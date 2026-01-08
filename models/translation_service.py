import logging
from datetime import datetime
from odoo import models, api, _, SUPERUSER_ID
from odoo.exceptions import UserError
import hashlib
from psycopg2 import OperationalError

_logger = logging.getLogger(__name__)

class TranslationService(models.Model):
    _name = 'translation.service'
    _description = 'Translation Service'

    _cache = {}
    _cache_order = []
    _cache_limit = 20000
    _memo = {}
    _memo_order = []
    _memo_limit = 50000
    _creating = set()

    @api.model
    def get_supported_languages(self):
        try:
            from deep_translator import GoogleTranslator
            langs = None
            try:
                langs = GoogleTranslator().get_supported_languages(as_dict=True)
            except TypeError:
                langs = GoogleTranslator(source='auto', target='en').get_supported_languages(as_dict=True)
            except Exception:
                langs = None

            if isinstance(langs, dict):
                return sorted([(code, str(name).title()) for name, code in langs.items()], key=lambda x: x[1])

            try:
                from deep_translator import constants as dt_constants
                if hasattr(dt_constants, 'GOOGLE_LANGUAGES_TO_CODES') and isinstance(dt_constants.GOOGLE_LANGUAGES_TO_CODES, dict):
                    m = dt_constants.GOOGLE_LANGUAGES_TO_CODES
                    return sorted([(code, str(name).title()) for name, code in m.items()], key=lambda x: x[1])
                if hasattr(dt_constants, 'GOOGLE_LANGUAGES') and isinstance(dt_constants.GOOGLE_LANGUAGES, dict):
                    m = dt_constants.GOOGLE_LANGUAGES
                    return sorted([(code, str(name).title()) for name, code in m.items()], key=lambda x: x[1])
            except Exception:
                pass

            langs = GoogleTranslator(source='auto', target='en').get_supported_languages()
            if isinstance(langs, (list, tuple)):
                out = []
                for it in langs:
                    if isinstance(it, (list, tuple)) and len(it) >= 2:
                        out.append((it[0], str(it[1]).title()))
                    elif isinstance(it, str):
                        out.append((it, it))
                if out:
                    return sorted(out, key=lambda x: x[1])
            raise Exception('Unsupported deep_translator language format')
        except Exception as e:
            _logger.warning(f"Failed to fetch supported languages: {e}")
            # Fallback to simple list if offline or error
            return [('en', 'English'), ('fr', 'French'), ('es', 'Spanish'), ('de', 'German'), ('zh-CN', 'Chinese (Simplified)')]

    @api.model
    def _google_target_from_odoo_lang(self, odoo_lang_code):
        if not odoo_lang_code:
            return 'en'
        code = odoo_lang_code.replace('-', '_')
        if code == 'zh_CN':
            return 'zh-CN'
        if code == 'zh_TW':
            return 'zh-TW'
        return code.split('_', 1)[0].lower()

    @api.model
    def _persist_enabled(self):
        try:
            params = self.env['ir.config_parameter'].sudo()
            # Default to '1' (True) now
            v = params.get_param('auto_system_translator.persist_cache', '1')
            s = str(v).strip().lower()
            return s in ('1', 'true', 't', 'yes', 'on')
        except Exception:
            return True

    @api.model
    def _cache_key(self, text, target_language):
        return f'{target_language}:{text}'

    @api.model
    def _cache_get(self, text, target_language):
        key = self._cache_key(text, target_language)
        return self._cache.get(key)

    @api.model
    def _cache_set(self, text, target_language, value):
        key = self._cache_key(text, target_language)
        if key in self._cache:
            self._cache[key] = value
            return
        self._cache[key] = value
        self._cache_order.append(key)
        if len(self._cache_order) > self._cache_limit:
            old_key = self._cache_order.pop(0)
            self._cache.pop(old_key, None)
    
    @api.model
    def _memo_key(self, checksum, target_lang):
        return f'{target_lang}:{checksum}'
    
    @api.model
    def _memo_get(self, checksum, target_lang):
        return self._memo.get(self._memo_key(checksum, target_lang))
    
    @api.model
    def _memo_set(self, checksum, target_lang, value):
        k = self._memo_key(checksum, target_lang)
        if k in self._memo:
            self._memo[k] = value
            return
        self._memo[k] = value
        self._memo_order.append(k)
        if len(self._memo_order) > self._memo_limit:
            old = self._memo_order.pop(0)
            self._memo.pop(old, None)

    @api.model
    def translate_string(self, text, target_language, source_language='auto', persist_target_lang=None):
        if not text or not str(text).strip():
            return text
        if isinstance(text, bytes):
            try:
                text = text.decode('utf-8', errors='ignore')
            except Exception:
                text = str(text)
        if self._is_untranslatable(text):
            return text
        checksum = hashlib.sha1(str(text).encode('utf-8', errors='ignore')).hexdigest()
        target_persist = persist_target_lang or target_language
        memo_val = self._memo_get(checksum, target_persist)
        if memo_val:
            return memo_val
        cached = self._cache_get(text, target_language)
        if cached:
            return cached
        if self._persist_enabled():
            try:
                # Use a separate cursor to avoid holding locks during Google API call
                with self.env.registry.cursor() as new_cr:
                    env_new = api.Environment(new_cr, SUPERUSER_ID, self.env.context)
                    rec = env_new['translation.cache'].search([
                        ('checksum', '=', checksum),
                        ('target_lang', '=', target_persist),
                        ('translated_text', '!=', False),
                    ], limit=1)
                    if rec:
                        val = rec.translated_text
                        self._memo_set(checksum, target_persist, val)
                        self._cache_set(text, target_language, val)
                        return val
            except OperationalError:
                pass
            except Exception:
                pass
        try:
            from deep_translator import GoogleTranslator
        except Exception:
            raise UserError(_('deep_translator is not installed. Install with: pip install deep_translator'))
        try:
            _logger.info(f"Translating '{text}' from {source_language} to {target_language}")
            translated = GoogleTranslator(source=source_language, target=target_language).translate(text)
            _logger.info(f"Translated result: '{translated}'")
            if translated:
                self._cache_set(text, target_language, translated)
                self._memo_set(checksum, target_persist, translated)
                if self._persist_enabled():
                    try:
                        with self.env.registry.cursor() as new_cr:
                            env_new = api.Environment(new_cr, SUPERUSER_ID, self.env.context)
                            cache_model = env_new['translation.cache']
                            entry = cache_model.search([('checksum', '=', checksum), ('target_lang', '=', target_persist)], limit=1)
                            if entry:
                                if not entry.translated_text:
                                    entry.write({'translated_text': translated})
                            else:
                                try:
                                    cache_model.create({
                                        'src_text': str(text),
                                        'checksum': checksum,
                                        'target_lang': target_persist,
                                        'translated_text': translated,
                                    })
                                except Exception:
                                    # Concurrent creation
                                    pass
                    except OperationalError:
                        pass
                    except Exception:
                        pass
                return translated
            return text
        except Exception as e:
            _logger.warning(str(e))
            return text

    @api.model
    def _is_untranslatable(self, text):
        s = str(text)
        if s.isnumeric():
            return True
        if not s.strip():
            return True
        if self._looks_like_code(s):
            return True
        return False

    @api.model
    def _looks_like_code(self, s):
        if '{' in s or '}' in s:
            return True
        if '%s' in s or '%(name)s' in s or '${' in s:
            return True
        if 'OwlError' in s or 'UncaughtPromiseError' in s:
            return True
        return False

