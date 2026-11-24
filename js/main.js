/* Input, travel, auto-explore, rest, timing. */
'use strict';
const Main = (() => {
  const M = {}; let run = null, timer = 0, lastAct = performance.now(), lock = 0, hold = null;
  M.stop = () => { run = null; clearTimeout(timer); R.st.path = null; };
  const busy = () => !G || UI.screen !== 'game' || G.over || !$('modal').hidden || !$('sheet').hidden;
  /* time played: gaps of over 25 seconds do not count */
  function tick() { const n = performance.now(); if (G && UI.screen === 'game') G.time += Math.min(25, (n - lastAct) / 1000); lastAct = n; }

  M.start = (kit, seed, mode) => { UI.fade(); Save.clear(); FX.on = true; FX.q = []; R.reset(); newGame(kit, seed, mode || 'normal'); enter(); if (!Meta.d.runs.length) setTimeout(() => UI.tip('move', TIPS[0] + ' Nothing moves until you do.'), 2400); };
  M.resume = () => { UI.fade(); FX.on = true; FX.q = []; R.reset(); if (!Save.load()) { Save.clear(); return UI.title(); } FX.q = []; enter(); UI.onFloor(); };
  function enter() { UI.show('game'); lastAct = performance.now(); R.recompose(); UI.hud(); Save.put(); UI.pending(); }

  /* after every action: refresh, tips, dialogs, end of run */
  M.after = () => {
    tick(); UI.hud(); if (G.over) { if (G.over.done) return; G.over.done = 1; M.stop(); UI.record(); if (!$('sheet').hidden) UI.close(); setTimeout(() => { UI.fade(); setTimeout(() => UI.over(), 260); }, G.over.home ? 100 : 900); return; }
    if (UI.pending()) { Save.put(); return; } tips(); Save.put();
  };
  function tips() {
    if (G.mons.some(m => m.intent && visible(m.x, m.y))) UI.tip('intent', TIPS[1]); else if (awakeInView().length >= 2) UI.tip('door', TIPS[2]); else if (awakeInView().length) UI.tip('fight', 'Tap a monster beside you to attack. Hold a finger on one to see how tough it is.');
    else if (G.p.bag.some(b => UI.better(b))) UI.tip('gear', 'You found something better than what you are wearing. Open your Bag: ▲ marks upgrades.'); else if (G.p.bag.some(b => (b.k === 'potion' || b.k === 'scroll') && !known(b.k, b.t))) UI.tip('unk', TIPS[3]); else if (G.p.hp < S.maxHp * .5) UI.tip('rest', TIPS[6]);
    else if (G.stairs && tileAt(...G.stairs) === T.STAIRS && visible(...G.stairs)) UI.tip('stairs', 'Those stairs go down. There is no way back up, so look around first.'); else if (G.p.food < 200) UI.tip('hungry', 'Hungry. Eat a pasty from your Bag before you starve.');
  }
  const threatKey = () => hostilesInView().map(m => m.id).sort().join();

  /* ---- walking loops: travel, explore, rest ---- */
  function loop() {
    clearTimeout(timer); if (!run || busy()) { M.stop(); UI.hud(); return; } const p = G.p, hp = p.hp;
    if (run.kind === 'rest') {
      if (awakeInView().length || p.food < 5 || (p.hp >= S.maxHp && p.mp >= S.maxMp) || run.n++ > 600) { const t = p.hp >= S.maxHp ? 'Rested.' : ''; if (t) say(t); M.stop(); UI.hud(); return; }
      const before = threatKey(); for (let k = 0; k < 3 && run && !G.over; k++) { ACT.wait(); if (threatKey() !== before || p.hp < hp || G.pending.length) { M.after(); M.stop(); return; } } M.after(); if (run) timer = setTimeout(loop, 40); return;
    }
    let path = run.path;
    if (run.kind === 'explore' && (!path || !path.length)) { const t = exploreTarget(); if (!t) { const s = G.stairs; if (s && tileAt(...s) === T.STAIRS && G.seen[ix(...s)] && !(p.x === s[0] && p.y === s[1])) { if (!run.said) { say('Nothing left to find. Heading for the stairs.'); run.said = 1; } path = pathTo(...s); } else { say(isBossFloor(G.floor) && !G.bossDead ? 'Nothing left, except whatever guards the stairs.' : 'Explored.'); M.stop(); UI.hud(); return; } } else path = pathTo(...t); run.path = path; }
    if (!path || !path.length) { M.stop(); UI.hud(); return; }
    const [x, y] = path[0]; if (cheb(x, y, p.x, p.y) !== 1) { M.stop(); return; }
    const m = monAt(x, y); if (m && path.length > 0 && !(run.kind === 'travel' && run.attack)) { if (visible(x, y)) { M.stop(); UI.hud(); return; } }
    if (dangerAt(x, y) && run.kind !== 'step') { M.stop(); UI.hud(); return; }
    path.shift(); R.st.path = run.kind === 'travel' ? path : null; const tk = threatKey(), bag = p.bag.length, fl = G.floor, st = Object.keys(p.st).length; const ok = ACT.move(x - p.x, y - p.y); M.after();
    if (!ok || !run || G.over || G.floor !== fl) { M.stop(); return; } const nk = threatKey();
    const fresh = nk.split(',').some(i => i && !tk.split(',').includes(i));
    if (fresh || p.hp < hp || Object.keys(p.st).length > st || (awakeInView().length && run.kind === 'explore') || (run.kind === 'travel' && awakeInView().length && !run.brave)) { M.stop(); UI.hud(); return; }
    if (!path.length && run.kind !== 'explore') { M.stop(); UI.hud(); return; } if (run.kind === 'explore' && tileAt(p.x, p.y) === T.STAIRS && !path.length) { M.stop(); UI.hud(); return; }
    timer = setTimeout(loop, 92);
  }
  M.travel = (x, y) => { M.stop(); const path = pathTo(x, y); if (!path || !path.length) return; run = { kind: 'travel', path, brave: 0 }; loop(); };
  M.explore = () => { if (run) { M.stop(); return; } if (awakeInView().length) { say('Not with company.', 'bad'); UI.hud(); return; } M.stop(); run = { kind: 'explore' }; loop(); };
  M.rest = () => { if (awakeInView().length) { say('Not with company.', 'bad'); UI.hud(); return; } M.stop(); run = { kind: 'rest', n: 0 }; loop(); };
  M.aim = o => { UI.target(o); UI.hud(); };
  const acted = r => { lock = performance.now() + (awakeInView().length ? 120 : 60); M.after(); return r; };

  function tapTile(x, y) {
    if (!inb(x, y)) return; const p = G.p, tg = R.st.target;
    if (tg) { UI.target(null); if (cheb(x, y, p.x, p.y) > tg.range || !visible(x, y)) { say('Out of reach.'); UI.hud(); return; } if (tg.item) acted(ACT.throwAt(tg.item, x, y)); else acted(ACT.cast(tg.spell, x, y)); return; }
    if (run) { M.stop(); UI.hud(); return; }
    if (x === p.x && y === p.y) { if (tileAt(x, y) === T.STAIRS) return descend(); const it = G.items.findIndex(i => i.x === x && i.y === y); if (it >= 0) { if (give(G.items[it])) G.items.splice(it, 1); acted(end(100)); } return; }
    const m = monAt(x, y) && (visible(x, y) || monAt(x, y).reveal) ? monAt(x, y) : null;
    if (m && visible(x, y)) { if (reachTarget(m)) return acted(ACT.attack(m)); const path = pathTo(x, y, false); if (path && path.length > 0 && !monAt(...path[0])) return acted(ACT.move(path[0][0] - p.x, path[0][1] - p.y)); return; }
    if (cheb(x, y, p.x, p.y) === 1) { if (canStep(p.x, p.y, x - p.x, y - p.y)) return acted(ACT.move(x - p.x, y - p.y)); }
    if (!G.seen[ix(x, y)]) return; if (G.t[ix(x, y)] === T.WALL) return;
    if (awakeInView().length) { const path = pathTo(x, y); if (path && path.length) acted(ACT.move(path[0][0] - p.x, path[0][1] - p.y)); return; }
    M.travel(x, y);
  }
  function descend() { M.stop(); $('fade').classList.add('on'); setTimeout(() => { ACT.descend(); lock = performance.now() + 250; M.after(); setTimeout(() => $('fade').classList.remove('on'), 60); }, 260); }

  /* ---- touch: tap, hold to inspect, swipe to step ---- */
  const cv = $('cv'); let pd = null;
  cv.addEventListener('pointerdown', e => { if (busy()) return; pd = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; clearTimeout(hold); hold = setTimeout(() => { if (!pd) return; const [tx, ty] = R.toTile(pd.x, pd.y); const m = inb(tx, ty) && monAt(tx, ty); if (m && visible(tx, ty)) { pd = null; M.stop(); UI.inspect(m); } }, 420); });
  cv.addEventListener('pointerup', e => {
    clearTimeout(hold); if (!pd || busy()) { pd = null; return; } const dx = e.clientX - pd.x, dy = e.clientY - pd.y, d = Math.hypot(dx, dy), s = pd; pd = null; if (performance.now() < lock) return;
    if (d > 26) { if (run) M.stop(); const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)); const v = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]][(a + 8) % 8]; if (R.st.target) return; acted(ACT.move(v[0], v[1])); return; }
    tapTile(...R.toTile(s.x, s.y));
  });
  cv.addEventListener('pointercancel', () => { clearTimeout(hold); pd = null; });
  document.addEventListener('contextmenu', e => e.preventDefault()); document.addEventListener('gesturestart', e => e.preventDefault()); document.addEventListener('dblclick', e => e.preventDefault());

  /* ---- buttons ---- */
  let waitT = 0, waited = false;
  $('bar').addEventListener('pointerdown', e => { const b = e.target.closest('button'); if (b && b.dataset.a === 'wait' && !busy()) { waited = false; waitT = setTimeout(() => { waited = true; M.rest(); }, 380); } });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('bar').addEventListener(ev, () => clearTimeout(waitT));
  function command(a, d = {}) {
    if (busy()) return; if (a === 'wait' && waited) { waited = false; return; } if (a !== 'explore' && run) { M.stop(); if (a === 'wait') { UI.hud(); return; } }
    if (a === 'wait') { if (waited) { waited = false; return; } return acted(ACT.wait()); } if (a === 'explore') { UI.target(null); return M.explore(); } if (a === 'bag') { UI.target(null); return UI.open('bag'); } if (a === 'descend') return descend();
    if (a === 'heal') { const it = G.p.bag.find(b => b.k === 'potion' && b.t === 'heal'); if (it) acted(useItem(it)); else { say('No healing potions left.', 'bad'); UI.hud(); } return; }
    if (a === 'spell') { const s = d.s; if (R.st.target && R.st.target.spell === s) return UI.target(null); if (!canCast(s)) { say(G.p.st.silence ? 'You cannot speak the words.' : 'Not enough mana.', 'bad'); UI.hud(); return; } if (!SPELLS[s].tgt) { UI.target(null); return acted(ACT.cast(s)); } return M.aim({ spell: s, range: spellRange(s), label: `${SPELLS[s].n}: tap ${s === 'blink' ? 'a spot' : 'a target'}` }); }
  }
  $('foot').addEventListener('click', e => { const b = e.target.closest('button'); if (b) command(b.dataset.a, b.dataset); });
  $('target').querySelector('button').addEventListener('click', () => UI.target(null));
  $('hudCard').addEventListener('click', () => { if (!busy()) UI.open('hero'); }); $('btnMap').addEventListener('click', () => { if (!busy()) UI.open('map'); }); $('btnMenu').addEventListener('click', () => { if (!busy()) UI.menu(); });
  addEventListener('keydown', e => {
    if (UI.screen !== 'game' || !G) return; if (e.key === 'Escape') { if (R.st.target) return UI.target(null); if (!$('sheet').hidden) return UI.close(); if (!$('modal').hidden) { if (U_close()) return; } else return UI.menu(); }
    if (busy()) return; const k = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], q: [-1, -1], e: [1, -1], z: [-1, 1], c: [1, 1] }[e.key];
    if (k) { e.preventDefault(); if (run) M.stop(); acted(ACT.move(...k)); } else if (e.key === ' ' || e.key === '.') { e.preventDefault(); command('wait'); } else if (e.key === 'x') command('explore'); else if (e.key === 'r') M.rest(); else if (e.key === 'i' || e.key === 'b') command('bag'); else if (e.key === 'm') UI.open('map'); else if (e.key === 'h') command('heal'); else if (e.key === 'Enter' || e.key === '>') { if (tileAt(G.p.x, G.p.y) === T.STAIRS) descend(); } else if (/^[1-9]$/.test(e.key)) { const s = Object.keys(G.p.spells)[+e.key - 1]; if (s) command('spell', { s }); }
  });
  const U_close = () => { if (UI.modalClose) { UI.modalClose(); return true; } return false; };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { M.stop(); tick(); Save.put(); } else lastAct = performance.now(); }); addEventListener('pagehide', () => Save.put());

  loadAll().then(() => { UI.title(); $('title').classList.add('ready'); });
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !location.hostname.includes('claude')) navigator.serviceWorker.register('sw.js').catch(() => { });
  return M;
})();
