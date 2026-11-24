/* RNG, map helpers, field of view, pathfinding and floor generation. */
'use strict';
const T = { WALL: 0, FLOOR: 1, DOOR: 2, LOCKED: 3, STAIRS: 4, ICE: 5, LAVA: 6, MUD: 7, FERN: 8 };
let G = null; // current run

/* ---------- rng (seeded, saved with the run) ---------- */
function rnd() { G.rs = (G.rs + 0x6D2B79F5) | 0; let t = Math.imul(G.rs ^ (G.rs >>> 15), 1 | G.rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const chance = p => rnd() < p;
const pick = a => a[Math.floor(rnd() * a.length)];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = ri(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a; }
function wpick(obj, w) { let s = 0; const ks = Object.keys(obj); for (const k of ks) s += w(obj[k], k); let r = rnd() * s; for (const k of ks) { r -= w(obj[k], k); if (r <= 0) return k; } return ks[0]; }

/* ---------- map helpers ---------- */
const D8 = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
const ix = (x, y) => y * G.w + x;
const inb = (x, y) => x >= 0 && y >= 0 && x < G.w && y < G.h;
const tileAt = (x, y) => inb(x, y) ? G.t[y * G.w + x] : 0;
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const monAt = (x, y) => { for (const m of G.mons) if (m.x === x && m.y === y && m.hp > 0) return m; return null; };
const featAt = (x, y) => { for (const f of G.feats) if (f.x === x && f.y === y) return f; return null; };
const BLOCKF = { chest: 1, barrel: 1, shelf: 1, bed: 1, forge: 1, trader: 1, altar: 1, pool: 1, cage: 1, ped: 1, decor: 1 };
const blockFeat = (x, y) => { const f = featAt(x, y); return f && BLOCKF[f.t] ? f : null; };
const walkable = (x, y) => { const t = tileAt(x, y); return t !== T.WALL && t !== T.LOCKED && !blockFeat(x, y); };
function blocksSight(x, y) {
  const t = tileAt(x, y);
  if (t === T.WALL || t === T.LOCKED) return true;
  if (t === T.DOOR) return !(G.p.x === x && G.p.y === y) && !monAt(x, y);
  if (t === T.FERN) return !(G.p.x === x && G.p.y === y);
  return false;
}
/* a diagonal step may not cut a wall corner */
function canStep(x, y, dx, dy, phase) {
  if (phase) return true;
  if (dx && dy) {
    const a = tileAt(x + dx, y), b = tileAt(x, y + dy);
    if (a === T.WALL || b === T.WALL || a === T.LOCKED || b === T.LOCKED) return false;
    if (tileAt(x, y) === T.DOOR || tileAt(x + dx, y + dy) === T.DOOR) return false;
  }
  return true;
}
function lineTiles(x0, y0, x1, y1) {
  const out = []; let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx - dy, x = x0, y = y0;
  for (let n = 0; n < 80; n++) { if (x === x1 && y === y1) break; const e2 = 2 * e; if (e2 > -dy) { e -= dy; x += sx; } if (e2 < dx) { e += dx; y += sy; } out.push([x, y]); }
  return out;
}
function los(x0, y0, x1, y1) { const l = lineTiles(x0, y0, x1, y1); for (let i = 0; i < l.length - 1; i++) if (blocksSight(l[i][0], l[i][1])) return false; return true; }

/* ---------- field of view: recursive shadowcasting ---------- */
const FOVM = [[1, 0, 0, -1, -1, 0, 0, 1], [0, 1, -1, 0, 0, -1, 1, 0], [0, 1, 1, 0, 0, -1, -1, 0], [1, 0, 0, 1, -1, 0, 0, -1]];
function computeFov() {
  const p = G.p, R = 9; G.vis.fill(0);
  const set = (x, y) => { if (inb(x, y)) { const i = ix(x, y); G.vis[i] = 1; G.seen[i] = 1; } };
  set(p.x, p.y);
  const cast = (row, start, end, xx, xy, yx, yy) => {
    if (start < end) return; let ns = start;
    for (let d = row; d <= R; d++) {
      let blocked = false;
      for (let dx = -d, dy = -d; dx <= 0; dx++) {
        const X = p.x + dx * xx + dy * xy, Y = p.y + dx * yx + dy * yy, ls = (dx - .5) / (dy + .5), rs = (dx + .5) / (dy - .5);
        if (start < rs) continue; if (end > ls) break;
        if (dx * dx + dy * dy <= (R + .5) * (R + .5)) set(X, Y);
        const bl = !inb(X, Y) || blocksSight(X, Y);
        if (blocked) { if (bl) { ns = rs; continue; } blocked = false; start = ns; }
        else if (bl && d < R) { blocked = true; cast(d + 1, start, ls, xx, xy, yx, yy); ns = rs; }
      }
      if (blocked) break;
    }
  };
  for (let o = 0; o < 8; o++) cast(1, 1, 0, FOVM[0][o], FOVM[1][o], FOVM[2][o], FOVM[3][o]);
}

/* ---------- distance maps and paths ---------- */
/* flood from (sx,sy); opts.known limits to explored tiles; opts.avoid avoids lava and known traps */
function flood(sx, sy, opts = {}) {
  const n = G.w * G.h, d = new Int16Array(n).fill(-1), q = [ix(sx, sy)]; d[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % G.w, y = (i / G.w) | 0, dd = d[i] + 1;
    if (opts.max && dd > opts.max) continue;
    for (const [dx, dy] of D8) {
      const X = x + dx, Y = y + dy; if (!inb(X, Y)) continue; const j = ix(X, Y); if (d[j] >= 0) continue;
      if (!opts.bf ? !walkable(X, Y) : !(G.bw[j])) continue;
      if (!canStep(x, y, dx, dy)) continue;
      if (opts.known && !G.seen[j]) continue;
      if (opts.avoid && G.t[j] === T.LAVA) continue;
      if (opts.avoid && G.trapSeen && G.trapSeen[j]) continue;
      d[j] = dd; q.push(j);
    }
  }
  return d;
}
/* cached walkability grid, rebuilt each turn, to keep floods cheap */
function buildWalk() {
  const n = G.w * G.h; if (!G.bw || G.bw.length !== n) G.bw = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const t = G.t[i]; G.bw[i] = t !== T.WALL && t !== T.LOCKED ? 1 : 0; }
  G.trapSeen = null;
  for (const f of G.feats) { if (BLOCKF[f.t]) G.bw[ix(f.x, f.y)] = 0; else if (f.t === 'trap' && f.seen && !f.used) { (G.trapSeen = G.trapSeen || {})[ix(f.x, f.y)] = 1; } }
}
/* path from player to target (target itself may be a blocking feature) */
function pathTo(tx, ty, known = true) {
  const p = G.p; buildWalk(); const tj = ix(tx, ty), save = G.bw[tj], st = G.trapSeen && G.trapSeen[tj]; G.bw[tj] = 1; if (st) delete G.trapSeen[tj];
  let d = flood(tx, ty, { bf: 1, known, avoid: 1 });
  if (d[ix(p.x, p.y)] < 0) d = flood(tx, ty, { bf: 1, known });
  G.bw[tj] = save; if (st) G.trapSeen[tj] = 1;
  if (d[ix(p.x, p.y)] < 0) return null;
  const out = []; let x = p.x, y = p.y;
  for (let n = 0; n < 400 && !(x === tx && y === ty); n++) {
    let best = null, bd = d[ix(x, y)];
    for (const [dx, dy] of D8) { const X = x + dx, Y = y + dy; if (!inb(X, Y)) continue; const v = d[ix(X, Y)]; if (v < 0 || v >= bd || !canStep(x, y, dx, dy)) continue; if (!best || v < best[2]) best = [X, Y, v]; }
    if (!best) return null; x = best[0]; y = best[1]; out.push([x, y]);
  }
  return out;
}

/* ---------- floor generation ---------- */
const zoneIdx = f => Math.floor((f - 1) / FLOORS_PER_ZONE) % ZONES.length;
const zoneOf = f => ZONES[zoneIdx(f)];
const isBossFloor = f => f % FLOORS_PER_ZONE === 0;

function genFloor(f) {
  for (let tries = 0; tries < 60; tries++) { if (tryGen(f)) return; }
  throw new Error('floor generation failed');
}
function tryGen(f) {
  const boss = isBossFloor(f), z = zoneOf(f), zi = zoneIdx(f);
  const CS = 9, cols = boss ? 3 : 3, rows = boss ? 4 : (f < 3 ? 3 : f < 9 ? 4 : 5);
  G.w = cols * CS + 1; G.h = rows * CS + 1; const n = G.w * G.h;
  G.t = new Uint8Array(n); G.seen = new Uint8Array(n); G.vis = new Uint8Array(n); G.deco = new Uint8Array(n);
  G.mons = []; G.items = []; G.feats = []; G.rooms = []; G.bw = null; G.floorTurn = 0; G.bossDead = false; G.key = false;
  for (let i = 0; i < n; i++) G.deco[i] = ri(0, 15);
  const cell = {}, key = (c, r) => c + ',' + r;
  /* rooms */
  if (boss) {
    /* bottom row: start; then rooms; top 3x? arena */
    addRoom(0, 'arena', 4, 1, 19, 14);
    for (let c = 0; c < 3; c++) { if (c !== 1 && chance(.35)) continue; mk(c, 2); }
    mk(1, 3); if (chance(.6)) mk(pick([0, 2]), 3);
  } else {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { if (chance(.12)) continue; mk(c, r); }
  }
  function mk(c, r) {
    const ox = ri(1, 2), oy = ri(1, 2), w = ri(4, 7 - ox), h = ri(4, 7 - oy), x = c * CS + ox, y = r * CS + oy;
    cell[key(c, r)] = addRoom(0, '', x, y, w, h); cell[key(c, r)].c = c; cell[key(c, r)].r = r;
  }
  function addRoom(_, kind, x, y, w, h) {
    const R = { id: G.rooms.length, kind, x, y, w, h, deg: 0, doors: [], adj: [] }; G.rooms.push(R);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) G.t[ix(xx, yy)] = T.FLOOR;
    return R;
  }
  if (G.rooms.length < (boss ? 3 : 6)) return false;
  /* edges between neighbouring cells */
  const edges = [];
  for (const k in cell) { const a = cell[k]; for (const [dc, dr] of [[1, 0], [0, 1]]) { const b = cell[key(a.c + dc, a.r + dr)]; if (b) edges.push([a, b, dc ? 'h' : 'v']); } }
  shuffle(edges);
  const par = G.rooms.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
  const used = [];
  for (const e of edges) { const a = find(e[0].id), b = find(e[1].id); if (a !== b) { par[a] = b; used.push(e); } else if (chance(.28)) used.push(e); }
  if (boss) { const a = cell['1,2']; used.push([G.rooms[0], a, 'V']); par[find(0)] = find(a.id); }
  const root = find(0); for (const r of G.rooms) if (find(r.id) !== root) return false;
  for (const [a, b, dir] of used) {
    let x1, y1, x2, y2;
    if (dir === 'h') {
      x1 = a.x + a.w; y1 = ri(a.y, a.y + a.h - 1); x2 = b.x - 1; y2 = ri(b.y, b.y + b.h - 1); const mx = (a.c + 1) * CS - 1 + (x2 > (a.c + 1) * CS ? 0 : 0);
      for (let x = x1; x <= mx; x++) carve(x, y1); for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) carve(mx, y); for (let x = mx; x <= x2; x++) carve(x, y2);
    } else {
      x1 = ri(a.x, a.x + a.w - 1); y1 = a.y + a.h; x2 = ri(b.x, b.x + b.w - 1); y2 = b.y - 1;
      if (dir === 'V') { x1 = x2 = Math.max(a.x, Math.min(a.x + a.w - 1, x2)); }
      const my = dir === 'V' ? y2 : (a.r + 1) * CS - 1;
      for (let y = y1; y <= my; y++) carve(x1, y); for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) carve(x, my); for (let y = my; y <= y2; y++) carve(x2, y);
    }
    const da = [x1, y1], db = [x2, y2]; G.t[ix(...da)] = T.DOOR; if (dir === 'V' ? y1 !== y2 : 1) G.t[ix(...db)] = T.DOOR;
    a.deg++; b.deg++; a.doors.push(da); b.doors.push(db); a.adj.push(b.id); b.adj.push(a.id);
  }
  function carve(x, y) { if (G.t[ix(x, y)] === T.WALL) G.t[ix(x, y)] = T.FLOOR; }
  /* a door must have rock on two opposite sides, or it looks silly */
  for (let y = 1; y < G.h - 1; y++) for (let x = 1; x < G.w - 1; x++) if (G.t[ix(x, y)] === T.DOOR) {
    const hz = tileAt(x - 1, y) === T.WALL && tileAt(x + 1, y) === T.WALL, vt = tileAt(x, y - 1) === T.WALL && tileAt(x, y + 1) === T.WALL;
    if (!hz && !vt) G.t[ix(x, y)] = T.FLOOR;
  }
  const roomOfDoor = (x, y, R) => { for (const [a, b] of R.doors) if (Math.abs(a - x) + Math.abs(b - y) <= 1) return true; return false; };
  const bfs = id => { const d = G.rooms.map(() => -1); d[id] = 0; const q = [id]; for (let h = 0; h < q.length; h++) for (const j of G.rooms[q[h]].adj) if (d[j] < 0) { d[j] = d[q[h]] + 1; q.push(j); } return d; };
  /* start and stairs rooms */
  let start, end;
  if (boss) { start = cell['1,3']; end = G.rooms[0]; }
  else {
    start = pick(G.rooms.filter(r => r.deg <= 2)) || pick(G.rooms); const d = bfs(start.id);
    end = G.rooms.slice().sort((a, b) => d[b.id] - d[a.id])[0];
  }
  start.kind = 'start'; if (!boss) end.kind = 'end';
  const dist = bfs(start.id);
  /* placing things */
  const free = (x, y) => G.t[ix(x, y)] === T.FLOOR && !(x === G.p.x && y === G.p.y) && !featAt(x, y) && !G.items.some(i => i.x === x && i.y === y);
  const spot = (R, o = {}) => {
    for (let k = 0; k < 60; k++) {
      const x = ri(R.x, R.x + R.w - 1), y = o.top ? R.y : ri(R.y, R.y + R.h - 1);
      if (!free(x, y) || monAt(x, y)) continue; if (o.block && roomOfDoor(x, y, R)) continue;
      if (o.mid && (x === R.x || y === R.y || x === R.x + R.w - 1 || y === R.y + R.h - 1)) continue;
      if (o.away && cheb(x, y, G.p.x, G.p.y) < o.away) continue; return [x, y];
    } return null;
  };
  G.spot = spot;
  const feat = (R, t, o = {}) => { const s = spot(R, { block: 1, ...o }); if (!s) return null; const F = { t, x: s[0], y: s[1], used: 0, ...(o.props || {}) }; G.feats.push(F); return F; };
  /* shape: pillars, nibbled corners */
  for (const R of G.rooms) {
    if (R.kind === 'arena') { for (const [px, py] of [[R.x + 3, R.y + 3], [R.x + R.w - 4, R.y + 3], [R.x + 3, R.y + R.h - 4], [R.x + R.w - 4, R.y + R.h - 4]]) G.t[ix(px, py)] = T.WALL; continue; }
    if (zi > 0 && zi < 5) for (const [cx, cy] of [[R.x, R.y], [R.x + R.w - 1, R.y], [R.x, R.y + R.h - 1], [R.x + R.w - 1, R.y + R.h - 1]]) if (chance(.55) && !roomOfDoor(cx, cy, R)) G.t[ix(cx, cy)] = T.WALL;
    if (R.w >= 5 && R.h >= 5 && chance(.22)) { const px = R.x + (R.w >> 1), py = R.y + (R.h >> 1); G.t[ix(px, py)] = T.WALL; }
  }
  /* liquids */
  if (z.liquid) {
    const tt = { ice: T.ICE, fern: T.FERN, lava: T.LAVA, mud: T.MUD }[z.liquid];
    for (const R of G.rooms) {
      if (R.kind === 'start' || !chance(R.kind === 'arena' ? .8 : .42)) continue;
      for (let b = 0, nb = R.kind === 'arena' ? 3 : 1; b < nb; b++) {
        let x = ri(R.x, R.x + R.w - 1), y = ri(R.y, R.y + R.h - 1);
        for (let k = ri(4, tt === T.FERN ? 12 : 8); k > 0; k--) {
          if (x >= R.x && y >= R.y && x < R.x + R.w && y < R.y + R.h && G.t[ix(x, y)] === T.FLOOR && !(tt === T.LAVA && roomOfDoor(x, y, R))) G.t[ix(x, y)] = tt;
          const s = pick(D8); x = Math.max(R.x, Math.min(R.x + R.w - 1, x + s[0])); y = Math.max(R.y, Math.min(R.y + R.h - 1, y + s[1]));
        }
      }
    }
  }
  /* player and stairs */
  const ps = spot(start, {}); if (!ps) return false; G.p.x = ps[0]; G.p.y = ps[1];
  let es;
  if (boss) { es = [end.x + (end.w >> 1), end.y]; G.stairs = es; }
  else { es = spot(end, { block: 1 }); if (!es) return false; G.t[ix(...es)] = T.STAIRS; G.stairs = es; }
  /* ---- special rooms ---- */
  const inZone = ((f - 1) % FLOORS_PER_ZONE) + 1;
  const plain = () => shuffle(G.rooms.filter(r => !r.kind));
  const takeDead = () => { const r = plain().filter(r => r.deg === 1); return r[0]; };
  const take = () => plain().sort((a, b) => a.deg - b.deg)[0];
  let R;
  if (boss) { feat(start, 'bed'); R = take(); if (R) { R.kind = 'store'; feat(R, 'chest', { props: { q: 1 } }); feat(R, 'barrel'); } }
  else {
    if ((R = takeDead()) && chance(.62)) {
      R.kind = 'vault'; const [dx, dy] = R.doors[0]; G.t[ix(dx, dy)] = T.LOCKED;
      const opts = vaultChoices(f);
      const mx = R.x + (R.w >> 1), my = R.y + (R.h >> 1); let pi = 0;
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1]]) { const x = mx + ox, y = my + oy; G.t[ix(x, y)] = T.FLOOR; G.feats.push({ t: 'ped', x, y, used: 0, it: opts[pi++] }); }
      G.needKey = true;
    } else G.needKey = false;
    if (inZone === 2 && (R = take())) { R.kind = 'shop'; const F = feat(R, 'trader', { mid: 1 }); if (F) F.stock = shopStock(f); }
    if (inZone === 3 && (R = take())) { R.kind = 'forge'; feat(R, 'forge', { mid: 1, props: { left: 2 } }); }
    if (chance(.36) && (R = take())) { R.kind = 'shrine'; feat(R, 'altar', { mid: 1, props: { opts: shuffle(BOONS.slice()).slice(0, 3).map(b => b.id) } }); }
    if (chance(.30) && (R = take())) { R.kind = 'pool'; feat(R, 'pool', { mid: 1 }); }
    if (chance(.26) && (R = take())) { R.kind = 'library'; for (let k = ri(2, 3); k > 0; k--) feat(R, 'shelf', { top: 1 }); }
    if (f >= 3 && chance(.24) && (R = take())) { R.kind = 'arena2'; feat(R, 'circle', { mid: 1 }); }
    if (f >= 5 && f <= 8 && !G.p.luigi && !G.luigiPlaced && (f >= 7 || chance(.5)) && (R = take())) { R.kind = 'cage'; if (feat(R, 'cage', { mid: 1 })) G.luigiPlaced = 1; }
    if (f >= 2 && chance(.4) && (R = plain()[0])) { R.kind = 'den'; feat(R, 'chest', { props: { q: 1 } }); }
  }
  /* decor, chests, barrels, traps */
  for (const R of G.rooms) {
    if (R.kind === 'arena' || R.kind === 'vault') continue;
    if (R.w * R.h >= 20 && chance(.5)) { const F = feat(R, 'decor', { props: { art: pick(z.props) } }); if (F && F.art === 'barrel') F.t = 'barrel'; }
    if (chance(.16)) feat(R, 'barrel');
  }
  const loose = G.rooms.filter(r => !['start', 'vault', 'arena', 'shop'].includes(r.kind));
  for (let k = boss ? 0 : ri(1, 2); k > 0; k--) { const R = pick(loose); if (R) feat(R, 'chest', { props: { q: 0 } }); }
  for (let k = Math.min(5, 1 + (f >> 2) + ri(0, 1)); k > 0; k--) { const R = pick(loose), s = R && spot(R); if (s) G.feats.push({ t: 'trap', x: s[0], y: s[1], used: 0, seen: 0, kind: pick(f < 4 ? ['spike', 'alarm'] : f < 9 ? ['spike', 'alarm', 'gas', 'web'] : ['spike', 'alarm', 'gas', 'web', 'fire', 'fire']) }); }
  /* torches are decoration on walls above floor */
  G.torches = [];
  for (const R of G.rooms) { const x = R.x + ri(0, R.w - 1); if (tileAt(x, R.y - 1) === T.WALL && tileAt(x, R.y) !== T.WALL) G.torches.push([x, R.y - 1]); }
  /* everything walkable must be reachable (the vault through its lock) */
  const lockI = []; for (let i = 0; i < n; i++) if (G.t[i] === T.LOCKED) { lockI.push(i); G.t[i] = T.DOOR; }
  buildWalk(); const reach = flood(G.p.x, G.p.y, { bf: 1 });
  let ok = true;
  for (const R of G.rooms) for (const [x, y] of R.doors) if (reach[ix(x, y)] < 0) ok = false;
  if (!boss && reach[ix(...es)] < 0) ok = false;
  for (const F of G.feats) if (BLOCKF[F.t] && F.t !== 'decor') { if (!D8.some(([dx, dy]) => inb(F.x + dx, F.y + dy) && reach[ix(F.x + dx, F.y + dy)] >= 0)) ok = false; }
  for (const i of lockI) G.t[i] = T.LOCKED;
  if (!ok) return false;
  if (lockI.length) { buildWalk(); const r2 = flood(G.p.x, G.p.y, { bf: 1 }); for (const R of G.rooms) if (R.kind !== 'vault' && r2[ix(R.x + (R.w >> 1), R.y + (R.h >> 1))] < 0 && G.t[ix(R.x + (R.w >> 1), R.y + (R.h >> 1))] !== T.WALL && !blockFeat(R.x + (R.w >> 1), R.y + (R.h >> 1))) return false; if (!boss && r2[ix(...es)] < 0) return false; }
  /* lava must never be the only way: stairs reachable avoiding it */
  if (z.liquid === 'lava') { const r3 = flood(G.p.x, G.p.y, { bf: 1, avoid: 1 }); for (const R of G.rooms) for (const [x, y] of R.doors) if (r3[ix(x, y)] < 0 && reach[ix(x, y)] >= 0 && R.kind !== 'vault') return false; }
  /* ---- monsters ---- */
  const lootRooms = G.rooms.filter(r => !['vault', 'shop', 'start', 'arena'].includes(r.kind));
  if (boss) {
    spawnMon(f > WIN_FLOOR && zi === 5 ? 'ancient' : z.boss, end.x + (end.w >> 1), end.y + 3, f, { sleep: 1 });
    let nb = 3 + (f >> 3); for (let k = 0; k < nb; k++) { const R = pick(lootRooms.length ? lootRooms : [G.rooms[1]]); if (R && R !== start) { const s = spot(R); if (s) spawnMon(pick(z.pool), s[0], s[1], f); } }
  } else {
    let budget = 4.2 + Math.min(7, f * .30) + G.rooms.length * .34;
    for (let guard = 0; budget > 0 && guard < 60; guard++) {
      const R = pick(lootRooms); if (!R || ((R.kind === 'pool' || R.kind === 'shrine' || R.kind === 'forge') && chance(.6))) continue;
      const k = pick(z.pool), m = MON[k], cnt = m.pack ? ri(m.pack[0] - (f < 2 ? 1 : 0), m.pack[1]) : 1;
      const awake = chance(.25);
      for (let c = 0; c < cnt; c++) { const s = spot(R, { away: 6 }); if (s) spawnMon(k, s[0], s[1], f, { wander: awake }); }
      budget -= cnt * (m.pack ? .7 : 1) * (m.hp > 1.2 ? 1.3 : 1);
    }
    const den = G.rooms.find(r => r.kind === 'den'); if (den) { const k = pick(z.pool); for (let c = 0; c < ri(2, 3); c++) { const s = spot(den, { away: 5 }); if (s) spawnMon(k, s[0], s[1], f); } }
    const mb = MINIBOSS[f] || (f > WIN_FLOOR && inZone === 2 ? pick(['thornback', 'bonelord', 'royal']) : null);
    if (mb) { const s = spot(end, { away: 5 }); if (s) spawnMon(mb, s[0], s[1], f, { sleep: 1 }); }
  }
  /* ---- floor items ---- */
  const drop = (it, R) => { const s = spot(R || pick(lootRooms.length ? lootRooms : [start])); if (s) G.items.push({ ...it, x: s[0], y: s[1] }); };
  const nItems = boss ? 1 : ri(2, 3) + (f === 1 ? 1 : 0);
  for (let k = 0; k < nItems; k++) drop(rollItem(f));
  for (let k = boss ? 1 : ri(2, 3); k > 0; k--) drop({ k: 'gold', q: goldAmt(f) });
  /* pity timers keep every run fed and patched up */
  G.p.pity.food += 1; G.p.pity.heal += 1; G.p.pity.forge += 1;
  if (G.p.pity.food >= 2 || (f > 1 && chance(.1))) { drop({ k: 'food', t: 'pasty', q: 1 }); G.p.pity.food = 0; }
  if (f <= 2 || G.p.pity.heal >= 3 || chance(.3)) { drop({ k: 'potion', t: 'heal', q: 1 }); G.p.pity.heal = 0; }
  if (G.p.pity.forge >= 2 || chance(.3)) { drop({ k: 'scroll', t: 'forge', q: 1 }); G.p.pity.forge = 0; }
  if (f === 2 || (f > 2 && f % 5 === 0)) drop({ k: 'tome', t: rollTome() });
  if (G.needKey) { const c = G.mons.filter(m => !m.boss); if (c.length && chance(.5)) { pick(c).key = 1; } else drop({ k: 'key', q: 1 }); if (!c.length && !G.items.some(i => i.k === 'key')) return false; if (!G.mons.some(m => m.key) && !G.items.some(i => i.k === 'key')) return false; }
  buildWalk(); const last = flood(G.p.x, G.p.y, { bf: 1 });
  for (const m of G.mons) if (last[ix(m.x, m.y)] < 0) return false;
  for (const it of G.items) if (last[ix(it.x, it.y)] < 0) return false;
  return true;
}
