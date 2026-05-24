(function() {
  "use strict";

  // === Architecture ===
  // This IIFE is the entire standup-tracker bookmarklet. Feature sections
  // are delimited by // #region / // #endregion markers so the v2 builder
  // can include or exclude them when baking a custom bookmarklet.
  //
  // Toggleable regions (v2 builder can cut these):
  //   meet-detect       — Meet presence guard and toast
  //   participant-scan  — Tile/panel name extraction and filtering
  //   panel-ui          — Floating and docked panel rendering + teardown
  //   settings-tab      — In-memory settings UI
  //   lifecycle         — Teardown entry point and clean-up

  var state = {};

  // #region meet-detect

  function isMeetCall() {
    if (location.hostname !== 'meet.google.com') return false;
    return !!(
      document.querySelector('[data-participant-id]') ||
      document.querySelector('[aria-label*="Leave call"], [aria-label*="Quitter"]')
    );
  }

  function showToast(msg) {
    var el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
      background: '#202124', color: '#e8eaed', padding: '12px 24px',
      borderRadius: '8px', zIndex: '999999', fontFamily: 'Google Sans, sans-serif',
      fontSize: '14px', boxShadow: '0 2px 8px rgba(0,0,0,.3)'
    });
    document.body.appendChild(el);
    setTimeout(function() { el.remove(); }, 4000);
  }

  // #endregion

  // #region participant-scan

  var ignorePatterns = [
    /arrière-plans?/i, /backgrounds?.*effects?/i, /effets?/i,
    /cadré/i, /framing/i, /continu/i,
    /présentation/i, /presenting/i,
    /micro/i, /caméra/i, /camera/i,
    /sous-titres/i, /captions/i,
    /participants?$/i,
    /chat/i, /meeting/i, /réunion/i,
    /activités/i, /activities/i,
    /paramètres/i, /settings/i,
    /enregistr/i, /recording/i,
    /tableau blanc/i, /whiteboard/i,
    /lever la main/i, /raise hand/i,
    /réactions?/i, /reactions?/i,
    /quitter/i, /leave/i,
    /rejoindre/i, /join/i,
    /couper/i, /mute/i,
  ];

  function looksLikeName(str) {
    var s = str.trim();
    if (s.length < 2 || s.length > 50) return false;
    if (s.split(/\s+/).length > 6) return false;
    if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(s)) return false;
    for (var i = 0; i < ignorePatterns.length; i++) {
      if (ignorePatterns[i].test(s)) return false;
    }
    return true;
  }

  function isIconLikeNode(el) {
    if (!el || !el.getAttribute) return false;
    if (el.getAttribute('aria-hidden') === 'true') return true;
    var cls = el.className;
    if (cls && cls.baseVal !== undefined) cls = cls.baseVal;
    if (typeof cls !== 'string') cls = '';
    if (/icon|symbol|material/i.test(cls)) return true;
    var tag = el.tagName;
    if (tag === 'I' || tag === 'SVG') return true;
    return false;
  }

  function dedup(str) {
    var s = str.trim();
    if (s.length % 2 === 0) {
      var half = s.substring(0, s.length / 2);
      if (s === half + half) return half;
    }
    return s;
  }

  function normalizeKey(name) {
    return dedup(name).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  var nameTemplates = [
    /^tile for (.+)$/i,
    /^vignette de (.+)$/i,
    /^plus d'options pour (.+)$/i,
    /^épinglez (.+?)(?: sur votre écran principal)?$/i,
    /^retirez (?:la présentation de )?(.+?) de votre écran principal$/i,
    /^couper le micro de (.+)$/i,
    /^réactiver le micro de (.+)$/i,
    /^more options for (.+)$/i,
    /^pin (.+?)(?: to your main screen)?$/i,
    /^mute (.+)$/i,
    /^unmute (.+)$/i,
  ];

  function nameFromAriaLabel(label) {
    if (!label) return null;
    var s = label.trim();
    for (var i = 0; i < nameTemplates.length; i++) {
      var m = s.match(nameTemplates[i]);
      if (m && m[1]) {
        var name = m[1].trim().replace(/\s+/g, ' ');
        if (looksLikeName(name)) return name;
      }
    }
    return null;
  }

  function extractName(el) {
    var ariaLabel = el.getAttribute && el.getAttribute('aria-label');
    var tmpl = nameFromAriaLabel(ariaLabel);
    if (tmpl) return tmpl;

    var labelled = el.querySelectorAll('[aria-label]');
    for (var i = 0; i < labelled.length; i++) {
      tmpl = nameFromAriaLabel(labelled[i].getAttribute('aria-label'));
      if (tmpl) return tmpl;
    }

    if (ariaLabel) {
      var a = dedup(ariaLabel.trim());
      if (looksLikeName(a)) return a;
    }
    for (var j = 0; j < labelled.length; j++) {
      var l2 = labelled[j].getAttribute('aria-label');
      if (!l2) continue;
      var ld = dedup(l2.trim());
      if (looksLikeName(ld)) return ld;
    }

    var fullText = el.textContent || '';
    var deduped = dedup(fullText.trim());
    if (deduped !== fullText.trim() && looksLikeName(deduped)) return deduped;

    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var node;
    while (node = walker.nextNode()) {
      var skip = false;
      var p = node.parentElement;
      while (p && p !== el) {
        if (isIconLikeNode(p)) { skip = true; break; }
        p = p.parentElement;
      }
      if (skip) continue;
      var t = node.textContent.trim();
      if (t.length >= 2 && t.length <= 50 && looksLikeName(t)) return t;
    }
    return null;
  }

  function isSelfTile(el) {
    var text = el.textContent || '';
    return /cadré en continu/i.test(text) ||
      /arrière-plans et effets/i.test(text) ||
      /backgrounds and effects/i.test(text) ||
      /you are framed/i.test(text) ||
      /plus d'options pour vous/i.test(text) ||
      /more options for you/i.test(text);
  }

  function isPresentationTile(el) {
    var labels = el.querySelectorAll('[aria-label]');
    for (var i = 0; i < labels.length; i++) {
      var l = labels[i].getAttribute('aria-label') || '';
      if (/présentation|presentation/i.test(l)) return true;
      if (/plein écran|fullscreen|ouvrir dans une nouvelle fenêtre|open in a new window|zoom avant|zoom in/i.test(l)) return true;
    }
    return false;
  }

  function addParticipant(pid, name) {
    if (!looksLikeName(name)) return;
    if (state.participants.has(pid)) return;
    state.participants.set(pid, { name: name.trim() });
    renderList();
  }

  function removeParticipant(pid) {
    state.participants.delete(pid);
    renderList();
  }

  function scanTiles() {
    document.querySelectorAll('[data-participant-id]').forEach(function (el) {
      var pid = el.getAttribute('data-participant-id');
      if (!pid) return;
      if (isSelfTile(el)) return;
      if (isPresentationTile(el)) return;
      var name = extractName(el);
      if (name) addParticipant(pid, name);
    });
  }

  function scanPanelFallback() {
    if (state.participants.size > 0) return;
    document.querySelectorAll('[role="listitem"]').forEach(function (el) {
      var text = el.textContent.trim();
      if (text && text.length < 60 && looksLikeName(dedup(text))) {
        var key = normalizeKey(text);
        if (!state.participants.has(key)) {
          state.participants.set(key, { name: text.trim() });
          renderList();
        }
      }
    });
  }

  function runScan() {
    scanTiles();
    if (state.participants.size === 0) scanPanelFallback();
  }

  // #endregion

  // #region panel-ui

  var _panelEl, _headerEl, _bodyEl, _listEl;

  var panelBaseStyle = {
    zIndex: '99999', width: '260px', maxHeight: '70vh',
    background: '#1e1e1e', color: '#e0e0e0',
    borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
    fontSize: '13px', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', userSelect: 'none'
  };

  function detectSidePanel() {
    var side = document.querySelector('[role="complementary"][data-tab-id]');
    if (side && side.offsetParent !== null) return side;
    return null;
  }

  function renderDocked(target) {
    _panelEl = document.createElement('div');
    _panelEl.id = 'standup-panel';
    Object.assign(_panelEl.style, panelBaseStyle);
    buildPanelContent();
    target.appendChild(_panelEl);
  }

  function renderFloat() {
    _panelEl = document.createElement('div');
    _panelEl.id = 'standup-panel';
    Object.assign(_panelEl.style, panelBaseStyle);
    _panelEl.style.position = 'fixed';
    _panelEl.style.top = '80px';
    _panelEl.style.right = '16px';
    buildPanelContent();
    document.body.appendChild(_panelEl);
    initDrag();
  }

  function buildPanelContent() {
    _headerEl = document.createElement('div');
    Object.assign(_headerEl.style, {
      padding: '10px 14px', background: '#2a2a2a', cursor: 'grab',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      borderBottom: '1px solid #333'
    });
    var title = document.createElement('span');
    title.style.fontWeight = '600';
    title.style.fontSize = '14px';
    title.textContent = 'Standup Tracker';
    _headerEl.appendChild(title);

    var gear = document.createElement('button');
    gear.textContent = '\u2699';
    Object.assign(gear.style, {
      background: 'none', border: 'none', color: '#aaa', cursor: 'pointer',
      fontSize: '16px', padding: '0', lineHeight: '1'
    });
    gear.addEventListener('click', toggleSettings);
    _headerEl.appendChild(gear);

    _bodyEl = document.createElement('div');
    Object.assign(_bodyEl.style, { overflowY: 'auto', flex: '1', padding: '4px 0' });

    _listEl = document.createElement('div');
    _bodyEl.appendChild(_listEl);

    _panelEl.append(_headerEl, _bodyEl);
  }

  function initDrag() {
    var dragX, dragY;
    function onMove(ev) {
      _panelEl.style.left = ev.clientX - dragX + 'px';
      _panelEl.style.top = ev.clientY - dragY + 'px';
      _panelEl.style.right = 'auto';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    _headerEl.addEventListener('mousedown', function(e) {
      dragX = e.clientX - _panelEl.offsetLeft;
      dragY = e.clientY - _panelEl.offsetTop;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function openPanel() {
    var target = detectSidePanel();
    if (target) { renderDocked(target); return; }
    renderFloat();
  }

  function renderList() {
    if (!_listEl) return;
    _listEl.innerHTML = '';
    var sorted = [...state.participants.entries()].sort(function(a, b) {
      return a[1].name.localeCompare(b[1].name);
    });
    sorted.forEach(function(entry) {
      var p = entry[1];
      var row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', padding: '6px 14px', gap: '8px'
      });
      var nameEl = document.createElement('span');
      nameEl.textContent = p.name;
      nameEl.style.flex = '1';
      nameEl.style.overflow = 'hidden';
      nameEl.style.textOverflow = 'ellipsis';
      nameEl.style.whiteSpace = 'nowrap';
      row.appendChild(nameEl);
      _listEl.appendChild(row);
    });
  }

  // #endregion

  // #region settings-tab

  var _settingsVisible = false;
  var _settingsEl;

  function toggleSettings() {
    _settingsVisible = !_settingsVisible;
    if (_settingsVisible) {
      if (!_settingsEl) _settingsEl = renderSettings();
      _listEl.style.display = 'none';
      _bodyEl.appendChild(_settingsEl);
    } else {
      if (_settingsEl) _settingsEl.remove();
      _listEl.style.display = '';
    }
  }

  function inputStyle() {
    return {
      width: '100%', background: '#333', border: '1px solid #555',
      borderRadius: '4px', color: '#e0e0e0', padding: '4px 8px',
      fontSize: '12px', outline: 'none', boxSizing: 'border-box'
    };
  }

  function labelStyle() {
    return {
      display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '2px'
    };
  }

  function renderSettings() {
    var container = document.createElement('div');
    Object.assign(container.style, { padding: '12px 14px' });

    var fields = [
      { label: 'Min talk seconds', key: 'minTalkSec', type: 'number', min: 1 },
      { label: 'Timer seconds', key: 'timerSeconds', type: 'number', min: 1 },
      { label: 'Timer for me only', key: 'timerForMeOnly', type: 'checkbox' },
    ];

    fields.forEach(function(f) {
      var labelEl = document.createElement('label');
      labelEl.textContent = f.label;
      Object.assign(labelEl.style, labelStyle());

      var input = document.createElement('input');
      input.type = f.type;
      if (f.min !== undefined) input.min = f.min;
      input.value = state.settings[f.key];
      if (f.type === 'checkbox') input.checked = state.settings[f.key];

      if (f.type === 'number') {
        Object.assign(input.style, inputStyle());
        input.addEventListener('change', function() {
          var raw = input.value.trim();
          var num = Number(raw);
          if (raw === '' || isNaN(num) || num < (f.min || 0)) {
            input.value = state.settings[f.key];
            return;
          }
          state.settings[f.key] = num;
        });
      } else {
        input.style.marginTop = '4px';
        input.addEventListener('change', function() {
          state.settings[f.key] = input.checked;
        });
      }

      container.appendChild(labelEl);
      container.appendChild(input);
    });

    return container;
  }

  // #endregion

  // #region lifecycle

  function teardown() {
    if (state._scanInterval) clearInterval(state._scanInterval);
    if (state._scanObserver) state._scanObserver.disconnect();
    if (_panelEl) { _panelEl.remove(); _panelEl = null; }
  }

  // #endregion

  if (window.__standupActive) {
    teardown();
    return;
  }

  if (!isMeetCall()) {
    showToast('Not in a Google Meet call');
    return;
  }

  window.__standupActive = true;

  state = {
    settings: { minTalkSec: 3, timerForMeOnly: true, timerSeconds: 60 },
    participants: new Map()
  };

  runScan();
  openPanel();

  state._scanInterval = setInterval(runScan, 3000);

  state._scanObserver = new MutationObserver(function() { runScan(); });
  state._scanObserver.observe(document.body, {
    subtree: true, childList: true, attributes: false
  });

  if (window.__STANDUP_DEBUG) { window.__standup = state; }
})();
