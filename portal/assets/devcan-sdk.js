/* DevCan Games SDK: stands in for the CrazyGames SDK v3 when a game runs on devcangames.com (tools/publish_devcan.py
   puts this script where the CrazyGames SDK tag was). Games call the same functions they call on CrazyGames:
   - data.getItem/setItem: the signed-in player's cloud save for this game, loaded before init() resolves; guests get
     null, so the game keeps using localStorage exactly like it does off-platform.
   - no ads (window.CrazyGames.SDK.ad is undefined, so games hide their rewarded buttons and skip midgame breaks).
   - gameplayStart/Stop, happytime, loading* and the room calls are no-ops; invite links point at devcangames.com.
   It talks to the game page (portal/assets/bridge.js) with postMessage; opened on its own, it is simply a guest. */
(function () {
  'use strict';
  var parentOrigin = location.hostname === 'play.devcangames.com' ? 'https://devcangames.com' : location.origin;
  var slug = (location.pathname.split('/').filter(Boolean)[0] === '__play' ? location.pathname.split('/')[2] : location.pathname.split('/')[1]) || '';
  var embedded = window.parent && window.parent !== window;
  var cache = {}, signedIn = false, dirty = {}, timer = 0, seq = 0, waiting = {};
  function ask(op, payload, timeoutMs) {
    return new Promise(function (resolve) {
      if (!embedded) { resolve(null); return; }
      var id = ++seq; waiting[id] = resolve;
      try { window.parent.postMessage({ dc: 1, id: id, op: op, game: slug, payload: payload || null }, parentOrigin); } catch (e) { delete waiting[id]; resolve(null); return; }
      setTimeout(function () { if (waiting[id]) { delete waiting[id]; resolve(null); } }, timeoutMs || 2500);
    });
  }
  window.addEventListener('message', function (ev) {
    if (ev.origin !== parentOrigin || ev.source !== window.parent) return;
    var m = ev.data; if (!m || m.dc !== 1) return;
    if (m.id && waiting[m.id]) { var r = waiting[m.id]; delete waiting[m.id]; r(m.payload); }
  });
  function flush() {
    if (!signedIn) return;
    var items = dirty; dirty = {}; clearTimeout(timer); timer = 0;
    if (Object.keys(items).length) ask('save', { items: items }, 5000);
  }
  function schedule() { if (!timer) timer = setTimeout(flush, 1500); }
  addEventListener('pagehide', flush); document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
  var settings = { muteAudio: false, disableChat: true };
  var noop = function () {};
  var params = new URLSearchParams(location.search);
  var SDK = {
    environment: 'devcan',
    init: function () {
      return ask('hello', null, 2500).then(function (r) {
        if (r && r.user) { signedIn = true; cache = r.saves || {}; }
      });
    },
    data: {
      getItem: function (k) { return signedIn && Object.prototype.hasOwnProperty.call(cache, k) ? cache[k] : null; },
      setItem: function (k, v) { if (!signedIn) return; v = String(v); if (cache[k] === v) return; cache[k] = v; dirty[k] = v; schedule(); },
      removeItem: function (k) { if (!signedIn) return; delete cache[k]; },
      clear: function () { cache = {}; },
      syncUnityGameData: noop,
    },
    user: {
      isUserAccountAvailable: false, // a DevCan account is not a CrazyGames account: games use their own player names
      systemInfo: { locale: navigator.language || 'en-US', countryCode: '', applicationType: 'web',
        device: { type: matchMedia('(pointer: coarse)').matches ? (Math.min(screen.width, screen.height) > 600 ? 'tablet' : 'mobile') : 'desktop' },
        os: { name: '', version: '' }, browser: { name: '', version: '' } },
      getUser: function () { return Promise.resolve(null); },
      getUserToken: function () { return Promise.reject(new Error('userNotAuthenticated')); },
      addAuthListener: noop, removeAuthListener: noop,
      showAuthPrompt: function () { return Promise.reject(new Error('userCancelled')); },
      showAccountLinkPrompt: function () { return Promise.resolve({ response: 'no' }); },
      submitScore: noop,
    },
    game: {
      settings: settings, addSettingsChangeListener: noop, removeSettingsChangeListener: noop,
      gameplayStart: noop, gameplayStop: noop, happytime: noop, loadingStart: noop, loadingStop: noop,
      isInstantMultiplayer: false,
      getInviteParam: function (k) { return params.get(k === 'roomId' ? 'room' : k); },
      inviteLink: function (o) { return 'https://devcangames.com/games/' + slug + '?room=' + encodeURIComponent((o && o.roomId) || ''); },
      updateRoom: noop, leftRoom: noop, addJoinRoomListener: noop, removeJoinRoomListener: noop, showInviteButton: noop, hideInviteButton: noop,
    },
  };
  window.CrazyGames = { SDK: SDK };
})();
