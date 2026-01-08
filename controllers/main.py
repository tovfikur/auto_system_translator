from odoo import http
from datetime import datetime
import json
from odoo.http import request, route
from psycopg2 import OperationalError

class AutoSystemTranslatorController(http.Controller):
    def _safe_lang_code(self, value):
        if value is None:
            return None
        try:
            s = str(value).strip()
        except Exception:
            return None
        if not s:
            return None
        if len(s) > 32:
            return None
        return s

    def _enabled(self):
        try:
            params = request.env['ir.config_parameter'].sudo()
            v = params.get_param('auto_system_translator.enabled', '1')
            s = str(v).strip().lower()
            return s not in ('0', 'false', 'no', 'off')
        except Exception:
            return False
    
    @route('/auto_system_translator/enabled', type='json', auth='public', csrf=False)
    def enabled(self, **kwargs):
        return {'enabled': self._enabled()}

    @route('/auto_system_translator/supported_languages', type='json', auth='public', csrf=False)
    def supported_languages(self, **kwargs):
        try:
            langs = request.env['translation.service'].sudo().get_supported_languages()
            return {'languages': langs}
        except Exception:
            return {'languages': [('en', 'English'), ('fr', 'French'), ('es', 'Spanish'), ('de', 'German'), ('ar', 'Arabic')]}

    @route('/auto_system_translator/translate', type='json', auth='public', csrf=False)
    def translate(self, text=None, **kwargs):
        payload = {}
        try:
            raw = request.httprequest.get_data(cache=False, as_text=True)
            if raw:
                payload = json.loads(raw)
        except Exception:
            payload = {}

        if text is None:
            text = (payload.get('text') or (payload.get('params') or {}).get('text') or '')

        if not self._enabled():
            return {'result': text}

        target_override = self._safe_lang_code(
            payload.get('target_lang') or kwargs.get('target_lang') or (payload.get('params') or {}).get('target_lang')
        )
        source_override = self._safe_lang_code(
            payload.get('source_lang') or kwargs.get('source_lang') or (payload.get('params') or {}).get('source_lang')
        )
        
        try:
            params = request.env['ir.config_parameter'].sudo()
            target_odoo = params.get_param('auto_system_translator.target_odoo_lang', 'en') or 'en'
            source_odoo = params.get_param('auto_system_translator.source_odoo_lang', 'auto') or 'auto'
            if target_override:
                target_odoo = target_override
            if source_override:
                source_odoo = source_override
            service = request.env['translation.service']
            target_google = service._google_target_from_odoo_lang(target_odoo)
            source_google = service._google_target_from_odoo_lang(source_odoo)
        except OperationalError:
            # DB Locked. Return text as-is.
            return {'result': text if text else ''}
        
        try:
            if service._is_untranslatable(text):
                return {'result': text}
            translated = service.translate_string(text, target_language=target_google, source_language=source_google, persist_target_lang=target_odoo)
            return {'result': translated}
        except Exception as e:
            return {'result': text, 'error': str(e)}

    @route('/auto_system_translator/translate_batch', type='json', auth='public', csrf=False)
    def translate_batch(self, items=None, **kwargs):
        payload = {}
        try:
            raw = request.httprequest.get_data(cache=False, as_text=True)
            if raw:
                payload = json.loads(raw)
        except Exception:
            payload = {}

        if items is None:
            items = payload.get('items') or (payload.get('params') or {}).get('items') or []

        if not self._enabled():
            out = [{'i': it.get('i'), 'result': (it.get('text') or '')} for it in items]
            return {'items': out}

        target_override = self._safe_lang_code(
            payload.get('target_lang') or kwargs.get('target_lang') or (payload.get('params') or {}).get('target_lang')
        )
        source_override = self._safe_lang_code(
            payload.get('source_lang') or kwargs.get('source_lang') or (payload.get('params') or {}).get('source_lang')
        )

        try:
            params = request.env['ir.config_parameter'].sudo()
            target_odoo = params.get_param('auto_system_translator.target_odoo_lang', 'en') or 'en'
            source_odoo = params.get_param('auto_system_translator.source_odoo_lang', 'auto') or 'auto'
            if target_override:
                target_odoo = target_override
            if source_override:
                source_odoo = source_override
            service = request.env['translation.service']
            target_google = service._google_target_from_odoo_lang(target_odoo)
            source_google = service._google_target_from_odoo_lang(source_odoo)
        except OperationalError:
            items = items or []
            return {'items': [{'i': it.get('i'), 'result': (it.get('text') or '')} for it in items]}
            
        out = []
        try:
            for it in items:
                i = it.get('i')
                text = it.get('text') or ''
                if service._is_untranslatable(text):
                    out.append({'i': i, 'result': text})
                    continue
                translated = service.translate_string(text, target_language=target_google, source_language=source_google, persist_target_lang=target_odoo)
                out.append({'i': i, 'result': translated})
            return {'items': out}
        except Exception as e:
            # Return original items on error
            return {'items': [{'i': it.get('i'), 'result': (it.get('text') or '')} for it in items]}
