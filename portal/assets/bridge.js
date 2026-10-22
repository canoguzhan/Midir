// Game page side of the save bridge: answers the game frame (portal/assets/devcan-sdk.js) with the signed-in player's
// cloud save for this game and stores what the game saves. Only messages from the game frame's own window are answered.
(function () {
  'use strict';
  var frame = document.getElementById('frame'); if (!frame) return;
  var game = frame.dataset.game, frameOrigin = new URL(frame.src, location.href).origin;
  function reply(id, payload) { frame.contentWindow.postMessage({ dc: 1, id: id, payload: payload }, frameOrigin); }
  window.addEventListener('message', function (ev) {
    if (ev.origin !== frameOrigin || ev.source !== frame.contentWindow) return;
    var m = ev.data; if (!m || m.dc !== 1 || m.game !== game) return;
    if (m.op === 'hello') {
      fetch('/api/saves/' + encodeURIComponent(game), { credentials: 'same-origin' }).then(function (r) { return r.json(); })
        .then(function (d) { reply(m.id, d); }).catch(function () { reply(m.id, { user: null, saves: {} }); });
    } else if (m.op === 'save' && m.payload && m.payload.items) {
      fetch('/api/saves/' + encodeURIComponent(game), { method: 'PUT', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: m.payload.items }) })
        .then(function (r) { reply(m.id, { ok: r.ok }); }).catch(function () { reply(m.id, { ok: false }); });
    }
  });
  var fs = document.getElementById('fs');
  if (fs) fs.addEventListener('click', function () { var s = document.getElementById('stage'); (s.requestFullscreen || s.webkitRequestFullscreen || function () {}).call(s); frame.focus(); });
  frame.focus();
})();
