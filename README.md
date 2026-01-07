# Auto System Translator

Automatically translate the entire Odoo system UI into any target language using machine translation.

## ⚠️ CRITICAL WARNINGS

**Please read this carefully before using the module:**

1.  **Website Editing / System Changes:**
    *   If you need to **edit the website**, install new modules, or make structural changes to Odoo:
    *   **STEP 1: UNINSTALL** this module first.
    *   **STEP 2:** Make your changes (edit website, install apps, etc.).
    *   **STEP 3: RE-INSTALL** this module when you are finished.
    *   *Failure to follow this may result in errors or conflicts during editing.*

2.  **Installation Order:**
    *   This app should be the **LAST app** you install in your Odoo environment. Ensure all other modules are set up before installing this one.

## Features

*   **Automatic Translation:** Translates Odoo UI elements in real-time using Google Translate.
*   **Smart Caching:**
    *   **Persist Translations:** Saves translated terms to the database (Global Cache) to minimize API calls and speed up loading.
    *   **Memory Cache:** Uses server-side memory for instant retrieval of frequently used terms.
*   **Language Support:** Supports all languages available in Google Translate.
*   **Easy Configuration:**
    *   Select **Source Language** (System Language) and **Target Language** (Translation Language).
    *   Toggle translation **On/Off** directly from Settings.
    *   Quick-switch dropdown in the top navbar.

## Installation & Setup Flow

1.  **Prerequisites:**
    *   Install the required Python library:
        ```bash
        pip install deep_translator
        ```

2.  **Install the Module:**
    *   Place the module in your `custom_addons` folder.
    *   Update your App List in Odoo.
    *   Install **Auto System Translator**.

3.  **Configuration:**
    *   Go to **Settings** > **Auto System Translator**.
    *   **Auto Translate Enabled:** Check this to turn on the system.
    *   **Persist Translations:** Check this (Recommended) to save translations to the database.
    *   **System Language (Source):** Select `Detect Language (Auto)` or your specific system language.
    *   **Language to Translate to:** Select your desired target language.
    *   Click **Save**.

4.  **Usage:**
    *   The system will now automatically translate UI text.
    *   You can also use the **Translator** icon in the top navbar to change the target language on the fly.

## Troubleshooting

*   **OwlError / View Errors:** If you encounter errors after uninstalling, ensure you have refreshed your browser and restarted the Odoo service.
*   **Translation Not Appearing:** Check if `Auto Translate Enabled` is on and if the correct Target Language is selected.
