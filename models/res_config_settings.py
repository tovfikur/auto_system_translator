from odoo import models, fields, api

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    recaptcha_public_key = fields.Char(config_parameter='recaptcha.public_key')
    recaptcha_private_key = fields.Char(config_parameter='recaptcha.private_key')
    recaptcha_min_score = fields.Float(string="ReCaptcha Min Score", default=0.5, config_parameter='recaptcha.min_score')

    auto_translate_enabled = fields.Boolean(string="Auto Translate Enabled", default=True)
    persist_cache = fields.Boolean(string="Persist Translations", default=True)
    
    @api.model
    def get_values(self):
        res = super(ResConfigSettings, self).get_values()
        params = self.env['ir.config_parameter'].sudo()
        res.update(
            auto_translate_enabled=params.get_param('auto_system_translator.enabled', '1') == '1',
            persist_cache=params.get_param('auto_system_translator.persist_cache', '1') == '1',
        )
        return res

    def set_values(self):
        super(ResConfigSettings, self).set_values()
        params = self.env['ir.config_parameter'].sudo()
        params.set_param('auto_system_translator.enabled', '1' if self.auto_translate_enabled else '0')
        params.set_param('auto_system_translator.persist_cache', '1' if self.persist_cache else '0')
    
    def _get_target_languages(self):
        # Use supported languages from deep_translator instead of installed Odoo languages
        try:
            return self.env['translation.service'].get_supported_languages()
        except Exception:
            return self.env['res.lang'].get_installed()

    def _get_source_languages(self):
        langs = self._get_target_languages()
        return [('auto', 'Detect Language (Auto)')] + langs

    source_odoo_lang = fields.Selection(selection=_get_source_languages, string="System Language (Source)", config_parameter='auto_system_translator.source_odoo_lang', default='auto')
    target_odoo_lang = fields.Selection(selection=_get_target_languages, string="Language to Translate to", config_parameter='auto_system_translator.target_odoo_lang', default='en')

