(() => {
  "use strict";

  const STYLE_ID = "meet-standup-companion-style";
  const TOOLBAR_ID = "meet-standup-companion-toolbar";
  const INSTANCE_KEY = "__meetStandupCompanion";
  const DEBUG_KEY = "__meetStandupCompanionDebug";
  const ROW_KEY_ATTR = "data-msc-participant-key";
  const SPEAKER_THRESHOLD_MS = 3000;
  const OBSERVER_DELAY_MS = 120;
  const SPEAKER_POLL_MS = 250;
  const TILE_SPEAKER_SELECTOR = ".sxlEM, .BlxGDf";

  if (window[INSTANCE_KEY]) {
    window[INSTANCE_KEY].refresh();
    window[INSTANCE_KEY].focus();
    return;
  }

  const state = {
    participants: new Map(),
    observer: null,
    traceObserver: null,
    refreshTimer: 0,
    speakerTimer: 0,
    activeSpeakerKey: "",
    activeSpeakerSince: 0,
    activeSpeakerMarked: false,
    participantsPanelAttempted: false,
    lastPanel: null
  };

  const stopWords = new Set([
    "activities",
    "add people",
    "admit",
    "camera",
    "chat",
    "close",
    "everyone",
    "host controls",
    "layout",
    "leave call",
    "meeting details",
    "mic",
    "microphone",
    "more options",
    "mute",
    "muted",
    "people",
    "pin",
    "present now",
    "presentation",
    "raise hand",
    "remove",
    "settings",
    "show everyone",
    "turn off",
    "turn on",
    "you are presenting"
  ]);

  const rejectedCandidatePatterns = [
    /^mark .+ as talked$/i,
    /^standup talked state$/i,
    /^talked$/i,
    /^your\s*\.?$/i,
    /^meeting host$/i,
    /^more actions$/i,
    /^mute .+/i
  ];

  const statusPatterns = [
    /\(you\)/gi,
    /\byou\b/gi,
    /\bis speaking\b/gi,
    /\bspeaking\b/gi,
    /\bis presenting\b/gi,
    /\bpresenting\b/gi,
    /\bis muted\b/gi,
    /\bmuted\b/gi,
    /\bmicrophone is off\b/gi,
    /\bmicrophone is on\b/gi,
    /\bcamera is off\b/gi,
    /\bcamera is on\b/gi,
    /\bhas joined\b/gi,
    /\bjoined\b/gi,
    /\bmore options\b/gi,
    /\bmic(?:rophone)?\b(?![a-z])/gi
  ];

  function normalizeName(name) {
    return String(name || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function collapseRepeatedWords(value) {
    const words = value.split(" ").filter(Boolean);
    if (words.length > 1 && words.length % 2 === 0) {
      const half = words.length / 2;
      const left = words.slice(0, half).join(" ").toLowerCase();
      const right = words.slice(half).join(" ").toLowerCase();
      if (left === right) {
        return words.slice(0, half).join(" ");
      }
    }
    return value;
  }

  function cleanName(raw) {
    let value = String(raw || "");

    for (const pattern of statusPatterns) {
      value = value.replace(pattern, " ");
    }

    value = collapseRepeatedWords(
      value
        .replace(/[,:;|]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );

    if (!value || value.length < 2 || value.length > 80) {
      return "";
    }

    if (stopWords.has(value.toLowerCase())) {
      return "";
    }

    if (rejectedCandidatePatterns.some((pattern) => pattern.test(value))) {
      return "";
    }

    if (/^\d+$/.test(value)) {
      return "";
    }

    return value;
  }

  function isVisible(element) {
    if (!element || !(element instanceof Element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      style.opacity !== "0"
    );
  }

  function safeQueryAll(selector, root = document) {
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch (_error) {
      return [];
    }
  }

  function unique(values) {
    const seen = new Set();
    const result = [];

    for (const value of values) {
      const normalized = normalizeName(value);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      result.push(value);
    }

    return result;
  }

  function addCandidate(candidates, value, source, priority) {
    const cleaned = cleanName(value);
    if (!cleaned) {
      return;
    }

    candidates.push({
      value: cleaned,
      source,
      priority,
      words: cleaned.split(" ").length,
      length: cleaned.length
    });
  }

  const nameTemplates = [
    /^more options for (.+)$/i,
    /^pin (.+?)(?: to your main screen)?$/i,
    /^mute (.+)$/i,
    /^unmute (.+)$/i,
    /^plus d'options pour (.+)$/i,
    /^(?:\u00e9|e)pinglez (.+?)(?: sur votre \u00e9cran principal)?$/i,
    /^retirez (?:la pr\u00e9sentation de )?(.+?) de votre \u00e9cran principal$/i,
    /^couper le micro de (.+)$/i,
    /^r\u00e9activer le micro de (.+)$/i
  ];

  function nameFromTemplatedLabel(label) {
    const value = String(label || "").trim();
    if (!value) {
      return "";
    }

    for (const template of nameTemplates) {
      const match = value.match(template);
      if (match && match[1]) {
        return cleanName(match[1]);
      }
    }

    return "";
  }

  function elementLeafText(element) {
    if (!element || !isVisible(element) || isOwnElement(element)) {
      return "";
    }

    const visibleChildren = Array.from(element.children).filter(isVisible);
    if (visibleChildren.length > 0) {
      return "";
    }

    return element.textContent || "";
  }

  function isOwnElement(element) {
    return Boolean(element && element.closest && element.closest(`#${TOOLBAR_ID}, .msc-control`));
  }

  function rowTextWithoutOwnControls(row) {
    if (!row) {
      return "";
    }

    const clone = row.cloneNode(true);
    for (const element of clone.querySelectorAll(`#${TOOLBAR_ID}, .msc-control`)) {
      element.remove();
    }
    return clone.textContent || "";
  }

  function candidateNames(row) {
    if (!row) {
      return [];
    }

    const candidates = [];

    addCandidate(candidates, nameFromTemplatedLabel(row.getAttribute("aria-label")), "row:aria-label-template", 1);
    addCandidate(candidates, nameFromTemplatedLabel(row.getAttribute("title")), "row:title-template", 1);
    addCandidate(candidates, row.getAttribute("data-participant-name"), "row:data-participant-name", 1);
    addCandidate(candidates, row.getAttribute("data-self-name"), "row:data-self-name", 1);
    addCandidate(candidates, row.getAttribute("aria-label"), "row:aria-label", 2);
    addCandidate(candidates, row.getAttribute("title"), "row:title", 3);

    for (const element of safeQueryAll("[data-participant-name], [data-self-name]", row)) {
      if (isOwnElement(element)) {
        continue;
      }
      addCandidate(candidates, element.getAttribute("data-participant-name"), "child:data-participant-name", 1);
      addCandidate(candidates, element.getAttribute("data-self-name"), "child:data-self-name", 1);
    }

    for (const element of safeQueryAll("[title], [aria-label]", row)) {
      if (isOwnElement(element)) {
        continue;
      }
      addCandidate(candidates, nameFromTemplatedLabel(element.getAttribute("aria-label")), "child:aria-label-template", 1);
      addCandidate(candidates, nameFromTemplatedLabel(element.getAttribute("title")), "child:title-template", 1);
      addCandidate(candidates, element.getAttribute("aria-label"), "child:aria-label", 4);
      addCandidate(candidates, element.getAttribute("title"), "child:title", 5);
    }

    for (const element of safeQueryAll("span, div", row)) {
      if (isOwnElement(element)) {
        continue;
      }
      addCandidate(candidates, elementLeafText(element), "leaf:text", 4);
    }

    addCandidate(candidates, rowTextWithoutOwnControls(row), "row:text", 9);

    return candidates
      .filter((candidate) => candidate.words <= 8)
      .sort((a, b) => a.priority - b.priority || a.words - b.words || a.length - b.length);
  }

  function extractParticipantName(row) {
    const [candidate] = candidateNames(row);
    return candidate ? candidate.value : "";
  }

  function headingText(element) {
    const heading = safeQueryAll("h1, h2, h3, [role='heading']", element).find(isVisible);
    return cleanName(heading ? heading.textContent : "");
  }

  function isTransientSurface(element) {
    if (!element) {
      return true;
    }

    if (element.closest("[role='tooltip'], [data-tooltip], [data-tooltip-id]")) {
      return true;
    }

    const role = element.getAttribute("role") || "";
    return role.toLowerCase() === "tooltip";
  }

  function panelLabel(element) {
    return [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      headingText(element)
    ]
      .filter(Boolean)
      .join(" ");
  }

  function panelCandidateDetails(element) {
    const rows = findParticipantRows(element);
    const label = panelLabel(element);
    const labelLooksRight = /\b(people|participants?)\b/i.test(label);
    const role = element.getAttribute("role") || "";
    const rect = element.getBoundingClientRect();
    const transient = isTransientSurface(element);
    const score = rows.length * 10 + (labelLooksRight ? 25 : 0) + (role === "dialog" || role === "complementary" ? 8 : 0);

    return {
      element,
      role,
      label: cleanName(label),
      rows,
      rowCount: rows.length,
      score,
      transient,
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  }

  function panelCandidates() {
    const selectors = [
      "[role='dialog']",
      "[role='complementary']",
      "[role='region']",
      "[role='tabpanel']",
      "[aria-label]",
      "[aria-modal]"
    ];

    const elements = new Set();

    for (const selector of selectors) {
      for (const element of safeQueryAll(selector)) {
        if (isVisible(element) && !isOwnElement(element)) {
          elements.add(element);
        }
      }
    }

    return Array.from(elements)
      .map(panelCandidateDetails)
      .filter((candidate) => candidate.rowCount > 0 || /\b(people|participants?)\b/i.test(candidate.label))
      .sort((a, b) => b.score - a.score || b.rowCount - a.rowCount);
  }

  function findParticipantsPanel() {
    const selectors = [
      "[role='dialog'][aria-label*='people' i]",
      "[role='dialog'][aria-label*='participant' i]",
      "[role='complementary'][aria-label*='people' i]",
      "[role='complementary'][aria-label*='participant' i]",
      "[aria-label*='People' i][role='region']",
      "[aria-label*='Participants' i][role='region']"
    ];

    for (const selector of selectors) {
      const panel = safeQueryAll(selector).find(isVisible);
      if (panel && !isTransientSurface(panel) && findParticipantRows(panel).length > 0) {
        return panel;
      }
    }

    const [candidate] = panelCandidates().filter((item) => !item.transient && item.score >= 20 && item.rowCount > 0);
    return candidate ? candidate.element : null;
  }

  function findParticipantRows(panel) {
    if (!panel) {
      return [];
    }

    const selectors = [
      "[data-participant-id]",
      "[data-participant-name]",
      "[role='listitem']",
      "[role='option']",
      "li"
    ];

    const rows = new Set();

    for (const selector of selectors) {
      for (const element of safeQueryAll(selector, panel)) {
        if (!isVisible(element) || element.closest(`#${TOOLBAR_ID}`) || element.classList.contains("msc-control")) {
          continue;
        }

        if (extractParticipantName(element)) {
          rows.add(element);
        }
      }
    }

    return Array.from(rows);
  }

  function isParticipantsPanelOpen() {
    if (findParticipantsPanel()) {
      return true;
    }

    const pressed = safeQueryAll(
      "button[aria-pressed='true'][aria-label*='people' i], " +
        "button[aria-expanded='true'][aria-label*='people' i], " +
        "button[aria-pressed='true'][aria-label*='participant' i], " +
        "button[aria-expanded='true'][aria-label*='participant' i]"
    );

    return pressed.some(isVisible);
  }

  function attemptOpenParticipantsPanel() {
    if (state.participantsPanelAttempted || isParticipantsPanelOpen()) {
      return;
    }

    state.participantsPanelAttempted = true;

    const selectors = [
      "button[aria-label*='Show everyone' i]",
      "button[aria-label*='People' i]",
      "button[aria-label*='Participants' i]",
      "div[role='button'][aria-label*='Show everyone' i]",
      "div[role='button'][aria-label*='People' i]",
      "div[role='button'][aria-label*='Participants' i]"
    ];

    const button = selectors
      .flatMap((selector) => safeQueryAll(selector))
      .find((element) => isVisible(element) && element.getAttribute("aria-disabled") !== "true");

    if (button) {
      button.click();
    }
  }

  function syncParticipants(rows) {
    const now = Date.now();
    const seen = new Set();

    for (const row of rows) {
      const name = extractParticipantName(row);
      const key = normalizeName(name);
      if (!key) {
        continue;
      }

      seen.add(key);

      const existing = state.participants.get(key);
      if (existing) {
        existing.name = name;
        existing.row = row;
        existing.lastSeen = now;
      } else {
        state.participants.set(key, {
          key,
          name,
          row,
          talked: false,
          lastSeen: now
        });
      }

      row.setAttribute(ROW_KEY_ATTR, key);
    }

    for (const key of state.participants.keys()) {
      if (!seen.has(key)) {
        state.participants.delete(key);
      }
    }
  }

  function createElement(tag, options = {}) {
    const element = document.createElement(tag);

    if (options.className) {
      element.className = options.className;
    }

    if (options.text !== undefined) {
      element.textContent = options.text;
    }

    if (options.attrs) {
      for (const [key, value] of Object.entries(options.attrs)) {
        element.setAttribute(key, value);
      }
    }

    return element;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = createElement("style", { attrs: { id: STYLE_ID } });
    style.textContent = `
      #${TOOLBAR_ID} {
        --msc-bg: #202124;
        --msc-bg-soft: #292a2d;
        --msc-border: rgba(255, 255, 255, 0.14);
        --msc-text: #f1f3f4;
        --msc-muted: #bdc1c6;
        --msc-good: #81c995;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 8px;
        margin: 8px 0;
        padding: 8px;
        color: var(--msc-text);
        background: var(--msc-bg-soft);
        border: 1px solid var(--msc-border);
        border-radius: 8px;
        font: 13px/1.35 "Google Sans", Roboto, Arial, sans-serif;
      }

      #${TOOLBAR_ID} * {
        box-sizing: border-box;
      }

      #${TOOLBAR_ID} .msc-title {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
      }

      #${TOOLBAR_ID} .msc-count {
        color: var(--msc-muted);
        font-size: 12px;
        white-space: nowrap;
      }

      #${TOOLBAR_ID} button,
      .msc-control button {
        appearance: none;
        border: 1px solid var(--msc-border);
        border-radius: 6px;
        color: var(--msc-text);
        background: var(--msc-bg);
        font: inherit;
        min-height: 28px;
        padding: 0 9px;
        cursor: pointer;
      }

      #${TOOLBAR_ID} button:hover,
      .msc-control button:hover {
        background: #333438;
      }

      .msc-control {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-inline-start: 8px;
        color: #bdc1c6;
        font: 12px/1.2 "Google Sans", Roboto, Arial, sans-serif;
        vertical-align: middle;
      }

      .msc-control input {
        width: 16px;
        height: 16px;
        accent-color: var(--msc-good, #81c995);
        cursor: pointer;
      }

      .msc-control.is-talked {
        color: #81c995;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureToolbar(panel) {
    ensureStyle();

    if (!panel) {
      return null;
    }

    let toolbar = panel.querySelector(`#${TOOLBAR_ID}`);
    if (toolbar) {
      return toolbar;
    }

    toolbar = createElement("div", {
      attrs: {
        id: TOOLBAR_ID,
        role: "group",
        "aria-label": "Standup companion controls"
      }
    });

    const heading = safeQueryAll("h1, h2, h3, [role='heading']", panel).find(isVisible);
    if (heading && heading.parentElement) {
      heading.insertAdjacentElement("afterend", toolbar);
    } else {
      panel.insertBefore(toolbar, panel.firstChild);
    }

    return toolbar;
  }

  function renderToolbar(panel) {
    const toolbar = ensureToolbar(panel);
    if (!toolbar) {
      return;
    }

    const participants = visibleParticipants();
    const talkedCount = participants.filter((participant) => participant.talked).length;

    toolbar.textContent = "";
    toolbar.appendChild(createElement("div", { className: "msc-title", text: "Standup" }));
    toolbar.appendChild(createElement("div", { className: "msc-count", text: `${talkedCount}/${participants.length}` }));

    const reset = createElement("button", { text: "Reset", attrs: { type: "button" } });
    reset.addEventListener("click", () => {
      for (const participant of state.participants.values()) {
        participant.talked = false;
      }
      resetSpeakerTracking();
      render();
    });
    toolbar.appendChild(reset);
  }

  function visibleParticipants() {
    return Array.from(state.participants.values())
      .filter((participant) => participant.row && isVisible(participant.row))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  function renderParticipantControls() {
    for (const participant of state.participants.values()) {
      if (!participant.row || !isVisible(participant.row)) {
        continue;
      }

      let control = participant.row.querySelector(":scope > .msc-control");
      if (!control) {
        control = createElement("label", {
          className: "msc-control",
          attrs: { title: "Standup talked state" }
        });
        const checkbox = createElement("input", {
          attrs: {
            type: "checkbox",
            "aria-label": `Mark ${participant.name} as talked`
          }
        });
        checkbox.addEventListener("change", () => {
          participant.talked = checkbox.checked;
          render();
        });
        control.appendChild(checkbox);
        control.appendChild(createElement("span", { text: "Talked" }));
        participant.row.appendChild(control);
      }

      const checkbox = control.querySelector("input");
      const label = control.querySelector("span");
      control.classList.toggle("is-talked", participant.talked);
      checkbox.checked = participant.talked;
      checkbox.setAttribute("aria-label", `Mark ${participant.name} as talked`);
      label.textContent = participant.talked ? "Talked" : "Talked";
    }
  }

  function removeOrphanControls() {
    for (const control of safeQueryAll(".msc-control")) {
      const row = control.parentElement;
      const key = row ? row.getAttribute(ROW_KEY_ATTR) : "";
      if (!key || !state.participants.has(key)) {
        control.remove();
      }
    }
  }

  function render() {
    const panel = findParticipantsPanel();
    state.lastPanel = panel;
    renderToolbar(panel);
    removeOrphanControls();
    renderParticipantControls();
  }

  function refresh() {
    const panel = findParticipantsPanel();
    state.lastPanel = panel;

    if (panel) {
      syncParticipants(findParticipantRows(panel));
    }

    render();
  }

  function scheduleRefresh() {
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(refresh, OBSERVER_DELAY_MS);
  }

  function isOwnNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    return Boolean(node.closest(`#${TOOLBAR_ID}, .msc-control`));
  }

  function isOwnMutation(mutation) {
    if (isOwnNode(mutation.target)) {
      return true;
    }

    const added = Array.from(mutation.addedNodes || []);
    const removed = Array.from(mutation.removedNodes || []);
    return added.concat(removed).length > 0 && added.concat(removed).every(isOwnNode);
  }

  function observeDom() {
    state.observer = new MutationObserver((mutations) => {
      if (mutations.length > 0 && mutations.every(isOwnMutation)) {
        return;
      }
      scheduleRefresh();
    });
    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "aria-label",
        "aria-pressed",
        "aria-expanded",
        "class",
        "data-is-speaking",
        "data-speaking",
        "data-participant-name",
        "data-self-name",
        "title"
      ]
    });
  }

  function rowNameForElement(element) {
    const row = element.closest(`[${ROW_KEY_ATTR}], [data-participant-id], [data-participant-name], [role='listitem'], [role='option'], li`);
    const rowName = extractParticipantName(row || element);
    const rowKey = normalizeName(rowName);

    if (rowKey && state.participants.has(rowKey)) {
      return rowName;
    }

    const label = [
      element.getAttribute("data-participant-name"),
      element.getAttribute("data-self-name"),
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.textContent
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    for (const participant of state.participants.values()) {
      if (label.includes(participant.name.toLowerCase())) {
        return participant.name;
      }
    }

    return rowName;
  }

  function candidateTextForSpeakerElement(element) {
    return [
      element.getAttribute("data-participant-name"),
      element.getAttribute("data-self-name"),
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.textContent
    ]
      .filter(Boolean)
      .join(" ");
  }

  function matchParticipantFromText(text) {
    const cleaned = cleanName(text);
    const templated = nameFromTemplatedLabel(text);
    const cleanedKey = normalizeName(cleaned);
    const templatedKey = normalizeName(templated);

    if (cleanedKey && state.participants.has(cleanedKey)) {
      return state.participants.get(cleanedKey);
    }

    if (templatedKey && state.participants.has(templatedKey)) {
      return state.participants.get(templatedKey);
    }

    const lowered = String(text || "").toLowerCase();
    for (const participant of state.participants.values()) {
      const name = participant.name.toLowerCase();
      if (
        lowered.includes(name) ||
        cleaned.toLowerCase().includes(name) ||
        templated.toLowerCase().includes(name)
      ) {
        return participant;
      }
    }

    return null;
  }

  function activeSpeakerMarkerForTile(tile) {
    if (!tile || !tile.getAttribute || !tile.getAttribute("data-participant-id")) {
      return null;
    }

    if (tile.matches && tile.matches(TILE_SPEAKER_SELECTOR)) {
      return tile;
    }

    return tile.querySelector(TILE_SPEAKER_SELECTOR);
  }

  function activeSpeakerTiles() {
    return safeQueryAll("[data-participant-id]").filter((tile) => activeSpeakerMarkerForTile(tile));
  }

  function speakerSignalForElement(element) {
    const tile = element.closest ? element.closest("[data-participant-id]") : null;
    const marker = activeSpeakerMarkerForTile(tile);

    if (!marker) {
      return "";
    }

    const matchedClass = Array.from(marker.classList || []).find((className) => className === "sxlEM" || className === "BlxGDf");
    return matchedClass ? `tile:${matchedClass}` : "tile";
  }

  function speakerCandidates() {
    const candidates = [
      ...activeSpeakerTiles(),
      ...safeQueryAll("[data-is-speaking='true'], [data-speaking='true']"),
      ...safeQueryAll("[aria-label*='speaking' i]"),
      ...safeQueryAll("[aria-label*='talking' i]"),
      ...safeQueryAll("[aria-label*='parle' i]"),
      ...safeQueryAll("[title*='speaking' i]"),
      ...safeQueryAll("[title*='talking' i]"),
      ...safeQueryAll("[title*='parle' i]"),
      ...safeQueryAll("[aria-live], [role='status']")
    ].filter((element, index, all) => isVisible(element) && !isOwnElement(element) && all.indexOf(element) === index);

    return candidates.map((candidate) => {
      const rowName = rowNameForElement(candidate);
      const text = candidateTextForSpeakerElement(candidate);
      const matched = matchParticipantFromText(rowName) || matchParticipantFromText(text);

      return {
        tag: candidate.tagName.toLowerCase(),
        rowName,
        text: cleanName(text),
        ariaLabel: candidate.getAttribute("aria-label") || "",
        title: candidate.getAttribute("title") || "",
        dataIsSpeaking: candidate.getAttribute("data-is-speaking") || "",
        dataSpeaking: candidate.getAttribute("data-speaking") || "",
        dataParticipantId: candidate.getAttribute("data-participant-id") || "",
        signal: speakerSignalForElement(candidate),
        matchedName: matched ? matched.name : "",
        matchedKey: matched ? matched.key : ""
      };
    });
  }

  function detectActiveSpeaker() {
    const candidates = speakerCandidates();

    for (const candidate of candidates) {
      if (candidate.matchedKey && state.participants.has(candidate.matchedKey)) {
        return state.participants.get(candidate.matchedKey).name;
      }
    }

    return "";
  }

  function resetSpeakerTracking() {
    state.activeSpeakerKey = "";
    state.activeSpeakerSince = 0;
    state.activeSpeakerMarked = false;
  }

  function tickSpeaker() {
    const speaker = detectActiveSpeaker();
    const speakerKey = normalizeName(speaker);
    const now = performance.now();

    if (!speakerKey) {
      if (state.activeSpeakerKey) {
        resetSpeakerTracking();
        render();
      }
      return;
    }

    if (speakerKey !== state.activeSpeakerKey) {
      state.activeSpeakerKey = speakerKey;
      state.activeSpeakerSince = now;
      state.activeSpeakerMarked = false;
      render();
      return;
    }

    if (!state.activeSpeakerMarked && now - state.activeSpeakerSince >= SPEAKER_THRESHOLD_MS) {
      const participant = state.participants.get(speakerKey);
      if (participant) {
        participant.talked = true;
        state.activeSpeakerMarked = true;
        render();
      }
    }
  }

  function focus() {
    const panel = findParticipantsPanel();
    if (panel) {
      panel.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function snapshot() {
    const panel = findParticipantsPanel();
    const rows = findParticipantRows(panel).map((row, index) => ({
      index,
      selectedName: extractParticipantName(row),
      rowText: cleanName(row.textContent),
      ariaLabel: row.getAttribute("aria-label") || "",
      title: row.getAttribute("title") || "",
      dataParticipantName: row.getAttribute("data-participant-name") || "",
      dataSelfName: row.getAttribute("data-self-name") || "",
      candidates: candidateNames(row).slice(0, 12)
    }));

    return {
      hasPanel: Boolean(panel),
      participantCount: rows.length,
      rows,
      panelCandidates: panelCandidates().slice(0, 10).map((candidate) => ({
        role: candidate.role,
        label: candidate.label,
        rowCount: candidate.rowCount,
        score: candidate.score,
        transient: candidate.transient,
        bounds: candidate.bounds
      })),
      participants: Array.from(state.participants.values()).map((participant) => ({
        key: participant.key,
        name: participant.name,
        talked: participant.talked,
        visible: Boolean(participant.row && isVisible(participant.row))
      })),
      activeSpeaker: state.activeSpeakerKey,
      speakerCandidates: speakerCandidates()
    };
  }

  function logSnapshot() {
    const data = snapshot();
    console.log(JSON.stringify(data, null, 2));
    return data;
  }

  function compactElementInfo(element) {
    const row = element.closest(`[${ROW_KEY_ATTR}], [data-participant-id], [data-participant-name], [role='listitem'], [role='option'], li`);
    const text = cleanName(element.textContent || "");
    const rowName = row ? extractParticipantName(row) : rowNameForElement(element);
    const matched = matchParticipantFromText(rowName) || matchParticipantFromText(candidateTextForSpeakerElement(element));
    const rect = element.getBoundingClientRect();

    return {
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role") || "",
      rowName,
      matchedName: matched ? matched.name : "",
      ariaLabel: element.getAttribute("aria-label") || "",
      title: element.getAttribute("title") || "",
      className: String(element.getAttribute("class") || "").slice(0, 180),
      dataIsSpeaking: element.getAttribute("data-is-speaking") || "",
      dataSpeaking: element.getAttribute("data-speaking") || "",
      dataParticipantId: element.getAttribute("data-participant-id") || "",
      signal: speakerSignalForElement(element),
      text: text.slice(0, 180),
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  }

  function summarizeTraceRecords(records) {
    const seen = new Set();
    return records
      .filter((record) => {
        const key = JSON.stringify(record);
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(0, 120);
  }

  function traceSpeaking(durationMs = 5000) {
    const ms = Math.max(1000, Math.min(Number(durationMs) || 5000, 15000));
    const panel = findParticipantsPanel();
    const root = panel || document.body;
    const records = [];
    const startedAt = Date.now();

    if (state.traceObserver) {
      state.traceObserver.disconnect();
    }

    const pushRecord = (type, element, extra = {}) => {
      if (!element || element.nodeType !== Node.ELEMENT_NODE || isOwnElement(element) || !isVisible(element)) {
        return;
      }

      records.push({
        atMs: Date.now() - startedAt,
        type,
        ...extra,
        element: compactElementInfo(element)
      });
    };

    state.traceObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (isOwnMutation(mutation)) {
          continue;
        }

        if (mutation.type === "attributes") {
          pushRecord("attribute", mutation.target, {
            attribute: mutation.attributeName,
            value: mutation.target.getAttribute(mutation.attributeName) || ""
          });
        } else if (mutation.type === "characterData") {
          const parent = mutation.target.parentElement;
          pushRecord("text", parent, {
            value: cleanName(parent ? parent.textContent : "")
          });
        } else if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            pushRecord("added", node);
          }
          for (const node of mutation.removedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              records.push({
                atMs: Date.now() - startedAt,
                type: "removed",
                element: {
                  tag: node.tagName.toLowerCase(),
                  role: node.getAttribute("role") || "",
                  ariaLabel: node.getAttribute("aria-label") || "",
                  title: node.getAttribute("title") || "",
                  className: String(node.getAttribute("class") || "").slice(0, 180),
                  text: cleanName(node.textContent || "").slice(0, 180)
                }
              });
            }
          }
        }
      }
    });

    state.traceObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeOldValue: false,
      attributeFilter: [
        "aria-label",
        "aria-live",
        "aria-pressed",
        "aria-selected",
        "class",
        "data-is-speaking",
        "data-speaking",
        "data-participant-name",
        "data-self-name",
        "style",
        "title"
      ]
    });

    console.log(`Standup trace: speak now for ${Math.round(ms / 1000)} seconds...`);

    return new Promise((resolve) => {
      window.setTimeout(() => {
        if (state.traceObserver) {
          state.traceObserver.disconnect();
          state.traceObserver = null;
        }

        const result = {
          durationMs: ms,
          hasPanel: Boolean(panel),
          participants: Array.from(state.participants.values()).map((participant) => participant.name),
          speakerCandidates: speakerCandidates(),
          records: summarizeTraceRecords(records)
        };

        console.log(JSON.stringify(result, null, 2));
        resolve(result);
      }, ms);
    });
  }

  function destroy() {
    window.clearTimeout(state.refreshTimer);
    window.clearInterval(state.speakerTimer);

    if (state.observer) {
      state.observer.disconnect();
    }
    if (state.traceObserver) {
      state.traceObserver.disconnect();
    }

    document.getElementById(TOOLBAR_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    for (const control of safeQueryAll(".msc-control")) {
      control.remove();
    }
    for (const row of safeQueryAll(`[${ROW_KEY_ATTR}]`)) {
      row.removeAttribute(ROW_KEY_ATTR);
    }
    delete window[INSTANCE_KEY];
    delete window[DEBUG_KEY];
  }

  window[INSTANCE_KEY] = {
    refresh,
    focus,
    destroy
  };

  window[DEBUG_KEY] = {
    state,
    refresh,
    discover: () => findParticipantRows(findParticipantsPanel()).map((row) => extractParticipantName(row)),
    detectActiveSpeaker,
    panelCandidates: () =>
      panelCandidates().map((candidate) => ({
        role: candidate.role,
        label: candidate.label,
        rowCount: candidate.rowCount,
        score: candidate.score,
        transient: candidate.transient,
        bounds: candidate.bounds
      })),
    speakerCandidates,
    traceSpeaking,
    snapshot,
    logSnapshot
  };

  observeDom();
  refresh();
  state.speakerTimer = window.setInterval(tickSpeaker, SPEAKER_POLL_MS);
})();
