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

  // #endregion

  // #region participant-scan

  // #endregion

  // #region panel-ui

  // #endregion

  // #region settings-tab

  // #endregion

  // #region lifecycle

  function teardown() {
    // Remove panel, disconnect observers, clear intervals, remove decorations
  }

  // #endregion

  if (window.__standupActive) {
    teardown();
    return;
  }

  // Meet presence guard
  if (
    location.hostname !== 'meet.google.com' ||
    (!document.querySelector('[data-participant-id]') &&
     !document.querySelector('[aria-label*="Leave call"], [aria-label*="Quitter"]'))
  ) {
    // Transient toast
    var _toast = document.createElement('div');
    _toast.textContent = 'Not in a Google Meet call';
    Object.assign(_toast.style, {
      position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
      background: '#202124', color: '#e8eaed', padding: '12px 24px',
      borderRadius: '8px', zIndex: '999999', fontFamily: 'Google Sans, sans-serif',
      fontSize: '14px', boxShadow: '0 2px 8px rgba(0,0,0,.3)'
    });
    document.body.appendChild(_toast);
    setTimeout(function() { _toast.remove(); }, 4000);
    return;
  }

  window.__standupActive = true;

  state = {
    settings: { minTalkSec: 3, timerForMeOnly: true, timerSeconds: 60 }
  };

  if (window.__STANDUP_DEBUG) { window.__standup = state; }
})();
