/* Offline play. Bump VERSION on every deploy. */
const VERSION = 'oliver-below-v4';
const CORE = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'assets/icon-180.png', 'assets/icon-192.png', 'assets/hero.webp',
  ...['atlas', 'data', 'dungeon', 'engine', 'audio', 'render', 'ui', 'main'].map(n => `js/${n}.js`),
  ...['mon', 'port', 'icon', 'tile', 'prop', 'gate_barrow', 'gate_ice', 'gate_grove', 'gate_caldera', 'gate_temple', 'gate_castle'].map(n => `assets/${n}.webp`),
  'assets/layers/base.webp', ...['body', 'head', 'hands', 'legs', 'feet'].flatMap(s => [0, 1, 2, 3, 4, 5].map(t => `assets/layers/${s}${t}.webp`)),
  ...['hit', 'swing', 'dodge', 'tap', 'coin', 'chop', 'mine', 'craft', 'level_up', 'nap', 'quest'].map(n => `assets/sfx/${n}.mp3`)];
const MUSIC = VERSION + '-music';
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('oliver-below') && k !== VERSION && k !== MUSIC).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    if (hit) return ranged(e.request, hit);
    if (e.request.url.includes('/music/')) return fetch(e.request.url).then(r => { if (r.status === 200) { const c = r.clone(); caches.open(MUSIC).then(m => m.put(e.request.url, c)); } return ranged(e.request, r); });
    return fetch(e.request);
  }));
});
/* Safari asks for media in byte ranges and refuses a plain 200 from a cache */
async function ranged(req, res) {
  const h = req.headers.get('range'); if (!h || res.status !== 200) return res;
  const b = await res.arrayBuffer(), m = /bytes=(\d+)-(\d*)/.exec(h); if (!m) return new Response(b, { headers: res.headers });
  const s = +m[1], x = Math.min(m[2] ? +m[2] : b.byteLength - 1, b.byteLength - 1);
  return new Response(b.slice(s, x + 1), { status: 206, headers: { 'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg', 'Content-Range': `bytes ${s}-${x}/${b.byteLength}`, 'Content-Length': String(x - s + 1), 'Accept-Ranges': 'bytes' } });
}
/* other apps on this origin may clear every cache when they update: refill whatever is missing */
self.addEventListener('message', e => { if (e.data === 'refill') e.waitUntil(caches.open(VERSION).then(async c => { const have = new Set((await c.keys()).map(r => r.url)); await Promise.all(CORE.map(u => have.has(new URL(u, location.href).href) ? 0 : c.add(new Request(u, { cache: 'reload' })).catch(() => 0))); })); });
