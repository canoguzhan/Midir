// Where the game server lives. When this site is served by server.py itself (VPS, localhost, LAN IP) everything is same-origin.
// On Vercel, /api is proxied (vercel.json) but WebSockets can't be, so they go straight to the VPS.
// Anywhere else (e.g. a CrazyGames upload) both API and WebSocket go straight to the VPS (server.py sends CORS headers).
(() => {
  const SERVER = 'https://104-207-80-220.sslip.io', h = location.hostname;
  const self = h === 'localhost' || /^[\d.]+$/.test(h) || h.endsWith('sslip.io');
  window.MIDIR_API = self || h.endsWith('vercel.app') ? '' : SERVER;
  window.MIDIR_WS = self ? '' : SERVER.replace('https:', 'wss:') + '/ws';
})();
