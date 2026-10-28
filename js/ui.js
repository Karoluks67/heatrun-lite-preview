/* ui: pasaulio ir objektų piešimas, HUD, kortelės, pauzė, atgaivinimas, rezultatai, garažas, pagrindinis ciklas */
'use strict';
/* Sklandi kamera: seka mašiną su lengvu vėlavimu, poslinkis į priekį pagal išlygintą greitį - smūgis nebeperstumia vaizdo */
const CAM = { x: 0, y: 0, vx: 0, vy: 0, init: false, t: 0 };
function camStep(dt) {
  if (!CAM.init) { CAM.vx = pl.vx; CAM.vy = pl.vy; CAM.x = pl.x + pl.vx * .22; CAM.y = pl.y + pl.vy * .22; CAM.init = true; }
  const kv = 1 - Math.exp(-3 * dt), kp = 1 - Math.exp(-9 * dt);
  CAM.vx += (pl.vx - CAM.vx) * kv; CAM.vy += (pl.vy - CAM.vy) * kv;
  CAM.x += (pl.x + CAM.vx * .22 - CAM.x) * kp; CAM.y += (pl.y + CAM.vy * .22 - CAM.y) * kp; CAM.t = performance.now();
}
let CAM_OV = null, state = 'boot', garageSel = 0, resT = 0, doubled = false, toast = null;
const COL = { panel: '#1E2128', panel2: '#2A2E37', edge: '#3E434F', acc: '#FF8A2A', acc2: '#F2C230', txt: '#F4F1E8', dim: '#9AA0AC', red: '#FF4F4F', ad: '#3F7CFF' };

/* ---------- Pasaulis ---------- */
function drawWorld(t) {
  if (performance.now() - CAM.t > 250) CAM.init = false;   // įrankiai (be ciklo) - kamera iškart prie mašinos
  if (!CAM.init) camStep(0);
  const lx = CAM_OV ? CAM_OV[0] : CAM.x, ly = CAM_OV ? CAM_OV[1] : CAM.y;   // CAM_OV - miniatiūrų kadravimas (tools/thumb.js)
  const sk = shake > 0 ? shake * 8 : 0;   // drebėjimas - sklandi banga, ne atsitiktiniai šuoliai kas kadrą
  camX = Math.round(lx * PPU - WW / 2 + Math.sin(gt * 53) * sk); camY = Math.round(ly * PPU - WH / 2 + Math.cos(gt * 41) * sk);
  drawGround(); drawScorch(); drawProps(false);
  for (const h of haz) { const [x, y] = P2(h.x, h.y);
    if (h.k === 'mine') spr(h.arm > 0 || Math.floor(t * 4) % 2 ? 'haz_mine_0' : 'haz_mine_1', x, y);
    else if (h.k === 'spike') { ctx.fillStyle = '#3A3E46'; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5); ctx.fillStyle = '#C8CDD6'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); }
    else if (h.k === 'pspike') { const ca = Math.cos(h.a), sa = Math.sin(h.a); for (let d = -h.len / 2; d <= h.len / 2; d += 15) spr(Math.floor(t * 6) % 2 ? 'haz_pspike_0' : 'haz_pspike_1', x + ca * d * PPU, y + sa * d * PPU); }
    else if (h.k === 'ebul') sprRot('prj_ebul_red', x, y, h.a);
    else if (h.k === 'bomb') { const r = Math.round(h.r * PPU), k = 1 - h.t / h.max; ringPx(x, y, r, '#FF4F4F'); ctx.fillStyle = 'rgba(255,79,79,.28)'; circlePx(x, y, Math.round(r * k)); } }
  for (const g of gems) { const [x, y] = P2(g.x, g.y); if (x < -10 || y < -10 || x > WW + 10 || y > WH + 10) continue;
    if (g.k === 'xp') spr(g.v >= 10 ? 'xp_2' : g.v >= 3 ? 'xp_1' : 'xp_0', x, y - (Math.floor(t * 3 + g.x) % 2));
    else spr(g.k === 'coin' ? 'cash_' + (Math.floor(t * 8 + g.y) % 4) : g.k === 'heal' ? 'pick_heal' : 'pick_magnet', x, y); }
  drawFx(true); drawCivs();   // po mašinomis: nitro liepsna, padangų dūmai
  for (const c of cops) if (c.ab === 'emp' && c.empW && !c.dead) { const [x, y] = P2(c.x, c.y), k = 1 - clamp(c.abT, 0, 1); ringPx(x, y, Math.round(450 * PPU * k), Math.floor(t * 12) % 2 ? '#6FE7FF' : '#FFFFFF'); }   // EMP įspėjimas
  /* mašinos: šešėlis, kėbulas, blyksnis; policijos švyturėliai */
  for (const c of cops) { if (c.boss === 'heli' || c.gone) continue; const [x, y] = P2(c.x, c.y); if (x < -40 || y < -40 || x > WW + 40 || y > WH + 40) continue;
    if (c.boss === 'tank') { sprRot('tank_hull_sh', x + 2, y + 2, c.a); sprRot('tank_hull_' + (Math.floor(t * 8) % 3), x, y, c.a); sprRot('tank_turret_sh', x + 2, y + 2, Math.atan2(pl.y - c.y, pl.x - c.x)); sprRot('tank_turret', x, y, Math.atan2(pl.y - c.y, pl.x - c.x)); }
    else { sprRot(c.spr + '_sh', x + 2, y + 2, c.a); sprRot(c.spr + '_spr', x, y, c.a, c.dead ? 'd' : 0);
      if (c.flash > 0) { ctx.globalAlpha = .8; sprRot(c.spr + '_spr', x, y, c.a, 'w'); ctx.globalAlpha = 1; }
      if (!c.dead) { const on = Math.floor((t + c.sirT) * 6) % 2, fx = Math.cos(c.a), fy = Math.sin(c.a);
        ctx.fillStyle = on ? '#FF3B3B' : '#3F8CFF'; ctx.fillRect(Math.round(x - fy * 3 - fx * 2), Math.round(y + fx * 3 - fy * 2), 2, 2);
        ctx.fillStyle = on ? '#3F8CFF' : '#FF3B3B'; ctx.fillRect(Math.round(x + fy * 3 - fx * 2) - 1, Math.round(y - fx * 3 - fy * 2) - 1, 2, 2); } } }
  if (!G.over || G.over < .05) { const [x, y] = P2(pl.x, pl.y);
    if (pl.inv <= 0 || Math.floor(t * 20) % 2 || !G.started) { sprRot(pl.sh, x + 2, y + 2, pl.a); sprRot(pl.spr, x, y, pl.a); if (G.hurtT > 0) { ctx.globalAlpha = .7; sprRot(pl.spr, x, y, pl.a, 'w'); ctx.globalAlpha = 1; } } }
  else { const [x, y] = P2(pl.x, pl.y); sprRot(pl.spr, x, y, pl.a + G.over * 3, 'k'); }
  /* ginklai */
  if (G.w.orbit && !G.over) { const n = wv('orbit', 'amt', G.w.orbit) + amtAdd(), R = wv('orbit', 'area', G.w.orbit) * areaMul();
    for (let i = 0; i < n; i++) { const a = G.orbA + i / n * TAU, [x, y] = P2(pl.x + Math.cos(a) * R, pl.y + Math.sin(a) * R); spr(Math.floor(t * 10) % 2 ? 'wpn_orbit_00' : 'wpn_orbit_01', x, y); } }
  for (const p of proj) { const [x, y] = P2(p.x, p.y);
    if (p.k === 'lbolt') {   // Steam LaserBolt: švytėjimas, rožinis kūnas, balta šerdis, pėdsakas, balta galvutė
      const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp, len = 12 + Math.min(7, p.lv || 1) * 2, tx = x - ux * len, ty = y - uy * len;
      ctx.globalAlpha = .28; linePx(x + ux, y + uy, tx, ty, '#FF4FB8', 4); ctx.globalAlpha = 1;
      linePx(x, y, x - ux * len * .85, y - uy * len * .85, '#FF4FB8', 2); linePx(x, y, x - ux * len * .55, y - uy * len * .55, '#FFE0F4', 1);
      for (let i = 1; i <= 4; i++) { ctx.globalAlpha = .55 - i * .12; ctx.fillStyle = i < 3 ? '#FF7AD0' : '#FF4FB8'; ctx.fillRect(Math.round(tx - ux * i * 2), Math.round(ty - uy * i * 2), 1, 1); }
      ctx.globalAlpha = 1; ctx.fillStyle = '#FFFFFF'; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); ctx.fillRect(Math.round(x - ux), Math.round(y - uy), 1, 1);
    }
    else if (p.k === 'rkt') { ctx.fillStyle = '#E8EAEE'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); ctx.fillStyle = '#FF7A3A'; ctx.fillRect(Math.round(x - Math.cos(p.a) * 2), Math.round(y - Math.sin(p.a) * 2), 2, 2); }
    else { const [bx, by] = P2(p.x - p.vx * .02, p.y - p.vy * .02); linePx(bx, by, x, y, p.col, 1); ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); } }
  for (const z of zaps) { const [x0, y0] = P2(z.x0, z.y0), [x1, y1] = P2(z.x1, z.y1); let px = x0, py = y0; for (let i = 1; i <= 5; i++) { const nx = lerp(x0, x1, i / 5) + (i < 5 ? rnd(-4, 4) : 0), ny = lerp(y0, y1, i / 5) + (i < 5 ? rnd(-4, 4) : 0); linePx(px, py, nx, ny, '#7FE8FF', 2); linePx(px, py, nx, ny, '#FFFFFF', 1); px = nx; py = ny; } }
  drawFx(false); drawProps(true);
  for (const c of cops) { if (c.boss !== 'heli') continue; const [x, y] = P2(c.x, c.y);   // sraigtasparnis - virš medžių
    ctx.globalAlpha = .35; sprRot('heli_body_sh', x + 10, y + 14, c.a); ctx.globalAlpha = 1; sprRot('heli_body_' + (Math.floor(t * 6) % 2), x, y, c.a, c.dead ? 'd' : 0);
    if (c.flash > 0) { ctx.globalAlpha = .8; sprRot('heli_body_0', x, y, c.a, 'w'); ctx.globalAlpha = 1; }
    sprRot('heli_rotor_' + (Math.floor(t * 18) % 3), x, y, c.a); }
  for (const n of nums) { const [x, y] = P2(n.x, n.y); text(n.v, x, y, 1, n.v >= 50 ? COL.acc2 : '#fff', .5); }
}
function drawFx(under) {
  for (const p of ps) { if (!!p.u !== !!under) continue; const [x, y] = P2(p.x, p.y), k = p.life / p.max;
    if (p.k === 'puff') { const s = Math.round(p.r * (1 + (1 - k) * 1.6)); ctx.globalAlpha = k * .5; ctx.fillStyle = p.c1; ctx.fillRect(Math.floor(x) - (s >> 1), Math.floor(y) - (s >> 1), s, s); ctx.globalAlpha = 1; }   // Steam dūmai: kvadratėlis plečiasi ir blėsta
    else if (p.k === 'nf') { const q = 1 - k, s = q < .25 ? 3 : q < .6 ? 2 : 1; ctx.fillStyle = q < .2 ? '#FFFFFF' : q < .45 ? '#BFF3FF' : q < .75 ? '#5AB8FF' : '#3D6BFF'; ctx.fillRect(Math.round(x) - (s >> 1), Math.round(y) - (s >> 1), s, s); }   // nitro: balta -> žydra -> mėlyna
    else if (p.k === 'sq') { ctx.fillStyle = p.c; ctx.fillRect(Math.round(x), Math.round(y), p.s, p.s); }
    else if (p.k === 'ring') { const q = 1 - k, e = 1 - k * k, r = Math.round(p.r * PPU * (.15 + .85 * e)); ctx.globalAlpha = 1 - q * q; ringPx(x, y, r, q < .3 ? '#FFF3B0' : '#FFB040'); if (q < .6) ringPx(x, y, r - 1, '#FF8A2A'); ctx.globalAlpha = 1; }
    else if (p.k === 'fire') { const q = 1 - k, s = Math.max(1, Math.round(p.s * (k + .4))); ctx.globalAlpha = Math.min(1, k * 1.6); ctx.fillStyle = q < .2 ? '#FFF3B0' : q < .45 ? '#FFD23F' : q < .7 ? '#FF8A2A' : '#8A8A90'; ctx.fillRect(Math.floor(x), Math.floor(y), s, s); ctx.globalAlpha = 1; }
    else if (p.k === 'flash') { const r = Math.max(1, Math.round(p.r * k)), cx = Math.round(x), cy = Math.round(y); ctx.fillStyle = '#FFE66B'; ctx.fillRect(cx - r, cy, 2 * r + 1, 1); ctx.fillRect(cx, cy - r, 1, 2 * r + 1); ctx.fillStyle = '#FFFFFF'; circlePx(cx, cy, Math.max(1, Math.round(r * .55))); }   // Steam „hit" žvaigždė
    else if (p.k === 'deb') { ctx.globalAlpha = Math.min(1, k * 3); sprRot(p.n, x, y, p.a); ctx.globalAlpha = 1; }
    else if (p.k === 'star') { ctx.fillStyle = Math.floor(p.life * 20) % 2 ? '#FFF3B0' : '#FFD23F'; ctx.fillRect(Math.round(x) - 1, Math.round(y), 3, 1); ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 3); } }
}
/* Apdegusi dėmė (Steam ScorchEv): netaisyklinga tamsi pikselių dėmė, blėsta per 9 s */
function drawScorch() {
  for (const q of scorch) {
    const [cx, cy] = P2(q.x, q.y), r = Math.max(3, Math.round(q.r * PPU)); if (cx < -r || cy < -r || cx > WW + r || cy > WH + r) continue;
    if (!q.img) {   // forma piešiama vieną kartą
      const c = document.createElement('canvas'); c.width = c.height = r * 2 + 1; const g = c.getContext('2d'); g.fillStyle = '#1A1714';
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = (x * x + y * y) / (r * r), h = ((x * 73856093) ^ (y * 19349663) ^ q.seed) >>> 0; if (d < .45 || d < 1 && (h % 100) < (1 - d) * 120) g.fillRect(x + r, y + r, 1, 1); }
      q.img = c;
    }
    ctx.globalAlpha = Math.min(1, q.t / 3, (9 - q.t) / .6) * .38; ctx.drawImage(q.img, Math.round(cx) - r, Math.round(cy) - r); ctx.globalAlpha = 1;
  }
}
/* Pikselių primityvai be glotninimo (kraštai ant tinklelio) */
function circlePx(cx, cy, r) { cx = Math.round(cx); cy = Math.round(cy); for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y + r * .8)); ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1); } }
function ringPx(cx, cy, r, col) { ctx.fillStyle = col; cx = Math.round(cx); cy = Math.round(cy); const n = Math.max(12, r * 6); for (let i = 0; i < n; i++) { const a = i / n * TAU; ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1); } }
function linePx(x0, y0, x1, y1, col, w) { ctx.fillStyle = col; const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))), o = Math.floor(w / 2); for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(lerp(x0, x1, i / n)) - o, Math.round(lerp(y0, y1, i / n)) - o, w, w); }

/* ---------- UI primityvai (480×270 dėžė) ---------- */
function panel(x, y, w, h, c, e) { x += UIX; y += UIY; ctx.fillStyle = '#0E1014'; ctx.fillRect(x + 2, y + 2, w, h); ctx.fillStyle = e || COL.edge; ctx.fillRect(x, y, w, h); ctx.fillStyle = c || COL.panel; ctx.fillRect(x + 1, y + 1, w - 2, h - 2); }
function T(s, x, y, sc, col, al, sh) { text(s, x + UIX, y + UIY, sc, col, al, sh); }
function icon(name, x, y, s) { sprAt('ic_' + name, x + UIX, y + UIY, s); }
function btn(x, y, w, h, label, col, fn, opt) {
  opt = opt || {}; label = String(label); const hv = hover && hover.x === x + UIX && hover.y === y + UIY, dis = opt.dis;
  panel(x, y, w, h, dis ? '#3A3E46' : hv ? lighten(col) : col, dis ? '#2A2D34' : '#0E1014');
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + UIX + 1, y + UIY + 1, w - 2, 2);
  const iw = opt.clap ? 34 : opt.coin ? 14 : 0, sc = fitSc(label, w - 12 - iw, opt.sc || 2), x0 = x + Math.round((w - iw - textW(label, sc)) / 2);   // ikona + tekstas - viena centruota grupė
  let tx = x0 + iw + textW(label, sc) / 2; if (opt.clap) clapper(x0, y + h / 2 - 12, 2); if (opt.coin) coinIc(x0, y + h / 2 - 5);
  T(label, tx, y + h / 2 - sc * 3.5, sc, dis ? '#7A808C' : opt.tc || '#fff', .5);
  if (!dis) button(x, y, w, h, fn);
}
const lighten = c => ({ [COL.acc]: '#FFA24D', [COL.ad]: '#5B92FF', [COL.panel2]: '#363B46', '#3A6F3F': '#4A8450' })[c] || c;
/* Filmo klaketė (Poki rewarded reikalavimas: ne žalias mygtukas su klakete) - 14×12 piešiama kodu */
function clapper(x, y, s) {
  s = s || 1; x += UIX; y += UIY; const R = (a, b, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x + a * s, y + b * s, w * s, h * s); };
  R(0, 4, 14, 9, '#16181D'); R(1, 5, 12, 7, '#F4F1E8'); R(0, 0, 14, 4, '#16181D'); for (let i = 0; i < 3; i++) R(1 + i * 5, 1, 3, 2, '#F4F1E8'); R(3, 7, 8, 1, '#16181D'); R(3, 9, 6, 1, '#16181D');
}
/* Spyna (užrakinta mašina): 24×26, piešiama kodu */
function padlock(x, y) {
  const R = (a, b, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(UIX + x + a, UIY + y + b, w, h); };
  R(4, 0, 16, 4, '#16181D'); R(2, 2, 4, 12, '#16181D'); R(18, 2, 4, 12, '#16181D'); R(6, 2, 12, 2, '#C9D0D8'); R(4, 4, 2, 9, '#C9D0D8'); R(18, 4, 2, 9, '#C9D0D8');
  R(0, 11, 24, 15, '#16181D'); R(2, 13, 20, 11, '#F2C230'); R(2, 13, 20, 2, '#FFE680'); R(10, 16, 4, 6, '#16181D'); R(11, 21, 2, 2, '#8A5A10');
}
function coinIc(x, y) { x += UIX; y += UIY; ctx.fillStyle = '#8A5A10'; ctx.fillRect(x + 1, y, 8, 10); ctx.fillRect(x, y + 1, 10, 8); ctx.fillStyle = '#F2C230'; ctx.fillRect(x + 1, y + 1, 8, 8); ctx.fillStyle = '#FFE680'; ctx.fillRect(x + 2, y + 2, 2, 5); ctx.fillStyle = '#C8901A'; ctx.fillRect(x + 4, y + 3, 2, 4); }
function bar(x, y, w, h, k, col, bg) { x += UIX; y += UIY; ctx.fillStyle = '#0E1014'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2); ctx.fillStyle = bg || '#3A3E46'; ctx.fillRect(x, y, w, h); ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(w * clamp(k, 0, 1)), h); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x, y, Math.round(w * clamp(k, 0, 1)), 1); }
function dim(a) { ctx.fillStyle = `rgba(10,12,16,${a})`; ctx.fillRect(0, 0, LW, LH); }
function wIcon(w) { return w; }   // ginklų piktogramų vardai sutampa su id

/* ---------- HUD: prie ekrano kraštų (UI drobės koordinatės be dėžės poslinkio) ---------- */
const NB = () => [LW - 46, LH - 46];   // nitro mygtuko centras
const tbEnabled = () => (state === 'play' || state === 'ready') && G && !G.cards && !G.over;
const onNitroBtn = (px, py) => { if (touchUI || state !== 'play' || !G || !G.started || G.cards) return false; const [x, y] = NB(); return Math.hypot(px - x, py - y) < 34; };
function drawHud(t) {
  const sx = UIX, sy = UIY; UIX = 0; UIY = 0;
  /* XP juosta per visą viršų, lygis */
  ctx.fillStyle = '#0E1014'; ctx.fillRect(0, 0, LW, 6); ctx.fillStyle = '#3FA2FF'; ctx.fillRect(0, 0, Math.round(LW * G.xp / G.need), 5); ctx.fillStyle = '#9FD3FF'; ctx.fillRect(0, 0, Math.round(LW * G.xp / G.need), 1);
  T(L('lv') + ' ' + G.lvl, 8, 12, 2, '#9FD3FF');
  /* gyvybė */
  bar(8, 30, 120, 9, pl.hp / pl.max, pl.hp / pl.max < .3 ? (Math.floor(t * 6) % 2 ? COL.red : '#FF9A9A') : '#5BD15B', '#5A2A2A');
  T(Math.ceil(pl.hp), 134, 31, 1, '#fff');
  /* ginklai ir pasyvai */
  let ix = 8; for (const w in G.w) { panel(ix, 44, 20, 20, '#1A1D23'); icon(w, ix + 2, 46, .5); T(G.w[w], ix + 21, 56, 1, COL.acc2); ix += 30; }
  ix = 8; for (const k in G.tl) { panel(ix, 68, 20, 20, '#1A1D23'); icon(TOME[k].ic, ix + 2, 70, .5); T(G.tl[k], ix + 21, 80, 1, '#9FD3FF'); ix += 30; }
  /* laikas, monetos, pauzė */
  T(fmtTime(G.t), LW / 2, 12, 3, '#fff', .5);
  coinIc(LW - 100, 14); T(G.coins, LW - 86, 14, 2, COL.acc2);
  btn(LW - 34, 10, 26, 24, 'II', COL.panel2, () => pauseGame(), { sc: 1 });
  /* bosas */
  const b = cops.find(c => c.boss && !c.dead);
  if (b) { T(b.boss === 'heli' ? L('chopper') : L('tank'), LW / 2, 38, 1, COL.red, .5); bar(LW / 2 - 90, 48, 180, 6, b.hp / b.max, COL.red); offArrow(b, t); }
  if (G.banner) { const k = G.banner.t / G.banner.max, y = LH * .3 - (1 - Math.min(1, (1 - k) * 8)) * 20; T(G.banner.s, LW / 2, y, fitSc(G.banner.s, LW - 16, 3), G.banner.col, .5); }
  if (touchUI) drawTouch(t);
  else {   /* nitro mygtukas (pelė / klaviatūra) */
    const [nx, ny] = NB(), full = pl.nitro, R = 28;
    const dk = pl.dry ? .5 + .5 * Math.sin(t * 6) : 0;   // tuščias: sklandus raudonas pulsavimas
    ctx.fillStyle = '#0E1014'; circlePx(nx + 1, ny + 2, R + 1); ctx.fillStyle = pl.boost ? '#5AB8FF' : '#2A2E37'; circlePx(nx, ny, R);
    if (dk > 0) { ctx.fillStyle = `rgba(200,40,40,${(.15 + dk * .4).toFixed(2)})`; circlePx(nx, ny, R); }
    ctx.fillStyle = pl.boost ? '#8FD0FF' : '#1A4E8C'; for (let y = -R + 1; y <= R - 1; y++) { if ((R - y) / (2 * R) > full) continue; const w = Math.floor(Math.sqrt(R * R - y * y)); ctx.fillRect(nx - w, ny + y, w * 2 + 1, 1); }
    ringPx(nx, ny, R, pl.dry ? `rgb(255,${Math.round(70 + 60 * (1 - dk))},${Math.round(70 + 60 * (1 - dk))})` : full > .98 ? `rgb(${Math.round(90 + 165 * (.5 + .5 * Math.sin(t * 5)))},${Math.round(184 + 71 * (.5 + .5 * Math.sin(t * 5)))},255)` : '#5AB8FF');   // pilnas - sklandžiai švyti baltai
    icon('nitro', nx - 16, ny - 17, 1); T('SHIFT', nx, ny + R + 4, 1, COL.dim, .5);
    if (G.tut && !G.nitroUsed && pl.nitro > .97 && G.t > 6) { const b = Math.abs(Math.sin(t * 5)) * 6; hand(nx - 30 + b, ny - 34 + b); ringPx(nx, ny, R + 4 + Math.floor(t * 8) % 4, '#FFFFFF'); }
  }
  /* vairasvirtė */
  if (stick.on) { ringPx(stick.ox, stick.oy, 26, 'rgba(255,255,255,.6)'); ctx.fillStyle = 'rgba(255,255,255,.55)'; circlePx(stick.ox + stick.dx * 26, stick.oy + stick.dy * 26, 9); }
  UIX = sx; UIY = sy;
}
/* Lietimo mygtukai: ◀ ▶ kairėje, stabdis ir dujos dešinėje, nitro virš dujų (su pildymo juosta). UI koordinatės be dėžės poslinkio */
function drawTouch(t) {
  const L = tbLayout(), arrow = (x, y, w, h, dir, col) => { ctx.fillStyle = col; const cx = x + w / 2, cy = y + h / 2;
    for (let i = 0; i < 14; i++) { const hw = Math.round(i * .9); if (dir === 'l') ctx.fillRect(cx - 7 + i, cy - hw, 2, hw * 2 + 1); else if (dir === 'r') ctx.fillRect(cx + 7 - i, cy - hw, 2, hw * 2 + 1); else if (dir === 'u') ctx.fillRect(cx - hw, cy - 9 + i, hw * 2 + 1, 2); else ctx.fillRect(cx - hw, cy + 9 - i, hw * 2 + 1, 2); } };
  const pad = (k, col, colOn) => { const [x, y, w, h] = L[k], on = tb[k]; ctx.globalAlpha = on ? .95 : .7; panel(x, y + (on ? 2 : 0), w, h, on ? colOn : col, '#0E1014'); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + 1, y + (on ? 3 : 1), w - 2, 2); ctx.globalAlpha = 1; return [x, y + (on ? 2 : 0), w, h]; };
  let r = pad('left', '#2A2E37', '#4A5060'); arrow(r[0], r[1], r[2], r[3], 'l', '#F4F1E8');
  r = pad('right', '#2A2E37', '#4A5060'); arrow(r[0], r[1], r[2], r[3], 'r', '#F4F1E8');
  r = pad('brake', '#5A2A2A', '#8A3A3A'); arrow(r[0], r[1], r[2], r[3], 'd', '#FFB0A0');
  r = pad('gas', '#7A3E10', COL.acc); arrow(r[0], r[1], r[2], r[3], 'u', '#FFF3B0');
  r = pad('nitro', pl.boost ? '#3A7AC0' : '#1A2E4A', '#5AB8FF');
  if (pl.dry) { ctx.fillStyle = `rgba(200,40,40,${(.2 + .4 * (.5 + .5 * Math.sin(t * 6))).toFixed(2)})`; ctx.fillRect(r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2); }   // tuščias - raudonas pulsavimas
  ctx.fillStyle = '#5AB8FF'; ctx.fillRect(r[0] + 4, r[1] + r[3] - 7, Math.round((r[2] - 8) * pl.nitro), 4); icon('nitro', r[0] + r[2] / 2 - 16, r[1] + 6, 1);
  if (G.tut && !G.nitroUsed && pl.nitro > .97 && G.t > 6) { const b = Math.abs(Math.sin(t * 5)) * 6; hand(L.nitro[0] - 10 + b, L.nitro[1] + 20 + b); }
}
function offArrow(c, t) {   // rodyklė į bosą už ekrano (pasaulio px -> UI px)
  let [x, y] = P2(c.x, c.y); if (x > 10 && y > 10 && x < WW - 10 && y < WH - 10) return; x *= KW / K; y *= KW / K;
  const a = Math.atan2(y - LH / 2, x - LW / 2), r = Math.min(LW, LH) / 2 - 20, ax = LW / 2 + Math.cos(a) * r, ay = LH / 2 + Math.sin(a) * r;
  ctx.fillStyle = Math.floor(t * 4) % 2 ? COL.red : '#fff'; for (let i = 0; i < 6; i++) { const w = 6 - i; ctx.fillRect(Math.round(ax + Math.cos(a) * i - w / 2 * Math.abs(Math.sin(a))), Math.round(ay + Math.sin(a) * i - w / 2 * Math.abs(Math.cos(a))), Math.max(1, Math.round(w * Math.abs(Math.sin(a)))) || 1, Math.max(1, Math.round(w * Math.abs(Math.cos(a)))) || 1); }
}
/* Pirmas kadras: mašina stovi, pirštas rodo tempimą (pamoka vaizdu, ne tekstu) */
function drawReady(t) {
  const k = (t * .8) % 1, cx = 240, cy = 190, hx = cx - 30 + k * 60;
  ctx.fillStyle = 'rgba(255,255,255,.25)'; for (let i = 0; i < 60; i += 4) ctx.fillRect(UIX + cx - 30 + i, UIY + cy, 2, 1);
  if (touchUI) { const g = tbLayout().gas, b = Math.abs(Math.sin(t * 5)) * 6, sx = UIX, sy = UIY; UIX = UIY = 0; drawTouch(t); hand(g[0] + 30 + b, g[1] + 40 + b); UIX = sx; UIY = sy; }   // pirštas spaudžia dujas
  else hand(hx, cy - 4);
  T(touchUI ? L('drag') : L('keys'), 240, 216, fitSc(touchUI ? L('drag') : L('keys'), 470, 2), '#fff', .5);
  T(L('escape'), 240, 236, 1, COL.acc2, .5);
}
function hand(x, y) {   // 11×14 pirštas
  x = Math.round(x + UIX); y = Math.round(y + UIY); const R = ['....##.....', '...#ww#....', '...#ww#....', '...#ww####.', '...#ww#ww##', '.###ww#ww#w#', '#ww#wwwwwww#', '#wwwwwwwwww#', '.#wwwwwwwww#', '..#wwwwwww#.', '..#wwwwwww#.', '...#######..'];
  R.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') { ctx.fillStyle = r[i] === '#' ? '#16181D' : '#F4F1E8'; ctx.fillRect(x + i, y + j, 1, 1); } });
}

/* ---------- Kortelės ---------- */
function drawCards(t) {
  dim(.55); T(L('levelup'), 240, 34, fitSc(L('levelup'), 470, 3), COL.acc2, .5);
  G.cards.forEach((c, i) => {
    const x = 36 + i * 142, y = 64, w = 128, h = 150, nm = c.t === 'w' ? L('w_' + c.k) : c.t === 'p' ? L('t_' + c.k) : c.t === 'h' ? L('repair') : L('coins');
    const isNew = c.lv === 1 && (c.t === 'w' || c.t === 'p'), ec = c.t === 'w' ? COL.acc : c.t === 'p' ? '#3FA2FF' : '#5BD15B';
    const hv = hover && hover.x === x + UIX && hover.y === y + UIY;
    panel(x, y - (hv ? 3 : 0), w, h, hv ? '#2E333D' : COL.panel, ec);
    const yy = y - (hv ? 3 : 0);
    ctx.fillStyle = ec; ctx.fillRect(x + UIX + 1, yy + UIY + 1, w - 2, 4);
    if (c.t === 'w' || c.t === 'p') icon(c.t === 'w' ? c.k : TOME[c.k].ic, x + w / 2 - 32, yy + 16, 2); else if (c.t === 'h') sprAt('pick_heal', x + UIX + w / 2 - 22, yy + UIY + 26, 4); else { coinIc(x + w / 2 - 5 - 20, yy + 40); T('+10', x + w / 2 + 8, yy + 41, 2, COL.acc2, .5); }
    T(nm, x + w / 2, yy + 90, fitSc(nm, w - 8, 2), '#fff', .5);
    if (isNew) T(L('new'), x + w / 2, yy + 108, fitSc(L('new'), w - 8, 2), COL.acc2, .5);
    else if (c.lv) { const mx = c.t === 'w' ? W_MAX : TOME[c.k].max || T_MAX; for (let p = 0; p < mx; p++) { ctx.fillStyle = p < c.lv ? ec : '#3A3E46'; ctx.fillRect(x + UIX + w / 2 - mx * 5 + p * 10, yy + UIY + 110, 8, 6); } }
    T(i + 1, x + w / 2, yy + 132, 1, COL.dim, .5);
    button(x, y, w, h, () => takeCard(c));
  });
  if (G.tut && !G.cardTut) { const b = Math.abs(Math.sin(t * 5)) * 6; hand(234 + b, 150 + b); }   // pirmos kortelės - pirštas rodo „spausk"
}

/* ---------- Pauzė, atgaivinimas, rezultatai ---------- */
function pauseGame() { if (state !== 'play' || !G.started) return; state = 'pause'; Poki.stop(); engine(0, false); }
function resumeGame() { state = 'play'; Poki.start(); }
function onBlur() { if (state === 'play' && G && G.started && !G.cards) pauseGame(); }
const DRIVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyN'];
function onKey(k) {
  if (state === 'ready' && G && DRIVE_KEYS.includes(k)) { G.started = true; state = 'play'; Poki.start(); return; }   // net trumpas paspaudimas paleidžia runą
  if (state === 'play' && (k === 'Escape' || k === 'KeyP')) { if (G.cards) return; pauseGame(); return; }
  if (state === 'pause' && (k === 'Escape' || k === 'KeyP')) { resumeGame(); return; }
  if (state === 'play' && G.cards && ['Digit1', 'Digit2', 'Digit3'].includes(k)) { takeCard(G.cards[+k[5] - 1]); return; }
  if (k === 'KeyM') { muted = !muted; save.muted = muted; persist(); setVol(); }
  if (k === 'Enter') { if (state === 'garage') startRun(); else if (state === 'results') toGarage(); else if (state === 'revive') toResults(); }
}
function drawPause() {
  dim(.6); T(L('paused'), 240, 50, fitSc(L('paused'), 470, 3), '#fff', .5);
  btn(170, 84, 140, 34, L('resume'), COL.acc, resumeGame);
  btn(170, 126, 140, 28, muted ? L('soundOff') : L('soundOn'), COL.panel2, () => { muted = !muted; save.muted = muted; persist(); setVol(); }, { sc: 1 });
  btn(170, 162, 140, 28, L('lang'), COL.panel2, langNext, { sc: 1 });
  btn(170, 198, 140, 28, L('endRun'), COL.panel2, () => { state = 'results'; finishRun(); }, { sc: 1 });
}
function drawRevive() {
  dim(.6); T(L('wrecked'), 240, 50, fitSc(L('wrecked'), 470, 3), COL.red, .5); T(L('keepDriving'), 240, 84, fitSc(L('keepDriving'), 470, 2), '#fff', .5);
  btn(70, 120, 165, 40, L('revive'), COL.ad, () => { Poki.rewarded().then(ok => { if (ok) { revive(); state = 'play'; Poki.start(); } else toResults(); }); }, { clap: true });
  btn(245, 120, 165, 40, L('noThanks'), COL.panel2, toResults);
}
function toResults() { state = 'results'; finishRun(); }
let lastRun = null;
function finishRun() {
  Poki.stop(); engine(0, false);
  const bonus = Math.floor(G.t / 5), total = G.coins + bonus;
  lastRun = { t: G.t, kills: G.kills, coins: G.coins, bonus, total, best: G.t > save.best };
  save.coins += total; save.best = Math.max(save.best, G.t); save.runs++; persist(); doubled = false; resT = 0;
}
function drawResults() {
  dim(.7); const r = lastRun; T(r.best ? L('newBest') : L('runOver'), 240, 26, fitSc(r.best ? L('newBest') : L('runOver'), 470, 3), r.best ? COL.acc2 : '#fff', .5);
  panel(120, 60, 240, 96);
  const rows = [[L('time'), fmtTime(r.t)], [L('cops'), r.kills], [L('coins'), '+' + r.coins], [L('timeBonus'), '+' + r.bonus]];
  rows.forEach(([a, b], i) => { const sc = fitSc(a, 150, 2); T(a, 134, 70 + i * 20 + (2 - sc) * 3, sc, COL.dim); T(b, 346, 70 + i * 20, 2, i >= 2 ? COL.acc2 : '#fff', 1); });
  coinIc(200, 170); T((doubled ? r.total * 2 : r.total), 214, 170, 3, COL.acc2);
  if (!doubled) btn(70, 206, 165, 40, L('x2'), COL.ad, () => { Poki.rewarded().then(ok => { if (ok && !doubled) { doubled = true; save.coins += r.total; persist(); sfx('buy'); } }); }, { clap: true });
  btn(doubled ? 157 : 245, 206, 165, 40, L('garage'), COL.acc, toGarage);
}
function toGarage() { state = 'garage'; garageSel = Math.max(0, CARS.findIndex(c => c.id === save.car)); }
function startRun() {
  const c = CARS[garageSel]; if (!save.cars[c.id].own) return; save.car = c.id; persist();
  Poki.commercial().then(() => { newRun(); G.started = true; G.t = 0; state = 'play'; Poki.start(); });
}

/* ---------- Garažas ---------- */
function drawGarage(t) {
  ctx.fillStyle = '#23262E'; ctx.fillRect(0, 0, LW, LH);
  for (let y = 0; y < LH; y += 16) { ctx.fillStyle = y % 32 ? '#262A32' : '#2A2E37'; ctx.fillRect(0, y, LW, 16); }   // grindų plytelės
  const car = CARS[garageSel], cs = save.cars[car.id], own = cs.own;
  T(L('garage'), 12, 10, fitSc(L('garage'), 200, 3), '#fff'); coinIc(400, 12); T(save.coins, 414, 12, 2, COL.acc2);
  btn(270, 8, 116, 22, L('lang'), COL.panel2, langNext, { sc: 1 });
  /* mašina ant pakylos */
  panel(10, 40, 200, 150, '#1A1D23');
  ctx.fillStyle = '#353A44'; ctx.fillRect(UIX + 30, UIY + 70, 160, 64); ctx.fillStyle = '#F2C230'; for (let i = 0; i < 160; i += 10) { ctx.fillRect(UIX + 30 + i, UIY + 70, 5, 2); ctx.fillRect(UIX + 30 + i, UIY + 132, 5, 2); }
  const r = A.spr.spr[`car_${car.id}_${cs.paint}`], sh = A.spr.spr[`car_${car.id}_sh`];
  ctx.drawImage(A.sprImg, sh[0], sh[1], sh[2], sh[3], UIX + 110 - sh[2] * 1.5 + 6, UIY + 102 - sh[3] * 1.5 + 6, sh[2] * 3, sh[3] * 3);
  ctx.drawImage(own ? A.sprImg : A.sprK, r[0], r[1], r[2], r[3], UIX + 110 - r[2] * 1.5, UIY + 102 - r[3] * 1.5, r[2] * 3, r[3] * 3);
  if (!own) { padlock(110 - 12, 84); coinIc(110 - textW(String(car.price), 2) / 2 - 8, 126); T(car.price, 110 + 7, 126, 2, COL.acc2, .5); }
  btn(14, 88, 18, 28, '<', COL.panel2, () => { garageSel = (garageSel + CARS.length - 1) % CARS.length; });
  btn(188, 88, 18, 28, '>', COL.panel2, () => { garageSel = (garageSel + 1) % CARS.length; });
  T(car.n, 110, 46, 2, '#fff', .5);
  icon(car.w, 60, 142, .5); T(L('w_' + car.w), 78, 146, 1, COL.acc2);
  const st = []; if (car.spd) st.push((car.spd > 0 ? '+' : '') + Math.round(car.spd * 100) + L('speed')); if (car.hp) st.push((car.hp > 0 ? '+' : '') + car.hp + ' ' + L('hp'));
  T(st.join('  '), 110, 160, 1, COL.dim, .5);
  for (let i = 0; i < CARS.length; i++) { ctx.fillStyle = i === garageSel ? COL.acc : save.cars[CARS[i].id].own ? '#9AA0AC' : '#4A4F5A'; ctx.fillRect(UIX + 110 - CARS.length * 4 + i * 8, UIY + 176, 5, 5); }
  /* spalvos */
  T(L('paint'), 12, 198, 1, COL.dim);
  Object.keys(PAINTS).forEach((p, i) => {
    const x = 12 + (i % 6) * 33, y = 210 + Math.floor(i / 6) * 28, has = save.paints.includes(p), sel = own && cs.paint === p;   // spalvos - bendros visoms mašinoms
    panel(x, y, 30, 24, sel ? '#fff' : '#1A1D23', sel ? '#fff' : '#0E1014');
    ctx.fillStyle = PAINTS[p]; ctx.fillRect(UIX + x + 3, UIY + y + 3, 24, 18); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(UIX + x + 3, UIY + y + 3, 24, 2);
    if (!own) { ctx.fillStyle = 'rgba(14,16,20,.7)'; ctx.fillRect(UIX + x + 3, UIY + y + 3, 24, 18); }   // užrakinta mašina - spalvų nesirinksi
    else if (!has) { ctx.fillStyle = 'rgba(14,16,20,.6)'; ctx.fillRect(UIX + x + 3, UIY + y + 3, 24, 18); T(PAINT_PRICE, x + 15, y + 9, 1, COL.acc2, .5); }
    if (own) button(x, y, 30, 24, () => { if (has) { cs.paint = p; persist(); } else if (save.coins >= PAINT_PRICE) { save.coins -= PAINT_PRICE; save.paints.push(p); cs.paint = p; persist(); sfx('buy'); } else note(L('notEnough')); });
  });
  /* tobulinimai */
  panel(222, 40, 250, 168);
  if (own) UPG.forEach((u, i) => {
    const y = 48 + i * 31, lv = cs.up[u.k], cost = upgCost(lv);
    icon(u.ic || car.w, 230, y, .75); const un = L('u_' + u.k), us = fitSc(un, 84, 2); T(un, 258, y + 2 + (2 - us) * 3, us, '#fff'); T(L('ud_' + u.k), 258, y + 18, 1, COL.dim);
    for (let p = 0; p < UPG_MAX; p++) { ctx.fillStyle = p < lv ? COL.acc : '#3A3E46'; ctx.fillRect(UIX + 346 + p * 9, UIY + y + 4, 7, 7); }
    if (lv >= UPG_MAX) T(L('max'), 437, y + 6, 2, COL.acc2, .5);
    else btn(408, y, 58, 24, cost, save.coins >= cost ? '#3A6F3F' : COL.panel2, () => { if (save.coins >= cost) { save.coins -= cost; cs.up[u.k]++; persist(); sfx('buy'); } else note(L('notEnough')); }, { sc: 1, coin: true, tc: save.coins >= cost ? '#fff' : COL.dim });
  });
  else { T(L('locked'), 347, 80, fitSc(L('locked'), 240, 3), COL.dim, .5); btn(287, 120, 120, 34, car.price, save.coins >= car.price ? COL.acc : COL.panel2, () => { if (save.coins >= car.price) { save.coins -= car.price; cs.own = true; if (!save.paints.includes(car.paint)) save.paints.push(car.paint); persist(); sfx('buy'); } else note(L('notEnough')); }, { coin: true }); }
  if (save.best) T(L('best') + ' ' + fmtTime(save.best), 347, 214, 1, COL.dim, .5);
  btn(300, 226, 172, 38, L('drive'), own ? COL.acc : COL.panel2, startRun, { dis: !own });
  if (toast) { toast.t -= 1 / 60; T(toast.s, 240, 186, fitSc(toast.s, 460, 2), COL.red, .5); if (toast.t <= 0) toast = null; }
}
function note(s) { toast = { s, t: 1.4 }; sfx('warn'); }

/* ---------- Pagrindinis ciklas ---------- */
let last = performance.now(), gt = 0;
const W_ = f => { ctx = wctx; f(); ctx = uctx; };   // piešimas pasaulio drobėje
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(.05, (now - last) / 1000); last = now; gt += dt;
  BTN = BTN_NEXT; BTN_NEXT = []; ctx = uctx; uctx.clearRect(0, 0, LW, LH);
  PAD = padRead(); if (PAD && PAD.start && !padStartPrev) { if (state === 'play' && G && !G.cards) pauseGame(); else if (state === 'pause') resumeGame(); } padStartPrev = !!(PAD && PAD.start);
  if (state === 'boot') { wctx.fillStyle = '#16181D'; wctx.fillRect(0, 0, WW, WH); T('HEATRUN', 240, 120, 4, COL.acc, .5); present(); return; }
  if (slowmo > 0) { slowmo -= dt; dt *= .3; }
  shake = Math.max(0, shake - dt); if (G && state !== 'garage' && state !== 'boot') camStep(dt);
  if (state === 'ready') {
    stepRun(dt); W_(() => drawWorld(gt)); drawReady(gt);
    if (anyInput && (inputDir() || stick.on || tb.gas || tb.brake || tb.left || tb.right) || PAD && PAD.active) { G.started = true; state = 'play'; Poki.start(); }
  } else if (state === 'play') {
    if (!G.cards) stepRun(dt);
    W_(() => drawWorld(gt)); if (!G.over) drawHud(gt);
    if (G.cards) drawCards(gt);
    if (G.over > 1.4) { state = G.revived ? 'results' : 'revive'; Poki.stop(); if (G.revived) finishRun(); }
  } else if (state === 'pause') { W_(() => drawWorld(gt)); drawHud(gt); drawPause(); }
  else if (state === 'revive') { W_(() => drawWorld(gt)); drawRevive(); }
  else if (state === 'results') { W_(() => drawWorld(gt)); drawResults(); }
  else if (state === 'garage') drawGarage(gt);
  if (Poki.adShow) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, LW, LH); T('AD (LOCAL TEST)', 240, 130, 2, '#fff', .5); }
  present();
}
async function boot() {
  requestAnimationFrame(frame);
  const [sj, si, pi, mj, fj] = await Promise.all([loadJson('assets/sprites.json'), loadImg('assets/sprites.png'), loadImg('assets/props.png'), loadJson('assets/map.json'), loadJson('assets/font.json'), Poki.init()]);
  A.spr = sj; A.sprImg = si; A.propImg = pi; A.map = mj; A.font = fj;
  A.propSh = shadowOf(pi, .32);
  A.sprW = tinted(si, '#fff', 'source-in'); A.sprD = tinted(si, 'rgba(20,18,16,.5)', 'source-atop'); A.sprK = tinted(si, 'rgba(14,16,20,.78)', 'source-atop');
  fontInit(); loadSave(); langInit(); worldInit(); newRun();
  ensureChunks(0, 0, 1);
  const t0 = performance.now(); while (!(ready(pl.x, pl.y) && ready(pl.x + 400, pl.y)) && performance.now() - t0 < 4000) await new Promise(r => setTimeout(r, 30));
  const [fx, fy] = freeNear(pl.x, pl.y); pl.x = fx; pl.y = fy;
  state = 'ready'; anyInput = false; Poki.loaded();
}
boot();
