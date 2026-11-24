/* Music through an <audio> element, sound effects through Web Audio. Silent if either is unavailable. */
'use strict';
const Snd = (() => {
  let ac = null, bufs = {}, music = null, cur = '', unlocked = false;
  const opt = { music: .5, sfx: .7 };
  try { Object.assign(opt, JSON.parse(localStorage.getItem('od_snd') || '{}')); } catch (e) { }
  const VOL = { hit: .5, swing: .5, dodge: .35, tap: .7, coin: .5, chop: .8, mine: .55, craft: .6, level_up: .6, nap: .5, quest: .55 };
  function unlock() {
    if (unlocked) return; unlocked = true;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)(); ac.resume();
      for (const n of Object.keys(VOL)) fetch('assets/sfx/' + n + '.mp3').then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(b => { bufs[n] = b; }).catch(() => { });
    } catch (e) { ac = null; }
    if (cur) { const c = cur; cur = ''; play(c); }
  }
  let last = {};
  function sfx(n) {
    if (!ac || !bufs[n] || !opt.sfx) return; const t = ac.currentTime; if (last[n] && t - last[n] < .06) return; last[n] = t;
    if (ac.state !== 'running') ac.resume();
    const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = bufs[n]; s.playbackRate.value = n === 'hit' || n === 'swing' ? .92 + Math.random() * .18 : 1; g.gain.value = opt.sfx * (VOL[n] || .5); s.connect(g).connect(ac.destination); s.start();
  }
  function play(n) {
    if (cur === n) return; cur = n; if (!unlocked) return;
    try { if (!music) { music = new Audio(); music.loop = true; } music.src = 'assets/music/' + n + '.mp3'; music.volume = opt.music; if (opt.music > 0) music.play().catch(() => { }); } catch (e) { }
  }
  function set(k, v) { opt[k] = v; try { localStorage.setItem('od_snd', JSON.stringify(opt)); } catch (e) { } if (k === 'music' && music) { music.volume = v; if (v > 0) music.play().catch(() => { }); else music.pause(); } }
  addEventListener('pointerdown', unlock, { once: true, capture: true }); addEventListener('keydown', unlock, { once: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (music) { if (document.hidden) music.pause(); else if (opt.music > 0) music.play().catch(() => { }); } });
  return { sfx, play, set, opt };
})();
