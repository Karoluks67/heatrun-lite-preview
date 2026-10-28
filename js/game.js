/* game: runas - žaidėjo mašina, policija, ginklai, paėmimai, lygiai ir kortelės, bosai, efektai */
'use strict';
const pl = { x: 0, y: 0, a: -Math.PI / 2, vx: 0, vy: 0, nitro: .5, boost: false, inv: 0, hp: 150, max: 150, L: 30, W: 13, drift: 0, spr: '', sh: '' };
let G = null, cops = [], proj = [], haz = [], gems = [], ps = [], nums = [], zaps = [], scorch = [], shake = 0, slowmo = 0;
const TOP = 500;   // vnt./s (prototipo pl.top 520)

function newRun() {
  const car = CARS.find(c => c.id === save.car) || CARS[0], cs = save.cars[car.id], up = cs.up;
  cops = []; proj = []; haz = []; gems = []; ps = []; nums = []; zaps = []; scorch = []; broken.clear(); civReset(); shake = 0; slowmo = 0;
  G = { t: 0, car, up, lvl: 1, xp: 0, need: xpNeed(1), coins: 0, kills: 0, w: { [car.w]: 1 + up.wpn }, tl: {}, cd: {}, orbA: 0, laser: null,
    spawnT: 2, bossI: 0, bossWarn: 0, banner: null, over: 0, revived: false, started: false, cards: null, pend: 0, hitStop: 0, tut: save.runs === 0 };
  const mx = Math.round((150 + car.hp + up.arm * 20));
  Object.assign(pl, { x: 0, y: 0, a: -Math.PI / 2, vx: 0, vy: 0, nitro: .5 + up.nit * .1, boost: false, inv: 1.5, hp: mx, max: mx, drift: 0,
    spr: `car_${car.id}_${cs.paint}`, sh: `car_${car.id}_sh` });
  const r = A.spr.cars.find(c => c.id === car.id); pl.L = r.L / PPU / 2 * .92; pl.W = 12 / PPU / 2 * .9;
  const [fx, fy] = freeNear(0, 0); pl.x = fx; pl.y = fy;
}
/* ---------- Dydžiai su pasyvais ir garažu ---------- */
const TL = k => G.tl[k] || 0;
const dmgMul = () => 1 + TL('caliber') * .1;
const cdMul = () => 1 / (1 + TL('cool') * .08);
const areaMul = () => 1 + TL('area') * .1;
const amtAdd = () => TL('amount');
const magR = () => 120 * (1 + TL('magnet') * .25 + G.up.mag * .25);
const topSpd = () => TOP * (1 + TL('engine') * .06 + G.up.eng * .05 + G.car.spd);
function recomputeMax() { const m = Math.round((150 + G.car.hp + G.up.arm * 20) * (1 + TL('hp') * .15)); pl.hp += m - pl.max; pl.max = m; }
const heatIdx = () => { let h = 0; while (h + 1 < HEAT_AT.length && G.t >= HEAT_AT[h + 1]) h++; return h; };
const heatHp = () => { const h = heatIdx(), a = HEAT_AT[h], b = HEAT_AT[h + 1] || a + 300; return lerp(HEAT_HP[h], HEAT_HP[h + 1] || HEAT_HP[h] * 1.3, clamp((G.t - a) / (b - a), 0, 1)); };

/* ---------- Žaidėjas: rodai kryptį - mašina sukasi ten, dujos automatinės; driftas staigiame posūkyje pildo nitro ---------- */
function inputDir() {
  if (stick.on && Math.hypot(stick.dx, stick.dy) > .25) return [stick.dx, stick.dy];
  const [kx, ky] = keyDir(); if (kx || ky) return [kx, ky];
  return null;
}
function stepPlayer(dt) {
  const d = inputDir(); let steer = 0, thr = G.started ? 1 : 0, brk = 0;
  if (d) {
    const want = Math.atan2(d[1], d[0]), df = angDiff(pl.a, want); steer = clamp(df * 2.4, -1, 1);
    const vF0 = pl.vx * Math.cos(pl.a) + pl.vy * Math.sin(pl.a); if (Math.abs(df) > 2.3 && vF0 > 220) { brk = 1; thr = .2; }
  }
  const nIn = keys.Space || keys.ShiftLeft || keys.ShiftRight || nitroBtn.on;
  pl.boost = G.started && nIn && pl.nitro > .02;
  if (pl.boost && !pl.wasBoost) { sfx('nitro'); G.nitroUsed = true; } pl.wasBoost = pl.boost;
  const sp0 = Math.hypot(pl.vx, pl.vy), tr = 3.1 * clamp(sp0 / 160, .25, 1) * (pl.drift > 0 ? 1.15 : 1);
  pl.a += steer * tr * dt;
  const fx = Math.cos(pl.a), fy = Math.sin(pl.a), rx = -fy, ry = fx;
  let vF = pl.vx * fx + pl.vy * fy, vR = pl.vx * rx + pl.vy * ry;
  const top = topSpd() * surfV(pl.x, pl.y) * (pl.boost ? 1.45 : 1);
  if (brk) vF -= 900 * dt; else vF += (top * thr - vF) * (pl.boost ? 2.6 : 1.5) * dt;
  /* driftas: staigus posūkis greitai - mažas sukibimas (slysta), kitaip - kelias „sugaudo" šoninį greitį */
  const drifting = Math.abs(steer) > .75 && vF > 300; pl.drift = drifting ? Math.min(1, pl.drift + dt * 3) : Math.max(0, pl.drift - dt * 2);
  vR *= Math.exp(-(drifting ? 2.4 : 10) * dt);
  pl.vx = fx * vF + rx * vR; pl.vy = fy * vF + ry * vR;
  const nm = 1 + TL('nitro') * .15 + G.up.nit * .2;
  if (pl.boost) pl.nitro = Math.max(0, pl.nitro - .3 * dt);
  else pl.nitro = Math.min(1, pl.nitro + dt * (.035 + (drifting && Math.abs(vR) > 60 ? .22 : 0)) * nm);
  /* judėjimas su sienomis: ašimis atskirai, atšokimas */
  const nx = pl.x + pl.vx * dt; if (solidCar(nx, pl.y, pl.a, pl.L, pl.W)) { crash(Math.abs(pl.vx)); pl.vx *= -.25; } else pl.x = nx;
  const ny = pl.y + pl.vy * dt; if (solidCar(pl.x, ny, pl.a, pl.L, pl.W)) { crash(Math.abs(pl.vy)); pl.vy *= -.25; } else pl.y = ny;
  if (solidAt(pl.x, pl.y)) { const [a, b] = freeNear(pl.x, pl.y); pl.x = a; pl.y = b; }
  const sp = Math.hypot(pl.vx, pl.vy);
  if (sp > 120) smashProps(pl.x + fx * pl.L * .7, pl.y + fy * pl.L * .7, 26, sp);
  /* dūmai driftuojant, nitro liepsna */
  const bx = pl.x - fx * pl.L * .8, by = pl.y - fy * pl.L * .8;
  if (pl.drift > .3 && Math.random() < .7) for (const s of [1, -1]) puff(bx + rx * pl.W * s, by + ry * pl.W * s, rnd(-30, 30), rnd(-30, 30), .6, 2 + Math.random() * 2, '#E8EAEE', '#B9BEC6');
  if (pl.boost) for (let i = 0; i < 2; i++) ps.push({ k: 'sq', x: bx, y: by, vx: -fx * 300 + rnd(-60, 60), vy: -fy * 300 + rnd(-60, 60), life: .18, max: .18, c: pick(['#BFF3FF', '#5AB8FF', '#FFFFFF']), s: 2 });
  engine(sp, G.started);
  return sp;
}
function crash(v) { if (v < 180) return; shake = Math.max(shake, Math.min(.35, v / 1500)); sfx('crash'); for (let i = 0; i < 6; i++) ps.push({ k: 'sq', x: pl.x, y: pl.y, vx: rnd(-200, 200), vy: rnd(-200, 200), life: .25, max: .25, c: pick(['#FFF3B0', '#FFD23F', '#FF8A2A']), s: 1 }); }

/* ---------- Policija ---------- */
function spawnCop(type, boss) {
  const T = boss ? null : COP[type], vr = Math.hypot(WW, WH) / 2 / PPU;
  for (let i = 0; i < 14; i++) {
    const a = pl.a + rnd(-1.6, 1.6) + (Math.random() < .3 ? Math.PI : 0), d = vr + rnd(60, 260), x = pl.x + Math.cos(a) * d, y = pl.y + Math.sin(a) * d;
    if (!ready(x, y) || clsAt(x, y) > 6 || solidCar(x, y, a + Math.PI, 40, 18)) continue;
    const hs = heatHp(); let c;
    if (boss) c = { boss: boss.k, x, y, a: a + Math.PI, v: 0, hp: boss.hp * (1 + G.t / 900), r: boss.k === 'heli' ? 40 : 46, dmg: boss.k === 'heli' ? 0 : 35, xp: boss.xp, coin: boss.coin, spd: boss.k === 'heli' ? 380 : 210, fireT: 3, spr: '' };
    else c = { type, x, y, a: a + Math.PI, v: T.spd * .6, hp: T.hp * hs, r: T.r, dmg: T.dmg, xp: T.xp, spd: T.spd * (1 + heatIdx() * .03) * (G.t < 120 ? .88 : 1), spr: T.spr };
    c.max = c.hp; c.flash = 0; c.dead = false; c.stuck = 0; c.slow = 0; c.hitCd = 0; c.sirT = Math.random();
    cops.push(c); return c;
  }
  return null;
}
function spawner(dt) {
  const t = G.t, alive = cops.reduce((n, c) => n + (c.dead || c.boss ? 0 : 1), 0);
  const want = Math.min(55, t < 25 ? 3 : t < 240 ? 4 + Math.floor(t / 15) : 20 + Math.floor((t - 240) / 8));
  G.spawnT -= dt; if (G.spawnT > 0 || alive >= want) return;
  G.spawnT = Math.max(.3, 1.3 - t / 320);
  const pool = []; for (const k in COP) if (t >= COP[k].at) for (let i = 0; i < ({ patrol: 5, inter: 3, suv: 2, van: 1, rhino: 1 })[k]; i++) pool.push(k);
  const n = Math.min(want - alive, t < 60 ? 1 : 1 + Math.floor(Math.random() * Math.min(4, 1 + t / 90)));
  for (let i = 0; i < n; i++) spawnCop(pick(pool));
  /* bosai: įspėjimas 5 s prieš */
  const B = BOSS[G.bossI % BOSS.length], at = B.at + Math.floor(G.bossI / BOSS.length) * 540;
  if (t >= at - 5 && !G.bossWarn) { G.bossWarn = 1; banner(B.k === 'heli' ? L('chopperIn') : L('tankIn'), '#FF4F4F', 3); sfx('warn'); }
  if (t >= at && spawnCop(null, B)) { G.bossI++; G.bossWarn = 0; }
}
function stepCops(dt) {
  const tx = pl.x + pl.vx * .35, ty = pl.y + pl.vy * .35;
  for (const c of cops) {
    c.flash = Math.max(0, c.flash - dt); c.hitCd = Math.max(0, c.hitCd - dt); c.slow = Math.max(0, c.slow - dt);
    if (c.dead) continue;
    const dx = tx - c.x, dy = ty - c.y, dist = Math.hypot(pl.x - c.x, pl.y - c.y);
    if (c.boss === 'heli') { stepHeli(c, dt, dist); continue; }
    let want;
    if (dist < 420 && los(c.x, c.y, pl.x, pl.y)) want = Math.atan2(dy, dx);
    else { want = navDir(c.x, c.y); if (want === null) want = Math.atan2(dy, dx); }
    const df = angDiff(c.a, want); c.a += clamp(df, -3.4 * dt, 3.4 * dt);
    const vmax = c.spd * (c.slow > 0 ? .45 : 1) * (Math.abs(df) > 1.2 ? .55 : 1) * surfV(c.x, c.y);
    c.v += (vmax - c.v) * 2 * dt;
    const vx = Math.cos(c.a) * c.v, vy = Math.sin(c.a) * c.v; let moved = false;
    const nx = c.x + vx * dt; if (!solidAt(nx, c.y) && !solidAt(nx + Math.cos(c.a) * c.r, c.y)) { c.x = nx; moved = true; }
    const ny = c.y + vy * dt; if (!solidAt(c.x, ny) && !solidAt(c.x, ny + Math.sin(c.a) * c.r)) { c.y = ny; moved = true; }
    if (!moved) { c.v *= .3; c.stuck += dt; } else c.stuck = Math.max(0, c.stuck - dt);
    if (c.stuck > 1.6) { c.a += Math.PI * rnd(.5, 1); c.stuck = 0; }
    if (dist > 2400 && !c.boss) { c.dead = true; c.deadT = 0; c.gone = true; }   // per toli - perkeliamas (gims iš naujo)
    if (c.boss === 'tank') { c.fireT -= dt; if (c.fireT <= 0 && dist < 700) { c.fireT = 3.2; bombAt(pl.x + pl.vx * .9, pl.y + pl.vy * .9, 1.3, 95, 30); } }
    /* susidūrimas su žaidėju: abu atstumiami; žaidėjas gauna žalos, policija - taranavimo žalą */
    const rr = c.r + 22;
    if (dist < rr) {
      const nx2 = (c.x - pl.x) / (dist || 1), ny2 = (c.y - pl.y) / (dist || 1), push = (rr - dist);
      c.x += nx2 * push * .7; c.y += ny2 * push * .7; pl.x -= nx2 * push * .3; pl.y -= ny2 * push * .3;
      const rel = Math.max(0, (pl.vx - Math.cos(c.a) * c.v) * nx2 + (pl.vy - Math.sin(c.a) * c.v) * ny2);
      if (c.hitCd <= 0) { c.hitCd = .3; hurtCop(c, (8 + rel * .06) * (pl.boost ? 3 : 1) * dmgMul()); sfx('crash'); shake = Math.max(shake, .12); }
      if (pl.inv <= 0 && c.dmg > 0 && !G.over) hurtPlayer(c.dmg * (1 + heatIdx() * .15));
      c.v *= .4;
    }
  }
  /* atstumas tarp policijos mašinų */
  for (let i = 0; i < cops.length; i++) { const a = cops[i]; if (a.dead || a.boss === 'heli') continue;
    for (let j = i + 1; j < cops.length; j++) { const b = cops[j]; if (b.dead || b.boss === 'heli') continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r; if (d >= m || d === 0) continue;
      const p = (m - d) / 2 / d; a.x -= dx * p; a.y -= dy * p; b.x += dx * p; b.y += dy * p; } }
  cops = cops.filter(c => !(c.dead && c.deadT <= 0));
}
function stepHeli(c, dt, dist) {   // sraigtasparnis: skrenda virš namų, sukasi aplink ir meta bombas
  c.orb = (c.orb || 0) + dt * .45; const ox = pl.x + Math.cos(c.orb) * 260, oy = pl.y + Math.sin(c.orb) * 260;
  const want = Math.atan2(oy - c.y, ox - c.x); c.a += clamp(angDiff(c.a, want), -2 * dt, 2 * dt);
  const v = Math.min(c.spd, Math.hypot(ox - c.x, oy - c.y) * 2); c.x += Math.cos(want) * v * dt; c.y += Math.sin(want) * v * dt;
  c.fireT -= dt; if (c.fireT <= 0 && dist < 650) { c.fireT = 2.4; bombAt(pl.x + pl.vx * .8 + rnd(-40, 40), pl.y + pl.vy * .8 + rnd(-40, 40), 1.2, 85, 22); }
}
function bombAt(x, y, t, r, dmg) { haz.push({ k: 'bomb', x, y, t, max: t, r, dmg }); }
function hurtPlayer(d) {
  pl.hp -= Math.max(1, d * (G.t < 240 ? .45 : Math.min(1, .45 + (G.t - 240) / 240 * .55)) - TL('armor')); pl.inv = .7; shake = Math.max(shake, .25); sfx('hit'); G.hurtT = .3;   // iki 4 min. - 45 % žalos, iki 8 min. tolygiai iki 100 % (Poki: naujokas turi išbūti 3+ min.)
  if (pl.hp <= 0) { pl.hp = 0; die(); }
}
function hurtCop(c, d) {
  if (c.dead) return; c.hp -= d; c.flash = .1; if (d >= 12 && nums.length < 14) nums.push({ x: c.x + rnd(-10, 10), y: c.y - 20, v: Math.round(d), t: .5 });
  if (c.hp <= 0) killCop(c);
}
function killCop(c) {
  c.dead = true; c.deadT = 0;   // kaip Steam versijoje (Run.Cops KillCop): mašina sprogsta ir dingsta, lieka apdegusi dėmė
  G.kills++; carBlast(c.x, c.y, !!c.boss, c.type === 'van' ? ['#1F2A44', '#3A3D44', '#E0443A'] : ['#F5F5F0', '#1E1F24', '#3D7BFF', '#E0443A'], pl.vx * .3, pl.vy * .3);
  if (c.xp > 0) dropXp(c.x, c.y, c.xp);
  const cc = c.boss ? c.coin : Math.random() < .2 + (c.xp >= 3 ? .25 : 0) ? 1 + (c.xp >= 3 ? 1 : 0) : 0;
  for (let i = 0; i < cc; i++) gems.push({ k: 'coin', x: c.x + rnd(-30, 30) * (c.boss ? 3 : 1), y: c.y + rnd(-30, 30) * (c.boss ? 3 : 1), v: 1 });
  const r = Math.random(); if (!c.boss && r < .025) gems.push({ k: 'heal', x: c.x, y: c.y, v: 1 }); else if (!c.boss && r < .035) gems.push({ k: 'magnet', x: c.x, y: c.y, v: 1 });
  if (c.boss) { banner(L('bossDown'), '#F2C230', 2.5); pl.hp = Math.min(pl.max, pl.hp + pl.max * .5); G.pend++; slowmo = .8; }
}
function dropXp(x, y, v) { if (gems.length > 260) { const g = gems.find(g => g.k === 'xp'); if (g) { g.v += v; return; } } gems.push({ k: 'xp', x, y, v }); }

/* ---------- Ginklai ---------- */
function nearestCop(x, y, R, skip) {
  let b = null, bd = R * R; for (const c of cops) { if (c.dead || (skip && skip.has(c))) continue; const d = (c.x - x) ** 2 + (c.y - y) ** 2; if (d < bd) { bd = d; b = c; } } return b;
}
function stepWeapons(dt) {
  const fx = Math.cos(pl.a), fy = Math.sin(pl.a);
  for (const w in G.w) {
    const lv = G.w[w]; if (w === 'orbit') continue;
    G.cd[w] = (G.cd[w] || 0) - dt; if (G.cd[w] > 0) continue;
    const dmg = wv(w, 'dmg', lv) * dmgMul(), amt = wv(w, 'amt', lv) + amtAdd(), area = wv(w, 'area', lv) * areaMul();
    let fired = true;
    if (w === 'turret') {
      const t = nearestCop(pl.x, pl.y, area); if (!t) { fired = false; } else for (let i = 0; i < amt; i++) {
        const a = Math.atan2(t.y - pl.y, t.x - pl.x) + (i - (amt - 1) / 2) * .12; proj.push({ k: 'bul', x: pl.x, y: pl.y, vx: Math.cos(a) * 950, vy: Math.sin(a) * 950, life: area / 900, dmg, r: 16, col: '#FFE680' });
      } if (fired) sfx('shot');
    } else if (w === 'shotgun') {
      const t = nearestCop(pl.x, pl.y, area); if (!t) fired = false; else { const a0 = Math.atan2(t.y - pl.y, t.x - pl.x);
        for (let i = 0; i < amt; i++) { const a = a0 + rnd(-.32, .32), s = rnd(850, 1050); proj.push({ k: 'bul', x: pl.x, y: pl.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: area / 950, dmg, r: 14, col: '#FFD23F' }); } sfx('shot'); }
    } else if (w === 'rockets') {
      if (!nearestCop(pl.x, pl.y, 800)) fired = false; else for (let i = 0; i < amt; i++) { const a = pl.a + Math.PI + rnd(-1, 1);
        proj.push({ k: 'rkt', x: pl.x, y: pl.y, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250, a, life: 3, dmg, r: 18, area, tgt: null }); }
    } else if (w === 'mines') {
      for (let i = 0; i < amt; i++) haz.push({ k: 'mine', x: pl.x - fx * pl.L * 1.2 + rnd(-10, 10), y: pl.y - fy * pl.L * 1.2 + rnd(-10, 10), arm: .5, life: WPN.mines.dur, r: area, dmg });
    } else if (w === 'spikes') {
      for (let i = 0; i < amt; i++) { const s = (i - (amt - 1) / 2) * 16; haz.push({ k: 'spike', x: pl.x - fx * pl.L * 1.2 - fy * s, y: pl.y - fy * pl.L * 1.2 + fx * s, life: WPN.spikes.dur, r: 26, dmg, hit: new Set() }); }
    } else if (w === 'tesla') {
      let from = { x: pl.x, y: pl.y }; const hit = new Set(); let t = nearestCop(pl.x, pl.y, 380);
      if (!t) fired = false; else { for (let i = 0; i < amt && t; i++) { zaps.push({ x0: from.x, y0: from.y, x1: t.x, y1: t.y, t: .18 }); hurtCop(t, dmg); hit.add(t); from = t; t = nearestCop(t.x, t.y, area, hit); } sfx('zap'); }
    } else if (w === 'laser') {
      if (!nearestCop(pl.x, pl.y, area)) fired = false; else G.laser = { t: wv(w, 'dur', lv), len: area, dmg: dmg * .3, n: amt, tick: 0 };
    }
    G.cd[w] = fired ? wv(w, 'cd', lv) * cdMul() : .15;
  }
  /* orbita: dronai sukasi aplink, kiekvienas daužo policiją */
  if (G.w.orbit) {
    const lv = G.w.orbit, n = wv('orbit', 'amt', lv) + amtAdd(), R = wv('orbit', 'area', lv) * areaMul(), dmg = wv('orbit', 'dmg', lv) * dmgMul(); G.orbA += dt * 3.2;
    for (let i = 0; i < n; i++) { const a = G.orbA + i / n * TAU, x = pl.x + Math.cos(a) * R, y = pl.y + Math.sin(a) * R;
      for (const c of cops) if (!c.dead) { if ((c.x - x) ** 2 + (c.y - y) ** 2 < (c.r + 16) ** 2 && !(c.orbCd > G.t)) { c.orbCd = G.t + .4; hurtCop(c, dmg); sfx('hit'); } } }
  }
  if (G.laser) {   // lazeris: spindulys priekin, žala kas 0,15 s
    const L = G.laser; L.t -= dt; L.tick -= dt;
    if (L.tick <= 0) { L.tick = .15; for (let k = 0; k < L.n; k++) { const a = pl.a + (k - (L.n - 1) / 2) * .5, ex = Math.cos(a), ey = Math.sin(a);
      for (const c of cops) { if (c.dead) continue; const px = c.x - pl.x, py = c.y - pl.y, f = px * ex + py * ey, s = Math.abs(-px * ey + py * ex); if (f > 0 && f < L.len && s < c.r + 10) hurtCop(c, L.dmg); } } }
    if (L.t <= 0) G.laser = null;
  }
  /* sviediniai */
  for (const p of proj) {
    p.life -= dt;
    if (p.k === 'rkt') { if (!p.tgt || p.tgt.dead) p.tgt = nearestCop(p.x, p.y, 900); const sp = Math.min(700, Math.hypot(p.vx, p.vy) + 900 * dt);
      if (p.tgt) { const w = Math.atan2(p.tgt.y - p.y, p.tgt.x - p.x); p.a += clamp(angDiff(p.a, w), -5 * dt, 5 * dt); } p.vx = Math.cos(p.a) * sp; p.vy = Math.sin(p.a) * sp;
      if (Math.random() < .6) puff(p.x, p.y, 0, 0, .4, 2, '#E8EAEE', '#B9BEC6'); }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (solidAt(p.x, p.y)) { p.life = 0; if (p.k === 'rkt') explode(p.x, p.y, p.area, p.dmg); continue; }
    for (const c of cops) { if (c.dead) continue; if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 < (c.r + p.r) ** 2) { if (p.k === 'rkt') explode(p.x, p.y, p.area, p.dmg); else { hurtCop(c, p.dmg); sfx('hit'); } p.life = 0; break; } }
  }
  proj = proj.filter(p => p.life > 0);
  /* žemėje: minos, spygliai, bosų bombos */
  for (const h of haz) {
    if (h.k === 'bomb') { h.t -= dt; if (h.t <= 0) { h.done = 1; boom(h.x, h.y, 1.4); sfx('boom'); shake = Math.max(shake, .3); if (Math.hypot(pl.x - h.x, pl.y - h.y) < h.r + 18 && pl.inv <= 0 && !G.over) hurtPlayer(h.dmg); } continue; }
    h.life -= dt; if (h.life <= 0) { h.done = 1; continue; }
    if (h.k === 'mine') { h.arm -= dt; if (h.arm > 0) continue; if (nearestCop(h.x, h.y, 50)) { h.done = 1; explode(h.x, h.y, h.r, h.dmg); } }
    else if (h.k === 'spike') for (const c of cops) { if (c.dead || c.boss === 'heli' || h.hit.has(c)) continue; if ((c.x - h.x) ** 2 + (c.y - h.y) ** 2 < (c.r + h.r) ** 2) { h.hit.add(c); c.slow = 1.5; hurtCop(c, h.dmg); } }
  }
  haz = haz.filter(h => !h.done);
}
function explode(x, y, r, dmg) { boom(x, y, r / 70); sfx('boom'); shake = Math.max(shake, .15); for (const c of cops) if (!c.dead && (c.x - x) ** 2 + (c.y - y) ** 2 < (r + c.r) ** 2) hurtCop(c, dmg); }

/* ---------- Paėmimai: XP kristalai, monetos, taisymas, magnetas ---------- */
function stepGems(dt) {
  const R = magR();
  for (const g of gems) {
    const dx = pl.x - g.x, dy = pl.y - g.y, d = Math.hypot(dx, dy);
    if (!g.fly && (d < R || g.k === 'coin' && d < R * 1.3)) g.fly = 1;
    if (g.fly) { g.sp = (g.sp || 200) + 1400 * dt; g.x += dx / d * g.sp * dt; g.y += dy / d * g.sp * dt; }
    if (d < 34) {
      g.got = 1;
      if (g.k === 'xp') { G.xp += g.v; sfx('gem'); }
      else if (g.k === 'coin') { G.coins += g.v; sfx('coin'); }
      else if (g.k === 'heal') { pl.hp = Math.min(pl.max, pl.hp + pl.max * .3); sfx('buy'); }
      else if (g.k === 'magnet') { for (const q of gems) if (q.k === 'xp' || q.k === 'coin') q.fly = 1; sfx('buy'); }
    }
  }
  gems = gems.filter(g => !g.got);
  while (G.xp >= G.need) { G.xp -= G.need; G.lvl++; G.need = xpNeed(G.lvl); G.pend++; }
}
/* ---------- Kortelės: 3 pasirinkimai (ginklai iki 4, pasyvai iki 4) ---------- */
function makeCards() {
  const opt = [];
  for (const w in WPN) { const lv = G.w[w] || 0; if (lv >= W_MAX) continue; if (!lv && Object.keys(G.w).length >= W_SLOTS) continue; opt.push({ t: 'w', k: w, lv: lv + 1, wt: lv ? 3 : 1.4 }); }
  for (const k in TOME) { const lv = G.tl[k] || 0, mx = TOME[k].max || T_MAX; if (lv >= mx) continue; if (!lv && Object.keys(G.tl).length >= T_SLOTS) continue; opt.push({ t: 'p', k, lv: lv + 1, wt: lv ? 2 : 1 }); }
  const out = [];
  while (out.length < 3 && opt.length) { let s = opt.reduce((a, o) => a + o.wt, 0) * Math.random(), i = 0; for (; i < opt.length - 1; i++) { s -= opt[i].wt; if (s <= 0) break; } out.push(opt.splice(i, 1)[0]); }
  while (out.length < 3) out.push(out.length ? { t: 'c', k: 'coins', lv: 0 } : { t: 'h', k: 'heal', lv: 0 });
  return out;
}
function takeCard(c) {
  if (c.t === 'w') G.w[c.k] = c.lv; else if (c.t === 'p') { G.tl[c.k] = c.lv; if (c.k === 'hp') recomputeMax(); }
  else if (c.t === 'h') pl.hp = Math.min(pl.max, pl.hp + pl.max * .4); else G.coins += 10;
  G.pend--; G.cards = null; G.cardTut = 1; pl.inv = Math.max(pl.inv, .6); sfx('buy');
}

/* ---------- Efektai: pilki dūmų kamuoliai su šešėline puse, kibirkštys, žiedai (ne plokšti skaidrūs diskai) ---------- */
function puff(x, y, vx, vy, life, r, c1, c2) { if (ps.length < 500) ps.push({ k: 'puff', x, y, vx, vy, life, max: life, r, c1, c2 }); }
/* Sprogimas (Steam Run.Explode): ryškus žiedas, ugnies kvadratėliai (balta-geltona -> oranžinė -> pilka), apdegusi dėmė ant žemės; R - vnt. */
function blast(x, y, R) {
  ps.push({ k: 'ring', x, y, life: .35, max: .35, r: R }, { k: 'flash', x, y, life: .16, max: .16, r: R > 100 ? 9 : 6 });
  for (let i = 0; i < (R > 100 ? 40 : 18); i++) { const a = Math.random() * TAU, v = 40 + Math.random() * R * 2.4, l = .45 + Math.random() * .35; ps.push({ k: 'fire', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, s: R > 100 ? 4 : 3 }); }
  scorch.push({ x, y, r: R * .55, t: 9, seed: Math.random() * 1e4 | 0 }); if (scorch.length > 40) scorch.shift();
  civBlast(x, y, R, R > 100 ? 60 : 35);   // grandinės: sprogimas žaloja ir stumia civilines mašinas
  sfx(R > 100 ? 'boom' : 'small'); if (R > 60) shake = Math.max(shake, R > 100 ? .4 : .12);
}
function boom(x, y, s) { blast(x, y, 45 * s); for (let i = 0; i < 3 * s; i++) puff(x + rnd(-20, 20), y + rnd(-20, 20), rnd(-30, 30), rnd(-50, -20), rnd(1, 1.8), 3, '#5A5E68'); }
/* Mašinos sprogimas (Steam KillCop): sprogimas, kėbulo dalys jos spalvomis, 1-2 detalės (buferis, ratlankis, veidrodėlis), dūmai. Be žmonių ir kraujo */
function carBlast(x, y, big, cols, vx, vy) {
  blast(x, y, big ? 140 : 55);
  for (let i = 0; i < (big ? 30 : 7); i++) { const a = Math.random() * TAU, v = 120 + Math.random() * 260; ps.push({ k: 'sq', x, y, vx: Math.cos(a) * v + vx, vy: Math.sin(a) * v + vy, life: .5 + Math.random() * .4, max: .9, c: cols[i % cols.length], s: 2 }); }
  for (let i = 0; i < (big ? 4 : 1 + (Math.random() < .5)); i++) { const a = Math.random() * TAU, v = rnd(140, 300); ps.push({ k: 'deb', x, y, vx: Math.cos(a) * v + vx, vy: Math.sin(a) * v + vy, a: Math.random() * TAU, va: rnd(-12, 12), life: 2.5, max: 2.5, n: pick(['deb_bumper', 'deb_hub', 'deb_mirror']) }); }
  for (let i = 0; i < 4; i++) puff(x + rnd(-10, 10), y + rnd(-10, 10), rnd(-15, 15), rnd(-35, -20), 1.4 + Math.random(), 3, '#5A5E68');
}
function smashFx(x, y) { for (let i = 0; i < 6; i++) ps.push({ k: 'sq', x, y, vx: rnd(-160, 160), vy: rnd(-160, 160), life: .4, max: .4, c: pick(['#8A6A48', '#5C8F3A', '#C8CCD4', '#3A3E46']), s: 2 }); sfx('hit'); }
function stepFx(dt) {
  for (const p of ps) { p.life -= dt; if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; const dr = p.k === 'fire' ? 1.4 : 3; p.vx *= Math.exp(-dr * dt); p.vy *= Math.exp(-dr * dt); } if (p.va) p.a += p.va * dt * Math.min(1, Math.hypot(p.vx, p.vy) / 120); }
  for (const q of scorch) q.t -= dt; if (scorch.length && scorch[0].t <= 0) scorch.shift();
  ps = ps.filter(p => p.life > 0);
  for (const n of nums) { n.t -= dt; n.y -= 60 * dt; } nums = nums.filter(n => n.t > 0); if (nums.length > 40) nums.splice(0, nums.length - 40);
  for (const z of zaps) z.t -= dt; zaps = zaps.filter(z => z.t > 0);
}
let bannerQ = null;
function banner(s, col, t) { G.banner = { s, col, t, max: t }; }

/* ---------- Runo žingsnis ---------- */
function stepRun(dt) {
  if (G.over) { G.over += dt; stepCops(dt); stepFx(dt); return; }
  if (G.started) G.t += dt;
  if (G.started && pl.hp < pl.max) pl.hp = Math.min(pl.max, pl.hp + dt * .6);   // lėtas savaiminis taisymas (vaikams - ne bausmė už kiekvieną klaidą)
  pl.inv = Math.max(0, pl.inv - dt); G.hurtT = Math.max(0, (G.hurtT || 0) - dt);
  if (G.banner && (G.banner.t -= dt) <= 0) G.banner = null;
  ensureChunks(pl.x + pl.vx * .5, pl.y + pl.vy * .5, 2); ensureChunks(pl.x, pl.y, 1);
  stepPlayer(dt);
  if (!G.started) return;
  if ((NAV.t -= dt) <= 0) { NAV.t = .35; navUpdate(pl.x, pl.y); }
  spawner(dt); stepCops(dt); stepCivs(dt); stepWeapons(dt); stepGems(dt); stepFx(dt);
  if (G.pend > 0 && !G.cards) { G.cards = makeCards(); sfx('lvl'); }
}
function die() {
  G.over = .001; carBlast(pl.x, pl.y, true, [PAINTS[save.cars[G.car.id].paint], '#1E1F24', '#C8CCD4'], 0, 0); shake = .6; slowmo = 1; engine(0, false);
}
function revive() {
  G.over = 0; G.revived = true; pl.hp = Math.round(pl.max * .6); pl.inv = 3; G.reviveT = 0;
  for (const c of cops) if (!c.dead && !c.boss && Math.hypot(c.x - pl.x, c.y - pl.y) < 700) { c.xp = 0; killCop(c); }
}
