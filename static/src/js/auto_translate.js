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
  var OBSERVE_LOCK = false;

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
  function postTranslate(texts) {
    return fetch("/auto_system_translator/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params: { text: texts[0] } }),
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
    var items = [];
    for (var i = 0; i < NODES.length; i++) {
      var n = NODES[i];
      if (!n) continue;
      var s = n.nodeValue;
      if (!s || !s.trim()) continue;
      var last = LAST_VAL.get(n);
      if (last != null && last === s) continue;
      items.push({ i: i, text: s });
      if (items.length >= MAX_BATCH) break;
    }
    return items;
  }
  function applyBatch(resp) {
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
    }
    OBSERVE_LOCK = false;
  }
  function sendBatch(items) {
    return fetch("/auto_system_translator/translate_batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: items }),
      credentials: "same-origin",
    }).then(function (r) {
      return r.json();
    });
  }
  function processBatches() {
    if (PROCESSING >= CONCURRENCY) return;
    var items = collectTexts();
    if (!items.length) return;
    PROCESSING += 1;
    sendBatch(items)
      .then(function (resp) {
        applyBatch(resp);
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
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    setTimeout(start, 0);
  } else {
    window.addEventListener("load", start);
  }
})();
