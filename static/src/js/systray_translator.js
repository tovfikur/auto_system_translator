/** @odoo-module **/
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, useState, onWillStart } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";

export class TranslatorSystray extends Component {
  setup() {
    this.rpc = useService("rpc");
    this.orm = useService("orm");
    this.state = useState({
      languages: [],
      currentLang: "en_US",
    });

    onWillStart(async () => {
      await this.loadLanguages();
    });
  }

  async loadLanguages() {
    try {
      // Fetch supported languages from translation service
      const langs = await this.orm.call(
        "translation.service",
        "get_supported_languages",
        []
      );
      // Fetch current setting
      const current = await this.orm.call("ir.config_parameter", "get_param", [
        "auto_system_translator.target_odoo_lang",
        "en",
      ]);

      // Transform langs [[code, name], ...] to objects
      this.state.languages = langs.map((l) => ({ code: l[0], name: l[1] }));
      this.state.currentLang = current;
    } catch (e) {
      console.error("TranslatorSystray: Failed to load languages", e);
    }
  }

  async setLanguage(code) {
    try {
      await this.orm.call("ir.config_parameter", "set_param", [
        "auto_system_translator.target_odoo_lang",
        code,
      ]);
      this.state.currentLang = code;
      window.location.reload();
    } catch (e) {
      console.error("TranslatorSystray: Failed to set language", e);
      // Likely access denied if not admin
      alert(
        "Error: You probably need Administrator rights to change global translation settings."
      );
    }
  }
}

TranslatorSystray.template = "auto_system_translator.TranslatorSystray";
TranslatorSystray.components = { Dropdown, DropdownItem };

export const systrayItem = {
  Component: TranslatorSystray,
};

registry
  .category("systray")
  .add("TranslatorSystray", systrayItem, { sequence: 100 });
