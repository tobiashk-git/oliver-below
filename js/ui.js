/* HUD, sheets, dialogs, title and end screens. */
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* an atlas picture as an element, scaled by percentage so it fits any box */
function ic(at, n, cls = '') { const a = ATLAS[at], m = a.map[n] || [0, 0], px = a.cols > 1 ? m[0] / (a.cols - 1) * 100 : 0, py = a.rows > 1 ? m[1] / (a.rows - 1) * 100 : 0; return `<span class="ic ${at === 'icon' ? '' : 'smooth'} ${cls}" style="background-image:url(assets/${at}.webp);background-size:${a.cols * 100}% ${a.rows * 100}%;background-position:${px}% ${py}%"></span>`; }
const mmss = t => { t = Math.round(t); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`; };

/* ---- lasting record ---- */
const Meta = (() => {
  const d = { runs: [], best: 0, wins: 0, time: 0, kills: 0, slept: {}, tips: {}, unlocked: {}, daily: {} };
  try { Object.assign(d, JSON.parse(localStorage.getItem('od_meta') || '{}')); } catch (e) { }
  return { d, save() { try { localStorage.setItem('od_meta', JSON.stringify(d)); } catch (e) { } } };
})();
const Save = {
  put() { if (!G || G.over || UI.screen !== 'game') return; try { localStorage.setItem('od_run', serialise()); } catch (e) { } },
  has() { try { return !!localStorage.getItem('od_run'); } catch (e) { return false; } },
  load() { try { const s = localStorage.getItem('od_run'); if (!s) return false; deserialise(s); return true; } catch (e) { console.error(e); return false; } },
  clear() { try { localStorage.removeItem('od_run'); } catch (e) { } },
  peek() { try { const o = JSON.parse(localStorage.getItem('od_run')); return o; } catch (e) { return null; } },
};

const UI = (() => {
  const U = { screen: 'title', tab: 'bag', sel: null, tipQ: [], toastT: 0 };
  let lastBar = '', lastLog = -1, lastChips = '';

  /* ---------------- HUD ---------------- */
  U.hud = () => {
    if (!G) return; const p = G.p, z = zoneOf(G.floor);
    $('hudZone').textContent = z.name; $('hudFloor').textContent = `Floor ${G.floor}  ·  Lv ${p.lvl}`;
    if (!$('hudPort').innerHTML) { const a = ATLAS.port, m = a.map.oliver; $('hudPort').innerHTML = ' '; $('hudPort').style.cssText = `background-image:url(assets/port.webp);background-size:${a.cols * 100}% ${a.rows * 100}%;background-position:${m[0] / (a.cols - 1) * 100}% ${m[1] / Math.max(1, a.rows - 1) * 100}%`; }
    $('hpFill').style.width = Math.max(0, p.hp / S.maxHp * 100) + '%'; $('wardFill').style.width = Math.min(100, p.ward / S.maxHp * 100) + '%'; $('hpTxt').textContent = `${Math.ceil(p.hp)} / ${S.maxHp}${p.ward ? ' +' + p.ward : ''}`;
    $('mpFill').style.width = p.mp / S.maxMp * 100 + '%'; $('mpTxt').textContent = `${p.mp} / ${S.maxMp}`; $('xpFill').style.width = p.xp / K.need(p.lvl) * 100 + '%';
    const chips = []; for (const s in p.st) chips.push(`<span class="chip" style="color:${STATUS[s].c}">${STATUS[s].n} ${p.st[s]}</span>`);
    if (p.food <= 0) chips.push('<span class="chip" style="color:#ff8d7c">Starving</span>'); else if (p.food < 200) chips.push('<span class="chip" style="color:#e8b04a">Hungry</span>'); if (G.key) chips.push('<span class="chip" style="color:#ffd24a">Vault key</span>');
    const c = chips.join(''); if (c !== lastChips) { $('chips').innerHTML = c; lastChips = c; }
    const b = G.mons.find(m => m.boss && m.ai === 'hunt' && (visible(m.x, m.y) || m.hp < m.mhp)); $('bossBar').hidden = !b; if (b) { $('bossBar').querySelector('b').textContent = mdef(b).n; $('bossBar').querySelector('u').style.width = Math.max(0, b.hp / b.mhp * 100) + '%'; }
    if (G.log.length) { const k = G.log.length + '|' + G.log[G.log.length - 1].s + G.log[G.log.length - 1].n; if (k !== lastLog) { lastLog = k; const l = G.log.slice(-3), t = G.log[G.log.length - 1].n; $('log').innerHTML = l.map(e => `<p class="${e.c} ${t - e.n > 4 ? 'old' : ''}">${esc(e.s)}</p>`).join(''); } }
    U.bar(); U.ctx();
  };
  U.better = it => { const p = G.p; if (it.k !== 'gear') return false; const e = p.eq[it.slot]; if (!e) return true; if (it.slot === 'weapon') return gearAtk(it) > gearAtk(e) + .05; if (it.slot === 'charm') return false; return gearDef(it) > gearDef(e) + .05; };
  U.bar = () => {
    const p = G.p, hp = p.bag.find(b => b.k === 'potion' && b.t === 'heal'), nb = p.bag.some(b => U.better(b) && !b.seen);
    let h = `<button data-a="wait" class="txt">Wait</button><button data-a="explore" class="txt">Explore</button>`;
    h += `<button data-a="heal" class="${hp ? '' : 'low'}" aria-label="Drink a healing potion">${ic('icon', 'healing_potion')}<i class="n">${hp ? hp.q : 0}</i></button>`;
    const sp = Object.keys(p.spells); if (sp.length) h += '<div class="spells">' + sp.map(s => `<button data-a="spell" data-s="${s}" class="${canCast(s) ? '' : 'low'} ${R.st.target && R.st.target.spell === s ? 'on' : ''}" aria-label="${SPELLS[s].n}">${ic('icon', SPELLS[s].ic)}<i class="n">${SPELLS[s].mp}</i><span class="l">${SPELLS[s].n.split(' ').pop()}</span></button>`).join('') + '</div>';
    h += `<button data-a="bag" aria-label="Bag" class="txt">Bag${nb ? '<i class="dot"></i>' : ''}</button>`;
    if (h !== lastBar) { const sc = document.querySelector('#bar .spells'), x = sc ? sc.scrollLeft : 0; $('bar').innerHTML = h; lastBar = h; const s2 = document.querySelector('#bar .spells'); if (s2) s2.scrollLeft = x; }
  };
  let lastCtx = '';
  U.ctx = () => { const on = tileAt(G.p.x, G.p.y) === T.STAIRS; const h = on ? `<button class="pri" data-a="descend">Descend to floor ${G.floor + 1}</button>` : ''; if (h !== lastCtx) { $('ctx').innerHTML = h; lastCtx = h; } };
  U.banner = (t, s) => { $('toast').innerHTML = `<div class="zt">${esc(t)}</div><div class="zs">${esc(s)}</div>`; U.showToast(2600); };
  U.tip = (id, s) => { if (Meta.d.tips[id] || !G) return; Meta.d.tips[id] = 1; Meta.save(); $('toast').innerHTML = `<div class="tip">${esc(s)}</div>`; U.showToast(5200); };
  U.showToast = ms => { const t = $('toast'); t.hidden = false; t.style.transition = 'none'; t.style.opacity = 1; clearTimeout(U.toastT); U.toastT = setTimeout(() => { t.style.transition = 'opacity .5s'; t.style.opacity = 0; }, ms); };
  U.fade = () => { $('fade').classList.add('on'); setTimeout(() => $('fade').classList.remove('on'), 420); };
  U.onFloor = () => { const z = zoneOf(G.floor), n = (G.floor - 1) % FLOORS_PER_ZONE; Snd.play(isBossFloor(G.floor) ? 'battle' : z.music); if (n === 0) U.banner(z.name, z.sub); else if (isBossFloor(G.floor)) U.banner(`Floor ${G.floor}`, 'Something is waiting. There is a bed, at least.'); else U.banner(`Floor ${G.floor}`, G.floor === 1 ? '' : z.name); $('fade').classList.remove('on'); };
  U.target = (o) => { R.st.target = o; $('target').hidden = !o; if (o) $('target').querySelector('span').textContent = o.label; U.bar(); };

  /* ---------------- sheets ---------------- */
  U.open = tab => { U.tab = tab; U.sel = null; $('sheet').hidden = false; U.sheet(); Main.stop(); };
  U.close = () => { $('sheet').hidden = true; $('sheet').innerHTML = ''; for (const b of G.p.bag) b.seen = 1; U.hud(); };
  const statLine = (n, v) => `<div><i>${n}</i><b>${v}</b></div>`;
  U.sheet = () => {
    const tabs = [['bag', 'Bag'], ['hero', 'Hero'], ['map', 'Map'], ['log', 'Log']]; const old = $('sheet').querySelector('.panel'), top = old ? old.scrollTop : 0;
    let h = `<div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${U.tab === k ? 'pri' : ''}">${n}</button>`).join('')}<button class="x" data-tab="x" aria-label="Close">✕</button></div>`;
    if (U.tab === 'bag') h += bagHtml(); else if (U.tab === 'hero') h += heroHtml(); else if (U.tab === 'map') h += `<canvas id="mapCv"></canvas><p class="sub" style="margin-top:8px">Tap a place you have seen to walk there.</p>`; else h += `<div>${G.log.slice().reverse().map(l => `<p class="sub" style="padding:3px 0;color:${l.c === 'good' ? 'var(--good)' : l.c === 'bad' ? 'var(--bad)' : l.c ? 'var(--gold)' : ''}">${esc(l.s)}</p>`).join('')}</div>`;
    $('sheet').innerHTML = `<div class="panel">${h}</div>`; const pn = $('sheet').querySelector('.panel'); pn.style.animation = old ? 'none' : ''; pn.scrollTop = top;
    if (U.tab === 'map') R.drawMap($('mapCv'));
  };
  function bagHtml() {
    const p = G.p; let h = `<div class="slots">${SLOTS.map(s => { const e = p.eq[s]; return `<div><button class="cell ${e ? 'has' : ''} ${U.sel && U.sel.eq === s ? 'sel' : ''}" data-eq="${s}" aria-label="${s}">${e ? ic('icon', itemIcon(e)) : ''}${e && e.plus ? `<b>+${e.plus}</b>` : ''}</button>${{ weapon: 'Weapon', body: 'Body', head: 'Head', hands: 'Hands', legs: 'Legs', feet: 'Feet', charm: 'Charm' }[s]}</div>`; }).join('')}</div>`;
    h += `<h3>Bag <i>${p.bag.length} / ${BAG_MAX}  ·  ${p.gold} gold  ·  ${Math.round(p.food / K.hungerMax * 100)}% fed</i></h3><div class="grid">`;
    p.bag.forEach((it, i) => { h += `<button class="cell has ${it.k === 'gear' && it.aff.length ? 'fine' : ''} ${U.sel && U.sel.bag === i ? 'sel' : ''}" data-bag="${i}" aria-label="${esc(itemName(it))}">${ic('icon', itemIcon(it))}${it.q > 1 ? `<b>${it.q}</b>` : it.plus ? `<b>+${it.plus}</b>` : ''}${U.better(it) ? '<s class="up">▲</s>' : (it.k === 'potion' || it.k === 'scroll') && !known(it.k, it.t) ? '<s class="q">?</s>' : ''}</button>`; });
    for (let i = p.bag.length; i < Math.max(10, Math.ceil(p.bag.length / 5) * 5); i++) h += '<div class="cell"></div>'; h += '</div>';
    const it = U.sel ? (U.sel.eq ? p.eq[U.sel.eq] : p.bag[U.sel.bag]) : null;
    if (it) {
      h += `<div class="detail"><h4>${esc(itemName(it))}</h4><p>${esc(itemDesc(it))}</p>`;
      if (U.sel.bag != null && it.k === 'gear' && it.slot !== 'charm') { const e = p.eq[it.slot]; const a = it.slot === 'weapon' ? gearAtk(it) - (e ? gearAtk(e) : 0) : gearDef(it) - (e ? gearDef(e) : 0); h += `<p class="cmp">${e ? 'Wearing ' + esc(itemName(e)) : 'Nothing worn there'}: <b class="${a >= 0 ? 'up' : 'dn'}">${a >= 0 ? '+' : ''}${a.toFixed(1)} ${it.slot === 'weapon' ? 'attack' : 'armour'}</b></p>`; }
      h += '<div class="row">';
      if (U.sel.eq) h += `<button data-do="unequip">Take off</button>`;
      else { if (it.k === 'gear') h += `<button class="pri" data-do="use">Put on</button>`; else if (it.k === 'throw') h += `<button class="pri" data-do="throw">Throw</button>`; else { h += `<button class="pri" data-do="use">${{ potion: 'Drink', scroll: 'Read', tome: 'Study', food: 'Eat', feather: 'Use' }[it.k]}</button>`; if (it.k === 'potion') h += `<button data-do="throw">Throw</button>`; } h += `<button data-do="drop">Drop</button>`; }
      h += '</div></div>';
    } else h += `<div class="detail"><p class="sub">Tap anything to see what it does. ▲ beats what you are wearing. ? is unknown until used.</p></div>`;
    return h;
  }
  function heroHtml() {
    const p = G.p, k = KITS[G.kit]; let h = `<div class="hero">${ic('port', 'oliver')}<div><h2>Oliver</h2><p class="sub">Level ${p.lvl}  ·  ${esc(k.n)}<br>${mmss(G.time)} in  ·  floor ${G.floor}</p></div></div><h3>Numbers</h3><div class="stats">`;
    h += statLine('Attack', S.atk.toFixed(1)) + statLine('Armour', S.def.toFixed(1)) + statLine('Critical', Math.round(S.crit * 100) + '%') + statLine('Dodge', Math.round(S.dodge * 100) + '%') + statLine('Health', `${Math.ceil(p.hp)} / ${S.maxHp}`) + statLine('Mana', `${p.mp} / ${S.maxMp}`) + statLine('Resist', Math.round(S.resist * 100) + '%') + statLine('Life steal', Math.round(S.leech * 100) + '%') + statLine('Put to sleep', G.stats.kills) + statLine('Next level', `${K.need(p.lvl) - p.xp} XP`) + '</div>';
    const sets = SETS.map((s, t) => [s, setCount(t), t]).filter(a => a[1] >= 2); if (sets.length) h += `<h3>Armour sets</h3>` + sets.map(([s, n]) => `<p class="sub"><b style="color:var(--gold)">${s.n} ${n}/5</b>  <span class="${n >= 3 ? 'up' : ''}">3: ${s.d3}.</span> <span class="${n >= 5 ? 'up' : ''}">5: ${s.d5}.</span></p>`).join('');
    const pk = Object.keys(p.perks); if (pk.length) h += `<h3>Talents</h3><div class="list">${pk.map(i => `<p class="sub"><b style="color:var(--gold)">${PERKS[i].n}${p.perks[i] > 1 ? ' x' + p.perks[i] : ''}</b>  ${PERKS[i].d}</p>`).join('')}</div>`;
    const sp = Object.keys(p.spells); if (sp.length) h += `<h3>Spells</h3><div class="list">${sp.map(i => `<p class="sub"><b style="color:var(--gold)">${SPELLS[i].n} ${p.spells[i]}</b>  ${SPELLS[i].mp} mana. ${SPELLS[i].d(p.spells[i])}</p>`).join('')}</div>`;
    return h;
  }
  $('sheet').addEventListener('click', e => {
    if (e.target === $('sheet')) return U.close(); const b = e.target.closest('button,canvas'); if (!b) return; const D = b.dataset; Snd.sfx('tap');
    if (b.id === 'mapCv') { const r = b.getBoundingClientRect(), k = Math.min(r.width / b.width, r.height / b.height), x = Math.floor((e.clientX - r.left - (r.width - b.width * k) / 2) / k / 8), y = Math.floor((e.clientY - r.top - (r.height - b.height * k) / 2) / k / 8); if (inb(x, y) && G.seen[ix(x, y)]) { U.close(); Main.travel(x, y); } return; }
    if (D.tab) { if (D.tab === 'x') return U.close(); U.tab = D.tab; U.sel = null; return U.sheet(); }
    if (D.eq) { U.sel = G.p.eq[D.eq] ? { eq: D.eq } : null; return U.sheet(); } if (D.bag) { U.sel = { bag: +D.bag }; return U.sheet(); }
    if (D.do) {
      const it = U.sel.eq ? G.p.eq[U.sel.eq] : G.p.bag[U.sel.bag];
      if (D.do === 'unequip') { ACT.unequip(U.sel.eq); U.sel = null; Main.after(); if (!$('sheet').hidden) U.sheet(); return; }
      if (D.do === 'throw') { U.close(); return Main.aim({ item: it, range: 7, label: 'Throw ' + itemName(it) }); }
      if (D.do === 'drop') { ACT.drop(it); U.sel = null; Main.after(); if (!$('sheet').hidden) U.sheet(); return; }
      if (it.k === 'gear') { ACT.equip(it); U.sel = null; R.recompose(); Main.after(); if (!$('sheet').hidden && !G.over) U.sheet(); return; }
      U.close(); useItem(it); Main.after();
    }
  });

  /* ---------------- dialogs that come out of play ---------------- */
  const modal = (h, fn, closable) => { $('modal').innerHTML = `<div class="panel">${h}</div>`; $('modal').hidden = false; U.modalFn = fn; U.modalClose = closable; };
  U.closeModal = () => { $('modal').hidden = true; $('modal').innerHTML = ''; U.modalFn = null; };
  $('modal').addEventListener('click', e => { if (e.target === $('modal') && U.modalClose) { U.modalClose(); return; } const b = e.target.closest('button'); if (!b || b.disabled || !U.modalFn) return; Snd.sfx('tap'); U.modalFn(b.dataset, b); });
  const opt = (icn, n, d, r = '', data = '', dis = false) => `<button class="opt ${dis ? 'lock' : ''}" ${dis ? 'disabled' : ''} ${data}>${icn}<span><b>${esc(n)}</b><span class="d">${esc(d)}</span></span><em>${r}</em></button>`;
  const later = '<div class="row"><button data-x="1">Not now</button></div>';
  U.pending = () => {
    if (!G.pending.length || !$('modal').hidden) return false; const q = G.pending[0]; const done = () => { G.pending.shift(); U.closeModal(); Main.after(); }; Main.stop();
    if (q.t === 'level') {
      modal(`<h2>Level ${G.p.lvl - G.pending.filter(a => a.t === 'level').length + 1}</h2><p class="sub" style="margin:2px 0 12px">Pick one talent.</p><div class="list">${q.opts.map(i => opt(ic('icon', PERKS[i].ic), PERKS[i].n + (perk(i) ? ` (have ${perk(i)})` : ''), PERKS[i].d, '', `data-i="${i}"`)).join('')}</div>`, d => { if (!d.i) return; takePerk(d.i); done(); });
    } else if (q.t === 'ped') {
      const o = G.feats.filter(f => f.t === 'ped'); modal(`<h2>The vault</h2><p class="sub" style="margin:2px 0 12px">Take one. The others crumble.</p><div class="list">${o.map((f, i) => opt(ic('icon', itemIcon(f.it)), itemName(f.it), itemDesc(f.it), U.better(f.it) ? '<span class="up">▲</span>' : '', `data-i="${i}"`)).join('')}</div>${later}`, d => { if (d.i != null) { if (!doPed(o[+d.i])) say('Your bag is full.', 'bad'); } done(); }, done);
    } else if (q.t === 'shop') {
      const draw = () => {
        const f = q.f; let h = `<div class="hero">${ic('port', 'village_trader')}<div><h2>The Trader</h2><p class="sub">“You came down here too, did you?”<br>You have <b style="color:var(--gold)">${G.p.gold} gold</b>.</p></div></div><h3>Buy</h3><div class="list">${f.stock.map((it, i) => opt(ic('icon', itemIcon(it)), known(it.k, it.t) ? itemName(it) : (it.k === 'potion' ? POTIONS : SCROLLS)[it.t].n, it.k === 'potion' ? POTIONS[it.t].d : it.k === 'scroll' ? SCROLLS[it.t].d : itemDesc(it), (U.better(it) ? '<span class="up">▲</span> ' : '') + price(it), `data-b="${i}"`, G.p.gold < price(it))).join('') || '<p class="sub">Sold out.</p>'}</div>`;
        h += `<h3>Sell</h3><div class="list">${G.p.bag.map((it, i) => opt(ic('icon', itemIcon(it)), itemName(it) + (it.q > 1 ? ' x' + it.q : ''), it.k === 'gear' ? itemDesc(it) : '', '+' + price(it, 1), `data-s="${i}"`)).join('') || '<p class="sub">Nothing to sell.</p>'}</div><div class="row"><button class="pri" data-x="1">Done</button></div>`;
        const pn = $('modal').querySelector('.panel'), top = pn ? pn.scrollTop : 0; modal(h, d => { if (d.x) return done(); if (d.b != null) { if (!doBuy(f, +d.b)) say('Could not buy that.', 'bad'); } if (d.s != null) doSell(G.p.bag[+d.s]); draw(); }, done); $('modal').querySelector('.panel').scrollTop = top; if (top) $('modal').querySelector('.panel').style.animation = 'none';
      }; draw();
    } else if (q.t === 'forge') {
      const draw = () => { const f = q.f; const w = SLOTS.filter(s => s !== 'charm' && G.p.eq[s]); modal(`<div class="hero">${ic('port', 'village_blacksmith')}<div><h2>The Forge</h2><p class="sub">Heat left for <b style="color:var(--gold)">${f.left}</b>. You have <b style="color:var(--gold)">${G.p.gold} gold</b>.</p></div></div><h3>Improve by +1</h3><div class="list">${w.map(s => { const it = G.p.eq[s], c = forgeCost(it); return opt(ic('icon', itemIcon(it)), itemName(it), s === 'weapon' ? `Attack ${gearAtk(it).toFixed(1)} → ${gearAtk({ ...it, plus: it.plus + 1 }).toFixed(1)}` : `Armour ${gearDef(it).toFixed(1)} → ${gearDef({ ...it, plus: it.plus + 1 }).toFixed(1)}`, c, `data-s="${s}"`, f.left <= 0 || G.p.gold < c); }).join('')}</div><div class="row"><button class="pri" data-x="1">Done</button></div>`, d => { if (d.x) return done(); doForge(f, G.p.eq[d.s]); draw(); }, done); }; draw();
    } else if (q.t === 'forgeScroll') {
      const w = SLOTS.filter(s => s !== 'charm' && G.p.eq[s]); modal(`<h2>Scroll of Forging</h2><p class="sub" style="margin:2px 0 12px">Improve one thing you are wearing.</p><div class="list">${w.map(s => { const it = G.p.eq[s]; return opt(ic('icon', itemIcon(it)), itemName(it), s === 'weapon' ? `Attack ${gearAtk(it).toFixed(1)} → ${gearAtk({ ...it, plus: it.plus + 1 }).toFixed(1)}` : `Armour ${gearDef(it).toFixed(1)} → ${gearDef({ ...it, plus: it.plus + 1 }).toFixed(1)}`, '', `data-s="${s}"`); }).join('')}</div>${later}`, d => { if (d.s) { takeOne(q.it); doForgeScroll(G.p.eq[d.s]); } done(); }, done);
    } else if (q.t === 'altar') {
      const o = q.f.opts.map(i => BOONS.find(b => b.id === i)); modal(`<h2>An old altar</h2><p class="sub" style="margin:2px 0 12px">It offers a bargain. It will only offer once.</p><div class="list">${o.map(b => opt(ic('icon', 'magic_crystal'), b.n, b.d, '', `data-i="${b.id}"`, b.ok && !b.ok(G.p))).join('')}</div>${later}`, d => { if (d.i) doAltar(q.f, d.i); done(); }, done);
    } else if (q.t === 'luigi') {
      modal(`<div class="hero">${ic('port', 'luigi')}<div><h2>Luigi the Fearless</h2><p class="sub">He was only down here to keep an eye on things, obviously.</p></div></div><p style="margin:12px 0 2px;line-height:1.45">Luigi follows you for the rest of the run and bites whatever you are fighting, every few turns. Nothing dares bite back.</p><div class="row"><button class="pri" data-x="1">Good dog</button></div>`, done, done);
    } else if (q.t === 'win') {
      Meta.d.wins++; Meta.save(); modal(`<h2>The Ancient Warden sleeps</h2><p style="margin:8px 0;line-height:1.45">After ${mmss(G.time)}, the last light in the valley is lit again. You could go home now, a hero.</p><p class="sub">Or keep going. The stairs run on past anything on the map, and nothing down there has ever met anyone.</p><div class="row"><button class="pri" data-h="1">Go home, victorious</button><button data-c="1">Into the Endless Deep</button></div>`, d => { if (d.h) { G.over = { by: 'choice', floor: G.floor, won: true, home: 1 }; } done(); });
    } return true;
  };
  /* look at a monster */
  U.inspect = m => { const d = mdef(m), hits = Math.max(1, Math.ceil(m.hp / Math.max(1, dmgF(S.atk, m.def * (1 - (S.w.pierce || 0)))))), dm = Math.round(dmgF(m.atk, S.def)); const a = ATLAS.mon; modal(`<div class="hero">${ic('mon', d.art)}<div><h2>${esc(d.n)}</h2><p class="sub">${Math.ceil(m.hp)} / ${m.mhp} health${m.ai === 'sleep' ? ', asleep' : ''}</p></div></div><p style="margin:10px 0;line-height:1.45">${esc(d.d)}</p><div class="stats">${statLine('Hits to beat', '~' + hits)}${statLine('Hits you for', '~' + dm)}${statLine('Speed', (d.spd || 100) > 110 ? 'Fast' : (d.spd || 100) < 90 ? 'Slow' : 'Normal')}${statLine('Ailments', Object.keys(m.st).map(s => STATUS[s].n).join(', ') || 'None')}</div><div class="row"><button class="pri" data-x="1">Close</button></div>`, U.closeModal, U.closeModal); };
  U.menu = () => {
    Main.stop(); modal(`<h2>Paused</h2><p class="sub">Your run saves itself. Floor ${G.floor}, ${mmss(G.time)} so far.</p><div style="margin-top:8px"><label class="setrow">Music <input type="range" min="0" max="1" step=".05" value="${Snd.opt.music}" data-v="music"></label><label class="setrow">Sounds <input type="range" min="0" max="1" step=".05" value="${Snd.opt.sfx}" data-v="sfx"></label></div><div class="row"><button class="pri" data-x="1">Keep going</button><button data-h="1">How to play</button></div><div class="row"><button data-q="1">Save and quit</button><button data-g="1">End this run</button></div>`, d => {
      if (d.x) U.closeModal(); if (d.h) U.help(U.menu); if (d.q) { Save.put(); U.closeModal(); U.title(); } if (d.g) modal(`<h2>End this run?</h2><p class="sub">Oliver heads home from floor ${G.floor}. This cannot be undone.</p><div class="row"><button data-n="1">Keep playing</button><button class="pri" data-y="1">End run</button></div>`, d => { if (d.n) U.closeModal(); if (d.y) { U.closeModal(); G.over = { by: 'choice', floor: G.floor, won: G.won, home: 1 }; Main.after(); } });
    }, U.closeModal);
  };
  $('modal').addEventListener('input', e => { if (e.target.dataset.v) Snd.set(e.target.dataset.v, +e.target.value); });
  U.help = back => modal(`<h2>How to play</h2><div class="list" style="margin-top:8px">${['Tap a tile to walk there. Swipe to take one step. Tap a monster beside you to attack; hold a finger on one to inspect it.', 'Nothing moves until you do. Take your time.', 'Wait passes a turn. Hold Wait to rest until you are well. Explore walks the floor for you and stops when anything happens.', ...TIPS.slice(1), 'When your health runs out, Oliver nods off and the run is over. The next one starts from the top, with everything moved around. What you keep is what you learned, and new kits for getting deeper.'].map(t => `<p class="sub" style="color:var(--text)">${esc(t)}</p>`).join('')}</div><div class="row"><button class="pri" data-x="1">Close</button></div>`, () => { U.closeModal(); if (back) back(); }, () => { U.closeModal(); if (back) back(); });

  /* ---------------- title ---------------- */
  const show = g => { U.screen = g; for (const i of ['hud', 'foot']) $(i).hidden = g !== 'game'; $('title').hidden = g === 'game'; if (g !== 'game') { $('sheet').hidden = true; $('target').hidden = true; } };
  U.show = show;
  const scene = gate => `<div class="scene"><img class="gate" src="assets/gate_${gate}.webp" alt=""><img class="ol" src="assets/hero.webp" alt="Oliver"></div>`;
  U.title = () => {
    show('title'); Snd.play('title'); const s = Save.peek(), m = Meta.d, z = s ? zoneOf(s.floor) : zoneOf(Math.max(1, Math.min(WIN_FLOOR, m.best || 1)));
    $('title').innerHTML = scene(z.id) + `<div class="box"><div><h1>Oliver</h1><p style="color:var(--gold);font-weight:600;font-size:18px;margin-top:2px">Below the Valley</p><p class="sub">Room by room, and no further than you can manage.</p></div>${s ? `<button class="pri" data-t="cont">Continue: floor ${s.floor}</button>` : ''}<button class="${s ? '' : 'pri'}" data-t="new">New run</button><div class="two"><button data-t="daily">Daily run</button><button data-t="journal">Journal</button></div><div class="two"><button data-t="help">How to play</button><button data-t="set">Sound</button></div>${m.runs.length ? `<p class="sub">Deepest floor ${m.best}${m.wins ? `  ·  ${m.wins} victor${m.wins > 1 ? 'ies' : 'y'}` : ''}  ·  ${m.runs.length} run${m.runs.length > 1 ? 's' : ''}</p>` : ''}</div>`;
  };
  U.kits = () => {
    const m = Meta.d; modal(`<h2>Who packed your bag?</h2><p class="sub" style="margin:2px 0 12px">${Save.has() ? 'Starting a new run ends the saved one. ' : ''}Kits are different, not better.</p><div class="list">${Object.entries(KITS).map(([k, v]) => { const ok = m.best >= v.need; return opt(ic('port', v.port), v.n, ok ? v.d : `Reach floor ${v.need} to unlock.`, '', `data-k="${k}"`, !ok); }).join('')}</div>${later}`, d => { if (d.k) { U.closeModal(); Main.start(d.k); } if (d.x) U.closeModal(); }, U.closeModal);
  };
  $('title').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const t = b.dataset.t; Snd.sfx('tap');
    if (t === 'cont') Main.resume(); if (t === 'new') U.kits(); if (t === 'help') U.help(); if (t === 'journal') U.journal(); if (t === 'title') U.title(); if (t === 'again') { U.kits(); }
    if (t === 'daily') { const d = new Date(), key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(), r = Meta.d.daily[key]; modal(`<h2>Daily run</h2><p class="sub" style="margin:6px 0">The same dungeon for everyone today, with the Wanderer's kit.${r ? ` You have reached floor ${r} today.` : ''}${Save.has() ? ' Starting it ends your saved run.' : ''}</p><div class="row"><button class="pri" data-y="1">Start</button><button data-x="1">Not now</button></div>`, q => { U.closeModal(); if (q.y) Main.start('wanderer', key * 31 + 7, 'daily:' + key); }, U.closeModal); }
    if (t === 'set') modal(`<h2>Sound</h2><label class="setrow">Music <input type="range" min="0" max="1" step=".05" value="${Snd.opt.music}" data-v="music"></label><label class="setrow">Sounds <input type="range" min="0" max="1" step=".05" value="${Snd.opt.sfx}" data-v="sfx"></label><div class="row"><button class="pri" data-x="1">Close</button><button data-cr="1">Credits</button></div>`, d => { U.closeModal(); if (d.cr) U.credits(); }, U.closeModal);
  });
  U.credits = () => fetch('CREDITS.md').then(r => r.text()).catch(() => 'Credits are in CREDITS.md.').then(t => modal(`<h2>Credits</h2>${t.split(String.fromCharCode(10)).filter(l => l.trim() && !l.startsWith('# ')).map(l => l.startsWith('##') ? `<h3>${esc(l.replace(/#+ /, ''))}</h3>` : `<p class="sub" style="padding:2px 0;overflow-wrap:anywhere">${esc(l)}</p>`).join('')}<div class="row"><button class="pri" data-x="1">Close</button></div>`, U.closeModal, U.closeModal));
  U.journal = () => {
    const m = Meta.d; let h = `<h2>Journal</h2><div class="trio" style="margin-top:10px"><div><b>${m.best || 0}</b><i>deepest floor</i></div><div><b>${m.runs.length}</b><i>runs</i></div><div><b>${m.wins}</b><i>victories</i></div></div><h3>Recent runs</h3>`;
    h += m.runs.length ? `<div class="list">${m.runs.slice(-8).reverse().map(r => `<p class="sub"><b style="color:var(--gold)">Floor ${r.f}</b>  ${mmss(r.t)}, level ${r.l}, ${esc(KITS[r.k] ? KITS[r.k].n : '')}${r.w ? ', victorious' : ''}. ${r.by === 'choice' ? 'Went home.' : 'Put to sleep by ' + esc(r.by) + '.'}</p>`).join('')}</div>` : '<p class="sub">None yet.</p>';
    h += `<h3>Bestiary <i>${Object.values(m.slept).filter(Boolean).length} / ${Object.keys(MON).length}</i></h3><div class="best">${Object.entries(MON).map(([k, d]) => { const n = m.slept[k]; return `<div>${ic('mon', d.art, n == null ? 'unk' : '')}<br>${n == null ? '???' : esc(d.n)}<small>${n ? n + ' asleep' : n === 0 ? 'met' : ''}</small></div>`; }).join('')}</div><div class="row"><button class="pri" data-x="1">Close</button></div>`;
    modal(h, d => { if (d.x) U.closeModal(); }, U.closeModal);
  };
  /* ---------------- end of a run ---------------- */
  const rank = t => t < 300 ? ['A quick look', 'Under five minutes. Everyone has one of those.'] : t < 900 ? ['Beginner', '5 to 15 minutes: finding your feet.'] : t < 3600 ? ['Adventurer', '15 to 60 minutes: a proper run.'] : ['Old hand', 'Over an hour. The deep knows your name.'];
  /* written the moment a run ends, so closing the app cannot undo it */
  U.record = () => {
    const m = Meta.d, o = G.over, f = G.floor; o.prev = m.best || 0; m.best = Math.max(m.best || 0, f); m.time += G.time; m.kills += G.stats.kills; for (const k in G.stats.slept) m.slept[k] = (m.slept[k] || 0) + G.stats.slept[k];
    m.runs.push({ f, t: Math.round(G.time), l: G.p.lvl, k: G.kit, by: o.by, w: G.won ? 1 : 0, d: Date.now(), n: G.stats.kills }); if (m.runs.length > 200) m.runs.shift(); if (G.mode.startsWith('daily:')) { const k = G.mode.slice(6); m.daily[k] = Math.max(m.daily[k] || 0, f); } Meta.save(); Save.clear();
  };
  U.over = () => {
    const m = Meta.d, o = G.over, prev = o.prev, f = G.floor;
    const un = Object.values(KITS).filter(k => k.need > prev && k.need <= m.best && k.need > 0), rk = rank(G.time), z = zoneOf(f); show('over'); Snd.play(G.won ? 'victory' : 'village');
    $('title').innerHTML = scene(z.id) + `<div class="box"><div><h2>${G.won ? 'A hero comes home' : o.home ? 'Home in time for tea' : 'Run over'}</h2><p class="sub">${o.home ? '' : `Put to sleep by ${esc(o.by)} in ${esc(z.name)}. `}${G.won && o.home ? 'The valley is bright again.' : esc(DEATH_LINES[G.turn % DEATH_LINES.length | 0] || DEATH_LINES[0])}</p></div><div class="trio"><div><b>${f}</b><i>floor${f > prev && prev ? ', your best' : ''}</i></div><div><b>${mmss(G.time)}</b><i>played</i></div><div><b>${G.p.lvl}</b><i>level</i></div></div><div><b style="color:var(--gold)">${rk[0]}</b><div class="meter"><u style="width:${Math.min(100, f / WIN_FLOOR * 100)}%"></u></div><p class="sub">${G.stats.kills} put to sleep, ${G.stats.boss} boss${G.stats.boss === 1 ? '' : 'es'}. ${f < WIN_FLOOR ? `${WIN_FLOOR - f} floors from the Ancient Warden.` : ''}</p></div>${un.map(k => `<p><b style="color:var(--good)">Unlocked: ${esc(k.n)}</b></p>`).join('')}${!G.won && !o.home ? `<p class="sub">${esc(TIPS[(m.runs.length * 3) % TIPS.length])}</p>` : ''}<button class="pri" data-t="again">New run</button><button data-t="title">Title</button></div>`;
  };
  return U;
})();
