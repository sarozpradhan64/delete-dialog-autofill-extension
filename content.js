/**
 * Delete Confirm AutoFill — content.js
 */
(() => {
  "use strict";

  const QUOTED_RE = /(["'`])([^"'`]+)\1|([“”‘’])([^“”‘’]+)([“”‘’])/g;

  const FIXED_PHRASES = [
    "delete my project",
    "delete my account",
    "i understand",
    "i confirm",
    "i agree",
    "confirm delete",
    "confirm deletion",
    "yes, delete",
    "yes delete",
    "permanently delete",
  ];

  function collectContextParts(input) {
    const parts = [];
    if (input.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (lbl) parts.push(lbl.textContent);
    }
    const wrap = input.closest("label");
    if (wrap) parts.push(wrap.textContent);
    let sib = input.previousElementSibling;
    let n = 0;
    while (sib && n < 3) { parts.push(sib.textContent); sib = sib.previousElementSibling; n++; }
    const p = input.parentElement;
    if (p) parts.push(p.textContent);
    if (p && p.parentElement) parts.push(p.parentElement.textContent);
    if (input.placeholder) parts.push(input.placeholder);
    return parts.filter(Boolean).map((part) => part.trim()).filter(Boolean);
  }

  function getFullNearbyText(input) {
    return collectContextParts(input).join(" ");
  }

  function getQuotedMatches(text) {
    const matches = [];
    QUOTED_RE.lastIndex = 0;
    let match;
    while ((match = QUOTED_RE.exec(text)) !== null) {
      const value = (match[2] || match[4] || "").trim();
      if (value) matches.push(value);
    }
    return matches;
  }

  function resolveValue(input) {
    const contextParts = collectContextParts(input);
    const fullCtx = contextParts.join(" ");
    const lowerCtx = fullCtx.toLowerCase();

    for (const part of contextParts) {
      const quoted = getQuotedMatches(part);
      if (quoted.length === 1) return quoted[0];
    }

    const allQuoted = getQuotedMatches(fullCtx);
    if (allQuoted.length === 1) return allQuoted[0];

    for (const phrase of FIXED_PHRASES) {
      if (lowerCtx.includes(phrase)) return phrase;
    }
    return null;
  }

  function nativeSet(input, value) {
    input.focus();
    const proto = input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value");
    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));
    input.blur();
  }

  function flashBadge(value) {
    const existing = Array.from(document.querySelectorAll('[data-dca-badge="true"]'));
    existing.forEach((node, index) => {
      node.style.bottom = `${20 + (index + 1) * 52}px`;
    });

    const badge = document.createElement("div");
    badge.dataset.dcaBadge = "true";
    badge.textContent = `✓ Auto-filled: "${value}"`;
    Object.assign(badge.style, {
      position: "fixed", bottom: "20px", right: "20px",
      background: "#22c55e", color: "#fff",
      fontFamily: "system-ui, sans-serif", fontSize: "13px",
      padding: "8px 14px", borderRadius: "8px",
      zIndex: "2147483647", boxShadow: "0 4px 14px rgba(0,0,0,.35)",
      opacity: "1", transition: "opacity .4s ease, bottom .2s ease", pointerEvents: "none",
    });
    document.body.appendChild(badge);

    const badges = Array.from(document.querySelectorAll('[data-dca-badge="true"]'));
    if (badges.length > 3) {
      badges.slice(0, badges.length - 3).forEach((node) => node.remove());
    }

    setTimeout(() => { badge.style.opacity = "0"; }, 2200);
    setTimeout(() => { badge.remove(); }, 2700);
  }

  let enabled = true;
  let filled = new WeakSet();

  chrome.storage.sync.get(["enabled"], (res) => {
    if (res.enabled === false) enabled = false;
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) enabled = changes.enabled.newValue;
  });

  function scanInputs() {
    if (!enabled) return;
    const inputs = document.querySelectorAll(
      'input[type="text"], input:not([type]), textarea'
    );
    inputs.forEach((input) => {
      if (filled.has(input)) return;
      if (input.value.trim() !== "") return;
      const value = resolveValue(input);
      if (!value) return;
      filled.add(input);
      setTimeout(() => {
        nativeSet(input, value);
        flashBadge(value);
      }, 120);
    });
  }

  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((m) => m.addedNodes.length > 0);
    if (relevant) scanInputs();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  scanInputs();

  // ── Fixed: call sendResponse + return true to keep port open ──────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === "manualScan") {
      filled = new WeakSet(); // reset so already-seen inputs are retried
      scanInputs();
      sendResponse({ ok: true });
    }
    return true; // IMPORTANT: keeps the message channel open for async response
  });
})();
