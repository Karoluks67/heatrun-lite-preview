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

/* ---------- Navigacija: Steam / prototipo policijos laukas (02e-police navBuild) - Dijkstra nuo žaidėjo, kaina pagal paviršių:
   kelias pigiausias, aikštės ir šaligatviai brangiau, žolė - dar brangiau, todėl policija renkasi gatves ir apvažiuoja kvartalus ---------- */
const NAV_C = 40, NAV_R = 1600;
const NAV = { n: 0, ox: 0, oy: 0, dist: null, cost: null, dx: null, dy: null, hk: null, hv: null, sc: null, st: null, gen: 0, t: 0 };
function rawAt(x, y) {   // Cls | 128 (kelias); už srities - kieta
  if (x < WB.x0 + 40 || y < WB.y0 + 40 || x > WB.x1 - 40 || y > WB.y1 - 40) return 9;
  const px = Math.floor(x * PPU), py = Math.floor(y * PPU), cx = Math.floor(px / CH), cy = Math.floor(py / CH);
  const c = chunks.get(cx + '_' + cy); return c && c.cls ? c.cls[(py - cy * CH) * CH + (px - cx * CH)] : 0;
}
const navCellCost = v => (v & 15) >= SOLID ? Infinity : v === 128 ? 1 : ({ 0: 1.2, 1: 2.5, 2: 2.5, 3: 2.8, 4: 1, 5: 1.25, 6: 1.3 })[v & 15] || 1.2;
const NDI = [1, -1, 0, 0, 1, 1, -1, -1], NDJ = [0, 0, 1, -1, 1, -1, 1, -1];
function navBuild(px, py) {
  const C = NAV_C, h = Math.ceil(NAV_R / C), n = 2 * h + 1, N = n * n;
  if (NAV.n !== n) Object.assign(NAV, { n, dist: new Float32Array(N), cost: new Float32Array(N), dx: new Float32Array(N), dy: new Float32Array(N), hk: new Float32Array(N * 8 + 8), hv: new Int32Array(N * 8 + 8), sc: new Uint8Array((n + 1) * (n + 1)), st: new Uint32Array(N), gen: 0 });
  const ox = Math.round(px / C) - h, oy = Math.round(py / C) - h, cost = NAV.cost, dist = NAV.dist; NAV.ox = ox; NAV.oy = oy;
  /* langelis kietas, jei kietas centras arba bet kuris kampas (±C/2) - kelias eina bent pusę langelio nuo sienų */
  const e = C / 2, m = n + 1, SC = NAV.sc;
  for (let j = 0; j < m; j++) { const y = (oy + j) * C - e; for (let i = 0; i < m; i++) SC[j * m + i] = (rawAt((ox + i) * C - e, y) & 15) >= SOLID ? 1 : 0; }
  for (let j = 0; j < n; j++) { const y = (oy + j) * C; for (let i = 0; i < n; i++) { const x = (ox + i) * C, k = j * n + i, q = j * m + i;
    cost[k] = SC[q] || SC[q + 1] || SC[q + m] || SC[q + m + 1] ? Infinity : navCellCost(rawAt(x, y)); dist[k] = Infinity; } }
  const hk = NAV.hk, hv = NAV.hv; let hn = 0;
  const push = (key, v) => { let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= key) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = key; hv[i] = v; };
  const pop = () => { const v = hv[0], last = hk[--hn], lv = hv[hn]; let i = 0;
    for (;;) { let l = 2 * i + 1; if (l >= hn) break; if (l + 1 < hn && hk[l + 1] < hk[l]) l++; if (hk[l] >= last) break; hk[i] = hk[l]; hv[i] = hv[l]; i = l; }
    hk[i] = last; hv[i] = lv; return v; };
  const s0 = h * n + h; dist[s0] = 0; push(0, s0);
  while (hn > 0) { const kd = hk[0], k = pop(); if (kd > dist[k]) continue; const i = k % n, j = (k - i) / n, c0 = cost[k] === Infinity ? 1 : cost[k];
    for (let q = 0; q < 8; q++) { const ii = i + NDI[q], jj = j + NDJ[q]; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue; const k2 = jj * n + ii, c2 = cost[k2]; if (c2 === Infinity) continue;
      if (q >= 4 && (cost[j * n + ii] === Infinity || cost[jj * n + i] === Infinity)) continue;   // įstrižai - be kampų kirpimo
      const nd = kd + (c0 + c2) * .5 * C * (q >= 4 ? 1.4142 : 1); if (nd < dist[k2]) { dist[k2] = nd; if (hn < hk.length) push(nd, k2); } } }
  NAV.gen++;
}
function navCellDir(k) {
  if (NAV.st[k] === NAV.gen) return; NAV.st[k] = NAV.gen; const n = NAV.n, dist = NAV.dist; NAV.dx[k] = 0; NAV.dy[k] = 0;
  const d0 = dist[k]; if (!(d0 < Infinity) || d0 === 0) return; const i = k % n, j = (k - i) / n; let best = d0, bi = 0, bj = 0;
  for (let q = 0; q < 8; q++) { const ii = i + NDI[q], jj = j + NDJ[q]; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue; const d2 = dist[jj * n + ii]; if (d2 < best) { best = d2; bi = NDI[q]; bj = NDJ[q]; } }
  if (bi || bj) { const L = Math.hypot(bi, bj); NAV.dx[k] = bi / L; NAV.dy[k] = bj / L; }
}
/* Kryptis į žaidėją: 4 artimiausių langelių kryptys su bilinijiniais svoriais (be zigzagų); kieti atstumia. Už lauko - null */
function navDir(x, y) {
  if (!NAV.dist) return null; const C = NAV_C, n = NAV.n, fx = x / C - NAV.ox, fy = y / C - NAV.oy, i0 = Math.floor(fx), j0 = Math.floor(fy);
  if (i0 < 0 || j0 < 0 || i0 >= n - 1 || j0 >= n - 1) return null; const tx = fx - i0, ty = fy - j0; let sx = 0, sy = 0;
  for (let q = 0; q < 4; q++) { const i = i0 + (q & 1), j = j0 + (q >> 1), k = j * n + i, w = (q & 1 ? tx : 1 - tx) * (q >> 1 ? ty : 1 - ty);
    if (NAV.cost[k] === Infinity) { sx += (fx - i) * w * 2; sy += (fy - j) * w * 2; } else { navCellDir(k); sx += NAV.dx[k] * w; sy += NAV.dy[k] * w; } }
  const L = Math.hypot(sx, sy); return L > 1e-3 ? [sx / L, sy / L] : null;
}
function navLOS(ax, ay, bx, by) { for (let t = .2; t < 1; t += .2) if (solidAt(ax + (bx - ax) * t, ay + (by - ay) * t)) return false; return true; }
function los(x0, y0, x1, y1) { const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 30); for (let i = 1; i < n; i++) { const t = i / n; if (solidAt(lerp(x0, x1, t), lerp(y0, y1, t))) return false; } return true; }
/* Kelio kryptis taške (vietoj Steam roadNear): kelio asfaltas ir ilgesnė jo ašis - {d: 0, e: true, ang} arba {d: 1e9} */
function roadNear(x, y) {
  if (!roadAt(x, y)) return { d: 1e9 };
  let rx = 0, ry = 0; for (const s of [-180, -100, 100, 180]) { rx += roadAt(x + s, y); ry += roadAt(x, y + s); }
  return rx === ry ? { d: 1e9 } : { d: 0, e: true, ang: rx > ry ? 0 : Math.PI / 2 };
}

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
  drawBorder();
}
/* Srities kraštas - Steam greitkelio atitvaras (Jersey, World.Chunk JEdge/JFace/JRidge/JRefl): betoniniai blokai tik ant pravažiuojamos
   žemės (per pastatus nepiešiama), sandūros kas 28 px, geltoni atšvaitai; už ribos miestas patamsintas */
const JC = ['#15171B', '#E2E5EA', '#F4F6F8', '#F4F6F8', '#D3D7DD', '#B5B9C0', '#33363D', 'rgba(0,0,0,.32)', 'rgba(0,0,0,.16)'];   // Jersey: kontūras, šviesus viršus, šonas, kontūras, šešėlis
function groundCls(x, y) { const px = Math.floor(x * PPU), py = Math.floor(y * PPU), cx = Math.floor(px / CH), cy = Math.floor(py / CH); const c = chunks.get(cx + '_' + cy); return c && c.cls ? c.cls[(py - cy * CH) * CH + (px - cx * CH)] & 15 : 0; }
function drawBorder() {
  const bx0 = Math.round(WB.x0 * PPU + 18 - camX), by0 = Math.round(WB.y0 * PPU + 18 - camY), bx1 = Math.round(WB.x1 * PPU - 18 - camX), by1 = Math.round(WB.y1 * PPU - 18 - camY);
  ctx.fillStyle = 'rgba(12,14,18,.4)';
  if (by0 > 2) ctx.fillRect(0, 0, WW, Math.min(WH, by0 - 2)); if (by1 < WH - 3) ctx.fillRect(0, Math.max(0, by1 + 3), WW, WH);
  const t0 = Math.max(0, by0 - 2), t1 = Math.min(WH, by1 + 3);
  if (bx0 > 2) ctx.fillRect(0, t0, Math.min(WW, bx0 - 2), t1 - t0); if (bx1 < WW - 3) ctx.fillRect(Math.max(0, bx1 + 3), t0, WW, t1 - t0);
  /* vienas kraštas: atkarpos ant pravažiuojamos žemės (ištisiniai bėgimai - po 5 stačiakampius), sandūros ir atšvaitai */
  const edge = (horiz, c0, a0, a1) => {
    const w = (u, v) => horiz ? groundCls((u + camX) / PPU, (c0 + camY) / PPU) : groundCls((c0 + camX) / PPU, (u + camY) / PPU);
    const lim = horiz ? WW : WH; let s0 = -1;
    for (let u = Math.max(a0 - 2, 0); u <= Math.min(a1 + 2, lim) + 1; u++) {
      const ok = u <= Math.min(a1 + 2, lim) && w(u) < SOLID;
      if (ok && s0 < 0) s0 = u;
      if (!ok && s0 >= 0) { const n = u - s0;
        for (let k = 0; k < JC.length; k++) { ctx.fillStyle = JC[k]; if (horiz) ctx.fillRect(s0, c0 - 3 + k, n, 1); else ctx.fillRect(c0 - 3 + k, s0, 1, n); }
        for (let q = s0; q < u; q++) { const g = q + (horiz ? camX : camY), m = ((g % 28) + 28) % 28;
          if (m === 0) { ctx.fillStyle = '#878B93'; horiz ? ctx.fillRect(q, c0 - 2, 1, 5) : ctx.fillRect(c0 - 2, q, 5, 1); }
          else if (m === 14) { ctx.fillStyle = '#FFC233'; horiz ? ctx.fillRect(q, c0 + 1, 2, 1) : ctx.fillRect(c0 + 1, q, 1, 2); } }
        s0 = -1; }
    }
  };
  if (by0 > -3 && by0 < WH + 3) edge(true, by0, bx0, bx1); if (by1 > -3 && by1 < WH + 3) edge(true, by1, bx0, bx1);
  if (bx0 > -3 && bx0 < WW + 3) edge(false, bx0, by0, by1); if (bx1 > -3 && bx1 < WW + 3) edge(false, bx1, by0, by1);
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
/* Objektų laužymas (Steam PROP_T): mašina prasimuša pro medį, žibintą, suolą... - objektas lūžta, lekia skeveldros, mašina sulėtėja */
function smashProps(b, isPl) {
  const sp = Math.hypot(b.vx, b.vy); if (sp < 60) return;
  const x = b.x + Math.cos(b.a) * (b.len || 52) * .35, y = b.y + Math.sin(b.a) * (b.len || 52) * .35;
  const cx = Math.floor(x * PPU / CH), cy = Math.floor(y * PPU / CH), P = A.map.props;
  for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
    const L = A.map.obj[i + '_' + j]; if (!L) continue;
    for (const o of L) {
      if (broken.has(o)) continue; const nm = P[o[0]][5], pt = PROP_T[PROP_ALIAS[nm] || nm]; if (!pt) continue;
      const R = pt.r + (b.wid || 24) * .6; if ((o[1] - x) ** 2 + (o[2] - y) ** 2 > R * R) continue;
      broken.add(o); smashFx(o[1], o[2], pt, b, isPl);
      b.vx *= pt.slow; b.vy *= pt.slow;
    }
  }
}
