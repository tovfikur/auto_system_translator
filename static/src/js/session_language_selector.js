(function () {
  var SESSION_KEY = "auto_system_translator.session_target_lang";
  var LANG_CACHE_KEY = "auto_system_translator.supported_languages";
  var LANG_CACHE_VERSION = 2;
  var MIN_EXPECTED_LANGS = 30;
  var URL_PARAM_KEY = "ast_lang";
  var RTL_BASE_CODES = {
    ar: true,
    dv: true,
    fa: true,
    he: true,
    ku: true,
    ps: true,
    ur: true,
    ug: true,
    yi: true,
  };

  function safeSessionGet(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSessionSet(key, val) {
    try {
      window.sessionStorage.setItem(key, val);
      return true;
    } catch (e) {
      return false;
    }
  }

  function safeSessionRemove(key) {
    try {
      window.sessionStorage.removeItem(key);
      return true;
    } catch (e) {
      return false;
    }
  }

  function normalizeLangCode(code) {
    if (!code) return "";
    return String(code).trim();
  }

  function baseLang(code) {
    var c = normalizeLangCode(code).toLowerCase();
    if (!c) return "";
    return c.split(/[-_]/)[0];
  }

  function isRtl(code) {
    return !!RTL_BASE_CODES[baseLang(code)];
  }

  function getOriginalDir() {
    var el = document.documentElement;
    if (!el.dataset.astOriginalDir) {
      el.dataset.astOriginalDir = el.getAttribute("dir") || "";
    }
    return el.dataset.astOriginalDir;
  }

  function getOriginalLang() {
    var el = document.documentElement;
    if (!el.dataset.astOriginalLang) {
      el.dataset.astOriginalLang = el.getAttribute("lang") || "";
    }
    return el.dataset.astOriginalLang;
  }

  function applyDirAndLang(code) {
    var el = document.documentElement;
    getOriginalDir();
    getOriginalLang();
    if (!code) {
      var origDir = el.dataset.astOriginalDir || "";
      var origLang = el.dataset.astOriginalLang || "";
      if (origDir) {
        el.setAttribute("dir", origDir);
      } else {
        el.removeAttribute("dir");
      }
      if (origLang) {
        el.setAttribute("lang", origLang);
      } else {
        el.removeAttribute("lang");
      }
      return;
    }
    el.setAttribute("dir", isRtl(code) ? "rtl" : "ltr");
    var b = baseLang(code);
    if (b) {
      el.setAttribute("lang", b);
    }
  }

  function setStatus(root, msg) {
    var node = root.querySelector("[data-ast-status]");
    if (!node) return;
    node.textContent = msg || "";
  }

  function getSessionTargetLang() {
    return normalizeLangCode(safeSessionGet(SESSION_KEY) || "");
  }

  function setSessionTargetLang(code) {
    var c = normalizeLangCode(code);
    if (!c) {
      safeSessionRemove(SESSION_KEY);
      return "";
    }
    safeSessionSet(SESSION_KEY, c);
    return c;
  }

  function isBackendPath(pathname) {
    if (!pathname) return false;
    return String(pathname).indexOf("/web") === 0;
  }

  function syncFromUrlParam() {
    try {
      if (isBackendPath(window.location && window.location.pathname)) return;
      var url = new URL(window.location.href);
      var v = normalizeLangCode(url.searchParams.get(URL_PARAM_KEY) || "");
      if (!v) return;
      setSessionTargetLang(v);
      url.searchParams.delete(URL_PARAM_KEY);
      window.history.replaceState(window.history.state, "", url.toString());
      applyDirAndLang(v);
    } catch (e) {}
  }

  function decorateLinkWithLang(a, lang) {
    try {
      if (!a || !a.href || !lang) return;
      var url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (isBackendPath(url.pathname)) return;
      url.searchParams.set(URL_PARAM_KEY, lang);
      a.href = url.toString();
    } catch (e) {}
  }

  function installLinkPropagation() {
    function handler(ev) {
      try {
        var lang = getSessionTargetLang();
        if (!lang) return;
        var el = ev.target;
        while (el && el !== document && el.tagName !== "A") {
          el = el.parentElement;
        }
        if (!el || el.tagName !== "A") return;
        decorateLinkWithLang(el, lang);
      } catch (e) {}
    }
    document.addEventListener("click", handler, true);
    document.addEventListener("auxclick", handler, true);
  }

  function loadLanguages() {
    var cached = safeSessionGet(LANG_CACHE_KEY);
    if (cached) {
      try {
        var parsed = JSON.parse(cached);
        if (
          parsed &&
          parsed.v === LANG_CACHE_VERSION &&
          Array.isArray(parsed.languages) &&
          parsed.languages.length >= MIN_EXPECTED_LANGS
        ) {
          return Promise.resolve(parsed.languages);
        }
      } catch (e) {}
    }

    return fetch("/auto_system_translator/supported_languages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params: {} }),
      credentials: "same-origin",
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (resp) {
        var payload = resp && resp.result ? resp.result : resp;
        var langs = (payload && payload.languages) || [];
        if (Array.isArray(langs) && langs.length >= MIN_EXPECTED_LANGS) {
          safeSessionSet(
            LANG_CACHE_KEY,
            JSON.stringify({ v: LANG_CACHE_VERSION, languages: langs })
          );
          return langs;
        }
        throw new Error("No languages");
      })
      .catch(function () {
        return [
          ["en", "English"],
          ["fr", "French"],
          ["es", "Spanish"],
          ["de", "German"],
          ["ar", "Arabic"],
          ["hi", "Hindi"],
          ["zh-CN", "Chinese (Simplified)"],
        ];
      });
  }

  function createSelectId() {
    return "o_ast_lang_select_" + Math.random().toString(16).slice(2);
  }

  function populateSelect(selectEl, languages, current) {
    while (selectEl.firstChild) {
      selectEl.removeChild(selectEl.firstChild);
    }

    var optDefault = document.createElement("option");
    optDefault.value = "";
    optDefault.textContent = "Default";
    selectEl.appendChild(optDefault);

    for (var i = 0; i < languages.length; i++) {
      var row = languages[i];
      var code = row && row[0];
      var name = row && row[1];
      if (!code || !name) continue;
      var opt = document.createElement("option");
      opt.value = code;
      opt.textContent = name;
      selectEl.appendChild(opt);
    }

    selectEl.value = current || "";
  }

  function triggerRetranslate() {
    if (
      window.AutoSystemTranslator &&
      typeof window.AutoSystemTranslator.reset === "function"
    ) {
      window.AutoSystemTranslator.reset();
      return;
    }
    window.location.reload();
  }

  function initOne(root) {
    var label = root.querySelector("[data-ast-label]");
    var select = root.querySelector("[data-ast-select]");
    var reset = root.querySelector("[data-ast-reset]");
    if (!select) return;

    var id = createSelectId();
    select.id = id;
    if (label) {
      label.setAttribute("for", id);
    }

    var current = getSessionTargetLang();
    applyDirAndLang(current);

    setStatus(root, "Loading languages");
    loadLanguages()
      .then(function (languages) {
        populateSelect(select, languages, current);
        setStatus(root, "");
      })
      .catch(function () {
        setStatus(root, "Failed to load languages");
      });

    select.addEventListener("change", function () {
      var val = normalizeLangCode(select.value || "");
      var stored = setSessionTargetLang(val);
      applyDirAndLang(stored);
      setStatus(root, stored ? "Language updated" : "Default restored");
      triggerRetranslate();
    });

    if (reset) {
      reset.addEventListener("click", function () {
        select.value = "";
        setSessionTargetLang("");
        applyDirAndLang("");
        setStatus(root, "Default restored");
        triggerRetranslate();
      });
    }
  }

  function initAll() {
    syncFromUrlParam();
    installLinkPropagation();
    var roots = document.querySelectorAll(".o_ast_session_lang_selector");
    for (var i = 0; i < roots.length; i++) {
      initOne(roots[i]);
    }
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    setTimeout(initAll, 0);
  } else {
    window.addEventListener("load", initAll);
  }
})();
