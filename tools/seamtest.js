/* Paste into the console: counts one-pixel dark lines across lit floor at many camera positions. */
window.seamTest = async (w = 390, h = 844, ratio = 3) => {
  for (const [k, v] of [['innerWidth', w], ['innerHeight', h], ['devicePixelRatio', ratio]]) Object.defineProperty(window, k, { get: () => v, configurable: true });
  Main.start('wanderer', 4242); G.mons = []; G.feats = []; G.items = []; G.torches = []; G.deco.fill(5);
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) G.t[y * G.w + x] = x > 2 && x < 24 && y > 2 && y < 24 ? 1 : 0;
  G.p.x = 12; G.p.y = 12; computeFov(); dispatchEvent(new Event('resize')); await new Promise(r => setTimeout(r, 1500));
  const cv = document.getElementById('cv'), c = cv.getContext('2d'), L = (d, i) => d[i] + d[i + 1] + d[i + 2], out = { canvas: cv.width + 'x' + cv.height, lines: 0, frames: 0 };
  const scan = (d, n) => { let k = 0; for (let x = 3; x < n - 3; x++) { const m = L(d, x * 4), a = L(d, (x - 2) * 4), b = L(d, (x + 2) * 4); if (a > 150 && b > 150 && m < a * .8 && m < b * .8) k++; } return k; };
  /* flatten the art so only seams can show */
  const P = CanvasRenderingContext2D.prototype, di = P.drawImage;
  P.drawImage = function (im, ...a) { if (im.width === 576) return; if (this === c && (im === IMG.tile || im.width === 32 || (im.tagName === 'CANVAS' && im.width === im.height && im.width < 300 && im.width !== 160))) { const q = a.length > 4 ? a.slice(4) : [a[0], a[1], im.width, im.height]; this.fillStyle = '#b89a60'; this.fillRect(...q); } else di.call(this, im, ...a); };
  for (let k = 0; k < 14; k++) { G.p.x = 8 + k % 8; G.p.y = 8 + (k * 3) % 7; await new Promise(r => setTimeout(r, 45 + k * 7)); const y = Math.round(cv.height * .30), x = Math.round(cv.width * .3); const row = c.getImageData(0, y, cv.width, 1).data, col = c.getImageData(x, Math.round(cv.height * .25), 1, Math.round(cv.height * .25)).data; out.lines += scan(row, cv.width) + scan(col, Math.round(cv.height * .25)); out.frames++; }
  P.drawImage = di; return JSON.stringify(out);
};
