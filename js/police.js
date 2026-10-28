/* police: Steam versijos policijos smegenys (kilmė - JS prototipo 02e-police.js): būrio vaidmenys (vytis, PIT - įsukimas iš galo,
   kelio kirtimas iš priekio, „roll" - važiuoja priekyje ir stabdo, apsupimas), vairuotojas per tikrą mašinos fiziką, įstrigus - atbulinė.
   Vaidmenys atrakinami pagal heat (HD.ROLE_HEAT): pradžioje - tik minia, kad naujokas spėtų išmokti. */
'use strict';
const PD = { NEAR: 250, SEP: 60, SQ_DT: .5, SQ_R: 700, PIT_V: 200, PIT_CD: 3, CUT_T: 1.2, ROLL_V: 300, ROLL_K: .85, BOX_V: 180, BOX_R: 45, ROLE_MIN: 2 };
const ROLE_HEAT = { chase: 2, pit: 2, cut: 2, roll: 3, box: 4 };
const roleAllowed = (r, heat) => heat >= (ROLE_HEAT[r] || 99);
const BOX_A = [0, Math.PI / 2, -Math.PI / 2, Math.PI, 2.36, -2.36, .79, -.79];
const copAir = c => c.boss === 'heli';
const copSolo = c => !!c.boss;

/* Atstumas tarp mašinų: stūmimas nuo artimesnių nei SEP (c.sx, c.sy) */
function sepStep(list) {
  const S = PD.SEP, grid = new Map(), key = (gx, gy) => gx * 73856093 ^ gy * 19349663;
  for (const c of list) { c.sx = 0; c.sy = 0; if (c.dead || copAir(c)) continue; const k = key(Math.floor(c.x / S), Math.floor(c.y / S)); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(c); }
  for (const c of list) { if (c.dead || copAir(c)) continue; const gx = Math.floor(c.x / S), gy = Math.floor(c.y / S);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const a = grid.get(key(gx + dx, gy + dy)); if (!a) continue;
      for (const o of a) { if (o === c) continue; const ex = c.x - o.x, ey = c.y - o.y, d = Math.hypot(ex, ey); if (d > 0 && d < S) { const f = (S - d) / S; c.sx += ex / d * f; c.sy += ey / d * f; } } } }
}
function pDir(P) { const s = Math.hypot(P.vx, P.vy); return s > 40 ? [P.vx / s, P.vy / s] : [Math.cos(P.a), Math.sin(P.a)]; }
/* Užkirtimo taškas: žaidėjo vieta po CUT_T; kelyje - kelio kryptimi, jei ji panaši į važiavimo */
function cutPoint(P, ps, fx, fy) {
  let dx = fx, dy = fy; const q = roadNear(P.x, P.y);
  if (q.d <= 0 && q.e) { let ax = Math.cos(q.ang), ay = Math.sin(q.ang); const d = ax * fx + ay * fy; if (Math.abs(d) > .7) { if (d < 0) { ax = -ax; ay = -ay; } dx = ax; dy = ay; } }
  return [P.x + dx * ps * PD.CUT_T, P.y + dy * ps * PD.CUT_T];
}
function roleTarget(c, P) {
  const ps = Math.hypot(P.vx, P.vy), [fx, fy] = pDir(P), rx = -fy, ry = fx, ex = c.x - P.x, ey = c.y - P.y, dP = Math.hypot(ex, ey),
    along = ex * fx + ey * fy, lat = ex * rx + ey * ry, top = c.top || 300;
  let x = P.x + P.vx * .5, y = P.y + P.vy * .5, v = top;
  switch (c.role) {
    case 'pit': { const s = c.side || (lat >= 0 ? 1 : -1); c.side = s;   // galinis kampas toje pusėje, kurioje policininkas
      const qx = P.x - fx * 30 + rx * s * 28, qy = P.y - fy * 30 + ry * s * 28;
      if (c.pitT > 0 || Math.hypot(c.x - qx, c.y - qy) < 35) { if (!(c.pitT > 0)) c.pitT = .6; x = P.x + P.vx * .15; y = P.y + P.vy * .15; v = ps * 1.2 + 40; }
      else { x = qx + P.vx * .3; y = qy + P.vy * .3; v = ps * 1.15 + 20; } break; }
    case 'cut': { const F = cutPoint(P, ps, fx, fy); if (along > 80 && Math.hypot(c.x - F[0], c.y - F[1]) < 150) { x = P.x; y = P.y; v = top * .9; } else { x = F[0]; y = F[1]; } break; }
    case 'roll': { const sl = (c.slot || 0) - 1, la = Math.max(140, along + 40); x = P.x + fx * la + rx * sl * 45; y = P.y + fy * la + ry * sl * 45; if (along > 60) v = Math.min(top, ps * PD.ROLL_K); break; }
    case 'box': { const A2 = BOX_A[(c.slot || 0) % BOX_A.length], ca = Math.cos(A2), sa = Math.sin(A2), rr = PD.BOX_R + (Math.abs(ca) > .7 ? 15 : 0);
      x = P.x + (fx * ca + rx * sa) * rr; y = P.y + (fy * ca + ry * sa) * rr; const dd = Math.hypot(c.x - x, c.y - y); v = dd < 15 ? 0 : Math.min(top, dd * 3); break; }
    case 'chase': { const o = ((c.slot || 0) % 2 ? 1 : -1) * (30 + 20 * Math.floor((c.slot || 0) / 2)); x += rx * o; y += ry * o; break; }
  }
  /* toli arba tikslo nematant - kelias pagal lauką (renkasi gatves, apvažiuoja pastatus); vaidmenys arti - tiesiai */
  const horde = !c.role || c.role === 'horde' || c.role === 'chase';
  if ((horde && dP > PD.NEAR) || !navLOS(c.x, c.y, x, y)) { const d = navDir(c.x, c.y); if (d) { x = c.x + d[0] * 120; y = c.y + d[1] * 120; if (!horde) v = top; } }
  x += (c.sx || 0) * 40; y += (c.sy || 0) * 40;
  return { x, y, v };
}
/* Vairuotojas: tikslas {x, y, v} -> valdikliai per tikrą fiziką; siena priekyje - stabdo; įstrigo - atbulinė 0,8 s ir „K" apsisukimas */
function copDrive(c, t, dt) {
  const cs = Math.hypot(c.vx, c.vy), ca = Math.cos(c.a), sa = Math.sin(c.a), u = c.vx * ca + c.vy * sa;
  const d = angDiff(c.a, Math.atan2(t.y - c.y, t.x - c.x)), ad = Math.abs(d), ctl = { steer: clamp(d * 2, -1, 1), thr: 0, brk: 0, rev: 0, hb: false, nitro: false };
  if (ad > 1.2 && cs > 200) ctl.brk = 1;
  else if (u < t.v - 10) ctl.thr = ad < 1.2 || cs < 120 ? 1 : .4;
  else if (u > t.v + 30) ctl.brk = Math.min(1, (u - t.v) / 150);
  ctl.hb = ad > 1.6 && cs > 250;
  if (t.v <= 0 && cs < 40) { ctl.thr = 0; ctl.brk = 1; ctl.hb = true; }
  if (cs > 180 && solidAt(c.x + ca * 60, c.y + sa * 60)) { ctl.thr = 0; ctl.brk = 1; }
  if (!(c.revT > 0) && cs < 40 && ad > 1.2 && solidAt(c.x + ca * 40, c.y + sa * 40)) c.revT = .8;
  if (ctl.thr > 0 && cs < 20) { c.stuckT = (c.stuckT || 0) + dt; if (c.stuckT > 1.5) { c.revT = .8; c.stuckT = 0; } } else c.stuckT = 0;
  if (c.revT > 0) { c.revT -= dt; ctl.thr = 0; ctl.brk = 0; ctl.rev = 1; ctl.hb = false; ctl.steer = -ctl.steer; }
  return ctl;
}
function copBrain(c, P, dt) {
  if (c.pitT > 0) { c.pitT -= dt; if (c.pitT <= 0) { c.pitCd = PD.PIT_CD; c.role = 'chase'; c.roleT = 0; } }
  return copDrive(c, roleTarget(c, P), dt);
}
/* Būrio koordinatorius (kas SQ_DT): artimiausi N gauna vaidmenis, kiti - minia */
const SQ = { t: 0 };
function squadStep(list, P, heat, dt) {
  SQ.t -= dt; if (SQ.t > 0) return; SQ.t = PD.SQ_DT;
  if (!roleAllowed('chase', heat)) { for (const c of list) c.role = c.dead || copAir(c) || copSolo(c) ? null : 'horde'; return; }
  const ps = Math.hypot(P.vx, P.vy), [fx, fy] = pDir(P), rx = -fy, ry = fx, N = heat >= 5 ? 8 : heat >= 3 ? 6 : 4, cand = [];
  for (const c of list) { if (c.pitCd > 0) c.pitCd -= PD.SQ_DT; if (c.roleT > 0) c.roleT -= PD.SQ_DT;
    if (c.dead || copAir(c) || copSolo(c)) { c.role = null; continue; }
    const ex = c.x - P.x, ey = c.y - P.y; c.sqD = Math.hypot(ex, ey); c.sqA = ex * fx + ey * fy; c.sqL = ex * rx + ey * ry;
    if (c.sqD < PD.SQ_R) cand.push(c); else c.role = 'horde'; }
  cand.sort((a, b) => a.sqD - b.sqD); const sq = cand.slice(0, N); for (const c of cand.slice(N)) c.role = 'horde';
  if (ps < PD.BOX_V && roleAllowed('box', heat)) {   // apsupimas: kiekvienam - artimiausia laisva vieta
    const free = BOX_A.map((A2, i) => i).slice(0, Math.max(4, sq.length));
    for (const c of sq) { let bi = free[0], bd = 1e9;
      for (const i of free) { const A2 = BOX_A[i], tx = P.x + (fx * Math.cos(A2) + rx * Math.sin(A2)) * PD.BOX_R, ty = P.y + (fy * Math.cos(A2) + ry * Math.sin(A2)) * PD.BOX_R, dd = Math.hypot(c.x - tx, c.y - ty); if (dd < bd) { bd = dd; bi = i; } }
      free.splice(free.indexOf(bi), 1); c.role = 'box'; c.slot = bi; c.roleT = 0; }
    return;
  }
  const keep = c => c.roleT > 0 && (c.role === 'pit' || c.role === 'cut' || c.role === 'roll');
  let pit = sq.find(c => keep(c) && c.role === 'pit'); const rolls = sq.filter(c => keep(c) && c.role === 'roll'), cuts = sq.filter(c => keep(c) && c.role === 'cut');
  if (!pit && ps > PD.PIT_V && roleAllowed('pit', heat)) { pit = sq.find(c => !keep(c) && !(c.pitCd > 0) && c.sqA < 0 && Math.abs(c.sqL) < -c.sqA * 1.8);
    if (pit) { pit.role = 'pit'; pit.roleT = PD.ROLE_MIN; pit.pitT = 0; pit.side = 0; } }
  const q = ps > PD.ROLL_V ? roadNear(P.x, P.y) : null, straight = q && q.d <= 0 && q.e && Math.abs(Math.cos(q.ang) * fx + Math.sin(q.ang) * fy) > .95;
  if (straight && rolls.length < 2 && roleAllowed('roll', heat)) { const ahead = sq.filter(c => !keep(c) && c !== pit && c.sqA > 150);
    if (ahead.length + rolls.length >= 2) for (const c of ahead.slice(0, 3 - rolls.length)) { c.role = 'roll'; c.roleT = PD.ROLE_MIN; rolls.push(c); } }
  rolls.sort((a, b) => a.sqL - b.sqL).forEach((c, i) => c.slot = i);
  for (const c of sq) { if (c === pit || rolls.includes(c) || keep(c)) continue;
    if (cuts.length < 2 && c.sqA > -50 && roleAllowed('cut', heat)) { c.role = 'cut'; c.roleT = PD.ROLE_MIN; cuts.push(c); } else c.role = 'chase'; }
  let k = 0; for (const c of sq) if (c.role === 'chase') c.slot = k++;
}
