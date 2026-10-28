/* vehicle: mašinos fizika - Steam versijos Heatrun.Core Vehicle.cs (kilmė - JS prototipo 02c-vehicle.js, 1:1):
   „dviračio" modelis su svorio perkėlimu, padangų sukibimas, rankinis (driftas), atbulinė, kapsulių susidūrimai su mase.
   Pridėta iš Steam: Ctl.aid - vairavimo pagalba žaidėjui (stipresnis kontravairas ir stabilizavimas). */
'use strict';
const VP = {
  G: 820, SLIDE: .5, APEAK: .12, WT: .25, AXA: 16, AXB: 16, K: 15, FX_K: 1.6, DRV_K: .3,
  ACC: 1.4, BRK: 420, BRK_F: .6, CD: .00116, CRR: .05, NITRO_V: 240, REV: 200, HB_GRIP: .4, HB_BRK: 100, HB_REC: .3,
  LOCK_LO: .6, LOCK_HI: .12, STEER_SPD: 9, STEER_HI: .65, ASSIST: .35, YAW_MAX: 4, YAW_SPIN: 9, KIN_V: 50, STAB: 4,
  GRIP_B: .06, AS_ACC: 35, DFT_HOLD: 1.4, DFT_MAX: .61, DFT_LIFT: 2.6, DFT_CAP: 1.22, BURN_V: 90, BURN_YAW: 3.2, BURN_CREEP: 40,
  E_CAR: .2, E_WALL: .25, MU_C: .35, TAKEDOWN: 300, DMG_REF: 120, DMG_MIN: 25, RAM_K: .25, COPCOP_K: .15, COPCOP_MIN: 80,
  AID_CS: .8, AID_STAB: 1, AID_SPIN: 1.5,
};
/* Policijos kėbulai (VCOP) ir paviršiaus sukibimas (World.SURF .G) */
const VCOP = { patrol: { m: 1, len: 52, wid: 24 }, inter: { m: .95, len: 52, wid: 24 }, suv: { m: 1.6, len: 56, wid: 28 }, van: { m: 2.2, len: 62, wid: 30 },
  rhino: { m: 2.8, len: 58, wid: 30 }, tank: { m: 8, len: 90, wid: 46 }, moto: { m: .5, len: 30, wid: 12 }, fed: { m: 1.5, len: 56, wid: 28 },
  emp: { m: 1.1, len: 52, wid: 24 }, spiker: { m: 1, len: 52, wid: 24 }, gunner: { m: 1.05, len: 52, wid: 24 } };
const SURF_G = [1, .8, .75, .2, 1, 1, .9, 1, 1, .55];

function bodyInit(o, s) {
  Object.assign(o, { vx: o.vx || 0, vy: o.vy || 0, w: 0, st: 0, axs: 0, hbg: 1, m: s.m || 1, len: s.len || 52, wid: s.wid || 24,
    top: s.top || 520, pw: s.pw || 1, grip: s.grip || 1, gripR: s.gripR || 1, gm: 1, gmT: 0, pm: 1, pmT: 0, spinT: 0, dft: false, burn: false });
  return o;
}
const bodySpeed = b => Math.hypot(b.vx, b.vy);
function tireF(al, cap) { const r = Math.abs(al) / VP.APEAK, f = r <= 1 ? r : VP.SLIDE + (1 - VP.SLIDE) * Math.exp(-(r - 1) * 3); return al > 0 ? -f * cap : f * cap; }

/* Vienas fizikos žingsnis. c - {steer -1..1, thr, brk, rev 0..1, hb, nitro, burn, aid 0..1}; sv, sg - paviršiaus greitis ir sukibimas */
function bodyStep(b, c, dt, sv, sg) {
  const ca = Math.cos(b.a), sa = Math.sin(b.a), u = b.vx * ca + b.vy * sa, vl = -b.vx * sa + b.vy * ca, au = Math.abs(u), sgn = u >= 0 ? 1 : -1, sp = Math.hypot(u, vl);
  if (b.gmT > 0) { b.gmT -= dt; if (b.gmT <= 0) b.gm = 1; } if (b.pmT > 0) { b.pmT -= dt; if (b.pmT <= 0) b.pm = 1; }
  const aid = b.dft || c.hb ? 0 : c.aid || 0;
  if (b.spinT > 0) b.spinT -= dt * (1 + aid * VP.AID_SPIN);
  const tgS = c.steer || 0, out = Math.abs(tgS) > Math.abs(b.st) && tgS * b.st >= 0, sr = VP.STEER_SPD * (out ? 1 - VP.STEER_HI * Math.min(1, au / 600) : 1);
  b.st += Math.max(-sr * dt, Math.min(sr * dt, tgS - b.st));
  const A = VP.AXA, B = VP.AXB, lock = (VP.LOCK_LO + (VP.LOCK_HI - VP.LOCK_LO) * Math.min(1, au / 520)) * (b.lockM || 1);
  b.burn = false;
  if (c.burn && sp < VP.BURN_V) {   // burnout: W+S stovint - saulutės
    b.burn = true; b.dft = false; b.w += (b.st * VP.BURN_YAW - b.w) * Math.min(1, 5 * dt);
    const kb = Math.min(1, 6 * dt), u2 = u + (VP.BURN_CREEP * Math.abs(b.st) - u) * kb, v2 = vl + (-A * b.w - vl) * kb;
    b.vx = u2 * ca - v2 * sa; b.vy = u2 * sa + v2 * ca; b.axs -= b.axs * Math.min(1, 8 * dt);
    b.a += b.w * dt; b.x += b.vx * dt; b.y += b.vy * dt; return;
  }
  const ar = sp > 1 ? Math.atan2(vl - B * b.w, au) : 0;
  const delta = b.st * lock + VP.ASSIST * (1 + aid * VP.AID_CS) * clamp(ar, -.5, .5) * (c.hb ? .5 : 1);
  const af = sp > 1 ? Math.atan2(vl + A * b.w, au) - delta * sgn : 0;
  const lf = clamp(.5 - VP.WT * b.axs / VP.G, .2, .8), lr = 1 - lf, g = VP.G * sg * b.grip * b.gm;
  b.hbg = c.hb ? VP.HB_GRIP : Math.min(1, b.hbg + dt * (1 - VP.HB_GRIP) / VP.HB_REC);
  const capF = g * lf, capR = g * lr * b.gripR * b.hbg;
  const T = b.top * sv + (c.nitro ? VP.NITRO_V : 0), k = VP.ACC * b.pw, engF = k * (VP.CD * T * T + VP.CRR * T) / b.m;
  let fxF = 0, fxR = 0, drv = 0;
  if (c.thr > 0 && u > -5) drv = c.thr * engF * b.pm;
  const bk = Math.max(c.brk || 0, c.burn ? 1 : 0, u < 0 && !c.hb ? c.thr || 0 : 0, u > 0 ? c.rev || 0 : 0);
  if (bk > 0) { const bf = bk * VP.BRK * clamp(u / 20, -1, 1); fxF -= bf * VP.BRK_F; fxR -= bf * (1 - VP.BRK_F); }
  if (c.rev > 0 && u <= 20 && !c.hb && u > -VP.REV) fxR -= c.rev * engF * .6;   // atbulinė
  if (c.hb && au > 5) fxR -= sgn * VP.HB_BRK;
  const lxF = capF * VP.FX_K, lxR = capR * VP.FX_K;
  fxF = clamp(fxF, -lxF, lxF); fxR = clamp(fxR, -lxR, lxR);
  const qF = fxF / (lxF || 1), qR = (fxR + drv * VP.DRV_K) / (lxR || 1);
  const fyF = tireF(af, capF * Math.sqrt(Math.max(0, 1 - qF * qF))), fyR = tireF(ar, capR * Math.sqrt(Math.max(0, 1 - qR * qR)));
  fxR += drv;
  const drag = k * (VP.CD * u * au + VP.CRR * u) / b.m, cd = Math.cos(delta), sd = Math.sin(delta);
  const fyFb = fxF * sd + fyF * cd, ax = fxR + fxF * cd - fyF * sd - drag, ay = fyR + fyFb, yaw = (A * fyFb - B * fyR) / (VP.K * VP.K);
  b.axs += (ax - b.axs) * Math.min(1, 8 * dt);
  b.vx += (ax * ca - ay * sa) * dt; b.vy += (ax * sa + ay * ca) * dt; b.w += yaw * dt;
  if (!c.hb && b.spinT <= 0 && sp > VP.KIN_V && au > 1) { const wg = g / au, wk = clamp(u * Math.tan(delta) / (A + B), -wg, wg); b.w += (wk - b.w) * Math.min(1, VP.STAB * (1 + aid * VP.AID_STAB) * dt); }
  if (sp < VP.KIN_V) {   // mažu greičiu - kinematinis modelis
    const kk = Math.min(1, 12 * dt) * (1 - sp / VP.KIN_V), ul = -b.vx * sa + b.vy * ca;
    b.w += (u * Math.tan(delta) / (A + B) - b.w) * kk; b.vx += sa * ul * kk; b.vy -= ca * ul * kk;
    if (au < 2 && !(c.thr > 0) && !(c.brk > 0) && !(c.rev > 0)) { b.vx *= .5; b.vy *= .5; }
  }
  const ym = b.spinT > 0 ? VP.YAW_SPIN : VP.YAW_MAX; b.w = clamp(b.w, -ym, ym);
  b.a += b.w * dt; b.x += b.vx * dt; b.y += b.vy * dt;
  if (c.hb && sp > 150) b.dft = true;
  if (b.dft) {   // drifto išėjimas: nosis grįžta ribotu greičiu
    const ca2 = Math.cos(b.a), sa2 = Math.sin(b.a), u2 = b.vx * ca2 + b.vy * sa2, v2 = -b.vx * sa2 + b.vy * ca2;
    if (u <= 0 || u2 <= 0 || sp < VP.KIN_V) b.dft = false;
    else if (!c.hb && b.spinT <= 0) {
      const b0 = Math.atan2(vl, u), s = b0 < 0 ? -1 : 1, a0 = Math.abs(b0), bn = Math.atan2(v2, u2) * s; let tgt = bn;
      if (c.thr > 0 && !(c.brk > 0) && !(c.rev > 0)) { if (a0 <= VP.DFT_MAX) tgt = Math.max(bn, a0 - VP.DFT_HOLD * dt); }
      else tgt = Math.min(bn, Math.max(0, a0 - VP.DFT_LIFT * dt));
      if (bn > VP.DFT_CAP && bn > a0) tgt = Math.min(tgt, Math.max(VP.DFT_CAP, a0));
      if (tgt !== bn) yawFix(b, (bn - tgt) * s, dt);
      if (Math.abs(tgt) < .035) b.dft = false;
    }
  }
  if (!b.dft && !c.hb && !b.burn && b.spinT <= 0 && sp > VP.KIN_V && u > 0) {   // be rankinio galas neišbėga
    const ca2 = Math.cos(b.a), sa2 = Math.sin(b.a), u2 = b.vx * ca2 + b.vy * sa2, v2 = -b.vx * sa2 + b.vy * ca2;
    if (u2 > 0) { const bn = Math.atan2(v2, u2), an = Math.abs(bn), lim = Math.max(VP.GRIP_B, Math.abs(Math.atan2(vl, u))); if (an > lim) yawFix(b, (an - lim) * (bn < 0 ? -1 : 1), dt); }
  }
}
function yawFix(b, d, dt) { const m = VP.AS_ACC * dt, dw = clamp(d / dt, -m, m); b.w += dw; b.a += dw * dt; }
/* Kadro judėjimas: dalimis po <= 10 vnt., po kiekvienos - sienos. Grąžina didžiausią Δv nuo sienų */
function bodyMove(b, c, dt, sv, sg) {
  const n = Math.min(6, Math.max(1, Math.ceil(bodySpeed(b) * dt / 10))), h = dt / n; let dv = 0;
  for (let i = 0; i < n; i++) { bodyStep(b, c, h, sv, sg); dv = Math.max(dv, bodyWall(b)); }
  return dv;
}
/* ---------- Kapsulė ir sienos ---------- */
function capC(b, k) { const h = (b.len - b.wid) / 2 * (k ? -1 : 1); return [b.x + Math.cos(b.a) * h, b.y + Math.sin(b.a) * h]; }
function bodyJ(b, Jx, Jy, rx, ry) { b.vx += Jx / b.m; b.vy += Jy / b.m; const dw = (rx * Jy - ry * Jx) / (b.m * VP.K * VP.K); b.w += dw; if (Math.abs(dw) > 1.5) b.spinT = .8; }
let CHX = 0, CHY = 0;
function circleHits(cx, cy, r) {
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < 8; i++) { const an = i * .7854, dx = Math.cos(an), dy = Math.sin(an); if (solidAt(cx + dx * r, cy + dy * r)) { sx += dx; sy += dy; n++; } }
  if (solidAt(cx, cy)) n += 4; CHX = sx; CHY = sy; return n;
}
let WCX = 0, WCY = 0, WCV = 0, WCNX = 0, WCNY = 0;
function bodyWall(b) {
  let dv = 0; const r = b.wid / 2;
  for (let k = 0; k < 2; k++) {
    let [cx, cy] = capC(b, k), n = circleHits(cx, cy, r); if (!n) continue;
    let nx = -CHX, ny = -CHY; const L = Math.hypot(nx, ny);
    if (L < 1e-6) { const s = bodySpeed(b) || 1; nx = -b.vx / s; ny = -b.vy / s; } else { nx /= L; ny /= L; }
    for (let s = 0; s < 24 && n; s++) { b.x += nx * 1.5; b.y += ny * 1.5; [cx, cy] = capC(b, k); n = circleHits(cx, cy, r); }
    const px = cx - nx * r, py = cy - ny * r, rx = px - b.x, ry = py - b.y, pvx = b.vx - b.w * ry, pvy = b.vy + b.w * rx, vn = pvx * nx + pvy * ny;
    WCX = px; WCY = py; WCV = Math.max(WCV, Math.abs(pvx * ny - pvy * nx)); WCNX = nx; WCNY = ny;
    if (vn >= 0) continue;
    const I = b.m * VP.K * VP.K, rn = rx * ny - ry * nx, j = -(1 + VP.E_WALL) * vn / (1 / b.m + rn * rn / I);
    const tx = -ny, ty = nx, vt = pvx * tx + pvy * ty, rt = rx * ty - ry * tx, jm = VP.MU_C * j, jt = clamp(-vt / (1 / b.m + rt * rt / I), -jm, jm);
    const Jx = nx * j + tx * jt, Jy = ny * j + ty * jt; bodyJ(b, Jx, Jy, rx, ry); dv = Math.max(dv, Math.hypot(Jx, Jy) / b.m);
  }
  return dv;
}
/* ---------- Mašina į mašiną ---------- */
let SC1X = 0, SC1Y = 0, SC2X = 0, SC2Y = 0;
const cl01 = t => t < 0 ? 0 : t > 1 ? 1 : t;
function segClosest(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1x = bx - ax, d1y = by - ay, d2x = dx - cx, d2y = dy - cy, rx = ax - cx, ry = ay - cy;
  const a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry; let s = 0, t = 0;
  if (a > 1e-9 || e > 1e-9) {
    if (a <= 1e-9) t = cl01(f / e);
    else { const c = d1x * rx + d1y * ry;
      if (e <= 1e-9) s = cl01(-c / a);
      else { const bb = d1x * d2x + d1y * d2y, den = a * e - bb * bb; s = den > 1e-9 ? cl01((bb * f - c * e) / den) : 0; t = (bb * s + f) / e;
        if (t < 0) { t = 0; s = cl01(-c / a); } else if (t > 1) { t = 1; s = cl01((bb - c) / a); } } }
  }
  SC1X = ax + d1x * s; SC1Y = ay + d1y * s; SC2X = cx + d2x * t; SC2Y = cy + d2y * t;
}
let DV1 = 0, DV2 = 0;
/* Impulsas pagal masę ir smūgio tašką; DV1, DV2 - greičio pokyčiai (žalai) */
function bodyPair(b1, b2) {
  DV1 = DV2 = 0;
  const [a1x, a1y] = capC(b1, 0), [c1x, c1y] = capC(b1, 1), [a2x, a2y] = capC(b2, 0), [c2x, c2y] = capC(b2, 1);
  segClosest(a1x, a1y, c1x, c1y, a2x, a2y, c2x, c2y);
  let nx = SC1X - SC2X, ny = SC1Y - SC2Y; const d = Math.hypot(nx, ny), R = (b1.wid + b2.wid) / 2; if (d >= R) return false;
  if (d < 1e-6) { nx = -Math.sin(b1.a); ny = Math.cos(b1.a); } else { nx /= d; ny /= d; }
  const im1 = 1 / b1.m, im2 = 1 / b2.m, sh = (R - d) / (im1 + im2);
  b1.x += nx * sh * im1; b1.y += ny * sh * im1; b2.x -= nx * sh * im2; b2.y -= ny * sh * im2;
  const px = (SC1X + SC2X) / 2, py = (SC1Y + SC2Y) / 2, r1x = px - b1.x, r1y = py - b1.y, r2x = px - b2.x, r2y = py - b2.y;
  const rvx = (b1.vx - b1.w * r1y) - (b2.vx - b2.w * r2y), rvy = (b1.vy + b1.w * r1x) - (b2.vy + b2.w * r2x), vn = rvx * nx + rvy * ny;
  if (vn >= 0) return true;
  const I1 = b1.m * VP.K * VP.K, I2 = b2.m * VP.K * VP.K, rn1 = r1x * ny - r1y * nx, rn2 = r2x * ny - r2y * nx;
  const j = -(1 + VP.E_CAR) * vn / (im1 + im2 + rn1 * rn1 / I1 + rn2 * rn2 / I2);
  const tx = -ny, ty = nx, vt = rvx * tx + rvy * ty, rt1 = r1x * ty - r1y * tx, rt2 = r2x * ty - r2y * tx, jm = VP.MU_C * j;
  const jt = clamp(-vt / (im1 + im2 + rt1 * rt1 / I1 + rt2 * rt2 / I2), -jm, jm), Jx = nx * j + tx * jt, Jy = ny * j + ty * jt, J = Math.hypot(Jx, Jy);
  bodyJ(b1, Jx, Jy, r1x, r1y); bodyJ(b2, -Jx, -Jy, r2x, r2y); DV1 = J * im1; DV2 = J * im2; return true;
}
/* Visos poros per tinklelį (80 vnt.); hit(b1, b2, dv1, dv2) - po kontakto */
const VGRID = new Map();
function bodyPairsGrid(list, hit) {
  VGRID.clear();
  for (let i = 0; i < list.length; i++) { const b = list[i], k = Math.floor(b.x / 80) * 100000 + Math.floor(b.y / 80); b._gi = i; let a = VGRID.get(k); if (!a) { a = []; VGRID.set(k, a); } a.push(b); }
  for (const b of list) { const gx = Math.floor(b.x / 80), gy = Math.floor(b.y / 80);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) { const a = VGRID.get((gx + ox) * 100000 + gy + oy); if (!a) continue;
      for (const o of a) if (o._gi > b._gi && bodyPair(b, o) && hit) hit(b, o, DV1, DV2); } }
}
function impactDmg(base, dv) { return dv < VP.DMG_MIN ? 0 : base * Math.max(.3, Math.min(3, dv / VP.DMG_REF)); }
