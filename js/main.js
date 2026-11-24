/* Input: move pad, action button, taps, keys. Also travel, auto-explore, rest and timing. */
'use strict';
const Main = (() => {
  const M = {}; let run = null, timer = 0, lastAct = performance.now(), hold = null, frozen = 0;
  M.stop = () => { run = null; clearTimeout(timer); R.st.path = null; };
  const busy = () => !G || UI.screen !== 'game' || G.over || !$('modal').hidden || !$('sheet').hidden || performance.now() < frozen;
  /* time played: gaps of over 25 seconds do not count */
  function tick() { const n = performance.now(); if (G && UI.screen === 'game') G.time += Math.min(25, (n - lastAct) / 1000); lastAct = n; }
  /* saving is cheap but not free: at most twice a second, always on the way out */
  let saveT = 0;
  const save = () => { if (!saveT) saveT = setTimeout(() => { saveT = 0; Save.put(); }, 500); };
  const noSave = () => { clearTimeout(saveT); saveT = 0; };
  const saveNow = () => { noSave(); Save.put(); };
  M.saveNow = saveNow;

  M.start = (kit, seed, mode) => { UI.fade(); noSave(); Save.clear(); FX.on = true; FX.q = []; R.reset(); newGame(kit, seed, mode || 'normal'); enter(); if (!Meta.d.runs.length) setTimeout(() => UI.tip('move2', TIPS[0] + ' Nothing moves until you do.'), 2400); };
  M.resume = () => { UI.fade(); noSave(); FX.on = true; FX.q = []; R.reset(); if (!Save.load()) { Save.clear(); return UI.title(); } FX.q = []; enter(); UI.onFloor(); };
  function enter() { UI.target(null); UI.show('game'); lastAct = performance.now(); R.recompose(); UI.hud(); saveNow(); UI.pending(); }

  /* after every action: refresh, tips, dialogs, end of run */
  M.after = () => {
    tick(); UI.hud();
    if (G.over) {
      if (G.over.done) return; G.over.done = 1; M.stop(); noSave(); UI.target(null); UI.record(); if (!$('sheet').hidden) UI.close();
      setTimeout(() => { UI.fade(); setTimeout(() => UI.over(), 260); }, G.over.home ? 100 : 900); return;
    }
    if (UI.pending()) { save(); return; } tips(); save();
  };
  function tips() {
    if (G.mons.some(m => m.intent && visible(m.x, m.y))) UI.tip('intent', TIPS[1]);
    else if (awakeInView().length >= 2) UI.tip('door', TIPS[2]);
    else if (awakeInView().length) UI.tip('fight2', 'Push the pad towards a monster, or press the big button, to attack. Hold a finger on a monster to see how tough it is.');
    else if (G.p.bag.some(b => UI.better(b))) UI.tip('gear', 'You found something better than what you are wearing. Open your Bag: ▲ marks upgrades.');
    else if (G.p.bag.some(b => (b.k === 'potion' || b.k === 'scroll') && !known(b.k, b.t))) UI.tip('unk', TIPS[3]);
    else if (G.p.hp < S.maxHp * .5) UI.tip('rest', TIPS[6]);
    else if (G.stairs && tileAt(...G.stairs) === T.STAIRS && visible(...G.stairs)) UI.tip('stairs', 'Those stairs go down. There is no way back up, so look around first.');
    else if (G.p.food < 200) UI.tip('hungry', 'Hungry. Eat a pasty from your Bag before you starve.');
  }
  const threats = () => hostilesInView().map(m => m.id);
  const acted = r => { M.after(); return r; };

  /* ---- walking loops: travel, explore, rest ---- */
  function loop() {
    clearTimeout(timer); if (!run || busy()) { M.stop(); if (G) UI.hud(); return; } const p = G.p, hp = p.hp;
    if (run.kind === 'rest') {
      if (awakeInView().length || p.food < 5 || (p.hp >= S.maxHp && p.mp >= S.maxMp) || run.n++ > 600) { if (p.hp >= S.maxHp) say('Rested.'); M.stop(); UI.hud(); return; }
      const before = threats().join();
      for (let k = 0; k < 3 && run && !G.over; k++) { ACT.wait(); if (threats().join() !== before || p.hp < hp || G.pending.length) { M.after(); M.stop(); return; } }
      M.after(); if (run) timer = setTimeout(loop, 40); return;
    }
    let path = run.path;
    if (run.kind === 'explore' && (!path || !path.length)) {
      const t = exploreTarget(), s = G.stairs;
      if (t) path = pathTo(...t);
      else if (s && tileAt(...s) === T.STAIRS && G.seen[ix(...s)] && !(p.x === s[0] && p.y === s[1])) { if (!run.said) { say('Nothing left to find. Heading for the stairs.'); run.said = 1; } path = pathTo(...s); }
      else { say(isBossFloor(G.floor) && !G.bossDead ? 'Nothing left, except whatever guards the stairs.' : 'Explored.'); M.stop(); UI.hud(); return; }
      run.path = path;
    }
    if (!path || !path.length) { M.stop(); UI.hud(); return; }
    const [x, y] = path[0]; if (cheb(x, y, p.x, p.y) !== 1) { M.stop(); return; }
    if ((monAt(x, y) && visible(x, y)) || dangerAt(x, y)) { M.stop(); UI.hud(); return; }
    path.shift(); R.st.path = run.kind === 'travel' ? path : null;
    const tk = threats(), fl = G.floor, st = Object.keys(p.st).length, ok = ACT.move(x - p.x, y - p.y); M.after();
    if (!ok || !run || G.over || G.floor !== fl) { M.stop(); return; }
    if (threats().some(i => !tk.includes(i)) || p.hp < hp || Object.keys(p.st).length > st || awakeInView().length) { M.stop(); UI.hud(); return; }
    if (!path.length && (run.kind !== 'explore' || tileAt(p.x, p.y) === T.STAIRS)) { M.stop(); UI.hud(); return; }
    timer = setTimeout(loop, R.STEP);
  }
  M.travel = (x, y) => { M.stop(); const path = pathTo(x, y); if (!path || !path.length) return; run = { kind: 'travel', path }; loop(); };
  M.explore = () => { if (run) { M.stop(); return; } if (awakeInView().length) { say('Not with company.', 'bad'); UI.hud(); return; } run = { kind: 'explore' }; loop(); };
  M.rest = () => { if (awakeInView().length) { say('Not with company.', 'bad'); UI.hud(); return; } M.stop(); run = { kind: 'rest', n: 0 }; loop(); };

  /* ---- aiming: nearest monster picked for you, pad moves the mark, action button fires ---- */
  M.aim = o => {
    M.stop(); const p = G.p, c = G.mons.filter(m => visible(m.x, m.y) && cheb(m.x, m.y, p.x, p.y) <= o.range).sort((a, b) => cheb(a.x, a.y, p.x, p.y) - cheb(b.x, b.y, p.x, p.y))[0];
    o.sel = o.spell !== 'blink' && c ? [c.x, c.y] : [p.x, p.y]; UI.target(o); UI.hud();
  };
  function fire(x, y) {
    const tg = R.st.target; UI.target(null);
    if (cheb(x, y, G.p.x, G.p.y) > tg.range || !visible(x, y)) { say('Out of reach.'); UI.hud(); return; }
    acted(tg.item ? ACT.throwAt(tg.item, x, y) : ACT.cast(tg.spell, x, y));
  }

  /* ---- what the action button does right now ---- */
  const FEATVERB = { chest: 'Open', barrel: 'Smash', shelf: 'Read', bed: 'Nap', altar: 'Pray', pool: 'Drink', trader: 'Trade', forge: 'Forge', cage: 'Free', ped: 'Choose' };
  M.context = () => {
    const p = G.p; if (R.st.target) return { k: 'fire', n: R.st.target.item ? 'Throw' : 'Cast' };
    const c = G.mons.filter(m => visible(m.x, m.y) && reachTarget(m));
    if (c.length) {
      const f = [[0, -1], [-1, 0], [0, 1], [1, 0]][p.dir], w = m => (m.x - p.x === f[0] && m.y - p.y === f[1] ? -1e6 : m.hp); c.sort((a, b) => w(a) - w(b));
      return { k: 'attack', n: 'Attack', m: c[0], ic: p.eq.weapon ? itemIcon(p.eq.weapon) : 'blade0' };
    }
    if (tileAt(p.x, p.y) === T.STAIRS) return { k: 'descend', n: 'Go down' };
    for (const d of D8) {
      const x = p.x + d[0], y = p.y + d[1]; if (!inb(x, y) || !canStep(p.x, p.y, d[0], d[1])) continue; const f = blockFeat(x, y);
      if (f && FEATVERB[f.t] && !f.used) return { k: 'use', n: FEATVERB[f.t], d }; if (tileAt(x, y) === T.LOCKED && G.key) return { k: 'use', n: 'Unlock', d };
    }
    if (G.items.some(i => i.x === p.x && i.y === p.y)) return { k: 'pick', n: 'Pick up' };
    if (run) return { k: 'stop', n: 'Stop' };
    if (awakeInView().length) return { k: 'wait', n: 'Wait' };
    return p.hp < S.maxHp * .8 ? { k: 'rest', n: 'Rest' } : { k: 'explore', n: 'Explore' };
  };
  /* mashing attack must not turn into going downstairs the moment a monster falls */
  let ctxKey = '', ctxT = 0; M.ctxChanged = k => { if (k !== ctxKey) { ctxKey = k; ctxT = performance.now(); } };
  function doAction(repeat) {
    if (busy()) return 0; if (run) { M.stop(); UI.hud(); return 0; }
    const c = M.context(); if (repeat && c.k !== 'attack') return 0;
    if (c.k !== 'attack' && c.k !== 'fire' && c.k !== 'wait' && performance.now() - ctxT < 320) return 0;
    switch (c.k) {
      case 'fire': fire(...R.st.target.sel); return 0;
      case 'attack': { const hp = G.p.hp; acted(ACT.attack(c.m)); return stopHold(hp) ? 0 : 300; }
      case 'descend': descend(); return 0; case 'rest': M.rest(); return 0; case 'explore': M.explore(); return 0;
      case 'use': acted(ACT.move(...c.d)); return 0;
      case 'pick': { const i = G.items.findIndex(i => i.x === G.p.x && i.y === G.p.y); if (give(G.items[i])) G.items.splice(i, 1); acted(end(100)); return 0; }
    }
    acted(ACT.wait()); return 0;
  }
  /* a held pad or button lets go when something important happens */
  const stopHold = hp => busy() || !!dangerAt(G.p.x, G.p.y) || (G.p.hp < hp && G.p.hp < S.maxHp * .35);
  function descend() { M.stop(); frozen = performance.now() + 520; $('fade').classList.add('on'); setTimeout(() => { ACT.descend(); M.after(); setTimeout(() => $('fade').classList.remove('on'), 60); }, 240); }

  /* ================= the move pad ================= */
  const pad = $('pad'), knob = $('knob'), P = { id: null, dir: null, fresh: false, paused: false, t: 0, warn: '', vx: 0, vy: 0 };
  const KEY8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  function aimPad(e) {
    const r = pad.getBoundingClientRect(), rad = r.width / 2, dx = e.clientX - r.left - rad, dy = e.clientY - r.top - rad, d = Math.hypot(dx, dy), tr = Math.min(d, rad - knob.offsetWidth / 2);
    P.vx = dx; P.vy = dy; knob.style.transform = d ? `translate(${dx / d * tr}px, ${dy / d * tr}px)` : '';
    if (d < 11) { P.dir = null; P.paused = false; return; }
    /* straight directions get the wider share, so corridors are easy; a little stickiness stops flicker */
    const a = Math.atan2(dy, dx) / (Math.PI / 4); let best = 0, bs = 9;
    for (let i = 0; i < 8; i++) { const q = Math.abs(((a - i) % 8 + 12) % 8 - 4) + (i % 2 ? .12 : -.06) - (P.dir === i ? .13 : 0); if (q < bs) { bs = q; best = i; } }
    if (P.dir !== best) {
      const first = P.dir === null; P.dir = best; P.paused = false; P.fresh = true;
      if (first) { clearTimeout(P.t); P.t = setTimeout(padStep, 34); } else if (!P.t) padStep();
    }
  }
  function padStep() {
    P.t = 0; if (P.dir === null || P.paused) return; const dt = padMove(KEY8[P.dir]); P.fresh = false;
    if (!dt) { P.paused = true; return; } P.t = setTimeout(padStep, dt);
  }
  const open = (x, y, d) => inb(x + d[0], y + d[1]) && canStep(x, y, d[0], d[1]) && walkable(x + d[0], y + d[1]);
  /* one step (or blow) in direction d; returns the delay before the next, or 0 to let go */
  function padMove(d) {
    if (busy()) return 0; if (run) M.stop(); const p = G.p;
    if (R.st.target) { const t = R.st.target, x = t.sel[0] + d[0], y = t.sel[1] + d[1]; if (inb(x, y) && cheb(x, y, p.x, p.y) <= t.range && visible(x, y)) t.sel = [x, y]; return 150; }
    let m = monAt(p.x + d[0], p.y + d[1]); if (m && !visible(m.x, m.y)) m = null;
    /* spear: push towards a foe two tiles off and strike it first */
    if (!m && S.reach === 2) { const q = monAt(p.x + d[0] * 2, p.y + d[1] * 2); if (q && visible(q.x, q.y) && reachTarget(q) && q.ai !== 'sleep') { const hp = p.hp; acted(ACT.attack(q)); return stopHold(hp) ? 0 : 300; } }
    /* pushing diagonally into a wall slides along it, whichever way the thumb leans */
    if (!m && d[0] && d[1] && !open(p.x, p.y, d) && !(blockFeat(p.x + d[0], p.y + d[1]) && canStep(p.x, p.y, d[0], d[1]))) {
      const s = [[d[0], 0], [0, d[1]]].filter(q => open(p.x, p.y, q) && !monAt(p.x + q[0], p.y + q[1])); if (!s.length) return 0;
      if (s.length > 1 && Math.abs(P.vy) > Math.abs(P.vx)) s.reverse(); d = s[0];
    }
    const x = p.x + d[0], y = p.y + d[1]; if (!inb(x, y)) return 0;
    if (!m) {
      const f = featAt(x, y), bad = tileAt(x, y) === T.LAVA ? 'Lava' : f && f.t === 'trap' && f.seen && !f.used ? 'A trap' : null, key = x + ',' + y + ',' + G.floor;
      if (bad && P.warn !== key) { P.warn = key; say(`${bad}! Push again to step on it anyway.`, 'bad'); UI.hud(); return 0; } if (!bad) P.warn = '';
      if (!P.fresh && dangerAt(x, y)) return 0;
    }
    const tk = threats(), hp = p.hp, ox = p.x, oy = p.y, fl = G.floor;
    if (!ACT.move(d[0], d[1])) { p.dir = dirOf(d[0], d[1]); if (G.pending.length) M.after(); else UI.hud(); return 0; }
    M.after(); if (G.floor !== fl || stopHold(hp)) return 0; if (m) return 300;
    if ((p.x === ox && p.y === oy) || threats().some(i => !tk.includes(i)) || tileAt(p.x, p.y) === T.STAIRS) return 0;
    return awakeInView().length ? R.STEP + 60 : R.STEP;
  }
  const letGo = () => { P.id = null; clearTimeout(P.t); P.t = 0; P.dir = null; P.paused = false; pad.classList.remove('on'); knob.style.transform = ''; };
  pad.addEventListener('pointerdown', e => { e.preventDefault(); letGo(); P.id = e.pointerId; try { pad.setPointerCapture(e.pointerId); } catch (x) { } pad.classList.add('on'); aimPad(e); });
  pad.addEventListener('pointermove', e => { if (e.pointerId === P.id) aimPad(e); });
  const padUp = e => {
    if (e.pointerId !== P.id) return;
    if (P.t && P.fresh && P.dir !== null && e.type === 'pointerup') { clearTimeout(P.t); P.t = 0; padMove(KEY8[P.dir]); P.fresh = false; } /* a quick tap still counts as one step */
    letGo();
  };
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(t, padUp);

  /* ================= buttons: they fire from what was pressed, so a redraw can never swallow a press ================= */
  let pr = null, holdT = 0, held = false;
  const foot = $('foot'), unpress = () => foot.querySelectorAll('.dn').forEach(b => b.classList.remove('dn'));
  foot.addEventListener('pointerdown', e => {
    const b = e.target.closest('button'); if (!b || busy()) return; const a = b.dataset.a;
    unpress(); pr = { id: e.pointerId, a, d: { ...b.dataset }, x: e.clientX, y: e.clientY }; held = false; b.classList.add('dn'); clearTimeout(holdT);
    const rest = () => { holdT = setTimeout(() => { held = true; M.rest(); }, 360); };
    if (a === 'wait') rest();
    if (a === 'act') {
      const k = M.context().k; if (k === 'wait') rest();
      else if (k === 'attack') { held = true; const rep = r => { const dt = doAction(r); if (dt && pr && pr.a === 'act') holdT = setTimeout(() => rep(true), dt); }; rep(false); }
    }
  });
  addEventListener('pointerup', e => { if (!pr || e.pointerId !== pr.id) return; const q = pr; pr = null; clearTimeout(holdT); unpress(); if (held || Math.hypot(e.clientX - q.x, e.clientY - q.y) > 28) return; command(q.a, q.d); });
  addEventListener('pointercancel', e => { if (pr && e.pointerId === pr.id) { pr = null; clearTimeout(holdT); unpress(); } });
  function command(a, d = {}) {
    if (busy()) return; if (a === 'act') { doAction(false); return; } if (a === 'explore') { UI.target(null); return M.explore(); }
    if (run) { M.stop(); UI.hud(); if (a === 'wait') return; }
    if (a === 'wait') { UI.target(null); return acted(ACT.wait()); } if (a === 'bag') { UI.target(null); return UI.open('bag'); }
    if (a === 'heal') { const it = G.p.bag.find(b => b.k === 'potion' && b.t === 'heal'); if (it) acted(useItem(it)); else { say('No healing potions left.', 'bad'); UI.hud(); } return; }
    if (a === 'spell') {
      const s = d.s; if (R.st.target && R.st.target.spell === s) { UI.target(null); return UI.hud(); }
      if (!canCast(s)) { say(G.p.st.silence ? 'You cannot speak the words.' : 'Not enough mana.', 'bad'); UI.hud(); return; }
      if (!SPELLS[s].tgt) { UI.target(null); return acted(ACT.cast(s)); } return M.aim({ spell: s, range: spellRange(s), label: SPELLS[s].n });
    }
  }
  $('target').querySelector('button').addEventListener('click', () => { UI.target(null); UI.hud(); });
  $('hudCard').addEventListener('click', () => { if (!busy()) UI.open('hero'); }); $('btnMap').addEventListener('click', () => { if (!busy()) UI.open('map'); }); $('btnMenu').addEventListener('click', () => { if (!busy()) UI.menu(); });

  /* ================= the map itself: tap to walk or aim, hold to inspect ================= */
  function tapTile(x, y) {
    if (!inb(x, y)) return; const p = G.p; if (R.st.target) return fire(x, y); if (run) { M.stop(); UI.hud(); return; }
    if (x === p.x && y === p.y) return; const m = monAt(x, y);
    if (m && visible(x, y)) { if (reachTarget(m)) return acted(ACT.attack(m)); const path = pathTo(x, y, false); if (path && path.length && !monAt(...path[0])) return acted(ACT.move(path[0][0] - p.x, path[0][1] - p.y)); return; }
    if (cheb(x, y, p.x, p.y) === 1 && canStep(p.x, p.y, x - p.x, y - p.y)) return acted(ACT.move(x - p.x, y - p.y));
    if (!G.seen[ix(x, y)] || G.t[ix(x, y)] === T.WALL) return;
    if (awakeInView().length) { const path = pathTo(x, y); if (path && path.length) acted(ACT.move(path[0][0] - p.x, path[0][1] - p.y)); return; }
    M.travel(x, y);
  }
  const cv = $('cv'); let pd = null;
  cv.addEventListener('pointerdown', e => {
    if (busy()) return; pd = { x: e.clientX, y: e.clientY, id: e.pointerId }; clearTimeout(hold);
    hold = setTimeout(() => { if (!pd) return; const [tx, ty] = R.toTile(pd.x, pd.y), m = inb(tx, ty) && monAt(tx, ty); if (m && visible(tx, ty)) { pd = null; M.stop(); UI.inspect(m); } }, 420);
  });
  cv.addEventListener('pointerup', e => { clearTimeout(hold); if (!pd || pd.id !== e.pointerId || busy()) { pd = null; return; } const s = pd, d = Math.hypot(e.clientX - s.x, e.clientY - s.y); pd = null; if (d < 22) tapTile(...R.toTile(s.x, s.y)); });
  cv.addEventListener('pointercancel', () => { clearTimeout(hold); pd = null; });
  for (const t of ['contextmenu', 'gesturestart', 'dblclick']) document.addEventListener(t, e => e.preventDefault());

  addEventListener('keydown', e => {
    if (UI.screen !== 'game' || !G) return;
    if (e.key === 'Escape') { if (R.st.target) { UI.target(null); return UI.hud(); } if (!$('sheet').hidden) return UI.close(); if (!$('modal').hidden) { if (UI.modalClose) UI.modalClose(); return; } return UI.menu(); }
    if (busy()) return; const k = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], q: [-1, -1], e: [1, -1], z: [-1, 1], c: [1, 1] }[e.key];
    if (k) { e.preventDefault(); P.fresh = !e.repeat; padMove(k); } else if (e.key === ' ' || e.key === '.') { e.preventDefault(); command('wait'); } else if (e.key === 'x') command('explore'); else if (e.key === 'r') M.rest(); else if (e.key === 'i' || e.key === 'b') command('bag'); else if (e.key === 'm') UI.open('map'); else if (e.key === 'h') command('heal'); else if (e.key === 'Enter') { e.preventDefault(); doAction(e.repeat); } else if (/^[1-9]$/.test(e.key)) { const s = Object.keys(G.p.spells)[+e.key - 1]; if (s) command('spell', { s }); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { M.stop(); letGo(); if (G && UI.screen === 'game') { tick(); saveNow(); } } else lastAct = performance.now(); });
  addEventListener('pagehide', () => { if (UI.screen === 'game') saveNow(); });

  loadAll().then(() => { UI.title(); $('title').classList.add('ready'); });
  /* a new version takes over straight away when nobody is mid-run */
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) { let once = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (!once && UI.screen === 'title') { once = true; location.reload(); } }); }
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !location.hostname.includes('claude')) navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(r => r.active && r.active.postMessage('refill')).catch(() => { });
  return M;
})();
