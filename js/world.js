/* world: dabartinės versijos Redgate Bay miesto dalis - gabalai (WebP) kraunami aplink mašiną, kietumas (Cls), objektai, policijos navigacija */
'use strict';
const CH = 384;                        // World.CHUNK_PX
const SOLID = 8;                       // World.SOLID
const SURF_V = [1, .82, .72, .96, 1.12, .88, .95, 1, 1, .45];   // World.SURF greitis pagal Cls
const chunks = new Map();              // "cx_cy" -> {img, cls, st}
let loading = 0;
const WB = { x0: 0, y0: 0, x1: 0, y1: 0 };   // srities ribos (vnt.)
function worldInit() {
  const m = A.map, g = m.ring || 0;   // žiedas - dekoratyvūs gabalai už atitvaro (miestas tęsiasi, bet ten nevažiuojama)
  WB.x0 = (m.cx0 + g) * CH / PPU; WB.y0 = (m.cy0 + g) * CH / PPU; WB.x1 = (m.cx1 + 1 - g) * CH / PPU; WB.y1 = (m.cy1 + 1 - g) * CH / PPU;
  NAV.w = Math.ceil((WB.x1 - WB.x0) / NAV.c); NAV.h = Math.ceil((WB.y1 - WB.y0) / NAV.c);
  NAV.pass = new Int8Array(NAV.w * NAV.h).fill(-1); NAV.dist = new Uint16Array(NAV.w * NAV.h);
}
const inRegion = (cx, cy) => cx >= A.map.cx0 && cy >= A.map.cy0 && cx <= A.map.cx1 && cy <= A.map.cy1;
function loadChunk(cx, cy) {
  const k = cx + '_' + cy; if (chunks.has(k) || !inRegion(cx, cy)) return; const c = { st: 0, img: null, cls: null }; chunks.set(k, c); loading++;
  Promise.all([loadImg('assets/map/' + k + '.webp'), loadImg('assets/map/' + k + '.c.png')]).then(([img, ci]) => {
    const t = document.createElement('canvas'); t.width = t.height = CH; const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(ci, 0, 0);
    const d = g.getImageData(0, 0, CH, CH).data, cls = new Uint8Array(CH * CH); for (let i = 0; i < cls.length; i++) cls[i] = d[i * 4];
    c.img = img; c.cls = cls; c.st = 1; loading--;
  }).catch(() => { c.st = 2; loading--; });
}
/* Gabalai aplink tašką: r - spindulys gabalais; artimiausi pirmi */
function ensureChunks(x, y, r) {
  const pcx = Math.floor(x * PPU / CH), pcy = Math.floor(y * PPU / CH), list = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) list.push([pcx + dx, pcy + dy, dx * dx + dy * dy]);
  list.sort((a, b) => a[2] - b[2]); for (const [a, b] of list) if (loading < 6) loadChunk(a, b);
}
const ready = (x, y) => { const c = chunks.get(Math.floor(x * PPU / CH) + '_' + Math.floor(y * PPU / CH)); return c && c.st === 1; };
function clsAt(x, y) {
  if (x < WB.x0 + 40 || y < WB.y0 + 40 || x > WB.x1 - 40 || y > WB.y1 - 40) return 9;   // srities kraštas - atitvaras
  const px = Math.floor(x * PPU), py = Math.floor(y * PPU), cx = Math.floor(px / CH), cy = Math.floor(py / CH);
  const c = chunks.get(cx + '_' + cy); if (!c || !c.cls) return 0;
  return c.cls[(py - cy * CH) * CH + (px - cx * CH)] & 15;
}
/* Kelio asfaltas (eksporte Cls | 128, kai World Road != 0) - eismas važiuoja tik juo */
function roadAt(x, y) {
  if (x < WB.x0 + 40 || y < WB.y0 + 40 || x > WB.x1 - 40 || y > WB.y1 - 40) return false;
  const px = Math.floor(x * PPU), py = Math.floor(y * PPU), cx = Math.floor(px / CH), cy = Math.floor(py / CH);
  const c = chunks.get(cx + '_' + cy); if (!c || !c.cls) return false;
  const v = c.cls[(py - cy * CH) * CH + (px - cx * CH)]; return v === 128;
}
const solidAt = (x, y) => clsAt(x, y) >= SOLID;
const surfV = (x, y) => SURF_V[Math.min(9, clsAt(x, y))] || 1;
/* Mašinos kontūras: 8 taškai aplink (kaip prototipo solidCar), L - pusilgis, W - puspločis */
function solidCar(x, y, a, L, W) {
  const fx = Math.cos(a), fy = Math.sin(a), rx = -fy, ry = fx;
  for (const [f, s] of [[1, 0], [-1, 0], [.8, 1], [.8, -1], [-.8, 1], [-.8, -1], [0, 1], [0, -1]]) if (solidAt(x + fx * L * f + rx * W * s, y + fy * L * f + ry * W * s)) return true;
  return false;
}
/* Laisva vieta šalia (įstrigus / gimstant) */
function freeNear(x, y, maxR) {
  if (!solidAt(x, y)) return [x, y];
  for (let r = 20; r <= (maxR || 400); r += 20) for (let k = 0; k < 16; k++) { const a = k / 16 * TAU, nx = x + Math.cos(a) * r, ny = y + Math.sin(a) * r; if (!solidAt(nx, ny)) return [nx, ny]; }
  return [x, y];
}

/* ---------- Navigacija: BFS atstumų laukas nuo žaidėjo (langeliai 40 vnt.) - policija apvažiuoja kvartalus ---------- */
const NAV = { c: 40, w: 0, h: 0, pass: null, dist: null, t: 0, R: 60 };
function navPass(i, j) {
  const k = j * NAV.w + i; let p = NAV.pass[k]; if (p >= 0) return p;
  const x = WB.x0 + (i + .5) * NAV.c, y = WB.y0 + (j + .5) * NAV.c; if (!ready(x, y)) return 0;
  p = solidAt(x, y) || (solidAt(x - 14, y) && solidAt(x + 14, y)) || (solidAt(x, y - 14) && solidAt(x, y + 14)) ? 0 : 1;
  return NAV.pass[k] = p;
}
function navUpdate(px, py) {
  const pi = Math.floor((px - WB.x0) / NAV.c), pj = Math.floor((py - WB.y0) / NAV.c), R = NAV.R;
  NAV.dist.fill(65535); NAV.ci = pi; NAV.cj = pj;
  if (pi < 0 || pj < 0 || pi >= NAV.w || pj >= NAV.h) return;
  const q = new Int32Array((2 * R + 1) * (2 * R + 1)); let h = 0, t = 0; q[t++] = pj * NAV.w + pi; NAV.dist[pj * NAV.w + pi] = 0;
  while (h < t) {
    const k = q[h++], i = k % NAV.w, j = (k - i) / NAV.w, d = NAV.dist[k];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= NAV.w || nj >= NAV.h || Math.abs(ni - pi) > R || Math.abs(nj - pj) > R) continue;
      const nk = nj * NAV.w + ni; if (NAV.dist[nk] !== 65535 || !navPass(ni, nj)) continue; NAV.dist[nk] = d + 1; q[t++] = nk;
    }
  }
}
/* Kryptis į žaidėją per lauką: kaimyninis langelis su mažiausiu atstumu (8 kryptys); null - laukas nepasiekia */
function navDir(x, y) {
  const i = Math.floor((x - WB.x0) / NAV.c), j = Math.floor((y - WB.y0) / NAV.c); if (i < 0 || j < 0 || i >= NAV.w || j >= NAV.h) return null;
  const d0 = NAV.dist[j * NAV.w + i]; let best = d0, bx = 0, by = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= NAV.w || nj >= NAV.h) continue;
    if (di && dj && (NAV.dist[j * NAV.w + ni] === 65535 || NAV.dist[nj * NAV.w + i] === 65535)) continue;   // įstrižai - tik kai abu šonai laisvi
    const d = NAV.dist[nj * NAV.w + ni] + (di && dj ? .4 : 0); if (d < best) { best = d; bx = di; by = dj; }
  }
  if (best === 65535 || (!bx && !by)) return null;
  return Math.atan2(by, bx);
}
/* Tiesi matomumo linija (žingsnis 30 vnt.) */
function los(x0, y0, x1, y1) { const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 30); for (let i = 1; i < n; i++) { const t = i / n; if (solidAt(lerp(x0, x1, t), lerp(y0, y1, t))) return false; } return true; }

/* ---------- Piešimas: žemė, objektai (medžiai - virš mašinų), srities kraštas ---------- */
let camX = 0, camY = 0;   // kameros kairysis viršus žaidimo pikseliais (sveiki)
const P2 = (x, y) => [x * PPU - camX, y * PPU - camY];
const broken = new Set();   // nuvažiuoti objektai (krūmai, suolai...) - nebepiešiami šiame rune
function drawGround() {
  ctx.fillStyle = '#3B4A3A'; ctx.fillRect(0, 0, WW, WH);
  const c0 = Math.floor(camX / CH), c1 = Math.floor((camX + WW) / CH), r0 = Math.floor(camY / CH), r1 = Math.floor((camY + WH) / CH);
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    const c = chunks.get(cx + '_' + cy);
    if (c && c.img) ctx.drawImage(c.img, cx * CH - camX, cy * CH - camY);
    else if (!inRegion(cx, cy)) { ctx.fillStyle = '#2D5A8C'; ctx.fillRect(cx * CH - camX, cy * CH - camY, CH, CH); }   // už srities - jūra
    else { ctx.fillStyle = '#5A5E66'; ctx.fillRect(cx * CH - camX, cy * CH - camY, CH, CH); }
  }
  /* srities kraštas: geltonai juodas atitvaras */
  const bx0 = Math.round(WB.x0 * PPU + 18 - camX), by0 = Math.round(WB.y0 * PPU + 18 - camY), bx1 = Math.round(WB.x1 * PPU - 18 - camX), by1 = Math.round(WB.y1 * PPU - 18 - camY);
  ctx.fillStyle = '#16181D'; ctx.fillRect(bx0 - 2, by0 - 2, bx1 - bx0 + 4, 4); ctx.fillRect(bx0 - 2, by1 - 2, bx1 - bx0 + 4, 4); ctx.fillRect(bx0 - 2, by0 - 2, 4, by1 - by0 + 4); ctx.fillRect(bx1 - 2, by0 - 2, 4, by1 - by0 + 4);
  ctx.fillStyle = '#F2C230';
  for (let x = bx0 - (bx0 % 8); x < bx1; x += 8) { ctx.fillRect(x, by0 - 1, 4, 2); ctx.fillRect(x, by1 - 1, 4, 2); }
  for (let y = by0 - (by0 % 8); y < by1; y += 8) { ctx.fillRect(bx0 - 1, y, 2, 4); ctx.fillRect(bx1 - 1, y, 2, 4); }
}
function drawProps(top) {
  const c0 = Math.floor((camX - 20) / CH), c1 = Math.floor((camX + WW + 20) / CH), r0 = Math.floor((camY - 20) / CH), r1 = Math.floor((camY + WH + 20) / CH), P = A.map.props;
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    const L = A.map.obj[cx + '_' + cy]; if (!L) continue;
    for (const o of L) {
      const p = P[o[0]]; if (p[4] !== (top ? 1 : 0)) continue;
      const x = Math.round(o[1] * PPU - camX - p[2] / 2), y = Math.round(o[2] * PPU - camY - p[3] / 2);
      if (x < -24 || y < -24 || x > WW + 4 || y > WH + 4 || broken.has(o)) continue;
      ctx.drawImage(A.propSh, p[0], p[1], p[2], p[3], x + 1, y + 1, p[2], p[3]);
      ctx.drawImage(A.propImg, p[0], p[1], p[2], p[3], x, y, p[2], p[3]);
    }
  }
}
/* Žemi objektai (ne medžiai) - nuvažiuojami: dingsta su dulkėmis */
const SMASH = new Set(['bush', 'bench', 'bin', 'hydrant', 'mail', 'news', 'planter', 'stop', 'cafe', 'phone', 'bollard', 'clock', 'litter', 'trash', 'tires', 'lamp', 'cone', 'barrel', 'sign']);
function smashProps(x, y, r, sp) {
  const cx = Math.floor(x * PPU / CH), cy = Math.floor(y * PPU / CH), P = A.map.props;
  for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
    const L = A.map.obj[i + '_' + j]; if (!L) continue;
    for (const o of L) {
      if (broken.has(o)) continue; const p = P[o[0]]; if (!SMASH.has(p[5])) continue;
      if (Math.abs(o[1] - x) < r && Math.abs(o[2] - y) < r) { broken.add(o); smashFx(o[1], o[2], sp); }
    }
  }
}
