// Independent dynamic translator: plain script using fetch, no Odoo RPC dependency
(function () {
  var CACHE = {};
  var CACHE_KEYS = [];
  var CACHE_LIMIT = 5000;
  var NODES = [];
  var NODE_INDEX = new WeakMap();
  var MAX_BATCH = 500;
  var CONCURRENCY = 2;
  var PROCESSING = 0;
  var LAST_VAL = new WeakMap();
  var LAST_LANG = new WeakMap();
  var ORIGINAL_VAL = new WeakMap();
  var OBSERVE_LOCK = false;
  var SESSION_KEY = "auto_system_translator.session_target_lang";

  function cacheGet(text) {
    return CACHE[text];
  }
  function cacheSet(text, value) {
    if (CACHE[text]) {
      CACHE[text] = value;
      return;
    }
    CACHE[text] = value;
    CACHE_KEYS.push(text);
    if (CACHE_KEYS.length > CACHE_LIMIT) {
      var old = CACHE_KEYS.shift();
      delete CACHE[old];
    }
  }
  function looksUntranslatable(s) {
    if (!s) return true;
    var t = s.trim();
    if (!t) return true;
    if (/^\d+$/.test(t)) return true;
    if (t.indexOf("{") !== -1 || t.indexOf("}") !== -1) return true;
    if (
      t.indexOf("%s") !== -1 ||
      t.indexOf("%(") !== -1 ||
      t.indexOf("${") !== -1
    )
      return true;
    return false;
  }
  function shouldSkipNode(node) {
    if (!node) return true;
    if (node.nodeType === Node.COMMENT_NODE) return true;
    var p = node.parentElement;
    if (!p) return false;
    var tag = p.tagName ? p.tagName.toLowerCase() : "";
    if (
      tag === "script" ||
      tag === "style" ||
      tag === "noscript" ||
      tag === "textarea"
    )
      return true;
    return false;
  }

  function safeSessionGet(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function getSessionTargetLang() {
    try {
      if (window.location && typeof window.location.pathname === "string") {
        if (window.location.pathname.indexOf("/web") === 0) return "";
      }
    } catch (e) {}
    var v = safeSessionGet(SESSION_KEY);
    if (!v) return "";
    return String(v).trim();
  }

  function postTranslate(texts, targetLang) {
    var payload = { params: { text: texts[0] } };
    if (targetLang) {
      payload.target_lang = targetLang;
    }
    return fetch("/auto_system_translator/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (result) {
        var val = result && result.result;
        if (typeof val !== "string") val = texts[0];
        return [val];
      })
      .catch(function () {
        return texts;
      });
  }
  function walk(node) {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
      if (shouldSkipNode(node)) return;
      var s = node.nodeValue;
      if (s && s.length > 500) return;
      if (!s || !s.trim()) return;
      if (!ORIGINAL_VAL.has(node)) {
        ORIGINAL_VAL.set(node, s);
      }
      var last = LAST_VAL.get(node);
      if (last != null && last === s) return;
      var idx = NODE_INDEX.get(node);
      if (idx == null) {
        idx = NODES.length;
        NODE_INDEX.set(node, idx);
        NODES.push(node);
      }
    } else {
      var children = node.childNodes || [];
      for (var i = 0; i < children.length; i++) {
        walk(children[i]);
      }
    }
  }
  function collectTexts() {
    var targetLang = getSessionTargetLang();
    var items = [];
    for (var i = 0; i < NODES.length; i++) {
      var n = NODES[i];
      if (!n) continue;
      var s = n.nodeValue;
      if (!s || !s.trim()) continue;
      var last = LAST_VAL.get(n);
      var lastLang = LAST_LANG.get(n) || "";
      if (last != null && last === s && lastLang === targetLang) continue;
      var src = ORIGINAL_VAL.get(n);
      if (!src) {
        src = s;
        ORIGINAL_VAL.set(n, s);
      }
      items.push({ i: i, text: src });
      if (items.length >= MAX_BATCH) break;
    }
    return { items: items, targetLang: targetLang };
  }
  function applyBatch(resp, targetLang) {
    var arr = [];
    if (resp) {
      if (Array.isArray(resp.items)) {
        arr = resp.items;
      } else if (resp.result && Array.isArray(resp.result.items)) {
        arr = resp.result.items;
      }
    }
    OBSERVE_LOCK = true;
    for (var k = 0; k < arr.length; k++) {
      var it = arr[k];
      var idx = it.i;
      var val = it.result;
      var node = NODES[idx];
      if (!node || typeof val !== "string") continue;
      node.nodeValue = val;
      LAST_VAL.set(node, val);
      LAST_LANG.set(node, targetLang || "");
    }
    OBSERVE_LOCK = false;
  }
  function sendBatch(items, targetLang) {
    var payload = { items: items };
    if (targetLang) {
      payload.target_lang = targetLang;
    }
    return fetch("/auto_system_translator/translate_batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
    }).then(function (r) {
      return r.json();
    });
  }
  function processBatches() {
    if (PROCESSING >= CONCURRENCY) return;
    var collected = collectTexts();
    var items = collected.items;
    if (!items.length) return;
    PROCESSING += 1;
    sendBatch(items, collected.targetLang)
      .then(function (resp) {
        applyBatch(resp, collected.targetLang);
      })
      .finally(function () {
        PROCESSING -= 1;
        requestAnimationFrame(processBatches);
      });
  }
  function observeMutations() {
    var observer = new MutationObserver(function (mutations) {
      if (OBSERVE_LOCK) return;
      mutations.forEach(function (m) {
        if (m.type === "childList") {
          m.addedNodes.forEach(function (n) {
            walk(n);
          });
        } else if (m.type === "characterData") {
          var t = m.target;
          if (t && t.nodeType === Node.TEXT_NODE) {
            walk(t);
          }
        }
      });
      requestAnimationFrame(processBatches);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  function start() {
    fetch("/auto_system_translator/enabled", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      credentials: "same-origin",
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (resp) {
        if (resp && resp.enabled === false) {
          return;
        }
        walk(document.body);
        observeMutations();
        requestAnimationFrame(processBatches);
      })
      .catch(function () {
        walk(document.body);
        observeMutations();
        requestAnimationFrame(processBatches);
      });
  }

  function reset() {
    if (document.body) {
      LAST_VAL = new WeakMap();
      LAST_LANG = new WeakMap();
      walk(document.body);
      requestAnimationFrame(processBatches);
    }
  }

  if (!window.AutoSystemTranslator) {
    window.AutoSystemTranslator = {};
  }
  window.AutoSystemTranslator.reset = reset;
  window.AutoSystemTranslator.getSessionTargetLang = getSessionTargetLang;

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    setTimeout(start, 0);
  } else {
    window.addEventListener("load", start);
  }
})();
