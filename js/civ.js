/* civ: miesto gyvybė - pastatytos mašinos (Steam Run.ParkedLook išvaizda) ir civilinis eismas keliais (Steam TRF_MODELS / TRF_COLS sprite'ai).
   Visos - kūnai su Steam fizika (js/vehicle.js): susidūrimai pagal masę, išstumtos slysta ir sukasi; sprogimai susprogdina (grandinės). Žmonių nėra. */
'use strict';
const TRF_COLS = ['#B8BCC4', '#E8E6E0', '#C9B98F', '#2C3E66', '#7A2430', '#2F5A3A', '#6A6E76', '#1E2024'];
const TRF_V = [260, 270, 250, 210, 240, 190, 170];   // modelio greitis (hatch, sedan, wagon, boxvan, pickup, semi, bus)
const TRF_R = [20, 22, 22, 26, 24, 32, 36];          // susidūrimo spindulys (vnt.)
const TRF_M = [.9, 1, 1.05, 1.6, 1.3, 2.6, 3.2];     // masė (TRF_MODELS m)
const TRF_W = [3, 4, 2, 2, 2, 1, 0];                 // eismo dažnis
const TRF_LEN = [46, 52, 54, 60, 56, 80, 92], TRF_WID = [22, 24, 24, 28, 26, 30, 28];   // kapsulė (TRF_MODELS len / wid)
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
let civs = [], parkUsed = new Set(), civT = 0;
const TRAFFIC_N = 0;   // vartotojas 2026-10-28: judantis eismas atrodė „goofy" - vietoj jo daugiau policijos (pastatytos mašinos lieka)

function civReset() { civs = []; parkUsed = new Set(); civT = 0; }
function civMake(x, y, a, m, c, mode) {
  const o = { x, y, a, model: m, c: m === 6 ? c % 2 : c, r: TRF_R[m], hp: 30 + TRF_M[m] * 20, mode, h: 0, v: 0, shift: 0, laneT: 0, turnCd: 0, isCiv: true };
  return bodyInit(o, { m: TRF_M[m], len: TRF_LEN[m], wid: TRF_WID[m], top: TRF_V[m] });
}
/* Pastatytą mašiną (statinis žemėlapio įrašas) paverčia judančiu kūnu, kai ją kas nors paliečia */
function parkWake(b) {   // tik ta pastatyta mašina, kurią kūnas tikrai liečia (kapsulė prie kapsulės), ne visa eilė
  const cx = Math.floor(b.x * PPU / CH), cy = Math.floor(b.y * PPU / CH), [a1x, a1y] = capC(b, 0), [c1x, c1y] = capC(b, 1);
  for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
    const L = A.map.park[i + '_' + j]; if (!L) continue;
    for (const p of L) { if (parkUsed.has(p)) continue; const m = p[3]; if (Math.abs(p[0] - b.x) > 120 || Math.abs(p[1] - b.y) > 120) continue;
      const h = (TRF_LEN[m] - TRF_WID[m]) / 2, ca = Math.cos(p[2]), sa = Math.sin(p[2]);
      segClosest(a1x, a1y, c1x, c1y, p[0] + ca * h, p[1] + sa * h, p[0] - ca * h, p[1] - sa * h);
      if (Math.hypot(SC1X - SC2X, SC1Y - SC2Y) < (b.wid + TRF_WID[m]) / 2 + 3) { parkUsed.add(p); const c = civMake(p[0], p[1], p[2], m, p[4], 'loose'); c.m *= 3; c.parked = true; civs.push(c); } }   // sunkios - tik pasislenka
  }
}
/* Eismo mašinos gimimas: kelio taškas už ekrano, kryptis - ilgesnė kelio ašis, važiuoja dešine puse */
function trafSpawn() {
  const vr = Math.hypot(WW, WH) / 2 / PPU;
  for (let k = 0; k < 10; k++) {
    const a = Math.random() * TAU, d = vr * rnd(1.1, 1.6), x = pl.x + Math.cos(a) * d, y = pl.y + Math.sin(a) * d;
    if (!ready(x, y) || !roadAt(x, y)) continue;
    let rx = 0, ry = 0; for (const s of [-160, -80, 80, 160]) { rx += roadAt(x + s, y); ry += roadAt(x, y + s); }
    if (Math.max(rx, ry) < 3) continue;
    const h = (rx >= ry ? 0 : 1) + (Math.random() < .5 ? 2 : 0);
    let pool = []; for (let m = 0; m < 7; m++) for (let i = 0; i < TRF_W[m]; i++) pool.push(m);
    const m = pick(pool), c = civMake(x, y, Math.atan2(DIRS[h][1], DIRS[h][0]), m, Math.floor(Math.random() * 8), 'drive');
    c.h = h; c.v = TRF_V[m] * .8; civs.push(c); return;
  }
}
/* Juostos laikymas: skenuoja kelio plotį statmenai ir pasislenka į dešinę pusę */
function laneShift(c) {
  const [dx, dy] = DIRS[c.h], rx = -dy, ry = dx; let L = 0, R = 0;
  while (L < 260 && roadAt(c.x - rx * (L + 8), c.y - ry * (L + 8))) L += 8;
  while (R < 260 && roadAt(c.x + rx * (R + 8), c.y + ry * (R + 8))) R += 8;
  const W = L + R; c.shift = (R - L) / 2 + (W > 110 ? W / 5 : 0);   // dešinė pusė, bet ne prie pastatytų mašinų
}
function stepDrive(c, dt) {
  const [dx, dy] = DIRS[c.h], rx = -dy, ry = dx;
  c.laneT -= dt; c.turnCd -= dt;
  if (c.laneT <= 0) {
    c.laneT = .3;
    const turn = nh => { c.h = nh; c.laneT = .15; c.turnCd = 2; };
    const sideOk = nh => roadAt(c.x + DIRS[nh][0] * 110, c.y + DIRS[nh][1] * 110) && roadAt(c.x + DIRS[nh][0] * 190, c.y + DIRS[nh][1] * 190);
    if (!roadAt(c.x + dx * 110, c.y + dy * 110)) {   // kelias baigiasi - sukasi (pirma į dešinę), kitaip apsisuka
      const R = (c.h + 1) % 4, L = (c.h + 3) % 4;
      if (sideOk(R) && (!sideOk(L) || Math.random() < .6)) turn(R); else if (sideOk(L)) turn(L); else turn((c.h + 2) % 4);
    } else if (c.turnCd <= 0) { const nh = (c.h + (Math.random() < .5 ? 1 : 3)) % 4; if (Math.random() < .25 && sideOk(nh)) turn(nh); }
    laneShift(c);
  }
  /* kliūtis priekyje (žaidėjas, policija, kita mašina) - stabdo */
  let block = false; const chk = (x, y) => { const px = x - c.x, py = y - c.y, f = px * dx + py * dy, s = Math.abs(px * rx + py * ry); if (f > 0 && f < 100 + c.r && s < 34) block = true; };
  chk(pl.x, pl.y); for (const o of civs) if (o !== c) chk(o.x, o.y); for (const o of cops) if (!o.dead && o.boss !== 'heli') chk(o.x, o.y);
  const vt = block ? 0 : TRF_V[c.model]; c.v += (vt - c.v) * (block ? 4 : 1.2) * dt;
  const sh = clamp(c.shift, -90 * dt, 90 * dt); c.shift -= sh;
  c.x += dx * c.v * dt + rx * sh; c.y += dy * c.v * dt + ry * sh;
  c.a += clamp(angDiff(c.a, Math.atan2(dy, dx)), -4 * dt, 4 * dt);
  c.vx = dx * c.v; c.vy = dy * c.v; c.w = 0;
}
function stepCivs(dt) {
  if (!G.started) return;
  if ((civT -= dt) <= 0) { civT = .5; if (civs.filter(c => c.mode === 'drive').length < TRAFFIC_N) trafSpawn(); }
  parkWake(pl);
  for (let i = 0; i < cops.length; i++) { const o = cops[i]; if (!o.dead && o.boss !== 'heli' && o.len && (i + Math.floor(G.t * 60)) % 3 === 0) parkWake(o); }
  const vr = Math.hypot(WW, WH) / 2 / PPU;
  for (const c of civs) {
    if (c.mode === 'drive') stepDrive(c, dt);
    else { const cl = clsAt(c.x, c.y); bodyMove(c, { steer: 0, thr: 0, brk: .35, rev: 0, hb: false }, dt, SURF_V[Math.min(9, cl)] || 1, SURF_G[Math.min(9, cl)] || 1); }   // išstumta: slysta, sukasi, stoja
  }
  for (const c of civs) if (c.hp <= 0 && !c.gone) civBoom(c);
  civs = civs.filter(c => !c.gone && Math.hypot(c.x - pl.x, c.y - pl.y) < (c.mode === 'drive' ? vr * 2.3 : 2600));
}
/* Smūgis į civilinę mašiną (iš js/game.js carHit): nustumta nebevažiuoja; stiprus - žala, kol susprogsta */
function civHit(c, dv) {   // civilinės mašinos nesprogsta (vartotojas: atsitiktiniai sprogimai ir drebėjimas atrodė blogai) - tik pasislenka
  if (dv > 15) c.mode = 'loose';
  if (dv > 160) sfx('hit');
}
/* Civilinės mašinos sprogimas: kaip policijos (Steam KillCop vaizdas), monetos kartais; sužeidžia aplink esančią policiją */
function civBoom(c) {
  c.gone = true; carBlast(c.x, c.y, false, [TRF_COLS[c.c], '#1E1F24', '#C8CCD4'], c.vx * .3, c.vy * .3);
  for (const o of cops) if (!o.dead && o.boss !== 'heli' && (o.x - c.x) ** 2 + (o.y - c.y) ** 2 < 90 * 90) hurtCop(o, 30 * dmgMul());
  if (Math.random() < .4) gems.push({ k: 'coin', x: c.x, y: c.y, v: 1 });
}
/* Sprogimų banga stumia ir žaloja mašinas (grandinės), pažadina pastatytas */
function civBlast(x, y, R) {   // sprogimas tik lengvai pastumia jau judančias mašinas - be žalos ir be grandinių
  for (const c of civs) { if (c.gone) continue; const dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy) || 1; if (d > R + c.r) continue;
    c.vx += dx / d * 80 / c.m; c.vy += dy / d * 80 / c.m; }
}
function drawCivs() {
  /* pastatytos (statinės) */
  const c0 = Math.floor((camX - 30) / CH), c1 = Math.floor((camX + WW + 30) / CH), r0 = Math.floor((camY - 30) / CH), r1 = Math.floor((camY + WH + 30) / CH);
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    const L = A.map.park[cx + '_' + cy]; if (!L) continue;
    for (const p of L) { if (parkUsed.has(p)) continue; const [x, y] = P2(p[0], p[1]); if (x < -30 || y < -30 || x > WW + 30 || y > WH + 30) continue;
      const n = `trf_${p[3]}_${p[3] === 6 ? p[4] % 2 : p[4]}`; sprRot(n + '_sh', x + 2, y + 2, p[2]); sprRot(n + '_spr', x, y, p[2]); }
  }
  for (const c of civs) { const [x, y] = P2(c.x, c.y); if (x < -40 || y < -40 || x > WW + 40 || y > WH + 40) continue;
    const n = `trf_${c.model}_${c.c}`; sprRot(n + '_sh', x + 2, y + 2, c.a); sprRot(n + '_spr', x, y, c.a, c.hp < 15 ? 'd' : 0);
    if (c.hp < 15 && Math.random() < .3) puff(c.x, c.y, rnd(-10, 10), rnd(-30, -15), 1, 3, '#5A5E68'); }   // apgadinta - rūksta
}
