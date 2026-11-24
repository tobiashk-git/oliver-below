/* Canvas renderer: reads G, plays the engine's effects, never changes the rules. */
'use strict';
const IMG = {};
function loadImg(k, src) { return new Promise(r => { const i = new Image(); i.onload = () => { IMG[k] = i; r(); }; i.onerror = () => r(); i.src = src; }); }
async function loadAll() {
  await Promise.all([...['mon', 'port', 'icon', 'tile', 'prop'].map(k => loadImg(k, `assets/${k}.webp`)), loadImg('base', 'assets/layers/base.webp'), loadImg('body0', 'assets/layers/body0.webp')]);
}
const R = (() => {
  const cv = document.getElementById('cv'), cx = cv.getContext('2d', { alpha: false });
  let W = 0, H = 0, dpr = 1, TS = 44, camX = 0, camY = 0, lit = null, ents = new Map(), dying = [], texts = [], parts = [], projs = [], areas = [], bursts = [], shake = 0, flash = 0, flashC = '#f00', tPrev = 0, time = 0, hero = null, heroKey = '', lastDelay = 0, snapCam = true, dim = null;
  const st = { target: null, path: null, sel: null };
  /* Everything on the canvas is in whole device pixels, and a tile is an exact multiple of its 32px art.
     Tile edges that fall between pixels let the background through as thin flickering lines. */
  let cap = 3, vw = 0, vh = 0, barH = 0, tc = {}, wallShade = null;
  function resize() {
    /* installed on iOS and drawn under the status bar, innerHeight comes up short by exactly that bar */
    const doc = document.documentElement, pr = document.createElement('i'); pr.style.cssText = 'position:absolute;visibility:hidden;height:env(safe-area-inset-top,0px)'; document.body.appendChild(pr); const bar = barH = pr.offsetHeight; pr.remove();
    const gap = screen.height - innerHeight, full = innerHeight + (navigator.standalone && innerHeight > innerWidth && gap > 0 && gap <= bar + 6 ? gap : 0);
    doc.style.setProperty('--vh', full + 'px');
    dpr = Math.min(window.devicePixelRatio || 1, cap); vw = innerWidth; vh = full; W = Math.round(vw * dpr); H = Math.round(vh * dpr); cv.width = W; cv.height = H; cv.style.width = W / dpr + 'px'; cv.style.height = H / dpr + 'px';
    const want = (vh < 520 ? 38 : Math.max(36, Math.min(64, Math.min(vw, 620) / 9))) * dpr; TS = Math.max(32, Math.round(want / 32) * 32); tc = {}; wallShade = null; snapCam = true;
  }
  addEventListener('resize', resize); addEventListener('orientationchange', () => { setTimeout(resize, 120); setTimeout(resize, 500); }); resize();
  /* if the phone cannot keep up at full sharpness, drop one step and carry on */
  let slowN = 0, slowT = 0;
  function watch(ms) { if (ms > 250) return; slowT += ms; if (++slowN >= 150) { if (slowT / slowN > 26 && cap > 2) { cap = 2; resize(); } slowN = slowT = 0; } }
  const STEP = 138; /* ms a step takes: the walk animation and the held pad share it */
  const topPad = () => (vh < 520 ? 60 : 110 + barH * 1.6) * dpr, botPad = () => (vh < 520 ? 80 : vh < 740 ? 200 : 232) * dpr;
  const ent = (id, x, y) => { let e = ents.get(id); if (!e) { e = { x, y, fx: 0, fy: 0, lt: 0, hit: 0, born: time }; ents.set(id, e); } return e; };
  function reset() { ents.clear(); dying = []; texts = []; parts = []; projs = []; areas = []; bursts = []; lit = null; snapCam = true; }

  /* ---- effects from the engine ---- */
  function drain() {
    if (!FX.q.length) return; let d = 0, step = 0; const q = FX.q; FX.q = [];
    for (const f of q) {
      switch (f.t) {
        case 'snd': { const n = f.n, dl = d; dl ? setTimeout(() => Snd.sfx(n), dl * 1000) : Snd.sfx(n); break; }
        case 'lunge': { if (f.id !== 'p' && f.id !== 'luigi') { d = .1 + step * .075; step++; } const e = ents.get(f.id); if (e) { e.lt = time + d; e.lx = f.x; e.ly = f.y; } break; }
        case 'shot': d = .1 + step * .075; step++; projs.push({ x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, kind: f.kind, t: time + d, dur: .2 }); d += .18; break;
        case 'proj': projs.push({ x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, ic: f.ic, t: time, dur: .16 }); d = Math.max(d, .14); break;
        case 'hit': { const e = ents.get(f.id); if (e) { e.hit = time + d; } texts.push({ x: f.x, y: f.y, s: String(f.n), c: f.crit ? '#ffe27a' : f.c || '#fff', t: time + d, big: f.crit, ox: (Math.random() - .5) * .5 }); spray(f.x, f.y, f.c || '#e8dcc8', 5, d); break; }
        case 'phit': texts.push({ x: G.p.x, y: G.p.y, s: '-' + f.n, c: f.c || '#ff6a5a', t: time + d, big: f.big, ox: (Math.random() - .5) * .5 }); { const e = ents.get('p'); if (e) e.hit = time + d; } flash = Math.max(flash, f.big ? .5 : .24); flashC = f.c || '#c22a2a'; if (f.big) shake = Math.max(shake, 6); break;
        case 'text': texts.push({ x: f.x, y: f.y, s: f.s, c: f.c, t: time + d, small: 1, ox: 0 }); break;
        case 'die': { const e = ents.get(f.id); dying.push({ k: f.k, x: e ? e.x : f.x, y: e ? e.y : f.y, t: time + d, small: f.small }); ents.delete(f.id); break; }
        case 'puff': spray(f.x, f.y, '#cbb994', 10, d, 1.4); break;
        case 'burst': bursts.push({ x: f.x, y: f.y, r: f.r, c: f.c, t: time + d }); for (let y = -f.r; y <= f.r; y++) for (let x = -f.r; x <= f.r; x++) spray(f.x + x, f.y + y, f.c, 4, d); break;
        case 'bolt': bursts.push({ x: f.x, y: f.y, bolt: 1, t: time + d }); break;
        case 'area': areas.push({ tiles: f.tiles, c: f.c, t: time + d }); for (const i of f.tiles) spray(i % G.w, (i / G.w) | 0, f.c, 3, d); break;
        case 'shake': shake = Math.max(shake, f.n); break;
        case 'level': bursts.push({ x: G.p.x, y: G.p.y, r: 2, c: '#ecc55a', t: time }); for (let k = 0; k < 24; k++) spray(G.p.x, G.p.y, '#ecc55a', 1, 0, 2); break;
        case 'floor': reset(); UI.onFloor(); break;
        case 'boss': UI.banner(MON[f.k].n, MON[f.k].d); Snd.play('battle'); break;
        case 'fade': UI.fade(); break;
      }
    }
    lastDelay = d;
  }
  function spray(x, y, c, n, d = 0, k = 1) { if (parts.length > 260) return; for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = (.4 + Math.random() * 1.6) * k; parts.push({ x: x + .5, y: y + .35, vx: Math.cos(a) * v, vy: Math.sin(a) * v - .8, c, t: time + d, l: .3 + Math.random() * .35, s: .04 + Math.random() * .06 }); } }

  /* ---- hero: LPC walk layers composed once per outfit ---- */
  function composeHero() {
    const e = G.p.eq, need = ['legs', 'feet', 'body', 'hands', 'head'].filter(s => e[s]).map(s => s + e[s].tier), key = need.join(); if (key === heroKey && hero) return; let ready = true;
    for (const n of need) if (!IMG[n]) { ready = false; if (!IMG['_' + n]) { IMG['_' + n] = 1; loadImg(n, `assets/layers/${n}.webp`).then(() => { heroKey = ''; }); } }
    if (!hero) { hero = document.createElement('canvas'); hero.width = 576; hero.height = 256; } const c = hero.getContext('2d'); c.clearRect(0, 0, 576, 256); if (IMG.base) c.drawImage(IMG.base, 0, 0); for (const n of need) if (IMG[n]) c.drawImage(IMG[n], 0, 0); if (ready) heroKey = key;
  }
  const tileImg = (n, x, y) => {
    let c = tc[n]; if (!c) { const m = ATLAS.tile.map[n]; if (!m || !IMG.tile) return; c = tc[n] = document.createElement('canvas'); c.width = c.height = TS; const k = c.getContext('2d'); k.imageSmoothingEnabled = false; k.drawImage(IMG.tile, m[0] * 32, m[1] * 32, 32, 32, 0, 0, TS, TS); }
    cx.drawImage(c, x, y);
  };
  const sprite = (at, n, x, y, w, h) => { const a = ATLAS[at], m = a.map[n]; if (m && IMG[at]) cx.drawImage(IMG[at], m[0] * a.cell + .5, m[1] * a.cell + .5, a.cell - 1, a.cell - 1, Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const shadow = (x, y, w) => { cx.fillStyle = 'rgba(0,0,0,.34)'; cx.beginPath(); cx.ellipse(x, y, w, w * .36, 0, 0, 7); cx.fill(); };

  function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min(.05, (now - tPrev) / 1000 || .016); if (UI.screen === 'game') watch(now - tPrev); tPrev = now; time += dt; const u = dpr;
    if (!G || !G.t || UI.screen !== 'game') { return; }
    drain(); composeHero();
    const z = zoneOf(G.floor), p = G.p, s = TS, n = G.w * G.h;
    if (!lit || lit.length !== n) { lit = new Float32Array(n); snapCam = true; }
    /* ease positions */
    const pe = ent('p', p.x, p.y); const ease = (e, x, y, k) => { const f = 1 - Math.pow(.5, dt * k); e.mv = Math.abs(x - e.x) + Math.abs(y - e.y) > .03; e.x += (x - e.x) * f; e.y += (y - e.y) * f; if (Math.abs(x - e.x) + Math.abs(y - e.y) > 6) { e.x = x; e.y = y; } };
    /* constant speed, so held walking glides instead of stop-starting */
    const glide = (e, x, y, ms) => { const st = dt * 1000 / ms, far = Math.max(Math.abs(x - e.x), Math.abs(y - e.y)), k = far > 1.3 ? far / 1.1 : 1; if (far > 5) { e.x = x; e.y = y; } const mv = far > .002; if (mv) e.mvT = time; e.mv = mv || time - (e.mvT || 0) < .06; const g = (a, b) => Math.abs(b - a) <= st * k ? b : a + Math.sign(b - a) * st * k; e.x = g(e.x, x); e.y = g(e.y, y); };
    glide(pe, p.x, p.y, STEP); for (const m of G.mons) ease(ent(m.id, m.x, m.y), m.x, m.y, 20); if (G.luigi) ease(ent('luigi', G.luigi.x, G.luigi.y), G.luigi.x, G.luigi.y, 16);
    const tx = (pe.x + .5) * s - W / 2, ty = (pe.y + .5) * s - (topPad() + (H - topPad() - botPad()) / 2);
    if (snapCam) { camX = tx; camY = ty; snapCam = false; } else { const f = 1 - Math.pow(.5, dt * 15); camX += (tx - camX) * f; camY += (ty - camY) * f; }
    shake = Math.max(0, shake - dt * 26); const sx = shake ? (Math.random() - .5) * shake * u : 0, sy = shake ? (Math.random() - .5) * shake * u : 0;
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = z.fog; cx.fillRect(0, 0, W, H); cx.imageSmoothingEnabled = false;
    const ox = Math.round(camX + sx), oy = Math.round(camY + sy), rim = Math.round(3 * u); cx.translate(-ox, -oy);
    const x0 = Math.max(0, Math.floor(ox / s) - 1), y0 = Math.max(0, Math.floor(oy / s) - 1), x1 = Math.min(G.w - 1, Math.ceil((ox + W) / s)), y1 = Math.min(G.h - 1, Math.ceil((oy + H) / s) + 1);
    const le = 1 - Math.pow(.5, dt * 12);
    /* ---- ground ---- */
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * G.w + x, want = G.vis[i] ? 1 : G.seen[i] ? .36 : 0; lit[i] += (want - lit[i]) * le; if (lit[i] < .015) continue;
      const t = G.t[i], X = x * s, Y = y * s, dv = G.deco[i];
      if (t === T.WALL || t === T.LOCKED) {
        const below = y + 1 < G.h ? G.t[i + G.w] : 0;
        if (t === T.LOCKED) { tileImg('w_' + z.id, X, Y, s); tileImg('locked', X, Y, s); }
        else if (below !== T.WALL) { tileImg('w_' + z.id, X, Y, s); cx.fillStyle = 'rgba(0,0,0,.28)'; cx.fillRect(X, Y, s, Math.round(s * .1)); cx.fillStyle = 'rgba(255,255,255,.07)'; cx.fillRect(X, Y + Math.round(s * .1), s, Math.round(1.5 * u)); if (dv === 3) { cx.fillStyle = 'rgba(40,70,30,.4)'; cx.fillRect(X, Y + Math.round(s * .55), Math.round(s * .6), Math.round(s * .3)); } }
        else { tileImg('t_' + z.id, X, Y, s); cx.fillStyle = `rgba(${z.light.join()},.16)`; if (x + 1 < G.w && G.t[i + 1] !== T.WALL && G.seen[i + 1]) cx.fillRect(X + s - rim, Y, rim, s); if (x > 0 && G.t[i - 1] !== T.WALL && G.seen[i - 1]) cx.fillRect(X, Y, rim, s); if (y > 0 && G.t[i - G.w] !== T.WALL && G.seen[i - G.w]) cx.fillRect(X, Y, s, rim); }
      } else {
        tileImg('f_' + z.id, X, Y, s);
        if (dv < 3) { cx.fillStyle = 'rgba(0,0,0,.055)'; cx.fillRect(X, Y, s, s); } else if (dv === 9) { cx.fillStyle = 'rgba(255,255,255,.03)'; cx.fillRect(X, Y, s, s); }
        if (t === T.ICE) { cx.globalAlpha = .85; tileImg('ice', X, Y, s); cx.globalAlpha = 1; } else if (t === T.MUD) { cx.globalAlpha = .86; tileImg('mud', X, Y, s); cx.globalAlpha = 1; }
        else if (t === T.LAVA) { tileImg('lava', X, Y, s); cx.fillStyle = `rgba(255,200,60,${.14 + .12 * Math.sin(time * 2 + x * 1.7 + y * 2.3)})`; cx.fillRect(X, Y, s, s); }
        else if (t === T.DOOR) { const open = (p.x === x && p.y === y) || monAt(x, y); tileImg(open ? 'dopen' : 'door', X, Y, s); }
        else if (t === T.STAIRS) tileImg('stairs', X, Y, s);
        else if (t === T.FERN) { cx.imageSmoothingEnabled = true; sprite('prop', dv & 1 ? 'fern' : 'bush', X - s * .08, Y - s * .14, s * 1.16, s * 1.12); cx.imageSmoothingEnabled = false; }
        if (y > 0 && G.t[i - G.w] === T.WALL && t !== T.LAVA) { if (!wallShade) { wallShade = document.createElement('canvas'); wallShade.width = s; wallShade.height = Math.round(s * .4); const k = wallShade.getContext('2d'), g = k.createLinearGradient(0, 0, 0, wallShade.height); g.addColorStop(0, 'rgba(0,0,0,.42)'); g.addColorStop(1, 'rgba(0,0,0,0)'); k.fillStyle = g; k.fillRect(0, 0, s, wallShade.height); } cx.drawImage(wallShade, X, Y); }
      }
    }
    /* torches, flat features */
    for (const [x, y] of G.torches) if (G.seen[ix(x, y)]) { const X = (x + .5) * s, Y = (y + .45) * s, fl = Math.sin(time * 9 + x * 3) * .05; cx.fillStyle = '#4a2d14'; cx.fillRect(X - s * .045, Y, s * .09, s * .3); cx.fillStyle = z.id === 'ice' ? '#8fd3ff' : z.id === 'temple' ? '#8fe0a0' : '#ff9a3c'; cx.beginPath(); cx.ellipse(X, Y - s * .05, s * (.1 + fl), s * (.17 + fl), 0, 0, 7); cx.fill(); cx.fillStyle = '#fff2b8'; cx.beginPath(); cx.ellipse(X, Y, s * .05, s * .08, 0, 0, 7); cx.fill(); }
    for (const f of G.feats) { if (!G.seen[ix(f.x, f.y)]) continue; if (f.t === 'trap' && f.seen) { cx.globalAlpha = f.used ? .35 : 1; tileImg(f.kind === 'web' ? 'web' : 'trap', f.x * s, f.y * s, s); cx.globalAlpha = 1; if (!f.used && f.kind !== 'web') { cx.fillStyle = { spike: '#c8ced6', gas: '#7ccf4a', fire: '#ff7a2c', alarm: '#ffd24a' }[f.kind]; cx.beginPath(); cx.arc((f.x + .84) * s, (f.y + .16) * s, s * .08, 0, 7); cx.fill(); } } else if (f.t === 'circle') { cx.globalAlpha = f.used ? .3 : .75 + .25 * Math.sin(time * 2.4); cx.imageSmoothingEnabled = true; sprite('prop', 'circle', f.x * s - s * .35, f.y * s - s * .75, s * 1.7, s * 1.7); cx.imageSmoothingEnabled = false; cx.globalAlpha = 1; } }
    /* danger tiles */
    const pulse = .46 + .16 * Math.sin(time * 9);
    for (const m of G.mons) if (m.intent) for (const i of m.intent.tiles) { if (!G.vis[i] && !G.seen[i]) continue; const X = (i % G.w) * s, Y = ((i / G.w) | 0) * s; cx.fillStyle = `rgba(230,40,24,${pulse})`; cx.fillRect(X, Y, s, s); cx.strokeStyle = 'rgba(255,130,100,.95)'; cx.lineWidth = 2 * u; cx.strokeRect(X + 2 * u, Y + 2 * u, s - 4 * u, s - 4 * u); }
    /* travel path and selection */
    if (st.path) { cx.fillStyle = 'rgba(236,197,90,.7)'; for (const [x, y] of st.path) { cx.beginPath(); cx.arc((x + .5) * s, (y + .5) * s, s * .07, 0, 7); cx.fill(); } }
    if (st.target) { const r = st.target.range; cx.fillStyle = 'rgba(236,197,90,.10)'; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (G.vis[ix(x, y)] && G.t[ix(x, y)] !== T.WALL && cheb(x, y, p.x, p.y) <= r) cx.fillRect(x * s, y * s, s, s); for (const m of G.mons) if (visible(m.x, m.y) && cheb(m.x, m.y, p.x, p.y) <= r) { cx.strokeStyle = '#ffd24a'; cx.lineWidth = 2 * u; cx.strokeRect(m.x * s + 2 * u, m.y * s + 2 * u, s - 4 * u, s - 4 * u); }
      const [qx, qy] = st.target.sel, k = (3 + Math.sin(time * 8) * 1.5) * u; cx.fillStyle = 'rgba(255,230,140,.28)'; cx.fillRect(qx * s, qy * s, s, s); cx.strokeStyle = '#fff3b0'; cx.lineWidth = 3 * u; cx.strokeRect(qx * s + k, qy * s + k, s - k * 2, s - k * 2); }
    /* ---- standing things, back to front ---- */
    const draw = [];
    for (const it of G.items) if (G.seen[ix(it.x, it.y)]) draw.push([it.y - .2, 0, it]);
    for (const f of G.feats) if (BLOCKF[f.t] && (G.seen[ix(f.x, f.y)])) draw.push([f.y, 1, f]);
    for (const m of G.mons) if (G.vis[ix(m.x, m.y)] || m.reveal) draw.push([ents.get(m.id).y, 2, m]);
    for (const d of dying) draw.push([d.y, 3, d]); if (G.luigi) draw.push([ents.get('luigi').y, 4, G.luigi]); draw.push([pe.y + .01, 5, p]);
    draw.sort((a, b) => a[0] - b[0]);
    for (const [, k, o] of draw) {
      if (k === 0) { const v = G.vis[ix(o.x, o.y)]; cx.globalAlpha = v ? 1 : .5; const X = (o.x + .5) * s, Y = (o.y + .5) * s + Math.sin(time * 2.4 + o.x) * s * .03; shadow(X, (o.y + .82) * s, s * .22); cx.imageSmoothingEnabled = false; sprite('icon', itemIcon(o), X - s * .36, Y - s * .4, s * .72, s * .72); if (o.k === 'gear' && (o.aff.length || o.tier > zoneIdx(G.floor))) { const a = .5 + .5 * Math.sin(time * 4 + o.x); cx.globalAlpha = a * (v ? 1 : .4); cx.fillStyle = '#fff3b0'; cx.fillRect(X + s * .22, Y - s * .3, 3 * u, 3 * u); cx.fillRect(X - s * .25, Y, 2 * u, 2 * u); } cx.globalAlpha = 1; }
      else if (k === 1) drawFeat(o, s);
      else if (k === 2) drawMon(o, s);
      else if (k === 3) { const a = (time - o.t) / .8; if (a < 0) { drawArt(MON[o.k], o.x, o.y, s, o.small || 1, 1, 0); continue; } cx.globalAlpha = Math.max(0, 1 - a); drawArt(MON[o.k], o.x, o.y + a * .1, s, (o.small || 1) * (1 - a * .12), 1 - a * .35, 0); cx.fillStyle = '#cfe0ff'; cx.font = `700 ${s * .34}px system-ui`; cx.textAlign = 'center'; cx.fillText('z z z', (o.x + .5) * s, (o.y - .2 - a * .7) * s); cx.globalAlpha = 1; }
      else if (k === 4) { const e = ents.get('luigi'), l = lunge(e); shadow((e.x + .5) * s, (e.y + .9) * s, s * .26); cx.imageSmoothingEnabled = true; sprite('prop', 'luigi', (e.x + l[0] - .02) * s, (e.y + l[1] - .12 - (e.mv ? Math.abs(Math.sin(time * 14)) * .08 : 0)) * s, s * 1.04, s * 1.04); }
      else drawHero(pe, s);
    }
    dying = dying.filter(d => time - d.t < .8);
    /* ---- fog of memory + light ---- */
    cx.fillStyle = z.fog;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const l = lit[y * G.w + x]; if (l < .985) { cx.globalAlpha = 1 - l; cx.fillRect(x * s, y * s, s, s); } } cx.globalAlpha = 1;
    const px = (pe.x + .5) * s, py = (pe.y + .5) * s, [lr, lg, lb] = z.light, fk = 1 + Math.sin(time * 7) * .012 + Math.sin(time * 11.3) * .008;
    cx.globalCompositeOperation = 'lighter'; let g = cx.createRadialGradient(px, py, 0, px, py, s * 4.2 * fk); g.addColorStop(0, `rgba(${lr},${lg},${lb},.15)`); g.addColorStop(1, 'rgba(0,0,0,0)'); cx.fillStyle = g; cx.fillRect(px - s * 5, py - s * 5, s * 10, s * 10);
    for (const [x, y] of G.torches) { const i = ix(x, y); if (!G.vis[i]) continue; const X = (x + .5) * s, Y = (y + .5) * s, r = s * 2 * (1 + Math.sin(time * 8 + x * 5) * .05); g = cx.createRadialGradient(X, Y, 0, X, Y, r); g.addColorStop(0, `rgba(${lr},${lg},${lb},.24)`); g.addColorStop(1, 'rgba(0,0,0,0)'); cx.fillStyle = g; cx.fillRect(X - r, Y - r, r * 2, r * 2); }
    cx.globalCompositeOperation = 'source-over'; g = cx.createRadialGradient(px, py, s * 2.6, px, py, s * 8.4); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.62)'); cx.fillStyle = g; cx.fillRect(ox - 20, oy - 20, W + 40, H + 40);
    /* ---- effects ---- */
    for (const a of areas) { const k = (time - a.t) / .34; if (k < 0 || k > 1) continue; cx.globalAlpha = (1 - k) * .7; cx.fillStyle = a.c; for (const i of a.tiles) cx.fillRect((i % G.w) * s, ((i / G.w) | 0) * s, s, s); } cx.globalAlpha = 1; areas = areas.filter(a => time - a.t < .34);
    for (const b of bursts) { const k = (time - b.t) / .4; if (k < 0 || k > 1) continue; cx.globalAlpha = 1 - k; if (b.bolt) { cx.strokeStyle = '#fff3a0'; cx.lineWidth = 3 * u; cx.beginPath(); let X = (b.x + .5) * s, Y = (b.y - 4) * s; cx.moveTo(X, Y); for (let j = 1; j <= 6; j++) cx.lineTo(X + (j < 6 ? (Math.random() - .5) * s * .5 : 0), Y + j * s * .74); cx.stroke(); } else { cx.strokeStyle = b.c; cx.lineWidth = s * .12 * (1 - k); cx.beginPath(); cx.arc((b.x + .5) * s, (b.y + .5) * s, (b.r + .6) * s * Math.sqrt(k), 0, 7); cx.stroke(); } } cx.globalAlpha = 1; bursts = bursts.filter(b => time - b.t < .4);
    for (const q of projs) { const k = (time - q.t) / q.dur; if (k < 0 || k > 1) continue; const X = (q.x0 + (q.x1 - q.x0) * k + .5) * s, Y = (q.y0 + (q.y1 - q.y0) * k + .4) * s - Math.sin(k * 3.14) * s * .2; if (q.ic) sprite('icon', q.ic, X - s * .3, Y - s * .3, s * .6, s * .6); else { cx.fillStyle = { web: '#eef', frost: '#8fd3ff', hex: '#c07cff' }[q.kind] || '#fff'; cx.beginPath(); cx.arc(X, Y, s * .13, 0, 7); cx.fill(); } } projs = projs.filter(q => time - q.t < q.dur);
    for (const a of parts) { const k = (time - a.t) / a.l; if (k < 0) continue; a.x += a.vx * dt; a.y += a.vy * dt; a.vy += 4 * dt; cx.globalAlpha = Math.max(0, 1 - k); cx.fillStyle = a.c; const q = a.s * s; cx.fillRect(a.x * s - q / 2, a.y * s - q / 2, q, q); } cx.globalAlpha = 1; parts = parts.filter(a => time - a.t < a.l);
    cx.textAlign = 'center'; cx.lineJoin = 'round'; const stack = {};
    for (const t of texts) { const k = (time - t.t) / (t.small ? 1.1 : .85); if (k < 0 || k > 1) continue; const key = t.x + ',' + t.y + t.small, off = (stack[key] = (stack[key] || 0) + 1) - 1; const fs = t.small ? s * .29 : t.big ? s * .56 : s * .42; cx.font = `800 ${fs}px "Avenir Next","Open Sans",system-ui,sans-serif`; cx.globalAlpha = k > .6 ? (1 - k) / .4 : 1; const X = (t.x + .5 + t.ox) * s, Y = (t.y - (t.small ? .28 : .05) - Math.sqrt(k) * .6) * s - (t.small ? off * s * .3 : 0); cx.strokeStyle = 'rgba(0,0,0,.85)'; cx.lineWidth = Math.max(3 * u, fs * .18); cx.strokeText(t.s, X, Y); cx.fillStyle = t.c; cx.fillText(t.s, X, Y); } cx.globalAlpha = 1; texts = texts.filter(t => time - t.t < 1.1);
    if (flash > 0) { cx.setTransform(1, 0, 0, 1, 0, 0); const g2 = cx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .62); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, flashC); cx.globalAlpha = Math.min(1, flash); cx.fillStyle = g2; cx.fillRect(0, 0, W, H); cx.globalAlpha = 1; flash = Math.max(0, flash - dt * 1.5); }
  }
  const lunge = e => { if (!e.lt) return [0, 0]; const k = (time - e.lt) / .17; if (k < 0 || k > 1) return [0, 0]; const a = Math.sin(k * 3.14) * .42; return [(e.lx - e.x) * a, (e.ly - e.y) * a]; };
  function drawArt(d, x, y, s, small, sy, white) { const sz = s * 1.16 * d.h * small * (d.boss ? 1.06 : 1), X = (x + .5) * s - sz / 2, Y = (y + .94) * s - sz * sy; cx.imageSmoothingEnabled = true; sprite('mon', d.art, X, Y, sz, sz * sy); if (white > 0) { const a = ATLAS.mon, m = a.map[d.art]; if (!dim) { dim = document.createElement('canvas'); dim.width = dim.height = 160; } const c = dim.getContext('2d'); c.globalCompositeOperation = 'copy'; c.drawImage(IMG.mon, m[0] * 160, m[1] * 160, 160, 160, 0, 0, 160, 160); c.globalCompositeOperation = 'source-atop'; c.fillStyle = '#fff'; c.fillRect(0, 0, 160, 160); cx.globalAlpha = white; cx.drawImage(dim, X, Y, sz, sz * sy); cx.globalAlpha = 1; } cx.imageSmoothingEnabled = false; return [X, Y, sz]; }
  function drawMon(m, s) {
    const d = mdef(m), e = ents.get(m.id), l = lunge(e), asleep = m.ai === 'sleep' || m.st.sleep, x = e.x + l[0], y = e.y + l[1]; if (!IMG.mon) return;
    shadow((x + .5) * s, (y + .92) * s, s * .3 * d.h * (m.small || 1)); let ph = G.vis[ix(m.x, m.y)] ? 1 : .4; if (d.phase) ph *= .82; if (m.st.hidden) ph *= .3; cx.globalAlpha = ph;
    const bob = asleep ? 1 + Math.sin(time * 1.6 + m.id) * .012 : 1 + Math.sin(time * 4.2 + m.id) * .028, fly = d.fly ? Math.sin(time * 5 + m.id) * .06 - .08 : 0, w = Math.max(0, 1 - (time - e.hit) / .16);
    const [X, Y, sz] = drawArt(d, x, y + fly, s, m.small || 1, d.dormant && m.ai === 'sleep' ? 1 : bob, e.hit && time >= e.hit ? w * .85 : 0); cx.globalAlpha = 1;
    if (m.rage || m.rage2) { cx.globalAlpha = .18 + .1 * Math.sin(time * 8); cx.fillStyle = '#ff3a1a'; cx.beginPath(); cx.ellipse((x + .5) * s, (y + .85) * s, s * .5 * d.h, s * .2 * d.h, 0, 0, 7); cx.fill(); cx.globalAlpha = 1; }
    if (asleep && !(d.dormant && !m.st.sleep)) { cx.fillStyle = '#cfe0ff'; cx.font = `700 ${s * .28}px system-ui`; cx.textAlign = 'center'; cx.strokeStyle = 'rgba(0,0,0,.7)'; cx.lineWidth = 3 * dpr; const k = (time * .5 + m.id * .3) % 1; cx.globalAlpha = 1 - k; cx.strokeText('z', (x + .72) * s, (y + .1 - k * .4) * s); cx.fillText('z', (x + .72) * s, (y + .1 - k * .4) * s); cx.globalAlpha = 1; }
    if (m.hp < m.mhp) { const bw = s * .74, bx = (x + .5) * s - bw / 2, by = (y + .97) * s; cx.fillStyle = 'rgba(0,0,0,.75)'; cx.fillRect(bx - dpr, by - dpr, bw + 2 * dpr, 6 * dpr); cx.fillStyle = m.boss ? '#ff9a3c' : '#d8382e'; cx.fillRect(bx, by, bw * Math.max(0, m.hp / m.mhp), 4 * dpr); }
    let k = 0; for (const st in m.st) { cx.fillStyle = STATUS[st].c; cx.beginPath(); cx.arc((x + .2 + k++ * .18) * s, (y + .9) * s, s * .07, 0, 7); cx.fill(); } if (m.key) sprite('icon', 'key', (x + .68) * s, (y + .5) * s, s * .36, s * .36);
  }
  function drawHero(e, s) {
    const p = G.p, l = lunge(e), x = e.x + l[0], y = e.y + l[1]; shadow((x + .5) * s, (y + .9) * s, s * .28); if (!hero) return;
    const fr = e.mv ? 1 + Math.floor(time * 14) % 8 : 0, sz = 64 * Math.max(1, Math.round(s * 1.46 / 64)), X = Math.round((x + .5) * s - sz / 2), Y = Math.round((y + .98) * s - sz * .985); cx.globalAlpha = p.st.hidden ? .45 : 1; cx.imageSmoothingEnabled = false; cx.drawImage(hero, fr * 64, p.dir * 64, 64, 64, X, Y, sz, sz);
    if (e.hit && time >= e.hit && time - e.hit < .14) { cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = .5; cx.drawImage(hero, fr * 64, p.dir * 64, 64, 64, X, Y, sz, sz); cx.globalCompositeOperation = 'source-over'; } cx.globalAlpha = 1;
    if (p.ward > 0) { cx.strokeStyle = `rgba(205,220,240,${.5 + .2 * Math.sin(time * 4)})`; cx.lineWidth = 2 * dpr; cx.beginPath(); cx.ellipse((x + .5) * s, (y + .5) * s, s * .5, s * .62, 0, 0, 7); cx.stroke(); }
    let k = 0; for (const st in p.st) { cx.fillStyle = STATUS[st].c; cx.beginPath(); cx.arc((x + .1 + k++ * .18) * s, (y + .98) * s, s * .07, 0, 7); cx.fill(); }
  }
  function drawFeat(f, s) {
    const v = G.vis[ix(f.x, f.y)], X = f.x * s, Y = f.y * s; cx.globalAlpha = v ? 1 : .75; cx.imageSmoothingEnabled = true; const put = (n, k, dy = 0) => { const sz = s * k; sprite('prop', n, X + s / 2 - sz / 2, Y + s * .95 - sz + dy * s, sz, sz); };
    if (f.t !== 'decor' || f.art !== 'log') shadow(X + s / 2, Y + s * .9, s * .36);
    switch (f.t) {
      case 'chest': put(f.q ? 'chest_iron' : 'chest', 1.25); break; case 'barrel': put('barrel', 1.35); break; case 'shelf': cx.filter = 'none'; put('shelf', 1.5); break; case 'bed': put('bed', 1.45); break; case 'forge': put('forge', 1.8); break; case 'trader': put('trader', 1.5); break; case 'cage': put('luigi', 1.05); cx.globalAlpha *= .9; put('cage', 1.6); break; case 'pool': put('pool', 1.25, .05); break;
      case 'altar': put('altar', 1.5); if (!f.used) { const a = .5 + .5 * Math.sin(time * 3); cx.globalAlpha = a * .5; cx.fillStyle = '#ffe9a0'; cx.beginPath(); cx.arc(X + s / 2, Y - s * .18, s * .16, 0, 7); cx.fill(); } break;
      case 'ped': put('obelisk', .9, .1); cx.imageSmoothingEnabled = false; sprite('icon', itemIcon(f.it), X + s * .12, Y - s * .28 + Math.sin(time * 2.4 + f.x) * s * .05, s * .76, s * .76); break;
      case 'decor': put(f.art, f.art === 'geyser' || f.art === 'crystal' ? 1.4 : 1.3); break;
    } cx.globalAlpha = 1; cx.imageSmoothingEnabled = false;
    if (f.used && (f.t === 'shelf' || f.t === 'bed' || f.t === 'altar' || f.t === 'pool')) { cx.fillStyle = 'rgba(0,0,0,.25)'; cx.fillRect(X + s * .2, Y, s * .6, s * .9); }
  }
  /* ---- map ---- */
  function drawMap(c) {
    const s = 8; c.width = G.w * s; c.height = G.h * s; const m = c.getContext('2d'); m.fillStyle = '#0a0806'; m.fillRect(0, 0, c.width, c.height); const z = zoneOf(G.floor);
    for (let i = 0; i < G.t.length; i++) { if (!G.seen[i]) continue; const x = i % G.w, y = (i / G.w) | 0, t = G.t[i]; m.fillStyle = t === T.WALL ? '#3b3025' : t === T.DOOR ? '#b47a3a' : t === T.LOCKED ? '#ffd24a' : t === T.LAVA ? '#e2582a' : t === T.ICE ? '#6fa8c8' : t === T.MUD ? '#5a5a30' : t === T.FERN ? '#4a7a3a' : G.vis[i] ? '#c9ad7c' : '#8a7452'; m.fillRect(x * s, y * s, s, s); }
    const ic = (n, x, y, k = 1.9) => { const a = ATLAS.icon.map[n]; m.drawImage(IMG.icon, a[0] * 64, a[1] * 64, 64, 64, (x + .5 - k / 2) * s, (y + .5 - k / 2) * s, s * k, s * k); };
    for (const it of G.items) if (G.seen[ix(it.x, it.y)]) ic(itemIcon(it), it.x, it.y);
    for (const f of G.feats) if (G.seen[ix(f.x, f.y)]) { if (f.t === 'trap') { if (f.seen && !f.used) { m.fillStyle = '#ff5a4a'; m.fillRect(f.x * s + 2, f.y * s + 2, 4, 4); } } else if (f.t !== 'decor') { const pn = { chest: 'chest', barrel: 'barrel', shelf: 'shelf', bed: 'bed', forge: 'forge', trader: 'trader', altar: 'altar', pool: 'pool', cage: 'luigi', ped: 'obelisk', circle: 'circle' }[f.t], a = ATLAS.prop.map[pn]; m.drawImage(IMG.prop, a[0] * 96, a[1] * 96, 96, 96, (f.x - .4) * s, (f.y - .6) * s, s * 1.8, s * 1.8); } }
    for (const q of G.mons) if (G.vis[ix(q.x, q.y)] || q.reveal) { m.fillStyle = q.boss ? '#ff9a3c' : '#ff3a2a'; m.beginPath(); m.arc((q.x + .5) * s, (q.y + .5) * s, q.boss ? s * .7 : s * .45, 0, 7); m.fill(); }
    if (G.stairs && G.seen[ix(...G.stairs)] && tileAt(...G.stairs) === T.STAIRS) { const a = ATLAS.tile.map.stairs; m.drawImage(IMG.tile, a[0] * 32, a[1] * 32, 32, 32, (G.stairs[0] - .4) * s, (G.stairs[1] - .4) * s, s * 1.8, s * 1.8); m.strokeStyle = '#ffd24a'; m.lineWidth = 1.5; m.strokeRect((G.stairs[0] - .4) * s, (G.stairs[1] - .4) * s, s * 1.8, s * 1.8); }
    m.fillStyle = '#fff'; m.strokeStyle = '#000'; m.lineWidth = 2; m.beginPath(); m.arc((G.p.x + .5) * s, (G.p.y + .5) * s, s * .62, 0, 7); m.fill(); m.stroke();
  }
  const toTile = (px, py) => [Math.floor((px * dpr + camX) / TS), Math.floor((py * dpr + camY) / TS)];
  const screenOf = (x, y) => [((x + .5) * TS - camX) / dpr, ((y + .5) * TS - camY) / dpr];
  requestAnimationFrame(frame);
  return { st, STEP, toTile, screenOf, reset, drawMap, get delay() { return lastDelay; }, get ts() { return TS; }, recompose() { heroKey = ''; } };
})();
