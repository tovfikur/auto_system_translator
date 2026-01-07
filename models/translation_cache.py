from odoo import models, fields, api


class TranslationCache(models.Model):
    _name = 'translation.cache'
    _description = 'Independent UI Translation Cache'
    _rec_name = 'src_text'

    src_text = fields.Text(required=True)
    checksum = fields.Char(required=True, index=True)
    target_lang = fields.Char(required=True, index=True)
    translated_text = fields.Text()
    use_count = fields.Integer(default=0)
    last_used = fields.Datetime()
    create_date = fields.Datetime(readonly=True)
    write_date = fields.Datetime(readonly=True)

    _sql_constraints = [
        ('uniq_checksum_target', 'unique(checksum, target_lang)', 'Duplicate cache entry for this text and language'),
    ]

    @api.model
    def create(self, vals):
        if not vals.get('checksum') and vals.get('src_text'):
            import hashlib
            vals['checksum'] = hashlib.sha1(vals['src_text'].encode('utf-8', errors='ignore')).hexdigest()
        return super().create(vals)
