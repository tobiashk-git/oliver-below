/* Simulated players, used by sim.html to tune run length. Not loaded by the game. */
'use strict';
const SKILL = {
  beginner: { dodge: .2, panic: .24, potionUse: .55, rest: .45, spell: .3, equip: .7, choke: .05, first: .1, ids: .5, perk: 'rand', special: .25, dive: .012, escape: .05, boon: .3, eat: .7, ring: .4, t: { step: .2, dec: 1.7, fight: 2.0, item: 6, level: 11, shop: 24, floor: 10 } },
  average: { dodge: .5, panic: .3, potionUse: .85, rest: .65, spell: .55, equip: 1, choke: .3, first: .3, ids: .9, perk: 'ok', special: .6, dive: 0, escape: .3, boon: .6, eat: 1, ring: .5, t: { step: .16, dec: 1.35, fight: 1.6, item: 4.5, level: 8, shop: 22, floor: 7 } },
  expert: { dodge: .95, panic: .42, potionUse: 1, rest: .93, spell: .95, equip: 1, choke: .9, first: .9, ids: 1, perk: 'best', special: 1, dive: 0, escape: .95, boon: .9, eat: 1, ring: .9, t: { step: .15, dec: 1.3, fight: 2.0, item: 5, level: 9, shop: 30, floor: 8 } },
};
const PERKW = { arm: 9, hide: 8, hearty: 8, nibble: 8, breath: 9, feet: 6, eye: 6, guard: 5, duel: 6, brawler: 4, first: 4, finish: 4, thorns: 4, steady: 3, moment: 3, tough: 4, alch: 5, riposte: 5, forager: 3, scholar: 4, medit: 4, scav: 3, haggle: 2, trap: 1 };
const BOONPREF = ['b_life', 'b_stone', 'b_edge', 'b_blood', 'b_feast', 'b_mind', 'b_gold'];

function simRun(skill, seed, o = {}) {
  const B = SKILL[skill], tm = B.t;
  let br = seed * 7919 + 13;
  const R = () => { br = (Math.imul(br, 1103515245) + 12345) & 0x7fffffff; return (br >>> 8 & 0xffff) / 65536; };
  const ok = p => R() < p;
  FX.on = false; newGame(o.kit || 'wanderer', seed);
  let time = 8, acts = 0, floor0 = 0, floorActs = 0, path = null, perFloor = [], tf = 0, skip = new Set(), timeouts = 0;
  const maxFloors = o.maxFloors || 60;
  const score = it => {
    if (it.slot === 'charm') return 2;
    if (it.slot === 'weapon') return gearAtk(it) * ({ great: .8, pick: 1.1, cleaver: 1.12, spear: 1.06, blade: 1.05 })[it.type] + it.aff.length * 1.2;
    return gearDef(it) + it.aff.length * .8;
  };
  const has = (k, t) => G.p.bag.find(b => b.k === k && (!t || b.t === t));
  const hasK = (k, t) => known(k, t) ? has(k, t) : null;
  const sval = it => it.k === 'gear' ? (G.p.eq[it.slot] ? score(it) - score(G.p.eq[it.slot]) : score(it)) + (it.slot === 'weapon' ? 1 : 0) : 1.5;

  function pend() {
    const q = G.pending.shift(), p = G.p; time += 2;
    if (q.t === 'level') {
      time += tm.level; const w = B.perk === 'rand' ? null : q.opts.slice().sort((a, b) => PERKW[b] - PERKW[a])[0];
      takePerk(w && ok(B.perk === 'best' ? 1 : .6) ? w : q.opts[Math.floor(R() * q.opts.length)]);
    } else if (q.t === 'ped') {
      time += 10; const b = G.feats.filter(f => f.t === 'ped').sort((a, b) => sval(b.it) - sval(a.it))[0]; if (!b || !doPed(b)) skip.add('ped');
    } else if (q.t === 'shop') {
      time += tm.shop; const f = q.f;
      for (const it of p.bag.slice()) if (it.k === 'gear' && p.eq[it.slot] && score(it) < score(p.eq[it.slot])) doSell(it);
      for (let n = 0; n < 8; n++) {
        const i = f.stock.findIndex(it => p.gold >= price(it) && ((it.k === 'potion' && it.t === 'heal') || (it.k === 'gear' && (!p.eq[it.slot] || score(it) > score(p.eq[it.slot]) * 1.12)) || (it.k === 'food' && !has('food')) || (it.k === 'scroll' && it.t === 'forge')));
        if (i < 0 || !ok(.6 + B.special * .4) || !doBuy(f, i)) break;
      }
    } else if (q.t === 'forge') {
      time += 12; for (let n = 0; n < 2; n++) { const it = p.eq.weapon && p.gold >= forgeCost(p.eq.weapon) ? p.eq.weapon : p.eq.body; if (it) doForge(q.f, it); }
    } else if (q.t === 'altar') {
      time += 9; const av = q.f.opts.filter(id => { const b = BOONS.find(b => b.id === id); return !b.ok || b.ok(p); });
      if (ok(B.boon) && av.length) doAltar(q.f, B.perk === 'rand' ? av[Math.floor(R() * av.length)] : av.sort((a, b) => BOONPREF.indexOf(a) - BOONPREF.indexOf(b))[0]);
    } else if (q.t === 'forgeScroll') {
      time += 4; const it = p.eq.weapon && (R() < .55 || !p.eq.body) ? p.eq.weapon : p.eq.body || p.eq.weapon; if (it) { takeOne(q.it); doForgeScroll(it); }
    }
  }
  function goStep(tx, ty) {
    const p = G.p;
    if (!path || path.tx !== tx || path.ty !== ty || !path.s.length) { const s = pathTo(tx, ty); if (!s || !s.length) return false; path = { tx, ty, s }; time += tm.dec; }
    const [x, y] = path.s.shift(); if (cheb(x, y, p.x, p.y) !== 1) { path = null; return false; }
    time += tm.step; const r = ACT.move(x - p.x, y - p.y); if (!r) path = null; return r || G.pending.length > 0;
  }
  const opens = (x, y) => { let n = 0; for (const [dx, dy] of D8) if (walkable(x + dx, y + dy) && canStep(x, y, dx, dy)) n++; return n; };
  function tryHeal() {
    if (!ok(B.potionUse)) return false; const it = has('potion', 'heal'); if (it) { time += tm.item * .7; return useItem(it); }
    if (canCast('heal')) { time += tm.fight; return castSpell('heal'); } return false;
  }
  function escape(th) {
    if (!ok(B.escape)) return false; const p = G.p; let it;
    if ((it = hasK('scroll', 'lull'))) { time += tm.item; return useItem(it); }
    if ((it = hasK('potion', 'doze'))) { const m = th.find(m => mdist(m) > 1); if (m) { time += tm.item; return ACT.throwAt(it, m.x, m.y); } }
    if (p.ward < 5 && (it = hasK('scroll', 'ward'))) { time += tm.item; return useItem(it); }
    if (p.ward < 5 && canCast('ward')) { time += tm.fight; return castSpell('ward'); }
    if (!p.st.hidden && (it = hasK('potion', 'vanish'))) { time += tm.item; return useItem(it); }
    if ((it = has('feather'))) { time += tm.item; return useItem(it); }
    if ((it = hasK('scroll', 'blink'))) { time += tm.item; return useItem(it); }
    if (G.stairs && tileAt(...G.stairs) === T.STAIRS && G.seen[ix(...G.stairs)] && cheb(p.x, p.y, ...G.stairs) < 9) {
      if (tileAt(p.x, p.y) === T.STAIRS) { time += 2; return ACT.descend(); }
      const s = pathTo(...G.stairs); if (s && s.length && !monAt(...s[0])) { time += 1; return ACT.move(s[0][0] - p.x, s[0][1] - p.y); }
    }
    return false;
  }
  function bestBlink() {
    let b = null; const p = G.p;
    for (let k = 0; k < 40; k++) { const x = p.x + Math.floor(R() * 9) - 4, y = p.y + Math.floor(R() * 9) - 4; if (inb(x, y) && walkable(x, y) && !monAt(x, y) && visible(x, y) && !dangerAt(x, y) && tileAt(x, y) !== T.LAVA) { const s = Math.min(9, ...G.mons.map(m => cheb(x, y, m.x, m.y))); if (!b || s > b[2]) b = [x, y, s]; } }
    return b && b.slice(0, 2);
  }
  function fight(th) {
    const p = G.p, hf = p.hp / S.maxHp, adj = th.filter(m => mdist(m) <= 1 && reachTarget(m)), boss = th.find(m => m.boss); time += tm.fight;
    if (dangerAt(p.x, p.y) && ok(B.dodge) && !p.st.root) {
      const c = [];
      for (const [dx, dy] of D8) { const x = p.x + dx, y = p.y + dy; if (!inb(x, y) || !walkable(x, y) || monAt(x, y) || !canStep(p.x, p.y, dx, dy) || dangerAt(x, y) || tileAt(x, y) === T.LAVA) continue; c.push([dx, dy, th.filter(m => cheb(m.x, m.y, x, y) <= 1).length]); }
      if (c.length) { c.sort((a, b) => a[2] - b[2]); return ACT.move(c[0][0], c[0][1]); }
      const bl = canCast('blink') && bestBlink(); if (bl && castSpell('blink', ...bl)) return true;
    }
    const incoming = th.reduce((s, m) => s + (mdist(m) <= 3 ? dmgF(m.atk, S.def) : 0), 0);
    const panic = Math.max(B.panic * .7, Math.min(.6, incoming * 1.6 / S.maxHp + (B.panic - .25)));
    if (hf < panic) { if (tryHeal()) return true; if (hf < .3 && escape(th)) return true; }
    if (boss && ok(B.special)) for (const t of ['might', 'stone', 'haste']) { const it = hasK('potion', t); if (it && !p.st[t] && mdist(boss) < 4) { time += tm.item; return useItem(it); } }
    if ((boss || th.length >= 3) && ok(B.special * .6)) {
      let it = hasK('potion', 'fire'); const m = th.find(m => mdist(m) >= 2 && mdist(m) < 7 && !mdef(m).fire);
      if (it && m) return ACT.throwAt(it, m.x, m.y);
      if ((it = hasK('scroll', 'storm'))) return useItem(it);
      if (th.length >= 3 && hf < .6 && (it = hasK('scroll', 'lull'))) return useItem(it);
    }
    if (!p.st.silence && ok(B.spell * .8)) {
      const far = th.filter(m => mdist(m) >= 2 && mdist(m) <= 6).sort((a, b) => mdist(a) - mdist(b))[0], res = p.spells.heal && B.special > .5 ? 6 : 0;
      if (boss || hf < .75 || p.mp > S.maxMp * .6) {
        for (const id of ['fire', 'storm', 'sling']) { const t = far || (id !== 'sling' && boss); if (t && canCast(id) && p.mp - SPELLS[id].mp >= res && !(id === 'fire' && mdef(t).fire) && visible(t.x, t.y) && mdist(t) <= SPELLS[id].range && castSpell(id, t.x, t.y)) return true; }
        if (adj.length >= 2 && canCast('frost') && p.mp - 5 >= res) return castSpell('frost');
      }
    }
    if (hf < .45 && canCast('heal') && ok(B.spell)) return castSpell('heal');
    if (th.length >= 2 && !boss && adj.length <= 2 && !p.st.root && opens(p.x, p.y) > 3 && ok(B.choke)) {
      const d = flood(p.x, p.y, { known: 1, avoid: 1, max: 5 }); let b = null;
      for (let y = p.y - 5; y <= p.y + 5; y++) for (let x = p.x - 5; x <= p.x + 5; x++) if (inb(x, y) && d[ix(x, y)] > 0 && opens(x, y) <= 2 && !monAt(x, y) && (!b || d[ix(x, y)] < b[2]) && th.every(m => cheb(m.x, m.y, x, y) >= d[ix(x, y)])) b = [x, y, d[ix(x, y)]];
      if (b) { const s = pathTo(b[0], b[1]); if (s && s.length && !monAt(...s[0])) return ACT.move(s[0][0] - p.x, s[0][1] - p.y); }
    }
    const tgt = th.filter(reachTarget).sort((a, b) => a.hp - b.hp)[0];
    if (tgt) return ACT.attack(tgt);
    const near = th.slice().sort((a, b) => mdist(a) - mdist(b))[0], st = has('throw');
    if (st && mdist(near) >= 2 && mdist(near) <= 6 && ok(B.first)) return ACT.throwAt(st, near.x, near.y);
    if (near.ai === 'flee' && mdist(near) > 2) return idle(1);
    if (!mdef(near).keep && !mdef(near).shot && near.ai === 'hunt' && mdist(near) <= 3 && ok(B.first)) return ACT.wait();
    const s = pathTo(near.x, near.y, false);
    if (s && s.length && near.ai !== 'wander') return ACT.move(s[0][0] - p.x, s[0][1] - p.y);
    return ok(.5) ? ACT.wait() : idle(1);
  }
  function idle(quick) {
    const p = G.p, hf = p.hp / S.maxHp;
    if (p.food < 250 && ok(B.eat)) { const f = has('food'); if (f) { time += 3; return useItem(f); } }
    for (const it of p.bag) if (it.k === 'gear' && !it.no && (!p.eq[it.slot] || score(it) > score(p.eq[it.slot]))) { if (ok(B.equip)) { time += tm.item; return ACT.equip(it); } it.no = 1; }
    const tb = has('tome'); if (tb) { time += tm.item; return useItem(tb); }
    const fs = has('scroll', 'forge'); if (fs) { time += 4; useItem(fs); return true; }
    if (hf > .75 && ok(B.ids)) {
      const u = p.bag.find(b => (b.k === 'potion' || b.k === 'scroll') && !known(b.k, b.t)); if (u) { time += tm.item; return useItem(u); }
      const mp = p.bag.find(b => b.k === 'scroll' && (b.t === 'map' || b.t === 'feast') && known('scroll', b.t)); if (mp) return useItem(mp);
      const v = hasK('potion', 'vigor') || (p.mp < S.maxMp * .3 && has('potion', 'mana')); if (v) return useItem(v);
    }
    if (!quick && hf < B.rest && (p.food > 260 || has('food')) && !p.st.burn && ok(.97)) { if (hf < .6 && B.spell > .5 && canCast('heal')) return castSpell('heal'); time += .03; return ACT.wait(); }
    const bed = G.feats.find(f => f.t === 'bed' && !f.used); if (bed && hf < .8 && goStep(bed.x, bed.y)) return true;
    if (G.stairs && G.seen[ix(...G.stairs)] && ok(B.dive)) skip.add('dive');
    if (!skip.has('dive')) {
      const t = exploreTarget(); if (t && !skip.has(t + '')) { if (goStep(t[0], t[1])) return true; skip.add(t + ''); }
      for (const f of G.feats) {
        const id = f.t + f.x + ',' + f.y; if (skip.has(id) || !G.seen[ix(f.x, f.y)]) continue; let w = 0;
        if ((f.t === 'altar' || f.t === 'pool') && !f.used) w = 1;
        if (f.t === 'trader' || (f.t === 'forge' && p.gold > 60) || (f.t === 'ped' && !skip.has('ped'))) w = 1;
        if (f.t === 'circle' && !f.used && hf > .85) { if (!f.dec) { f.dec = 1; f.want = ok(B.ring) ? 1 : 0; } if (f.want) w = 1; }
        if (w) { const near = cheb(p.x, p.y, f.x, f.y) <= 1; if (!goStep(f.x, f.y)) { skip.add(id); continue; } if (near) skip.add(id); return true; }
      }
    }
    if (G.stairs && tileAt(...G.stairs) === T.STAIRS) {
      if (p.x === G.stairs[0] && p.y === G.stairs[1]) { time += tm.floor; return ACT.descend(); }
      if (!quick && hf < B.rest && p.food > 300 && G.floorTurn < 1500) { time += .03; return ACT.wait(); }
      if (goStep(...G.stairs)) return true;
    }
    const b = G.mons.find(m => m.boss);
    if (b) { const s = pathTo(b.x, b.y, false); if (s && s.length) { time += tm.step; return ACT.move(s[0][0] - p.x, s[0][1] - p.y); } }
    if (G.stairs) { const s = pathTo(G.stairs[0], G.stairs[1], false); if (s && s.length) { time += tm.step; return ACT.move(s[0][0] - p.x, s[0][1] - p.y); } }
    return ACT.wait();
  }
  while (!G.over && G.floor <= maxFloors && acts++ < 60000) {
    if (G.floor !== floor0) { if (floor0) perFloor.push([G.floor, Math.round(time - tf), 'L' + G.p.lvl, Math.round(S.maxHp), 'a' + Math.round(S.atk), 'd' + Math.round(S.def), 'pot' + G.p.bag.filter(b => b.t === 'heal').reduce((a, b) => a + b.q, 0), 'food' + G.p.bag.filter(b => b.k === 'food').reduce((a, b) => a + b.q, 0) + '/' + Math.round(G.p.food), 't' + Math.round(G.turn), 'k' + G.stats.kills, 'g' + G.p.gold].join(' ')); tf = time; floor0 = G.floor; floorActs = 0; skip = new Set(); path = null; }
    if (++floorActs > 3500) { timeouts++; if (o.debug) console.log('stuck', skill, seed, G.floor); break; }
    if (G.pending.length) { pend(); continue; }
    const p = G.p, th = G.mons.filter(m => visible(m.x, m.y) && !(mdef(m).dormant && m.ai === 'sleep'));
    const aw = th.filter(m => (m.ai !== 'sleep' && !m.st.sleep) || mdist(m) <= 1);
    if (aw.length) { path = null; fight(aw); continue; }
    const sl = th.filter(m => !m.boss).sort((a, b) => mdist(a) - mdist(b))[0];
    if (sl && p.hp > S.maxHp * B.rest * .8) {
      if (reachTarget(sl)) { time += tm.fight; ACT.attack(sl); }
      else { const s = pathTo(sl.x, sl.y, false); if (s && s.length) { time += tm.step; ACT.move(s[0][0] - p.x, s[0][1] - p.y); } else idle(); }
      continue;
    }
    idle();
  }
  return { floor: G.floor, time, won: G.won, by: G.over ? G.over.by : 'cap', lvl: G.p.lvl, turns: G.turn, kills: G.stats.kills, perFloor, timeouts, hp: S.maxHp, atk: S.atk, def: S.def, food: G.p.food, spells: Object.keys(G.p.spells).length };
}
function summarise(skill, rs) {
  const n = rs.length;
  const t = rs.map(r => r.time / 60).sort((a, b) => a - b), f = rs.map(r => r.floor).sort((a, b) => a - b), q = (a, k) => a[Math.min(a.length - 1, Math.floor(a.length * k))];
  const by = {}; rs.forEach(r => by[r.by] = (by[r.by] || 0) + 1);
  return { skill, min: [.1, .25, .5, .75, .9].map(k => +q(t, k).toFixed(1)), floor: [.1, .25, .5, .75, .9].map(k => q(f, k)), won: rs.filter(r => r.won).length + '/' + n, stuck: rs.reduce((s, r) => s + r.timeouts, 0), lvl: +(rs.reduce((s, r) => s + r.lvl, 0) / n).toFixed(1), perFloorMin: +(rs.reduce((s, r) => s + r.time / r.floor, 0) / n / 60).toFixed(2), by: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 7).map(e => e.join(':')).join(' ') };
}
/* runs batches without freezing the page; results land in window.SIM */
async function simAsync(plan, o = {}) {
  window.SIM = { done: false, rows: [] };
  for (const [skill, n] of plan) {
    const keep = []; for (let i = 0; i < n; i++) { try { keep.push(simRun(skill, (o.seed || 1000) + i, o)); } catch (e) { window.SIM.err = e.stack + ' floor ' + G.floor + ' seed ' + i; } await new Promise(r => setTimeout(r)); }
    window.SIM.rows.push(summarise(skill, keep)); window.SIM.raw = keep;
  }
  window.SIM.done = true;
}
