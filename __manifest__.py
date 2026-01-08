{
    'name': 'Auto System Translator',
    'version': '17.0.1.0.0',
    'category': 'Tools',
    'sequence': 1,
    'summary': 'Automatically translate the entire Odoo system UI into any target language using machine translation',
    'description': 'Automatic UI translation using deep_translator',
    'author': 'Odoo Community',
    'website': 'https://github.com/odoo-community',
    'license': 'LGPL-3',
    'depends': [
        'base',
        'web',
        'website',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/res_config_settings_views.xml',
        'views/website_snippets.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'auto_system_translator/static/src/js/auto_translate.js',
            'auto_system_translator/static/src/js/systray_translator.js',
            'auto_system_translator/static/src/xml/systray_translator.xml',
        ],
        'web.assets_frontend': [
            'auto_system_translator/static/src/js/auto_translate.js',
            'auto_system_translator/static/src/js/session_language_selector.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'external_dependencies': {
        'python': ['deep_translator'],
    },
}
