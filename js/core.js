/* core: drobė (16:9, sveikas pikselių mastelis), įvestis, ištekliai, pikselinis šriftas, garsas, išsaugojimas, Poki SDK */
'use strict';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const fmtTime = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');

/* ---------- Drobė: pasaulis ir UI piešiami mažoje drobėje (žaidimo pikseliais), paskui padidinami sveiku skaičiumi ---------- */
const cv = document.getElementById('c'), cx2 = cv.getContext('2d');
/* Dvi mažos drobės: pasaulis (KW - ~280 eilučių, stambi mašina) ir UI (K - bent 270 eilučių, 480×270 dėžė centre, HUD - prie kraštų) */
const wcv = document.createElement('canvas'), wctx = wcv.getContext('2d');
const lo = document.createElement('canvas'), uctx = lo.getContext('2d');
let ctx = uctx;
let K = 4, LW = 480, LH = 270, UIX = 0, UIY = 0, KW = 4, WW = 480, WH = 270;
function resize() {
  const vw = innerWidth, vh = innerHeight, ar = 16 / 9;
  let w = vw, h = vw / ar; if (h > vh) { h = vh; w = vh * ar; }
  w = Math.floor(w); h = Math.floor(h);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.style.left = Math.floor((vw - w) / 2) + 'px'; cv.style.top = Math.floor((vh - h) / 2) + 'px';
  const dpr = Math.min(3, devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  /* sveikas mastelis, kai ekranas aukštas; žemame (pvz. 390 px telefonas su DPR 1) - trupmeninis, kad mašina liktų stambi */
  const ch = cv.height;
  KW = ch >= 560 ? Math.round(ch / 280) : ch / 280; WW = Math.ceil(cv.width / KW); WH = Math.ceil(ch / KW); wcv.width = WW; wcv.height = WH;
  K = ch >= 540 ? Math.floor(ch / 270) : ch / 270; LW = Math.ceil(cv.width / K); LH = Math.ceil(ch / K); lo.width = LW; lo.height = LH;
  UIX = Math.floor((LW - 480) / 2); UIY = Math.floor((LH - 270) / 2);
  wctx.imageSmoothingEnabled = false; uctx.imageSmoothingEnabled = false; cx2.imageSmoothingEnabled = false;
}
addEventListener('resize', resize); resize();
function present() { cx2.imageSmoothingEnabled = false; cx2.drawImage(wcv, 0, 0, WW * KW, WH * KW); cx2.drawImage(lo, 0, 0, LW * K, LH * K); }

/* ---------- Ištekliai ---------- */
const A = { spr: null, sprImg: null, props: null, propImg: null, propSh: null, map: null, font: null };
function loadImg(src) { return new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; }); }
function loadJson(src) { return fetch(src).then(r => r.json()); }
/* Šešėlio versija: ta pati forma, juoda, alfa a (kaip Godot ImgC su Color(0,0,0,a)) */
function shadowOf(img, a) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in';
  g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(0, 0, c.width, c.height); return c;
}
function spr(name, x, y, flip) {   // sprite iš atlaso, centras (x, y)
  const r = A.spr.spr[name]; if (!r) return;
  ctx.drawImage(A.sprImg, r[0], r[1], r[2], r[3], Math.round(x - r[2] / 2), Math.round(y - r[3] / 2), r[2], r[3]);
}
/* Atlaso variantai: w - balta forma (smūgio blyksnis), d - patamsinta (sudaužyta mašina); be ctx.filter - jo nepalaiko senesnis iOS Safari */
const ATL = v => v === 'w' ? A.sprW : v === 'd' ? A.sprD : v === 'k' ? A.sprK : A.sprImg;
function tinted(img, col, op) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d');
  g.drawImage(img, 0, 0); g.globalCompositeOperation = op; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height); return c;
}
function sprRot(name, x, y, a, w) {   // pasuktas sprite'as (veidas +x)
  const r = A.spr.spr[name]; if (!r) return;
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(a);
  ctx.drawImage(ATL(w), r[0], r[1], r[2], r[3], -r[2] / 2, -r[3] / 2, r[2], r[3]); ctx.restore();
}
function sprAt(name, x, y, s) {   // UI: kairysis viršus, mastelis s
  const r = A.spr.spr[name]; if (!r) return;
  ctx.drawImage(A.sprImg, r[0], r[1], r[2], r[3], Math.round(x), Math.round(y), r[2] * (s || 1), r[3] * (s || 1));
}

/* ---------- Pikselinis šriftas (Steam versijos Hud.GlyphX: 5×10, 2 eilutės diakritikams) ---------- */
const FONT = { at: {}, idx: {} };
function fontInit() {
  const keys = Object.keys(A.font); const c = document.createElement('canvas'); c.width = keys.length * 6; c.height = 10;
  const g = c.getContext('2d'); g.fillStyle = '#fff';
  keys.forEach((k, i) => { FONT.idx[k] = i; A.font[k].forEach((row, y) => { for (let x = 0; x < 5; x++) if ((row >> (4 - x)) & 1) g.fillRect(i * 6 + x, y, 1, 1); }); });
  FONT.white = c;
}
function fontCol(col) {
  if (FONT.at[col]) return FONT.at[col];
  const c = document.createElement('canvas'); c.width = FONT.white.width; c.height = 10; const g = c.getContext('2d');
  g.drawImage(FONT.white, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, 10);
  return FONT.at[col] = c;
}
const textW = (s, sc) => s.length ? (s.length * 6 - 1) * (sc || 1) : 0;
/* al: 0 kairė, .5 centras, 1 dešinė; y - raidės viršus (be diakritikų eilučių); sh - šešėlio spalva */
function text(s, x, y, sc, col, al, sh) {
  if (!FONT.white) return; sc = sc || 1; s = String(s).toUpperCase(); x = Math.round(x - textW(s, sc) * (al || 0)); y = Math.round(y);
  if (sh !== null) { const a = fontCol(sh || '#16181D'); drawStr(a, s, x, y + sc, sc); }
  drawStr(fontCol(col || '#fff'), s, x, y, sc);
}
const glyphOf = ch => { let k = FONT.idx[ch]; if (k === undefined) k = FONT.idx[ch.normalize('NFD')[0]]; return k; };   // raidė be šrifto (TR İ Ş Ğ, IT Ì Ò) -> bazinė
/* Didžiausias mastelis (iki sc), kuriuo tekstas telpa į plotį w - ilgiems vertimams */
const fitSc = (s, w, sc) => { s = String(s); while (sc > 1 && textW(s, sc) > w) sc--; return sc; };
function drawStr(atl, s, x, y, sc) {
  for (let i = 0; i < s.length; i++) { const k = glyphOf(s[i]); if (k !== undefined && s[i] !== ' ') ctx.drawImage(atl, k * 6, 0, 5, 10, x + i * 6 * sc, y - 2 * sc, 5 * sc, 10 * sc); }
}

/* ---------- Įvestis: plaukiojanti vairasvirtė (pirštas bet kur), nitro mygtukas, klaviatūra, UI mygtukai ---------- */
const keys = {}, stick = { on: false, id: null, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0 };
const nitroBtn = { on: false, id: null };
/* Lietimo valdymas (Poki tipo): kairėje ◀ ▶, dešinėje dujos, stabdis ir nitro; keli pirštai vienu metu, pirštą galima perslinkti */
const tb = { left: false, right: false, gas: false, brake: false, nitro: false }, tbPtr = new Map();
let touchUI = matchMedia('(pointer: coarse)').matches;
function tbLayout() { return { left: [10, LH - 82, 70, 72], right: [88, LH - 82, 70, 72], brake: [LW - 162, LH - 82, 70, 72], gas: [LW - 84, LH - 104, 74, 94], nitro: [LW - 84, LH - 172, 74, 60] }; }
function tbHit(px, py) { if (!touchUI || !tbEnabled()) return null; const L = tbLayout(); for (const k in L) { const [x, y, w, h] = L[k]; if (px >= x - 6 && py >= y - 6 && px < x + w + 6 && py < y + h + 6) return k; } return null; }
function tbSync() { for (const k in tb) tb[k] = false; for (const k of tbPtr.values()) if (k) tb[k] = true; }
/* Pultelis (Steam Main.Input): RT dujos, LT stabdis/atbulinė, kairė lazdelė arba kryžmė - vairas, A/LB rankinis, RB/X nitro, Start pauzė */
let PAD = null, padStartPrev = false;
function padRead() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const g of gps) { if (!g || !g.connected) continue;
    const b = i => g.buttons[i] ? (g.buttons[i].value || (g.buttons[i].pressed ? 1 : 0)) : 0; let x = g.axes[0] || 0; if (Math.abs(x) < .3) x = 0;   // didesnė negyvoji zona: drebanti lazdelė neperima valdymo
    if (!x) x = b(15) - b(14);
    const p = { x, rt: b(7), lt: b(6), hb: b(0) > .5 || b(4) > .5, nitro: b(5) > .5 || b(2) > .5, start: b(9) > .5 };
    p.active = !!(p.x || p.rt > .15 || p.lt > .15 || p.hb || p.nitro); if (p.active || p.start) return p; }
  return null;
}
let BTN = [], BTN_NEXT = [], lastInput = 0, anyInput = false;
const toLo = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * LW, (e.clientY - r.top) / r.height * LH]; };
/* Mygtukai registruojami kiekviename kadre piešiant (UI koordinatės) */
function button(x, y, w, h, fn) { BTN_NEXT.push({ x: x + UIX, y: y + UIY, w, h, fn }); }
function hitBtn(px, py) { for (let i = BTN.length - 1; i >= 0; i--) { const b = BTN[i]; if (px >= b.x && py >= b.y && px < b.x + b.w && py < b.y + b.h) return b; } return null; }
let hover = null;
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); try { window.focus(); } catch (_) { } audioInit(); anyInput = true; lastInput = performance.now();   // preventDefault neleidžia fokuso - Poki rėmelyje klavišai liktų tėviniam puslapiui
  const [px, py] = toLo(e), b = hitBtn(px, py);
  if (b) { b.fn(); sfx('click'); return; }
  if (e.pointerType === 'touch') { touchUI = true; const k = tbHit(px, py); if (k) { tbPtr.set(e.pointerId, k); tbSync(); try { cv.setPointerCapture(e.pointerId); } catch (_) { } return; } }
  if (onNitroBtn(px, py)) { nitroBtn.on = true; nitroBtn.id = e.pointerId; return; }
  if (!stick.on) { stick.on = true; stick.id = e.pointerId; stick.ox = px; stick.oy = py; stick.x = px; stick.y = py; stick.dx = 0; stick.dy = 0; }
  try { cv.setPointerCapture(e.pointerId); } catch (_) { }
});
cv.addEventListener('pointermove', e => {
  const [px, py] = toLo(e); hover = hitBtn(px, py);
  if (tbPtr.has(e.pointerId)) { tbPtr.set(e.pointerId, tbHit(px, py)); tbSync(); return; }   // pirštas perslenka ant kito mygtuko
  if (stick.on && e.pointerId === stick.id) {
    let dx = px - stick.ox, dy = py - stick.oy; const d = Math.hypot(dx, dy), R = 26;
    if (d > R) { stick.ox = px - dx / d * R; stick.oy = py - dy / d * R; dx = px - stick.ox; dy = py - stick.oy; }   // vairasvirtė seka pirštą
    stick.x = px; stick.y = py; stick.dx = dx / R; stick.dy = dy / R; lastInput = performance.now();
  }
});
function ptrUp(e) { if (tbPtr.delete(e.pointerId)) tbSync(); if (e.pointerId === stick.id) { stick.on = false; stick.id = null; stick.dx = stick.dy = 0; } if (e.pointerId === nitroBtn.id) { nitroBtn.on = false; nitroBtn.id = null; } }
cv.addEventListener('pointerup', ptrUp); cv.addEventListener('pointercancel', ptrUp);
cv.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  audioInit(); keys[e.code] = true; anyInput = true; lastInput = performance.now();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  onKey(e.code);
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; stick.on = false; nitroBtn.on = false; tbPtr.clear(); tbSync(); onBlur(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) onBlur(); });
function keyDir() {
  const dx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), dy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  return [dx, dy];
}
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

/* ---------- Garsas: viskas sintezuojama (0 baitų), variklio ūžesys pagal greitį; reklamos metu - tyla ---------- */
let AC = null, master = null, engO = null, engG = null, muted = false, adMute = false;
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.connect(AC.destination); setVol();
    engO = AC.createOscillator(); engO.type = 'sawtooth'; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    engG = AC.createGain(); engG.gain.value = 0; engO.connect(f); f.connect(engG); engG.connect(master); engO.start();
  } catch (_) { AC = null; }
}
function setVol() { if (master) master.gain.value = muted || adMute ? 0 : .5; }
function engine(sp, on) { if (!AC) return; engO.frequency.setTargetAtTime(48 + sp * .16, AC.currentTime, .05); engG.gain.setTargetAtTime(on ? .045 : 0, AC.currentTime, .1); }
let noiseBuf = null;
function noise(dur, f0, f1, vol, type) {
  if (!AC || muted) return; const t = AC.currentTime;
  if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = AC.createBufferSource(); s.buffer = noiseBuf; const fl = AC.createBiquadFilter(); fl.type = type || 'lowpass';
  fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
}
function tone(f, dur, vol, type, f2, delay) {
  if (!AC || muted) return; const t = AC.currentTime + (delay || 0); const o = AC.createOscillator(); o.type = type || 'square';
  o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
}
/* Muzika: vienas takelis (assets/music.mp3, ~0,9 MB) kraunamas tik prasidėjus žaidimui; WebAudio - veikia ir iOS po pirmo palietimo */
let musicBuf = null, musicSrc = null, musicLoading = false;
function musicStart() {
  if (!AC || musicSrc) return;
  if (!musicBuf) { if (!musicLoading) { musicLoading = true; fetch('assets/music.mp3').then(r => r.arrayBuffer()).then(b => AC.decodeAudioData(b)).then(buf => { musicBuf = buf; musicStart(); }).catch(() => { }); } return; }
  const g = AC.createGain(); g.gain.value = .32; musicSrc = AC.createBufferSource(); musicSrc.buffer = musicBuf; musicSrc.loop = true; musicSrc.connect(g); g.connect(master); musicSrc.start();
}
const SFX_T = {};
function sfx(k) {
  const now = performance.now(); if (SFX_T[k] && now - SFX_T[k] < 45) return; SFX_T[k] = now;
  switch (k) {
    case 'shot': tone(900, .05, .05, 'square', 300); break;
    case 'boom': noise(.45, 1800, 80, .5); tone(90, .3, .25, 'sine', 40); break;
    case 'small': noise(.18, 2500, 300, .22); break;
    case 'hit': noise(.08, 1200, 400, .15, 'bandpass'); break;
    case 'crash': noise(.25, 900, 120, .35); break;
    case 'gem': tone(1320, .06, .05, 'triangle', 1760); break;
    case 'coin': tone(1046, .06, .08, 'square'); tone(1568, .12, .08, 'square', null, .06); break;
    case 'lvl': [523, 659, 784, 1046].forEach((f, i) => tone(f, .14, .09, 'square', null, i * .07)); break;
    case 'click': tone(660, .04, .06, 'square'); break;
    case 'buy': [784, 988, 1318].forEach((f, i) => tone(f, .1, .08, 'square', null, i * .06)); break;
    case 'zap': noise(.12, 6000, 2000, .12, 'highpass'); break;
    case 'nitro': noise(.35, 300, 2400, .18, 'bandpass'); break;
    case 'warn': tone(880, .12, .07, 'square'); tone(660, .12, .07, 'square', null, .14); break;
  }
}

/* ---------- Išsaugojimas: localStorage su try/catch (inkognito, užblokuota saugykla - žaidžiama be įrašo) ---------- */
const SAVE_KEY = 'heatrun_lite_v1';
let save = null;
function loadSave() {
  let s = null; try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (_) { }
  const d = { v: 1, coins: 0, car: 'rotora', cars: {}, best: 0, runs: 0, muted: false };
  save = Object.assign(d, s || {});
  for (const c of CARS) if (!save.cars[c.id]) save.cars[c.id] = { own: c.price === 0, up: { eng: 0, arm: 0, mag: 0, nit: 0, wpn: 0 }, paint: c.paint, paints: [c.paint] };
  /* spalvos bendros visoms mašinoms: nupirkta kartą - tinka visoms (seni įrašai - sujungiami) */
  if (!Array.isArray(save.paints)) { save.paints = []; for (const c of CARS) { const cs = save.cars[c.id]; if (cs.own) for (const p of cs.paints || [cs.paint]) if (!save.paints.includes(p)) save.paints.push(p); } }
  for (const c of CARS) { const cs = save.cars[c.id]; if (cs.own && !save.paints.includes(c.paint)) save.paints.push(c.paint); }
  muted = !!save.muted;
}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { } }

/* ---------- Poki SDK: tikras, kai įkeltas Poki puslapyje; kitaip - vietinis pakaitalas (bandymams, „reklama" 1 s) ---------- */
const Poki = {
  sdk: null, playing: false, adShow: 0,
  init() {
    this.sdk = window.PokiSDK || null;
    if (!this.sdk) { console.log('[poki] SDK nėra - vietinis režimas'); return Promise.resolve(); }
    return this.sdk.init().catch(() => { });   // reklamų blokatorius - žaidžiama toliau
  },
  loaded() { this.sdk && this.sdk.gameLoadingFinished(); },
  start() { musicStart(); if (this.playing) return; this.playing = true; this.sdk ? this.sdk.gameplayStart() : console.log('[poki] gameplayStart'); },
  stop() { if (!this.playing) return; this.playing = false; this.sdk ? this.sdk.gameplayStop() : console.log('[poki] gameplayStop'); },
  commercial() {
    this.stop();
    if (!this.sdk) { console.log('[poki] commercialBreak'); return this.fake(.6); }
    return this.sdk.commercialBreak(() => { adMute = true; setVol(); }).then(() => { adMute = false; setVol(); });
  },
  rewarded() {
    this.stop();
    if (!this.sdk) { console.log('[poki] rewardedBreak'); return this.fake(1.2).then(() => true); }
    return this.sdk.rewardedBreak({ size: 'medium', onStart: () => { adMute = true; setVol(); } }).then(ok => { adMute = false; setVol(); return !!ok; });
  },
  fake(t) { adMute = true; setVol(); this.adShow = t; return new Promise(ok => setTimeout(() => { adMute = false; setVol(); this.adShow = 0; ok(); }, t * 1000)); }
};
