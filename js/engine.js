/* The rules. No DOM in here: the same engine runs the game and the simulated players. */
'use strict';

/* effects for the renderer; the simulator switches them off */
const FX = { on: false, q: [] };
function fx(t, o) { if (FX.on) FX.q.push({ t, ...o }); }
function say(s, c) { if (!G) return; G.log.push({ s, c: c || '', n: G.turn }); if (G.log.length > 60) G.log.shift(); fx('log', {}); }
const snd = n => fx('snd', { n });
const visible = (x, y) => G.vis[ix(x, y)] === 1;

/* ================= items ================= */
let uid = 1;
const goldAmt = f => Math.round((6 + f * 1.5) * (.7 + rnd() * .7));
function gearTier(f, bump = 0) { let t = zoneIdx(f); if (f > WIN_FLOOR) t = 5; if (chance(.30 - bump * .2)) t--; else if (chance(.10 + bump * .12)) t++; return Math.max(0, Math.min(5, t)); }
function rollGear(f, o = {}) {
  const slot = o.slot || wpick({ weapon: 3.2, body: 2, head: 1.5, hands: 1.3, legs: 1.5, feet: 1.3, charm: .7 }, w => w);
  if (slot === 'charm') return { k: 'gear', slot, type: pick(Object.keys(CHARMS)), tier: 0, plus: 0, aff: [], id: uid++ };
  const tier = o.tier != null ? o.tier : gearTier(f, o.bump || 0);
  let plus = chance(.5) ? 0 : chance(.62) ? 1 : chance(.65) ? 2 : 3; if (f > WIN_FLOOR) plus += Math.floor((f - WIN_FLOOR) / 2);
  const it = { k: 'gear', slot, tier, plus, aff: [], id: uid++ };
  if (slot === 'weapon') it.type = o.type || pick(Object.keys(WEAPONS));
  if (chance(.22 + (o.bump || 0) * .4)) { const a = pick(Object.keys(AFFIX)); it.aff.push([a, Math.max(1, Math.round(AFFIX[a].r(f) * (.75 + rnd() * .5)))]); }
  return it;
}
const rollPotion = () => ({ k: 'potion', t: wpick(POTIONS, p => p.w), q: 1 });
const rollScroll = () => ({ k: 'scroll', t: wpick(SCROLLS, p => p.w), q: 1 });
const rollTome = () => pick(Object.keys(SPELLS));
function rollItem(f, bump = 0) {
  const r = rnd();
  if (r < .36 + bump * .3) return rollGear(f, { bump });
  if (r < .62 + bump * .2) return rollPotion();
  if (r < .86 + bump * .07) return rollScroll();
  if (r < .90 + bump * .05) return { k: 'tome', t: rollTome() };
  if (r < .985) return { k: 'throw', t: 'stone', q: ri(2, 4) };
  return { k: 'food', t: 'pasty', q: 1 };
}
function vaultChoices(f) { const a = rollGear(f, { slot: 'weapon', bump: 1, tier: Math.min(5, zoneIdx(f) + (chance(.5) ? 1 : 0)) }); const b = rollGear(f, { slot: pick(['body', 'head', 'legs', 'charm']), bump: 1 }); return shuffle([a, b, chance(.5) ? { k: 'tome', t: rollTome() } : { k: 'potion', t: 'vigor', q: 1 }]); }
const price = (it, sell) => {
  let v; if (it.k === 'gear') v = it.slot === 'charm' ? 110 : (24 + it.tier * 30) * (it.slot === 'weapon' || it.slot === 'body' ? 1.5 : 1) + it.plus * (10 + it.tier * 6) + it.aff.length * 28;
  else if (it.k === 'potion') v = POTIONS[it.t].v; else if (it.k === 'scroll') v = SCROLLS[it.t].v; else if (it.k === 'tome') v = 95; else if (it.k === 'food') v = 22; else if (it.k === 'throw') v = 3; else if (it.k === 'feather') v = 70; else v = 5;
  if (it.k !== 'gear') v *= 1 + G.floor * .05;
  if (sell) return Math.max(1, Math.round(v * .3 * (it.q || 1))); return Math.max(1, Math.round(v * (perk('haggle') ? .67 : 1) * (it.q && it.k === 'throw' ? it.q : 1)));
};
function shopStock(f) { const s = [{ k: 'potion', t: 'heal', q: 1 }, { k: 'food', t: 'pasty', q: 1 }, { k: 'scroll', t: 'forge', q: 1 }, rollGear(f, { bump: .5 }), rollGear(f, { bump: .5 }), chance(.6) ? { k: 'tome', t: rollTome() } : rollPotion(), chance(.5) ? { k: 'feather', q: 1 } : rollScroll()]; return s; }

const known = (k, t) => (k !== 'potion' && k !== 'scroll') || !!((k === 'potion' ? POTIONS[t] : SCROLLS[t]).known || G.known[k + t]);
function learn(k, t) { if (!known(k, t)) { G.known[k + t] = 1; return true; } return false; }
const LOOKS = ['Amber', 'Yellow', 'Green', 'Teal', 'Cyan', 'Indigo', 'Violet', 'Cloudy'];
function itemName(it) {
  switch (it.k) {
    case 'gear': {
      if (it.slot === 'charm') return CHARMS[it.type].n + (it.plus ? ' +' + it.plus : '');
      const b = it.slot === 'weapon' ? TIERS[it.tier] + ' ' + WEAPONS[it.type].n : ARMNAME[it.slot][it.tier];
      return b + (it.plus ? ' +' + it.plus : '') + (it.aff[0] ? ' ' + AFFIX[it.aff[0][0]].n : '');
    }
    case 'potion': return known('potion', it.t) ? POTIONS[it.t].n : LOOKS[G.looks[it.t]] + ' Potion';
    case 'scroll': return known('scroll', it.t) ? SCROLLS[it.t].n : 'Scroll “' + G.words[it.t] + '”';
    case 'tome': return 'Tome of ' + SPELLS[it.t].n; case 'food': return 'Pasty'; case 'throw': return 'Throwing Stone'; case 'key': return 'Vault Key'; case 'gold': return it.q + ' gold'; case 'feather': return 'Angel Feather';
  } return '?';
}
function itemIcon(it) {
  switch (it.k) {
    case 'gear': return it.slot === 'charm' ? CHARMS[it.type].ic : (it.slot === 'weapon' ? it.type : it.slot) + it.tier;
    case 'potion': return POTIONS[it.t].ic || 'pot' + G.looks[it.t]; case 'scroll': return 'scroll'; case 'tome': return 'tome_' + it.t; case 'food': return 'pasty'; case 'throw': return 'stone'; case 'key': return 'key'; case 'gold': return 'gold'; case 'feather': return 'angel_feather';
  } return 'stone';
}
const gearAtk = it => (K.weaponAtk[it.tier] + it.plus * K.plusW(it.tier)) * WEAPONS[it.type].mul;
const gearDef = it => K.armour[it.slot][it.tier] + it.plus * K.plusA(it.tier);
function itemDesc(it) {
  switch (it.k) {
    case 'gear': {
      const l = []; if (it.slot === 'weapon') l.push(`Attack ${gearAtk(it).toFixed(1)}. ${WEAPONS[it.type].d}`); else if (it.slot === 'charm') l.push(CHARMS[it.type].d); else l.push(`Armour ${gearDef(it).toFixed(1)}. Part of the ${SETS[it.tier].n} set.`);
      for (const [a, v] of it.aff) l.push(AFFIX[a].t(v)); return l.join('  ');
    }
    case 'potion': return known('potion', it.t) ? POTIONS[it.t].d : 'You have no idea what this does. Drink it, or throw it at somebody.';
    case 'scroll': return known('scroll', it.t) ? SCROLLS[it.t].d : 'The writing swims. Read it to find out.';
    case 'tome': return (G.p.spells[it.t] ? 'You know this spell; reading it again makes it stronger. ' : 'Teaches a spell. ') + SPELLS[it.t].d((G.p.spells[it.t] || 0) + 1); case 'food': return 'Warm, crimped, dependable. Fills you up and mends 8% health.'; case 'throw': return 'A good throwing stone. Hits from afar.'; case 'key': return 'Opens the locked door on this floor.'; case 'feather': return 'Warm to the touch. Whisks you down to the next floor, mended by half. Works mid-fight.';
  } return '';
}
const stackKey = it => it.k + (it.t || '');
const BAG_MAX = 20;
function give(it, quiet) {
  const p = G.p;
  if (it.k === 'gold') { const q = Math.round(it.q * (1 + (S.gold || 0))); p.gold += q; G.stats.gold += q; if (!quiet) { say(`+${q} gold.`, 'gold'); snd('coin'); } return true; }
  if (it.k === 'key') { G.key = true; if (!quiet) { say('You found the vault key.', 'good'); snd('coin'); } return true; }
  if (it.k !== 'gear') { const s = p.bag.find(b => stackKey(b) === stackKey(it)); if (s) { s.q = (s.q || 1) + (it.q || 1); if (!quiet) { say('Picked up ' + itemName(it) + '.'); snd('tap'); } return true; } }
  if (p.bag.length >= BAG_MAX) { if (!quiet) say('Your bag is full.', 'bad'); return false; }
  const c = { ...it }; delete c.x; delete c.y; if (c.k !== 'gear' && !c.q) c.q = 1; p.bag.push(c);
  if (!quiet) { say('Picked up ' + itemName(it) + '.', it.k === 'gear' && (it.aff.length || it.tier > zoneIdx(G.floor)) ? 'good' : ''); snd('tap'); } return true;
}
function takeOne(it) { const p = G.p; if (it.q > 1) it.q--; else p.bag.splice(p.bag.indexOf(it), 1); }

/* ================= derived stats ================= */
let S = {};
const perk = id => (G.p.perks[id] || 0);
function aff(id) { let v = 0; for (const s of SLOTS) { const e = G.p.eq[s]; if (e) for (const [a, n] of e.aff) if (a === id) v += n; } return v; }
const charm = t => G.p.eq.charm && G.p.eq.charm.type === t;
function setCount(t) { let n = 0; for (const s of ['body', 'head', 'hands', 'legs', 'feet']) if (G.p.eq[s] && G.p.eq[s].tier === t) n++; return n; }
function calc() {
  const p = G.p, e = p.eq, L = p.lvl - 1, sets = [0, 1, 2, 3, 4, 5].map(t => { const n = setCount(t); return n >= 5 ? 2 : n >= 3 ? 1 : 0; });
  const w = e.weapon; S = {}; S.sets = sets; S.w = w ? WEAPONS[w.type] : { mul: 1 };
  S.atk = (K.baseAtk + K.atkLvl * L + (w ? gearAtk(w) : 0)) * (1 + .09 * perk('arm') + aff('might') / 100) * p.mul.atk * (sets[3] > 1 ? 1.12 : 1) * (sets[5] > 1 ? 1.1 : 1);
  let d = 0; for (const s of ['body', 'head', 'hands', 'legs', 'feet']) if (e[s]) d += gearDef(e[s]); S.def = (d + perk('hide')) * (1 + .10 * perk('hide')) * p.mul.def;
  S.maxHp = Math.round((K.baseHp + K.hpLvl * L + aff('vigor') + p.mul.hpFlat) * (1 + .09 * perk('hearty')) * p.mul.hp * (1 + .1 * sets[5]));
  S.maxMp = Math.round(K.baseMp + K.mpLvl * L + 5 * perk('scholar') + aff('mind') + p.mul.mp);
  S.crit = .05 + .06 * perk('eye') + (S.w.crit || 0) + aff('keen') / 100; S.dodge = Math.min(.5, .05 + .05 * perk('feet') + .08 * sets[0] + aff('light') / 100);
  S.spell = (1 + .14 * perk('scholar')); S.resist = Math.min(.85, .35 * perk('tough') + (charm('ward') ? .6 : 0) + aff('ward') / 100);
  S.leech = .04 * perk('nibble') + aff('leech') / 100; S.reflect = .12 * perk('thorns') + .2 * sets[4]; S.thorn = aff('thorn'); S.gold = (charm('luck') ? .6 : 0) + aff('gold') / 100;
  S.regen = 1 + [0, .4, 1][sets[2]]; S.reach = S.w.reach || 1;
  if (p.hp > S.maxHp) p.hp = S.maxHp; if (p.mp > S.maxMp) p.mp = S.maxMp;
}

/* ================= new run and floors ================= */
function newGame(kit = 'wanderer', seed = (Math.random() * 2 ** 31) | 0, mode = 'normal') {
  const kd = KITS[kit];
  G = { v: 1, rs: seed | 0, seed, mode, kit, floor: 0, turn: 0, time: 0, log: [], known: {}, looks: {}, words: {}, stats: { kills: 0, gold: 0, boss: 0, by: {}, slept: {} }, pending: [], over: null, won: false, floorTimes: [] };
  const looks = shuffle([0, 1, 2, 3, 4, 5, 6, 7]), w = shuffle(SCROLL_WORDS.slice()); let i = 0;
  for (const k in POTIONS) if (!POTIONS[k].ic) G.looks[k] = looks[i++ % 8]; i = 0; for (const k in SCROLLS) G.words[k] = w[i++ % w.length];
  G.p = { x: 0, y: 0, hp: 1, mp: 0, lvl: 1, xp: 0, gold: kd.gold || 0, food: K.hungerStart, eq: {}, bag: [], spells: {}, perks: {}, mul: { hp: kd.hp || 1, hpFlat: 0, atk: 1, def: 1, mp: kd.mp || 0 }, st: {}, pw: {}, ward: 0, dir: 2, hacc: 0, macc: 0, pity: { food: 0, heal: 0, forge: 0 }, luigi: null, moved: 0, steady: 0 };
  G.give = give;
  G.p.eq.weapon = { k: 'gear', slot: 'weapon', type: kd.weapon, tier: 0, plus: 0, aff: [], id: uid++ }; G.p.eq.body = { k: 'gear', slot: 'body', tier: 0, plus: 0, aff: [], id: uid++ };
  if (kd.perk) G.p.perks[kd.perk] = 1; calc();
  for (const s of kd.spells) G.p.spells[s] = 1;
  for (const [k, t, q] of kd.items) { if (k === 'potion' || k === 'scroll') learn(k, t); give({ k, t, q }, 1); }
  calc(); G.p.hp = S.maxHp; G.p.mp = S.maxMp; nextFloor();
}
function nextFloor() {
  if (G.floor > 0) G.floorTimes.push(Math.round(G.time));
  G.floor++; G.p.breath = 0; G.p.ward = Math.min(G.p.ward, S.maxHp * .2); G.luigi = null;
  genFloor(G.floor); if (G.p.luigi) G.luigi = { x: G.p.x, y: G.p.y, cd: 0 };
  computeFov(); const z = zoneOf(G.floor);
  if ((G.floor - 1) % FLOORS_PER_ZONE === 0) say(z.name + '. ' + z.sub, 'zone'); else say(`Floor ${G.floor}.`, 'zone');
  fx('floor', {}); G.alertN = 0; noteSeen();
}
function spawnMon(k, x, y, f, o = {}) {
  const d = MON[k], s = o.scale || 1, dis = d.boss ? 1 : .92 + rnd() * .16, hp = Math.max(2, Math.round(K.mhp(f) * d.hp * dis * s));
  const m = { id: uid++, k, x, y, hp, mhp: hp, atk: K.matk(f) * d.atk * (o.as || 1), def: K.mdef(f) * d.def, en: 0, ai: o.hunt ? 'hunt' : o.wander ? 'wander' : 'sleep', st: {}, pw: {}, cd: ri(0, 2), mcd: 1, mi: 0, intent: null, lx: -1, ly: -1, lost: 0, f, minion: o.minion || 0, first: 1 };
  if (d.boss) m.boss = 1; if (s < 1) m.small = s; G.mons.push(m); return m;
}
const mdef = m => MON[m.k];
function noteSeen() { for (const m of G.mons) if (visible(m.x, m.y)) G.stats.slept[m.k] = G.stats.slept[m.k] || 0; }

/* ================= statuses ================= */
function addSt(a, st, n, pw) {
  const isP = a === G.p;
  if (isP && STATUS[st].bad && chance(S.resist)) { fx('text', { x: a.x, y: a.y, s: 'resisted', c: '#cfd8e8' }); return false; }
  if (!isP) { const d = mdef(a); if (d.fire && st === 'burn') return false; if (a.boss) { if (st === 'sleep' || st === 'stun') n = Math.min(n, 2); else if (st === 'root') n = Math.min(n, 2); if (a.ccr && G.turn - a.ccr < 12 && (st === 'sleep' || st === 'root' || st === 'stun')) return false; if (st === 'sleep' || st === 'root' || st === 'stun') a.ccr = G.turn; } if (st === 'sleep') { a.intent = null; } }
  a.st[st] = Math.max(a.st[st] || 0, n); if (pw != null) a.pw[st] = Math.max(a.st[st] > n ? (a.pw[st] || 0) : 0, pw);
  fx('text', { x: a.x, y: a.y, s: STATUS[st].n, c: STATUS[st].c }); return true;
}
function tickSt(a) {
  const isP = a === G.p;
  for (const s in a.st) {
    if ((s === 'poison' || s === 'burn')) { const dmg = Math.max(1, Math.round(a.pw[s] || 1)); if (isP) hurtPlayer(dmg, STATUS[s].n.toLowerCase(), { dot: 1, c: STATUS[s].c, fire: s === 'burn' }); else hurtMon(a, dmg, { dot: 1, c: STATUS[s].c }); if (a.hp <= 0) return; }
    if (--a.st[s] <= 0) delete a.st[s];
  }
}

/* ================= damage ================= */
const dmgF = (a, d) => a * a / (a + Math.max(0, d));
function hurtMon(m, dmg, o = {}) {
  if (m.hp <= 0) return; dmg = Math.max(1, Math.round(dmg)); m.hp -= dmg; m.first = 0;
  fx('hit', { id: m.id, x: m.x, y: m.y, n: dmg, crit: o.crit, c: o.c, d: o.delay });
  if (m.st.sleep && !o.keepSleep) delete m.st.sleep;
  if (m.ai !== 'hunt' && !o.dot) { wake(m); }
  if (m.hp <= 0) return killMon(m, o);
  const d = mdef(m);
  if (d.split && !m.small && !m.didSplit && !o.dot && m.hp < m.mhp * .62) {
    m.didSplit = 1; const s = freeNear(m.x, m.y); if (s) { const half = Math.ceil(m.hp / 2); m.hp = half; const c = spawnMon(m.k, s[0], s[1], m.f, { hunt: 1, scale: .5, as: .8 }); c.hp = c.mhp = Math.max(2, half); m.small = .7; m.atk *= .85; say('The Magma Slime splits!', 'bad'); }
  }
  if (d.enrage && !m.rage && m.hp < m.mhp * .5) { m.rage = 1; m.atk *= 1.35; fx('text', { x: m.x, y: m.y, s: 'enraged!', c: '#ff6a5a' }); }
  if (m.boss && !m.rage2 && m.hp < m.mhp * .45) { m.rage2 = 1; say(`${mdef(m).n} is furious!`, 'bad'); fx('shake', { n: 8 }); }
}
function killMon(m, o = {}) {
  const d = mdef(m), p = G.p; m.hp = 0; G.mons.splice(G.mons.indexOf(m), 1); fx('die', { id: m.id, x: m.x, y: m.y, k: m.k, small: m.small });
  G.stats.kills++; G.stats.slept[m.k] = (G.stats.slept[m.k] || 0) + 1;
  say(`${d.n} ${d.boss ? 'is put to sleep at last!' : 'falls asleep.'}`, d.boss ? 'good' : '');
  let xp = K.xp(m.f) * d.xp * (m.small ? .5 : 1) * (m.minion ? .25 : 1) * (m.roam ? .5 : 1); gainXp(Math.round(xp));
  if (charm('moss')) heal(S.maxHp * .03, 1);
  const here = (it) => { const s = dropSpot(m.x, m.y); G.items.push({ ...it, x: s[0], y: s[1] }); };
  if (m.key) here({ k: 'key', q: 1 }); if (m.stole) here({ k: 'gold', q: m.stole });
  if (!m.minion && !m.small) {
    const sc = 1 + .35 * perk('scav');
    if (d.boss) { G.stats.boss++; G.stats.lastBoss = d.n; here({ k: 'gold', q: goldAmt(m.f) * 4 }); here(rollGear(m.f, { bump: 1, slot: 'weapon' })); here(rollGear(m.f, { bump: 1 })); here({ k: 'potion', t: 'heal', q: 1 }); if (!d.mini) { here({ k: 'tome', t: rollTome() }); here({ k: 'scroll', t: 'forge', q: 1 }); } snd('quest'); }
    else { if (chance(.32 * sc)) here({ k: 'gold', q: goldAmt(m.f) }); if (chance(.065 * sc)) here(rollItem(m.f)); }
  }
  if (d.boss && !d.mini) {
    G.bossDead = true; if (G.stairs) { G.t[ix(...G.stairs)] = T.STAIRS; }
    for (const q of G.mons.slice()) if (q.minion) { G.mons.splice(G.mons.indexOf(q), 1); fx('die', { id: q.id, x: q.x, y: q.y, k: q.k }); }
    say('The way down opens.', 'good'); fx('shake', { n: 10 });
    if (G.floor === WIN_FLOOR && !G.won) { G.won = true; G.pending.push({ t: 'win' }); }
  }
}
function heal(n, quiet) { const p = G.p; n = Math.max(1, Math.round(n)); const b = p.hp; p.hp = Math.min(S.maxHp, p.hp + n); if (p.hp > b) fx('text', { x: p.x, y: p.y, s: '+' + (p.hp - b), c: '#7ce07a' }); return p.hp - b; }
function hurtPlayer(dmg, by, o = {}) {
  const p = G.p; if (G.over) return;
  if (p.st.stone && !o.dot) dmg *= .5; if ((o.fire || o.cold) && S.sets[1] > 1) dmg *= .5;
  if (o.src && o.src.boss) dmg *= 1 - .1 * perk('guard');
  dmg = Math.max(1, Math.round(dmg));
  if (p.ward > 0) { const a = Math.min(p.ward, dmg); p.ward -= a; dmg -= a; if (dmg <= 0) { fx('text', { x: p.x, y: p.y, s: 'warded', c: '#cfd8e8' }); return; } }
  p.hp -= dmg; G.stats.taken = (G.stats.taken || 0) + dmg; G.stats.by[by] = (G.stats.by[by] || 0) + dmg;
  if (p.st.sleep && !o.dot) delete p.st.sleep;
  fx('phit', { n: dmg, c: o.c, big: dmg > S.maxHp * .2 });
  if (p.hp <= 0) {
    if (perk('breath') && !p.breath) { p.breath = 1; p.hp = Math.ceil(S.maxHp * .25); say('Not today! You keep your feet.', 'good'); fx('text', { x: p.x, y: p.y, s: 'Not today!', c: '#ffe27a' }); return; }
    p.hp = 0; G.over = { by, floor: G.floor, won: G.won }; say(`Put to sleep by ${by}.`, 'bad'); fx('over', {}); snd('nap');
  }
}
function gainXp(n) {
  const p = G.p; p.xp += n;
  while (p.xp >= K.need(p.lvl)) {
    p.xp -= K.need(p.lvl); p.lvl++; const b = S.maxHp; calc(); p.hp = Math.min(S.maxHp, p.hp + (S.maxHp - b) + Math.round(S.maxHp * .12)); p.mp = Math.min(S.maxMp, p.mp + 3);
    say(`Level ${p.lvl}!`, 'good'); fx('level', {}); snd('level_up'); G.pending.push({ t: 'level', opts: rollPerks() });
  }
}
function rollPerks() { const a = Object.keys(PERKS).filter(k => perk(k) < PERKS[k].max && !(k === 'trap' && G.floor > 16)); return shuffle(a).slice(0, 3); }
function takePerk(id) { G.p.perks[id] = perk(id) + 1; const b = S.maxHp; calc(); if (S.maxHp > b) G.p.hp += S.maxHp - b; if (id === 'scholar') G.p.mp = Math.min(S.maxMp, G.p.mp + 5); if (id === 'trap') for (const f of G.feats) if (f.t === 'trap') f.seen = 1; }

function freeNear(x, y, o = {}) { const c = []; for (const [dx, dy] of D8) { const X = x + dx, Y = y + dy; if (walkable(X, Y) && !monAt(X, Y) && !(G.p.x === X && G.p.y === Y) && tileAt(X, Y) !== T.LAVA && canStep(x, y, dx, dy)) c.push([X, Y]); } return c.length ? pick(c) : null; }
function dropSpot(x, y) {
  const bad = (X, Y) => !walkable(X, Y) || tileAt(X, Y) === T.LAVA || tileAt(X, Y) === T.STAIRS || tileAt(X, Y) === T.DOOR || G.items.some(i => i.x === X && i.y === Y) || (featAt(X, Y));
  if (inb(x, y) && !bad(x, y)) return [x, y];
  for (let r = 1; r < 5; r++) { const c = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inb(x + dx, y + dy) && !bad(x + dx, y + dy) && los(x, y, x + dx, y + dy)) c.push([x + dx, y + dy]); if (c.length) return pick(c); }
  return [G.p.x, G.p.y];
}

/* ================= player attacks ================= */
function playerMul(m) {
  const p = G.p; let k = 1; const adj = G.mons.filter(q => cheb(q.x, q.y, p.x, p.y) <= 1).length;
  if (perk('brawler') && adj > 1) k *= 1 + .14 * perk('brawler') * (adj - 1); if (perk('duel') && adj <= 1) k *= 1 + .16 * perk('duel');
  if (perk('first') && m.hp >= m.mhp) k *= 1 + .5 * perk('first'); if (perk('finish') && m.hp < m.mhp / 3) k *= 1 + .4 * perk('finish');
  if (perk('moment') && p.moved) k *= 1 + .25 * perk('moment'); if (perk('steady') && p.steady) k *= 1 + .4 * perk('steady');
  if (p.st.might) k *= 1.5; if (p.st.weak) k *= .7; if (charm('fury') && p.hp < S.maxHp / 2) k *= 1.3; if (m.boss) k *= 1 + .18 * perk('guard');
  return k;
}
function strike(m, mul = 1, o = {}) {
  const p = G.p, d = mdef(m), helpless = m.ai === 'sleep' || m.st.sleep || m.st.stun;
  const dodge = helpless ? 0 : (d.dodge || .05);
  if (!o.sure && chance(dodge)) { fx('text', { x: m.x, y: m.y, s: 'miss', c: '#bbb' }); snd('dodge'); wake(m); return 0; }
  let k = playerMul(m) * mul * (.9 + rnd() * .2); if (helpless) k *= 2; const crit = chance(S.crit); if (crit) k *= 1.7;
  const dmg = dmgF(S.atk, m.def * (1 - (S.w.pierce || 0))) * k;
  fx('lunge', { id: 'p', x: m.x, y: m.y }); snd('hit'); hurtMon(m, dmg, { crit });
  if (S.leech) { p.lacc = (p.lacc || 0) + Math.min(dmg, m.mhp) * S.leech; if (p.lacc >= 1) { heal(Math.floor(p.lacc), 1); p.lacc %= 1; } }
  if (m.hp > 0 && S.sets[3] && chance(.25)) addSt(m, 'burn', 3, S.atk * .22);
  return dmg;
}
function meleeAt(m) {
  strike(m);
  if (S.w.cleave) for (const q of G.mons.slice()) if (q !== m && cheb(q.x, q.y, G.p.x, G.p.y) <= 1) strike(q, S.w.cleave);
  G.p.moved = 0; G.p.steady = 0;
}
function wake(m) { if (m.ai === 'flee' && m.stole) return; if (m.ai !== 'hunt') { m.ai = 'hunt'; fx('text', { x: m.x, y: m.y, s: '!', c: '#ffd24a' }); } m.lx = G.p.x; m.ly = G.p.y; m.lost = 0; m.dorm = 0; }
function reachTarget(m) {
  const p = G.p, dist = cheb(m.x, m.y, p.x, p.y);
  if (dist === 1) return canStep(p.x, p.y, m.x - p.x, m.y - p.y, mdef(m).phase);
  if (dist === 2 && S.reach === 2) { const dx = m.x - p.x, dy = m.y - p.y; if ((dx === 0 || Math.abs(dx) === 2) && (dy === 0 || Math.abs(dy) === 2)) { const X = p.x + dx / 2, Y = p.y + dy / 2; return walkable(X, Y) && !monAt(X, Y) && canStep(p.x, p.y, dx / 2, dy / 2) && canStep(X, Y, dx / 2, dy / 2); } } return false;
}

/* ================= player actions: each returns true if it used a turn ================= */
const ACT = {
  wait() { G.p.steady = 1; G.p.moved = 0; return end(100); },
  attack(m) { if (!m || m.hp <= 0 || !reachTarget(m)) return false; G.p.dir = dirOf(m.x - G.p.x, m.y - G.p.y); meleeAt(m); return end(S.w.cost || 100); },
  move(dx, dy) {
    const p = G.p; p.dir = dirOf(dx, dy);
    if (p.st.confuse && chance(.4)) { [dx, dy] = pick(D8); }
    const x = p.x + dx, y = p.y + dy; if (!inb(x, y)) return false;
    const m = monAt(x, y);
    if (m) { if (!canStep(p.x, p.y, dx, dy, mdef(m).phase)) return false; meleeAt(m); return end(S.w.cost || 100); }
    if (!canStep(p.x, p.y, dx, dy)) return false;
    const f = blockFeat(x, y); if (f) return interact(f);
    const t = tileAt(x, y);
    if (t === T.LOCKED) { if (!G.key) { say('Locked. The key is somewhere on this floor.'); return false; } G.t[ix(x, y)] = T.DOOR; G.key = false; say('The vault creaks open.', 'good'); snd('craft'); return end(100); }
    if (t === T.WALL) return false;
    if (p.st.root) { say('You are rooted to the spot.', 'bad'); return end(100); }
    const ox = p.x, oy = p.y; p.x = x; p.y = y; p.moved = 1; p.steady = 0; if (G.luigi) { G.luigi.x = ox; G.luigi.y = oy; } fx('step', { id: 'p' });
    arrive(); return end(G.over ? 0 : t === T.MUD ? 160 : t === T.ICE ? 130 : 100);
  },
  equip(it) {
    const p = G.p, i = p.bag.indexOf(it); if (i < 0) return false; const old = p.eq[it.slot]; p.bag.splice(i, 1); if (old) p.bag.push(old); p.eq[it.slot] = it; const b = S.maxHp; calc(); say('You put on ' + itemName(it) + '.'); snd('craft'); return end(100);
  },
  unequip(slot) { const p = G.p; if (!p.eq[slot] || p.bag.length >= BAG_MAX) return false; p.bag.push(p.eq[slot]); delete p.eq[slot]; calc(); return end(100); },
  drop(it) { const p = G.p, i = p.bag.indexOf(it); if (i < 0) return false; p.bag.splice(i, 1); const s = dropSpot(p.x, p.y); G.items.push({ ...it, x: s[0], y: s[1], dropped: 1 }); return end(100); },
  use(it) { return useItem(it); },
  throwAt(it, x, y) {
    const p = G.p; let tx = x, ty = y; const ln = lineTiles(p.x, p.y, x, y); for (let i = 0; i < ln.length; i++) { const [a, b] = ln[i]; if (tileAt(a, b) === T.WALL || tileAt(a, b) === T.LOCKED) { const q = i ? ln[i - 1] : [p.x, p.y]; tx = q[0]; ty = q[1]; break; } if (monAt(a, b)) { tx = a; ty = b; break; } }
    takeOne(it); fx('proj', { x0: p.x, y0: p.y, x1: tx, y1: ty, ic: itemIcon(it) }); snd('swing');
    if (it.k === 'potion') { smash(it.t, tx, ty); } else { const m = monAt(tx, ty); if (m) { if (chance(.9)) { const s = m.ai === 'sleep' || m.st.sleep; hurtMon(m, dmgF(S.atk * .6 + G.floor * .4, m.def * .6) * (s ? 1.6 : 1) * (.9 + rnd() * .2)); } else fx('text', { x: tx, y: ty, s: 'miss', c: '#bbb' }); } if (chance(.6)) { const s = dropSpot(tx, ty); const ex = G.items.find(i => i.k === 'throw' && i.x === s[0] && i.y === s[1]); G.items.push({ k: 'throw', t: 'stone', q: 1, x: s[0], y: s[1], dropped: 0 }); } }
    return end(100);
  },
  cast(id, x, y) { return castSpell(id, x, y); },
  descend() { if (tileAt(G.p.x, G.p.y) !== T.STAIRS) return false; snd('quest'); nextFloor(); return true; },
};
function dirOf(dx, dy) { if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 3 : 1; return dy > 0 ? 2 : 0; }
function arrive() {
  const p = G.p;
  for (let i = G.items.length - 1; i >= 0; i--) { const it = G.items[i]; if (it.x === p.x && it.y === p.y && !it.dropped) { if (give(it)) G.items.splice(i, 1); else { it.dropped = 1; } } }
  const f = featAt(p.x, p.y);
  if (f && f.t === 'trap' && !f.used) springTrap(f);
  if (f && f.t === 'circle' && !f.used) { f.used = 1; G.ring = { wave: 0, x: f.x, y: f.y }; say('The circle wakes. Something answers.', 'bad'); ringWave(); }
  if (tileAt(p.x, p.y) === T.LAVA) { hurtPlayer(S.maxHp * .14, 'lava', { fire: 1, c: '#ff8a3c' }); if (!G.over) addSt(p, 'burn', 2, S.maxHp * .03); }
  if (tileAt(p.x, p.y) === T.STAIRS) fx('stairs', {});
}
function springTrap(f) {
  const p = G.p; f.used = 1; f.seen = 1; snd('mine'); fx('shake', { n: 4 });
  if (f.kind === 'spike') { say('Spikes!', 'bad'); hurtPlayer(S.maxHp * .13, 'a spike trap'); }
  else if (f.kind === 'gas') { say('Green gas hisses out.', 'bad'); addSt(p, 'poison', 6, S.maxHp * .025); }
  else if (f.kind === 'fire') { say('A gout of flame!', 'bad'); hurtPlayer(S.maxHp * .08, 'a fire trap', { fire: 1 }); addSt(p, 'burn', 3, S.maxHp * .03); }
  else if (f.kind === 'web') { say('Sticky web everywhere.', 'bad'); addSt(p, 'root', 3); }
  else { say('A bell rings through the halls!', 'bad'); for (const m of G.mons) if (!m.boss) { wake(m); } }
}
function ringWave() {
  const R = G.ring, z = zoneOf(G.floor); R.wave++;
  if (R.wave > 2) { G.ring = null; say('The circle falls quiet and leaves a gift.', 'good'); const s = dropSpot(R.x, R.y); G.items.push({ ...rollGear(G.floor, { bump: 1 }), x: s[0], y: s[1] }); const s2 = dropSpot(R.x, R.y); G.items.push({ k: 'scroll', t: 'forge', q: 1, x: s2[0], y: s2[1] }); snd('quest'); return; }
  const k = pick(z.pool), n = R.wave + 1; for (let i = 0; i < n; i++) { const s = dropSpotMon(R.x, R.y); if (s) { const m = spawnMon(k, s[0], s[1], G.floor, { hunt: 1 }); m.ring = 1; fx('puff', { x: s[0], y: s[1] }); } }
}
function dropSpotMon(x, y) { for (let r = 2; r < 5; r++) { const c = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (Math.max(Math.abs(dx), Math.abs(dy)) === r && inb(X, Y) && walkable(X, Y) && !monAt(X, Y) && !(G.p.x === X && G.p.y === Y) && tileAt(X, Y) !== T.LAVA && los(x, y, X, Y)) c.push([X, Y]); } if (c.length) return pick(c); } return freeNear(x, y); }

function interact(f) {
  const p = G.p;
  switch (f.t) {
    case 'chest': {
      if (f.used) return false; f.used = 1; G.feats.splice(G.feats.indexOf(f), 1); snd('craft'); fx('puff', { x: f.x, y: f.y }); const b = f.q ? 1 : charm('luck') ? .8 : .35;
      say(f.q ? 'The heavy chest opens.' : 'The chest opens.', 'good'); const put = it => { const s = dropSpot(f.x, f.y); G.items.push({ ...it, x: s[0], y: s[1] }); };
      put(rollItem(G.floor, b)); if (f.q) { put(rollGear(G.floor, { bump: 1 })); put(chance(.5) ? rollPotion() : rollScroll()); } put({ k: 'gold', q: goldAmt(G.floor) }); return end(100);
    }
    case 'barrel': { G.feats.splice(G.feats.indexOf(f), 1); snd('chop'); fx('puff', { x: f.x, y: f.y }); const r = rnd(); if (r < .28) G.items.push({ k: 'gold', q: goldAmt(G.floor), x: f.x, y: f.y }); else if (r < .40) G.items.push({ ...rollPotion(), x: f.x, y: f.y }); else if (r < .44) G.items.push({ k: 'food', t: 'pasty', q: 1, x: f.x, y: f.y }); else if (r < .55) { const m = spawnMon(G.floor < 9 ? 'rat' : 'spider', f.x, f.y, G.floor, { hunt: 1 }); say('Something was living in there!', 'bad'); } return end(100); }
    case 'shelf': { if (f.used) { say('Nothing else worth reading.'); return false; } f.used = 1; const r = rnd(); snd('tap'); if (r < .55) give(rollScroll()); else if (r < .68) give({ k: 'tome', t: rollTome() }); else if (r < .85) { say('A treatise on combat. You learn a little.'); gainXp(Math.round(K.need(p.lvl) * .18)); } else say('Dust, mostly.'); return end(100); }
    case 'bed': { if (f.used) { say('You are too awake to nap again.'); return false; } f.used = 1; p.hp = S.maxHp; p.mp = S.maxMp; p.st = {}; say('A proper nap. You wake mended.', 'good'); snd('nap'); fx('fade', {}); p.food = Math.max(60, p.food - 120); return end(100); }
    case 'pool': {
      if (f.used) { say('The pool is still now.'); return false; } f.used = 1; const r = rnd(); snd('nap');
      if (r < .45) { heal(S.maxHp * .5); p.st = {}; say('Cool and clear. You feel much better.', 'good'); } else if (r < .65) { p.mp = S.maxMp; p.mul.mp += 2; calc(); say('It tastes of starlight. +2 max mana.', 'good'); } else if (r < .82) { p.mul.hpFlat += 3 + (G.floor >> 1); calc(); p.hp += 3; say('You feel sturdier.', 'good'); } else { addSt(p, 'poison', 5, S.maxHp * .02); say('It was not, in fact, clean.', 'bad'); } return end(100);
    }
    case 'cage': { G.feats.splice(G.feats.indexOf(f), 1); p.luigi = 1; G.luigi = { x: f.x, y: f.y, cd: 0 }; say('Luigi the Fearless is free! He bites what you fight.', 'good'); snd('quest'); G.pending.push({ t: 'luigi' }); return end(100); }
    case 'ped': { G.pending.push({ t: 'ped', f }); return false; }
    case 'trader': G.pending.push({ t: 'shop', f }); return false;
    case 'forge': G.pending.push({ t: 'forge', f }); return false;
    case 'altar': if (f.used) { say('The altar has gone cold.'); return false; } G.pending.push({ t: 'altar', f }); return false;
  }
  return false;
}
/* the choices that come out of those */
const forgeCost = it => Math.round((20 + 16 * it.tier + 14 * it.plus) * (perk('haggle') ? .67 : 1));
function doPed(f) { const o = G.feats.filter(q => q.t === 'ped'); if (!give(f.it)) return false; for (const q of o) G.feats.splice(G.feats.indexOf(q), 1); say('The other pedestals crumble.'); snd('quest'); return end(100); }
function doBuy(f, i) { const it = f.stock[i], c = price(it); if (G.p.gold < c) return false; if (!give(it, 1)) { say('Your bag is full.', 'bad'); return false; } G.p.gold -= c; f.stock.splice(i, 1); snd('coin'); if (it.k === 'potion' || it.k === 'scroll') learn(it.k, it.t); return true; }
function doSell(it) { const i = G.p.bag.indexOf(it); if (i < 0) return; G.p.gold += price(it, 1); G.p.bag.splice(i, 1); snd('coin'); }
function doForge(f, it) { const c = forgeCost(it); if (G.p.gold < c || f.left <= 0) return false; G.p.gold -= c; f.left--; it.plus++; calc(); snd('craft'); say(itemName(it) + ' glows.', 'good'); return true; }
function doAltar(f, id) { f.used = 1; const b = BOONS.find(b => b.id === id); b.f(G.p, G); calc(); if (G.p.hp > S.maxHp) G.p.hp = S.maxHp; say(b.n + '.', 'good'); snd('quest'); return end(100); }
function doForgeScroll(it) { it.plus++; calc(); snd('craft'); say(itemName(it) + ' glows.', 'good'); return end(100); }

/* ================= consumables ================= */
function useItem(it) {
  const p = G.p, al = 1 + .35 * perk('alch');
  if (it.k === 'gear') return ACT.equip(it);
  if (it.k === 'food') { takeOne(it); p.food = Math.min(K.hungerMax, p.food + 800); heal(S.maxHp * (.08 + (perk('forager') ? .15 : 0))); say('A warm pasty. Marvellous.', 'good'); snd('tap'); return end(100); }
  if (it.k === 'tome') { takeOne(it); p.spells[it.t] = (p.spells[it.t] || 0) + 1; say(p.spells[it.t] > 1 ? `${SPELLS[it.t].n} grows stronger.` : `You learn ${SPELLS[it.t].n}.`, 'good'); snd('level_up'); return end(100); }
  if (it.k === 'feather') { takeOne(it); if (isBossFloor(G.floor) && !G.bossDead) { say('The feather lifts you clear of the fight.', 'good'); const s = G.rooms.find(r => r.kind === 'start'); const c = G.spot(s); if (c) { p.x = c[0]; p.y = c[1]; } heal(S.maxHp * .5); computeFov(); return end(100); } heal(S.maxHp * .5); nextFloor(); return true; }
  if (it.k === 'potion') {
    const nu = learn('potion', it.t); takeOne(it); snd('tap'); if (nu) say(`It was a ${POTIONS[it.t].n}!`, 'good');
    switch (it.t) {
      case 'heal': heal(S.maxHp * .45 * al); break; case 'mana': p.mp = Math.min(S.maxMp, p.mp + Math.ceil(S.maxMp * .6 * al)); break; case 'antidote': for (const s in p.st) if (STATUS[s].bad) delete p.st[s]; break;
      case 'might': addSt(p, 'might', Math.round(20 * al)); break; case 'haste': addSt(p, 'haste', Math.round(12 * al)); break; case 'stone': addSt(p, 'stone', Math.round(18 * al)); break;
      case 'vanish': addSt(p, 'hidden', Math.round(14 * al)); for (const m of G.mons) if (!m.boss) { m.ai = m.ai === 'sleep' ? 'sleep' : 'wander'; m.intent = null; } break;
      case 'sight': for (const m of G.mons) m.reveal = 1; for (const i of G.items) G.seen[ix(i.x, i.y)] = 1; for (const f of G.feats) f.seen = 1; G.sight = 1; break;
      case 'fire': smash('fire', p.x, p.y, 1); break; case 'doze': say('You come over all sleepy...', 'bad'); p.st.sleep = 4; fx('text', { x: p.x, y: p.y, s: 'zzz', c: '#a9b8ff' }); break;
      case 'vigor': p.mul.hp *= 1.08; calc(); p.hp = Math.min(S.maxHp, p.hp + Math.round(S.maxHp * .08)); say('You feel permanently sturdier.', 'good'); break;
    } return end(100);
  }
  if (it.k === 'scroll') {
    const nu = learn('scroll', it.t);
    if (it.t === 'forge') { G.pending.push({ t: 'forgeScroll', it }); return false; }
    takeOne(it); snd('quest'); if (nu) say(`It was a ${SCROLLS[it.t].n}!`, 'good');
    const seen = G.mons.filter(m => visible(m.x, m.y));
    switch (it.t) {
      case 'blink': { let best = null; for (let k = 0; k < 80; k++) { const x = ri(1, G.w - 2), y = ri(1, G.h - 2); if (!walkable(x, y) || monAt(x, y) || !G.seen[ix(x, y)] || tileAt(x, y) === T.LAVA || tileAt(x, y) === T.STAIRS) continue; const d = cheb(x, y, p.x, p.y); if (d < 5) continue; let md = 99; for (const m of seen) md = Math.min(md, cheb(x, y, m.x, m.y)); if (!best || md > best[2]) best = [x, y, md]; } if (best) { fx('puff', { x: p.x, y: p.y }); p.x = best[0]; p.y = best[1]; fx('puff', { x: p.x, y: p.y }); arrive(); } break; }
      case 'map': for (let i = 0; i < G.t.length; i++) { const x = i % G.w, y = (i / G.w) | 0; if (G.t[i] !== T.WALL) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inb(x + dx, y + dy)) G.seen[ix(x + dx, y + dy)] = 1; } for (const f of G.feats) if (f.t === 'trap') f.seen = 1; break;
      case 'lull': for (const m of seen) addSt(m, 'sleep', 9); break;
      case 'storm': for (const m of seen) { fx('bolt', { x: m.x, y: m.y }); hurtMon(m, dmgF(8 + G.floor * 2.6 + S.atk * .6, m.def * .4) * (.9 + rnd() * .2) * 1.3, { c: '#ffe27a' }); } break;
      case 'ward': p.ward = Math.max(p.ward, Math.round(S.maxHp * .35)); break; case 'howl': say('A dreadful howl! Everything heard that.', 'bad'); for (const m of G.mons) wake(m); break; case 'feast': give({ k: 'food', t: 'pasty', q: 2 }); break;
    } return end(100);
  }
  return false;
}
function smash(t, x, y, self) {
  const p = G.p; fx('burst', { x, y, r: 1, c: t === 'fire' ? '#ff8a3c' : t === 'doze' ? '#a9b8ff' : '#9fd' }); snd('mine');
  const nu = learn('potion', t); if (nu) say(`It was a ${POTIONS[t].n}!`);
  const al = 1 + .35 * perk('alch'); const hit = G.mons.filter(m => cheb(m.x, m.y, x, y) <= 1);
  for (const m of hit) { if (t === 'fire') { if (mdef(m).fire) { fx('text', { x: m.x, y: m.y, s: 'immune', c: '#ff8a3c' }); wake(m); continue; } hurtMon(m, (10 + G.floor * 4.4) * al, { c: '#ff8a3c' }); if (m.hp > 0) addSt(m, 'burn', 4, (2 + G.floor * .7) * al); } else if (t === 'doze') addSt(m, 'sleep', Math.round(8 * al)); else if (t === 'heal') { m.hp = Math.min(m.mhp, m.hp + m.mhp * .5); wake(m); } else wake(m); }
  if (cheb(p.x, p.y, x, y) <= 1) { if (t === 'fire') { hurtPlayer(S.maxHp * .14, 'liquid fire', { fire: 1, c: '#ff8a3c' }); if (!G.over) addSt(p, 'burn', 3, S.maxHp * .03); } else if (t === 'doze' && !self) { p.st.sleep = 3; } }
}

/* ================= spells ================= */
function spellCost(id) { return SPELLS[id].mp; }
function canCast(id) { const p = G.p; return p.spells[id] && p.mp >= spellCost(id) && !p.st.silence; }
function spellRange(id) { return SPELLS[id].range + (id === 'blink' ? G.p.spells.blink - 1 : 0); }
function castSpell(id, x, y) {
  const p = G.p, L = p.spells[id]; if (!L) return false; if (p.st.silence) { say('You cannot speak the words.', 'bad'); return false; } if (p.mp < spellCost(id)) { say('Not enough mana.', 'bad'); return false; }
  const sp = SPELLS[id], pow = (S.atk * .55 + 5 + G.p.lvl * 1.35) * S.spell;
  if (sp.tgt) { if (!inb(x, y) || cheb(x, y, p.x, p.y) > spellRange(id) || !visible(x, y)) { say('Out of reach.'); return false; } if (id === 'blink' && (!walkable(x, y) || monAt(x, y))) { say('Something is in the way.'); return false; } if ((id === 'sleep' || id === 'storm' || id === 'sling') && !monAt(x, y)) { say('Nobody there.'); return false; } }
  p.mp -= spellCost(id); p.moved = 0; p.steady = 0; p.dir = sp.tgt ? dirOf(x - p.x, y - p.y) : p.dir;
  const hit = (m, k, c, o) => hurtMon(m, dmgF(pow * k, m.def * .55) * (.9 + rnd() * .2), { c, ...o });
  switch (id) {
    case 'fire': fx('proj', { x0: p.x, y0: p.y, x1: x, y1: y, ic: 'fireball' }); fx('burst', { x, y, r: 1, c: '#ff8a3c' }); snd('mine'); for (const m of G.mons.slice()) if (cheb(m.x, m.y, x, y) <= 1) { if (mdef(m).fire) hit(m, (1.5 + .3 * L) * .4, '#ff8a3c'); else { hit(m, 1.5 + .3 * L, '#ff8a3c'); if (m.hp > 0) addSt(m, 'burn', 3, pow * .14); } } break;
    case 'heal': heal(S.maxHp * (.22 + .06 * L) * S.spell); for (const s in p.st) if (STATUS[s].bad) delete p.st[s]; snd('nap'); break;
    case 'frost': fx('burst', { x: p.x, y: p.y, r: 2, c: '#8fd3ff' }); snd('mine'); for (const m of G.mons.slice()) if (cheb(m.x, m.y, p.x, p.y) <= 2 && visible(m.x, m.y)) { hit(m, .7 + .2 * L, '#8fd3ff'); if (m.hp > 0) addSt(m, 'chill', 4 + L); } break;
    case 'blink': fx('puff', { x: p.x, y: p.y }); p.x = x; p.y = y; fx('puff', { x, y }); snd('dodge'); arrive(); break;
    case 'sleep': { const m = monAt(x, y); fx('proj', { x0: p.x, y0: p.y, x1: x, y1: y, ic: 'zzz' }); wake(m); addSt(m, 'sleep', 6 + 2 * L); break; }
    case 'storm': { let m = monAt(x, y), done = []; for (let k = 0; k <= 1 + L && m; k++) { done.push(m); fx('bolt', { x: m.x, y: m.y }); hit(m, (.95 + .2 * L) * Math.pow(.85, k), '#ffe27a'); const c = G.mons.filter(q => !done.includes(q) && q.hp > 0 && cheb(q.x, q.y, m.x, m.y) <= 3 && visible(q.x, q.y)); m = c[0]; } snd('mine'); break; }
    case 'ward': p.ward = Math.max(p.ward, Math.round(S.maxHp * (.14 + .06 * L) * S.spell)); fx('burst', { x: p.x, y: p.y, r: 1, c: '#cfd8e8' }); break;
    case 'root': fx('burst', { x, y, r: 1, c: '#86a040' }); for (const m of G.mons.slice()) if (cheb(m.x, m.y, x, y) <= 1) { hit(m, .4 + .15 * L, '#9ac060'); if (m.hp > 0) addSt(m, 'root', 3 + L); } break;
    case 'sling': { const m = monAt(x, y); fx('proj', { x0: p.x, y0: p.y, x1: x, y1: y, ic: 'stone' }); snd('swing'); hit(m, (.8 + .15 * L) * (m.ai === 'sleep' ? 1.5 : 1), '#eee'); break; }
  }
  return end(100);
}

/* ================= turn ================= */
function end(cost) {
  const p = G.p; if (G.over) return true;
  if (p.st.haste) cost *= .5; if (p.st.chill) cost *= 1.25;
  computeFov(); let left = cost;
  advance(cost);
  /* asleep or stunned: the world goes on without you */
  let guard = 0; while (!G.over && (p.st.sleep || p.st.stun) && guard++ < 12) { advance(100); computeFov(); }
  if (!G.over) { computeFov(); noteSeen(); }
  return true;
}
function advance(cost) {
  const p = G.p; G.turn += cost / 100; G.floorTurn += cost / 100; G.tacc = (G.tacc || 0) + cost;
  buildWalk(); G.dm = flood(p.x, p.y, { bf: 1, max: 40 });
  if (G.luigi && --G.luigi.cd <= 0) { const t = G.mons.find(m => visible(m.x, m.y) && m.ai === 'hunt' && (cheb(m.x, m.y, G.luigi.x, G.luigi.y) <= 1 || cheb(m.x, m.y, p.x, p.y) <= 1)); if (t) { G.luigi.cd = 3; fx('lunge', { id: 'luigi', x: t.x, y: t.y }); hurtMon(t, dmgF(S.atk * .62, t.def * .5), { c: '#ffc27a' }); } }
  for (const m of G.mons.slice()) {
    if (m.hp <= 0 || G.over) continue; let sp = mdef(m).spd || 100; if (m.st.chill) sp *= .6; if (m.st.haste) sp *= 1.5; m.en += sp * cost / 100; let n = 0;
    while (m.en >= 100 && m.hp > 0 && !G.over && n++ < 3) { m.en -= 100; monTurn(m); }
  }
  while (G.tacc >= 100) {
    G.tacc -= 100; if (G.over) return; tickSt(p); if (G.over) return;
    for (const m of G.mons.slice()) if (m.hp > 0) { tickSt(m); if (m.cd > 0) m.cd--; if (m.mcd > 0) m.mcd--; }
    p.food -= 1 / (1 + .35 * perk('forager')); if (p.food <= 0) { p.food = 0; p.starv = (p.starv || 0) + 1; if (p.starv % 12 === 0) hurtPlayer(Math.max(1, S.maxHp * .03), 'hunger', { dot: 1, c: '#c28a6a' }); if (p.starv === 1) say('You are starving. Find a pasty!', 'bad'); } else { if (p.food < 200 && p.food > 198.6) say('You are getting hungry.', 'bad'); p.starv = 0; p.hacc += S.maxHp / K.regen * S.regen; if (p.hacc >= 1) { const n = Math.floor(p.hacc); p.hacc -= n; if (p.hp < S.maxHp) p.hp = Math.min(S.maxHp, p.hp + n); } }
    p.macc += S.maxMp / K.mpRegen * (1 + .6 * perk('medit')) * (charm('echo') ? 2 : 1); if (p.macc >= 1) { const n = Math.floor(p.macc); p.macc -= n; p.mp = Math.min(S.maxMp, p.mp + n); }
    if (perk('trap')) for (const f of G.feats) if (f.t === 'trap' && visible(f.x, f.y)) f.seen = 1;
    for (const f of G.feats) if (f.t === 'trap' && !f.seen && cheb(f.x, f.y, p.x, p.y) <= 2 && chance(.16)) { f.seen = 1; say('You spot a trap.'); fx('text', { x: f.x, y: f.y, s: 'trap!', c: '#ffd24a' }); }
    if (G.ring && !G.mons.some(m => m.ring)) ringWave();
    if (!isBossFloor(G.floor) || G.bossDead) { if (G.floorTurn > 120 && chance(1 / (G.floorTurn > 700 ? K.wander * .45 : K.wander)) && G.mons.length < 18) roamer(); }
  }
}
function roamer() { for (let k = 0; k < 40; k++) { const x = ri(1, G.w - 2), y = ri(1, G.h - 2); if (walkable(x, y) && !monAt(x, y) && !visible(x, y) && cheb(x, y, G.p.x, G.p.y) > 10 && tileAt(x, y) === T.FLOOR && G.dm[ix(x, y)] >= 0) { const m = spawnMon(pick(zoneOf(G.floor).pool), x, y, G.floor, { wander: 1 }); m.roam = 1; return; } } }

/* ================= monsters ================= */
function mdist(m) { return cheb(m.x, m.y, G.p.x, G.p.y); }
function seesPlayer(m) { const d = mdist(m); if (G.p.st.hidden && d > 1) return false; if (d > 9) return false; if (tileAt(m.x, m.y) === T.WALL) return d <= 6; return visible(m.x, m.y) || (d <= 9 && los(m.x, m.y, G.p.x, G.p.y)); }
function monHit(m, mul = 1, o = {}) {
  const p = G.p, d = mdef(m); if (G.over) return;
  if (!o.sure && chance(S.dodge)) { fx('text', { x: p.x, y: p.y, s: 'dodge', c: '#cfe' }); snd('dodge'); if (!o.ranged && perk('riposte') && m.hp > 0 && chance(.35 * perk('riposte'))) strike(m, .8); return false; }
  let a = m.atk * mul * (.88 + rnd() * .24) * (m.st.weak ? .7 : 1); const dmg = dmgF(a, S.def); snd(o.ranged ? 'swing' : 'hit');
  hurtPlayer(dmg, d.n, { src: m, fire: o.fire, cold: o.cold }); if (G.over) return true;
  if (!o.ranged) {
    if (d.on && chance(d.on[1])) addSt(p, d.on[0], d.on[2], d.on[0] === 'poison' ? m.atk * .16 : d.on[0] === 'burn' ? m.atk * .2 : 0);
    if (d.drain) { m.hp = Math.min(m.mhp, m.hp + dmg * d.drain); }
    if (d.thief && !m.stole && p.gold > 4) { m.stole = Math.min(p.gold, Math.ceil(p.gold * .3)); p.gold -= m.stole; m.ai = 'flee'; say(`The Bandit grabs ${m.stole} gold and runs!`, 'bad'); snd('coin'); }
    const r = dmg * S.reflect + S.thorn; if (r >= 1) hurtMon(m, r, { c: '#c8d87a' }); if (m.hp > 0 && S.sets[1] && chance(.3)) addSt(m, 'chill', 3);
  }
  return true;
}
const canGo = (m, x, y) => { if (!inb(x, y) || monAt(x, y) || (G.p.x === x && G.p.y === y)) return false; const d = mdef(m); if (d.phase) return x > 0 && y > 0 && x < G.w - 1 && y < G.h - 1; if (!walkable(x, y)) return false; if (tileAt(x, y) === T.LAVA && !d.fire && !d.fly) return false; return true; };
function goTo(m, x, y) { m.x = x; m.y = y; if (tileAt(x, y) === T.MUD && !mdef(m).fly && mdef(m).art !== 'gloomfen_boss') m.en -= 40; }
function stepToward(m, tx, ty) {
  if (m.st.root) return false; const d = mdef(m); let best = null, bs = 1e9; const cur = Math.max(Math.abs(m.x - tx), Math.abs(m.y - ty));
  const chase = tx === G.p.x && ty === G.p.y && !d.phase;
  for (const [dx, dy] of D8) { const x = m.x + dx, y = m.y + dy; if (!canGo(m, x, y) || !canStep(m.x, m.y, dx, dy, d.phase)) continue; let s; if (chase) { s = G.dm[ix(x, y)]; if (s < 0) s = 900 + cheb(x, y, tx, ty); } else s = cheb(x, y, tx, ty); s += (dx && dy ? .1 : 0) + rnd() * .05; if (s < bs) { bs = s; best = [x, y]; } }
  if (!best) return false; if (chase && bs > G.dm[ix(m.x, m.y)] + 1.2 && G.dm[ix(m.x, m.y)] >= 0) return false; goTo(m, best[0], best[1]); return true;
}
function stepAway(m) { if (m.st.root) return false; let best = null, bs = -1e9; for (const [dx, dy] of D8) { const x = m.x + dx, y = m.y + dy; if (!canGo(m, x, y) || !canStep(m.x, m.y, dx, dy, mdef(m).phase)) continue; const s = Math.max(0, G.dm[ix(x, y)]) + rnd() * .3; if (s > bs) { bs = s; best = [x, y]; } } if (!best || bs <= Math.max(0, G.dm[ix(m.x, m.y)])) return false; goTo(m, best[0], best[1]); return true; }
function wanderStep(m) { if (m.st.root) return; if (!m.wt || (m.x === m.wt[0] && m.y === m.wt[1]) || chance(.03)) { const R = pick(G.rooms.filter(r => r.kind !== 'vault')); m.wt = [R.x + (R.w >> 1), R.y + (R.h >> 1)]; m.wd = null; } if (!m.wpath || chance(.1)) { const d = flood(m.wt[0], m.wt[1], { bf: 1, max: 60 }); let best = null, bv = 1e9; for (const [dx, dy] of D8) { const x = m.x + dx, y = m.y + dy; if (!canGo(m, x, y) || !canStep(m.x, m.y, dx, dy)) continue; const v = d[ix(x, y)]; if (v >= 0 && v < bv) { bv = v; best = [x, y]; } } if (best) goTo(m, best[0], best[1]); else m.wt = null; } }

function monTurn(m) {
  const d = mdef(m), p = G.p;
  if (m.st.sleep || m.st.stun) return;
  if (m.intent) { resolveIntent(m); return; }
  if (d.dormant && m.ai === 'sleep') { if (mdist(m) <= 1 && !p.st.hidden) { wake(m); say('The statue moves!', 'bad'); } return; }
  if (m.ai === 'sleep') { const di = mdist(m); let pr = di <= 2 ? .16 : di <= 6 ? .055 : .012; if (charm('veil')) pr *= .35; if (p.st.hidden) pr = 0; if (m.boss) pr = di <= 7 && visible(m.x, m.y) ? .6 : 0; if (pr && seesPlayer(m) && chance(pr)) { wake(m); if (m.boss) { say(`${d.n} wakes!`, 'bad'); fx('boss', { k: m.k }); } else if (d.pack) for (const q of G.mons) if (q.k === m.k && cheb(q.x, q.y, m.x, m.y) <= 4) wake(q); } return; }
  const sees = seesPlayer(m);
  if (m.ai === 'wander') { if (sees && chance(.75)) { wake(m); return; } wanderStep(m); return; }
  if (m.ai === 'flee') { if (mdist(m) > 12 && !visible(m.x, m.y)) { m.ai = 'wander'; } if (!stepAway(m) && mdist(m) === 1) monHit(m); return; }
  /* hunting */
  if (sees) { m.lx = p.x; m.ly = p.y; m.lost = 0; } else { m.lost++; if (m.lost > 14 && !m.boss) { m.ai = 'wander'; return; } if (m.lost < 6) { m.lx = p.x; m.ly = p.y; } }
  if (m.st.confuse && chance(.5)) { const s = freeNear(m.x, m.y); if (s && !m.st.root) goTo(m, s[0], s[1]); return; }
  if (d.erratic && chance(d.erratic)) { const s = freeNear(m.x, m.y); if (s && !m.st.root) goTo(m, s[0], s[1]); return; }
  const di = mdist(m), adj = di === 1 && canStep(m.x, m.y, p.x - m.x, p.y - m.y, d.phase) && !(p.st.hidden && chance(.5));
  if (d.moves && m.mcd <= 0 && sees && startMove(m, di)) return;
  if (d.caller && m.mcd <= 0 && sees && !m.called) { m.called = 1; m.mcd = d.caller; say('The Swamp Hag calls for company!', 'bad'); for (let k = 0; k < 2; k++) { const s = freeNear(m.x, m.y); if (s) { const q = spawnMon('insect', s[0], s[1], G.floor, { hunt: 1, minion: 1 }); q.hp = q.mhp = Math.ceil(q.mhp * .6); fx('puff', { x: s[0], y: s[1] }); } } return; }
  if (d.shot && m.cd <= 0 && sees && di <= d.shot.range && di > 1 && los(m.x, m.y, p.x, p.y) && visible(m.x, m.y)) {
    m.cd = d.shot.cd; fx('shot', { x0: m.x, y0: m.y, x1: p.x, y1: p.y, kind: d.shot.kind }); const hit = d.shot.mul ? monHit(m, d.shot.mul, { ranged: 1, cold: d.shot.kind === 'frost' }) : !chance(S.dodge); if (hit && !G.over && d.shot.st) addSt(p, d.shot.st[0], d.shot.st[1]); return;
  }
  if (d.blink && m.cd <= 0 && di > 1 && di < 8 && sees) { const s = freeNear(p.x, p.y); if (s) { m.cd = d.blink; fx('puff', { x: m.x, y: m.y }); m.x = s[0]; m.y = s[1]; fx('puff', { x: m.x, y: m.y }); return; } }
  if (d.keep && sees && di < d.keep && chance(.45) && stepAway(m)) return;
  if (adj) { fx('lunge', { id: m.id, x: p.x, y: p.y }); monHit(m); return; }
  const tx = m.lx >= 0 ? m.lx : p.x, ty = m.ly >= 0 ? m.ly : p.y;
  if (d.keep && sees && di <= d.keep && m.cd <= 2) return;
  if (m.lx === m.x && m.ly === m.y) { m.lx = p.x; m.ly = p.y; if (m.lost > 8) { m.ai = m.boss ? 'hunt' : 'wander'; } }
  stepToward(m, tx, ty);
}
/* ---- telegraphed attacks: mark tiles now, land them on the monster's next action ---- */
function startMove(m, di) {
  const d = mdef(m), p = G.p, mv = d.moves[m.mi % d.moves.length], [t, r, mul, st] = mv; let tiles = [];
  const add = (x, y) => { if (inb(x, y) && tileAt(x, y) !== T.WALL) tiles.push(ix(x, y)); };
  const cool = () => { m.mi++; m.mcd = (m.rage2 ? Math.max(1, d.mcd - 1) : d.mcd) + 1; };
  if (t === 'summon') { cool(); if (G.mons.filter(q => q.minion).length >= 4) return false; for (let k = 0; k < mul; k++) { const s = dropSpotMon(m.x, m.y); if (s) { const q = spawnMon(r, s[0], s[1], G.floor, { hunt: 1, minion: 1 }); q.hp = q.mhp = Math.ceil(q.mhp * .6); fx('puff', { x: s[0], y: s[1] }); } } say(`${d.n} calls for help!`, 'bad'); return true; }
  if (t === 'warp') { cool(); const s = freeNear(p.x, p.y); if (!s) return false; fx('puff', { x: m.x, y: m.y }); m.x = s[0]; m.y = s[1]; fx('puff', { x: m.x, y: m.y }); for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) add(m.x + x, m.y + y); }
  else if (t === 'slam') { if (di > r) return false; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) add(m.x + x, m.y + y); cool(); }
  else if (t === 'nova') { if (di > r + 1) { m.mi++; return false; } for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 1) add(m.x + x, m.y + y); cool(); }
  else if (t === 'line' || t === 'charge' || t === 'pull') {
    if (di > r || (t !== 'line' && di < 2)) { if (t !== 'line') m.mi++; return false; } const ex = m.x + (p.x - m.x) * 8, ey = m.y + (p.y - m.y) * 8; let n = 0;
    for (const [x, y] of lineTiles(m.x, m.y, ex, ey)) { if (!inb(x, y) || tileAt(x, y) === T.WALL || tileAt(x, y) === T.LOCKED || n++ >= r) break; add(x, y); } cool();
  } else if (t === 'cone') { if (di > r) return false; const L = Math.hypot(p.x - m.x, p.y - m.y) || 1, ux = (p.x - m.x) / L, uy = (p.y - m.y) / L; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const q = Math.hypot(x, y); if (!q || q > r) continue; if ((x * ux + y * uy) / q > .86 && inb(m.x + x, m.y + y) && los(m.x, m.y, m.x + x, m.y + y)) add(m.x + x, m.y + y); } cool(); }
  else if (t === 'rain') { add(p.x, p.y); for (let k = 0; k < r; k++) add(p.x + ri(-2, 2), p.y + ri(-2, 2)); cool(); }
  if (!tiles.length) return false;
  m.intent = { t, tiles, mul, st }; fx('text', { x: m.x, y: m.y, s: '!!', c: '#ff5a4a' }); return true;
}
function resolveIntent(m) {
  const it = m.intent, p = G.p, d = mdef(m); m.intent = null; const hit = it.tiles.includes(ix(p.x, p.y));
  const c = it.st === 'burn' ? '#ff7a2c' : it.st === 'chill' ? '#8fd3ff' : it.st === 'poison' ? '#7ccf4a' : it.st === 'root' ? '#86a040' : '#e8d8b0';
  fx('area', { tiles: it.tiles, c }); snd('mine'); if (m.boss) fx('shake', { n: 5 });
  if (it.t === 'charge') { let last = null; for (const i of it.tiles) { const x = i % G.w, y = (i / G.w) | 0; if ((x === p.x && y === p.y) || monAt(x, y) || !walkable(x, y)) break; last = [x, y]; } if (last) goTo(m, last[0], last[1]); }
  if (it.t === 'pull' && hit) { const s = freeNear(m.x, m.y); if (s) { p.x = s[0]; p.y = s[1]; fx('step', { id: 'p' }); say('Yanked right in!', 'bad'); arrive(); } }
  if (hit && !G.over) { monHit(m, it.mul, { sure: 1, ranged: 1, fire: it.st === 'burn', cold: it.st === 'chill' }); if (it.st && !G.over) addSt(p, it.st, it.st === 'root' ? 2 : 3, it.st === 'burn' ? m.atk * .16 : it.st === 'poison' ? m.atk * .13 : 0); }
}
const dangerAt = (x, y) => { const i = ix(x, y); for (const m of G.mons) if (m.intent && m.intent.tiles.includes(i)) return m; return null; };
const hostilesInView = () => G.mons.filter(m => visible(m.x, m.y) && !(mdef(m).dormant && m.ai === 'sleep'));
const awakeInView = () => G.mons.filter(m => visible(m.x, m.y) && m.ai !== 'sleep' && !m.st.sleep);

/* ================= auto-explore target ================= */
function exploreTarget(o = {}) {
  buildWalk(); const p = G.p; let d = flood(p.x, p.y, { bf: 1, known: 1, avoid: 1 }); let best = null, bd = 1e9;
  for (const it of G.items) { if (it.dropped || !G.seen[ix(it.x, it.y)]) continue; if (p.bag.length >= BAG_MAX && it.k !== 'gold' && it.k !== 'key' && !p.bag.some(b => b.k !== 'gear' && stackKey(b) === stackKey(it))) continue; const v = d[ix(it.x, it.y)]; if (v > 0 && v < bd) { bd = v; best = [it.x, it.y]; } }
  for (const f of G.feats) { if (!(f.t === 'chest' || f.t === 'barrel' || (f.t === 'shelf' && !f.used) || f.t === 'cage') || !G.seen[ix(f.x, f.y)]) continue; for (const [dx, dy] of D8) { const x = f.x + dx, y = f.y + dy; if (!inb(x, y) || !canStep(x, y, -dx, -dy)) continue; const v = d[ix(x, y)]; if (v >= 0 && v + 1 < bd) { bd = v + 1; best = [f.x, f.y]; } } }
  if (best && bd <= 10) return best;
  let fb = null, fd = 1e9;
  for (let y = 1; y < G.h - 1; y++) for (let x = 1; x < G.w - 1; x++) { const i = ix(x, y), v = d[i]; if (v <= 0 || v >= fd) continue; for (const [dx, dy] of D8) if (!G.seen[ix(x + dx, y + dy)]) { fd = v; fb = [x, y]; break; } }
  if (best && bd <= fd + 8) return best; if (fb) return fb; if (best) return best;
  if (G.key) for (let i = 0; i < G.t.length; i++) if (G.t[i] === T.LOCKED && G.seen[i]) { const x = i % G.w, y = (i / G.w) | 0; for (const [dx, dy] of D8) if (inb(x + dx, y + dy) && d[ix(x + dx, y + dy)] >= 0) return [x, y]; }
  return null;
}

/* ================= save ================= */
function serialise() { const { give: _g, spot: _s, bw, dm, vis, trapSeen, ...o } = G; return JSON.stringify({ ...o, t: Array.from(G.t).join(''), seen: Array.from(G.seen).join(''), deco: Array.from(G.deco).map(v => v.toString(16)).join(''), uid }); }
function deserialise(s) { const o = JSON.parse(s); uid = o.uid || 1; o.t = Uint8Array.from(o.t, Number); o.seen = Uint8Array.from(o.seen, Number); o.deco = Uint8Array.from(o.deco, c => parseInt(c, 16)); o.vis = new Uint8Array(o.t.length); G = o; G.give = give; G.bw = null; G.spot = R => { for (let k = 0; k < 60; k++) { const x = ri(R.x, R.x + R.w - 1), y = ri(R.y, R.y + R.h - 1); if (G.t[ix(x, y)] === T.FLOOR && !featAt(x, y) && !monAt(x, y)) return [x, y]; } return null; }; calc(); buildWalk(); G.dm = flood(G.p.x, G.p.y, { bf: 1, max: 40 }); computeFov(); }
