/* DevCan Games SDK: stands in for the CrazyGames SDK v3 when a game runs on devcangames.com (tools/publish_devcan.py
   puts this script where the CrazyGames SDK tag was). Games call the same functions they call on CrazyGames:
   - data.getItem/setItem: the signed-in player's cloud save for this game, loaded before init() resolves; guests get
     null, so the game keeps using localStorage exactly like it does off-platform.
   - ads through Google H5 Games Ads when the portal turns them on (see below); otherwise SDK.ad is undefined, so games
     hide their rewarded buttons and skip midgame breaks.
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

  // Ads: Google H5 Games Ads (Ad Placement API, adBreak) when the portal sets window.DEVCAN_ADS = { client, test }.
  // The game's own requestAd('midgame' | 'rewarded', { adStarted, adFinished, adError }) maps onto adBreak: midgame only
  // where the game already pauses (with at least MIDGAME_GAP_MS between two), rewarded only after the player taps a reward
  // button, and the reward only when Google reports the ad as viewed. No ad available -> adError, the game carries on.
  var ADS = window.DEVCAN_ADS || null, adsReady = false, lastMidgame = 0, MIDGAME_GAP_MS = 90000;
  if (ADS && /[?&]adtest=1(&|$)/.test(location.search)) ADS.test = true; // /games/<slug>?adtest=1 previews Google's test ads
  var adBreak = noop, adConfig = noop;
  if (ADS && ADS.client) {
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.requestNonPersonalizedAds = 1; // family audience: non-personalised ads for everyone
    adBreak = adConfig = function (o) { window.adsbygoogle.push(o); };
    var tag = document.createElement('script');
    tag.async = true; tag.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(ADS.client);
    tag.setAttribute('data-ad-client', ADS.client); tag.setAttribute('data-ad-frequency-hint', '90s'); tag.crossOrigin = 'anonymous';
    if (ADS.test) tag.setAttribute('data-adbreak-test', 'on');
    tag.onerror = function () { adsReady = false; };
    document.head.appendChild(tag);
    adConfig({ sound: 'on', preloadAdBreaks: 'on', onReady: function () { adsReady = true; } });
  }
  function requestAd(type, cb) {
    cb = cb || {}; var started = false, rewarded = false;
    var fail = function () { (cb.adError || noop)({ code: 'unfilled', message: 'No ad available' }); };
    if (!adsReady) { setTimeout(fail, 0); return; }
    if (type === 'midgame') {
      if (Date.now() - lastMidgame < MIDGAME_GAP_MS) { setTimeout(fail, 0); return; }
      adBreak({ type: 'next', name: 'midgame',
        beforeAd: function () { started = true; lastMidgame = Date.now(); (cb.adStarted || noop)(); },
        adBreakDone: function () { if (started) (cb.adFinished || noop)(); else fail(); } });
      return;
    }
    if (type === 'rewarded') {
      adBreak({ type: 'reward', name: 'rewarded',
        beforeReward: function (showAdFn) { showAdFn(); },
        beforeAd: function () { started = true; (cb.adStarted || noop)(); },
        adViewed: function () { rewarded = true; },
        adDismissed: function () { rewarded = false; },
        adBreakDone: function () { if (rewarded) (cb.adFinished || noop)(); else fail(); } });
      return;
    }
    setTimeout(fail, 0);
  }
  var params = new URLSearchParams(location.search);
  var SDK = {
    environment: 'devcan',
    init: function () {
      var adsWait = new Promise(function (resolve) { // give the ad API a moment to get ready, never more than 2.5 s
        if (!ADS || !ADS.client) { resolve(); return; }
        var t0 = Date.now(); (function poll() { if (adsReady || Date.now() - t0 > 2500) resolve(); else setTimeout(poll, 100); })();
      });
      return Promise.all([ask('hello', null, 2500), adsWait]).then(function (r) {
        if (r[0] && r[0].user) { signedIn = true; cache = r[0].saves || {}; }
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
  var adModule = { requestAd: requestAd, hasAdblock: function () { return Promise.resolve(!adsReady); }, addAdblockPopupListener: noop, removeAdblockPopupListener: noop };
  // games check `!!SDK.ad` before offering a rewarded button: it only exists once Google's ad API is ready
  Object.defineProperty(SDK, 'ad', { enumerable: true, get: function () { return adsReady ? adModule : undefined; } });
  window.CrazyGames = { SDK: SDK };
})();
