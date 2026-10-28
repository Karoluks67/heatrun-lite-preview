/* data: Lite turinys. Ginklų, pasyvų ir policijos skaičiai - iš Steam versijos godot/game/data/content.json (WDEF, TOME, COP, HD), sutrumpinti */
'use strict';
const PPU = 20 / 44;   // žaidimo pikseliai vienam pasaulio vienetui (World.PX_PER_UNIT)

/* Mašinos: sprite'ai - CarArt (dabartinė versija), savybės - DIECAST mod; ginklas - pradinis Lite ginklas; phys - masė, sukibimas, įsibėgėjimas (Steam VCAR) */
const CARS = [
  { id: 'rotora', n: 'Rotora 7', w: 'turret', price: 0, paint: 'orange', hp: 0, spd: 0, phys: { m: .95, grip: 1.05 } },
  { id: 'bambino', n: 'Kosoku EG', w: 'mines', price: 400, paint: 'yellow', hp: 0, spd: .03, phys: { m: .85, grip: 1.1, pw: 1.05 } },
  { id: 'stallion', n: 'Stallion GT', w: 'spikes', price: 800, paint: 'red', hp: 20, spd: .02, phys: { m: 1.1, pw: 1.1 } },
  { id: 'sora', n: 'Sora Mk4', w: 'orbit', price: 1300, paint: 'blue', hp: 0, spd: .05, phys: { m: 1, grip: 1.1, pw: 1.1 } },
  { id: 'bison', n: 'Vandal Brute', w: 'shotgun', price: 2000, paint: 'black', hp: 60, spd: -.06, phys: { m: 1.45, grip: .95, pw: 1.05 } },
  { id: 'arrow', n: 'Kaze GT-34', w: 'rockets', price: 3000, paint: 'white', hp: -20, spd: .12, phys: { m: .8, grip: 1.1 } },
];
const PAINTS = { yellow: '#F2C230', red: '#D93B30', blue: '#2F6FD6', green: '#2E9E5B', orange: '#F07C2A', white: '#F5F5F0', purple: '#8E4FD1', black: '#2A2D34', pink: '#F27BB4', cyan: '#35D0D6', lime: '#9BE34A', chrome: '#C9D0D8' };
const PAINT_PRICE = 60;
/* Garažo tobulinimai kiekvienai mašinai: 5 lygiai, kaina ×1,5 */
const UPG = [
  { k: 'eng', n: 'Engine', ic: 'engine', d: '+5% speed' },
  { k: 'arm', n: 'Armor', ic: 'armor', d: '+20 health' },
  { k: 'mag', n: 'Magnet', ic: 'magnet', d: '+25% pickup range' },
  { k: 'nit', n: 'Nitro', ic: 'nitro', d: '+20% nitro' },
  { k: 'wpn', n: 'Weapon', ic: null, d: '+1 start level' },
];
const UPG_MAX = 5, UPG_BASE = 40;
const upgCost = lv => Math.round(UPG_BASE * Math.pow(1.5, lv));

/* Ginklai: lygių lentelės (8 lygiai) iš WDEF; n - trumpas Lite pavadinimas */
const WPN = {
  turret: { n: 'Roof Gun', col: '#F2C230', dmg: [13, 16, 19, 22, 25, 28, 31, 34], cd: [.45, .4, .36, .32, .26, .24, .22, .2], amt: [1, 1, 2, 2, 3, 3, 4, 4], area: 560 },
  orbit: { n: 'Drones', col: '#C45BFF', dmg: [18, 24, 30, 36, 42, 48, 54, 60], cd: [.4, .4, .4, .4, .4, .4, .4, .4], amt: [1, 2, 2, 3, 4, 4, 5, 6], area: [78, 86, 94, 102, 110, 118, 126, 134] },
  mines: { n: 'Mines', col: '#FF4F4F', dmg: [63, 81, 99, 117, 135, 153, 171, 189], cd: [2.4, 2.2, 2, 1.8, 1.6, 1.5, 1.4, 1.2], amt: [1, 1, 1, 1, 1, 1, 2, 2], area: [90, 90, 90, 90, 90, 100, 100, 110], dur: 20 },
  rockets: { n: 'Rockets', col: '#FF7A3A', dmg: [47, 59, 71, 83, 95, 107, 119, 131], cd: [3, 2.8, 2.6, 2.4, 2.2, 2.1, 2, 1.9], amt: [1, 1, 2, 2, 4, 4, 5, 6], area: 70 },
  tesla: { n: 'Tesla', col: '#7FE8FF', dmg: [20, 20, 26, 26, 33, 33, 41, 50], cd: [1.6, 1.5, 1.5, 1.4, 1.4, 1.3, 1.2, 1.1], amt: [2, 3, 3, 4, 4, 5, 6, 6], area: 170 },
  shotgun: { n: 'Shotgun', col: '#FFD23F', dmg: [8, 10, 10, 12, 12, 14, 16, 18], cd: [1.4, 1.3, 1.3, 1.2, 1.1, 1.1, 1, .9], amt: [5, 5, 6, 6, 7, 8, 8, 10], area: 300 },
  spikes: { n: 'Spikes', col: '#C8CDD6', dmg: [18, 24, 30, 36, 42, 48, 54, 60], cd: [2.6, 2.4, 2.2, 2, 1.8, 1.7, 1.6, 1.5], amt: [3, 4, 5, 6, 7, 8, 9, 10], area: 22, dur: 8 },
  laser: { n: 'Laser', col: '#FF4FB8', dmg: [60, 60, 75, 75, 95, 95, 115, 140], cd: [3, 2.9, 2.8, 2.7, 2.6, 2.5, 2.4, 2.2], amt: [1, 1, 1, 2, 2, 2, 3, 3], area: [380, 380, 410, 410, 440, 440, 480, 520], dur: [.6, .7, .7, .8, .8, .9, 1, 1.2] },
};
const W_MAX = 8, W_SLOTS = 4;
const wv = (w, k, lv) => { const v = WPN[w][k]; return Array.isArray(v) ? v[Math.min(v.length, lv) - 1] : v; };
/* Pasyvai (TOME): v - priedas už lygį */
const TOME = {
  engine: { n: 'Engine', ic: 'engine', v: 6 }, armor: { n: 'Armor', ic: 'armor', v: 1 }, magnet: { n: 'Magnet', ic: 'magnet', v: 25 },
  caliber: { n: 'Power', ic: 'caliber', v: 10 }, cool: { n: 'Cooling', ic: 'cool', v: 8 }, hp: { n: 'Chassis', ic: 'hp', v: 15 },
  nitro: { n: 'Nitro', ic: 'nitro', v: 15 }, area: { n: 'Area', ic: 'area', v: 10 }, amount: { n: 'Extra', ic: 'amount', v: 1, max: 2 },
};
const T_MAX = 5, T_SLOTS = 4;

/* Policija (COP): hp, žala, xp, spindulys; spd - didžiausias greitis (vnt./s; žaidėjas 520, su nitro ~760), at - nuo kurios sekundės atsiranda */
const COP = {
  patrol: { spr: 'cop_patrol', hp: 24, dmg: 6, xp: 1, r: 22, spd: 470, at: 0 },
  inter: { spr: 'cop_inter', hp: 18, dmg: 6, xp: 2, r: 22, spd: 560, at: 60 },
  suv: { spr: 'cop_suv', hp: 70, dmg: 11, xp: 3, r: 26, spd: 440, at: 140 },
  van: { spr: 'cop_van', hp: 170, dmg: 16, xp: 4, r: 28, spd: 390, at: 230 },
  rhino: { spr: 'cop_rhino', hp: 120, dmg: 20, xp: 2, r: 28, spd: 480, at: 330 },
};
/* Heat (HD): HP daugiklis pagal laiką; Lite - ~1,3 karto lėtesnė kreivė, kad naujokas išbūtų 3+ min. */
const HEAT_AT = [0, 90, 220, 380, 560, 770, 1000, 1260, 1550, 1860], HEAT_HP = [1, 1.3, 1.7, 2.2, 2.9, 3.8, 5, 6.5, 8.5, 11];
const BOSS = [{ k: 'heli', at: 270, hp: 1100, xp: 60, coin: 40 }, { k: 'tank', at: 540, hp: 3200, xp: 150, coin: 80 }];
const xpNeed = l => Math.round(3 + (l - 1) * 3.5 + (l - 1) * (l - 1) * .35);
