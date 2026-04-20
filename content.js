/**
 * Delete Confirm AutoFill — content.js
 */
(() => {
  "use strict";

  const QUOTED_RE = /(^|[^\p{L}\p{N}_])(["`])([^"`]+)\2(?=$|[^\p{L}\p{N}_])|(^|[^\p{L}\p{N}_])(“([^”]+)”|‘([^’]+)’)/gu;

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

  const CONFIRMATION_HINTS = [
    "delete",
    "remove",
    "confirm",
    "type",
    "enter",
    "write",
    "exactly",
    "to continue",
    "to confirm",
    "required",
  ];

  // Platform-specific containers that commonly hold the exact confirmation value
  const PLATFORM_VALUE_CONTAINER_SELECTOR = [
    ".tw-c-form-field",     // Netlify form field wrapper
    ".form-field-container", // Netlify inner field container
    "label",
    "form",
    "[role='dialog']",
  ].join(", ");

  function isElementVisible(element) {
    if (!(element instanceof Element)) return false;
    if (!document.contains(element)) return false;

    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      style.opacity === "0"
    ) {
      return false;
    }

    if (element.closest("[hidden], [aria-hidden='true']")) return false;

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getVisibleText(element) {
    if (!isElementVisible(element)) return "";

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || !isElementVisible(parent)) {
            return NodeFilter.FILTER_REJECT;
          }

          if (!(node.textContent || "").trim()) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const segments = [];
    let node;
    while ((node = walker.nextNode())) {
      segments.push((node.textContent || "").trim());
    }

    const text = segments.join(" ").replace(/\s+/g, " ").trim();

    return text;
  }

  function pushVisibleText(parts, element) {
    const text = getVisibleText(element);
    if (text) parts.push(text);
  }

  function collectPreviousSiblingText(parts, element, limit = 3) {
    let sibling = element.previousElementSibling;
    let count = 0;

    while (sibling && count < limit) {
      pushVisibleText(parts, sibling);
      sibling = sibling.previousElementSibling;
      count++;
    }
  }

  function collectContextParts(input) {
    const parts = [];
    if (input.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (lbl) pushVisibleText(parts, lbl);
    }
    const wrap = input.closest("label");
    if (wrap) pushVisibleText(parts, wrap);
    collectPreviousSiblingText(parts, input);
    const p = input.parentElement;
    if (p) pushVisibleText(parts, p);
    if (p && p.parentElement) pushVisibleText(parts, p.parentElement);
    if (p) collectPreviousSiblingText(parts, p);
    if (p && p.parentElement) collectPreviousSiblingText(parts, p.parentElement);
    if (p && p.parentElement && p.parentElement.parentElement) {
      const container = p.parentElement.parentElement;
      pushVisibleText(parts, container);
      collectPreviousSiblingText(parts, container);
    }
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
      const value = (match[3] || match[6] || match[7] || "").trim();
      if (value) matches.push(value);
    }
    return matches;
  }

  function getExplicitValueCandidates(input) {
    const candidates = [];
    const seen = new Set();

    function add(text) {
      const value = (text || "").replace(/\s+/g, " ").trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      candidates.push(value);
    }

    const describedBy = (input.getAttribute("aria-describedby") || "").trim();
    if (describedBy) {
      describedBy.split(/\s+/).forEach((id) => {
        const element = document.getElementById(id);
        if (!element || !isElementVisible(element)) return;
        add(getVisibleText(element));
        element.querySelectorAll("code, pre").forEach((node) => add(getVisibleText(node)));
      });
    }

    const container = input.closest(PLATFORM_VALUE_CONTAINER_SELECTOR);
    if (container && isElementVisible(container)) {
      container.querySelectorAll("code, pre").forEach((node) => add(getVisibleText(node)));
    }

    return candidates;
  }

  function extractInstructionValue(text) {
    const patterns = [
      /\b(?:type|enter|write)\s+(.+?)\s+(?:below\s+)?to\s+confirm\b/i,
      /\b(?:type|enter|write)\s+(.+?)\s+(?:below\s+)?to\s+continue\b/i,
      /\b(?:type|enter|write)\s+(.+?)\s+(?:below\s+)?to\s+delete\b/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match) continue;

      const value = match[1]
        .replace(/\s+/g, " ")
        .replace(/^[:\- ]+|[:\- ]+$/g, "")
        .trim();

      if (value) return value;
    }

    return null;
  }

  function resolveValue(input) {
    const contextParts = collectContextParts(input);
    const fullCtx = contextParts.join(" ");
    const lowerCtx = fullCtx.toLowerCase();

    if (!CONFIRMATION_HINTS.some((hint) => lowerCtx.includes(hint))) {
      return null;
    }

    for (const part of contextParts) {
      const quoted = getQuotedMatches(part);
      if (quoted.length === 1) return quoted[0];
    }

    const explicitValues = getExplicitValueCandidates(input);
    if (explicitValues.length === 1) return explicitValues[0];

    const allQuoted = getQuotedMatches(fullCtx);
    if (allQuoted.length === 1) return allQuoted[0];

    const instructionValue = extractInstructionValue(fullCtx);
    if (instructionValue) return instructionValue;

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
      if (!isElementVisible(input)) return;
      if (input.disabled || input.readOnly) return;
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
