// Mech customization: parts, weapons and their stats.

export const FRAMES = {
  strider: { name: 'STRIDER', desc: 'Balanced frame', main: 0x56663f, dark: 0x37432a, frame: 0x8d949a, joint: 0x272b2f, eye: 0xffb347, hp: 100, speed: 1, bulk: 1, prop: [1, 1] },
  wraith:  { name: 'WRAITH',  desc: 'Fast, light armor', main: 0x6555b4, dark: 0x25222f, frame: 0x9aa0b5, joint: 0x1a1922, eye: 0xff3b6b, hp: 85, speed: 1.12, bulk: 0.92, prop: [0.88, 1.1] },
  bastion: { name: 'BASTION', desc: 'Heavy, slower', main: 0x67665e, dark: 0x403f3a, frame: 0x86867f, joint: 0x24241f, eye: 0xff5a2a, hp: 125, speed: 0.9, bulk: 1.14, prop: [1.16, 0.94] },
};

export const HEADS = {
  mono:   { name: 'MONO-EYE', desc: 'Sliding single eye' },
  horned: { name: 'HORNED', desc: 'Swept-back horns' },
  visor:  { name: 'VISOR', desc: 'Armored slit visor' },
  crest:  { name: 'V-CREST', desc: 'V-fin and twin eyes' },
};

export const SIZES = {
  standard: { name: 'STANDARD SUIT', desc: '12m mobile suit, fully customizable' },
  giant:    { name: 'GIANT ARMOR', desc: '4x size and armor, heavy artillery. Slow, burns fuel fast, weak close range' },
};

export const BODIES = {
  standard: { name: 'STANDARD', desc: 'Balanced torso', hp: 0, speed: 1 },
  sleek:    { name: 'SLEEK', desc: 'Narrow prow chest: +6% speed, -10 armor', hp: -10, speed: 1.06 },
  heavy:    { name: 'HEAVY', desc: 'Layered armor: +25 armor, -7% speed', hp: 25, speed: 0.93 },
  core:     { name: 'REACTOR CORE', desc: 'Exposed core: +30% generator recharge', hp: 0, speed: 1, regen: 1.3 },
};

export const LEGS = {
  standard: { name: 'BIPED', desc: 'Standard legs', hp: 0, speed: 1, jump: 1, air: 1 },
  hind:     { name: 'REVERSE-JOINT', desc: 'Hind legs: +8% speed, +35% jump', hp: -5, speed: 1.08, jump: 1.35, air: 1 },
  quad:     { name: 'QUADRUPED', desc: 'Four legs: +25 armor, slower', hp: 25, speed: 0.92, jump: 0.85, air: 0.95 },
  hover:    { name: 'HOVER SKIRT', desc: 'No legs: +15% flight speed', hp: -10, speed: 1.04, jump: 1.1, air: 1.15 },
};

export const MOBILITY = {
  standard: { name: 'STANDARD PACK', desc: 'Twin backpack thrusters' },
  boosters: { name: 'TWIN BOOSTERS', desc: 'Huge shoulder boosters: +25% boost speed, +45% flight time', boost: 1.25, fuel: 0.55, speed: 0.98 },
  wings:    { name: 'WING BINDERS', desc: '+18% flight speed, +25% flight time', air: 1.18, fuel: 0.75 },
  jumpjets: { name: 'JUMP JETS', desc: '+50% jump, quick boosts cost 40% less', jump: 1.5, qbCost: 0.6 },
  verniers: { name: 'VERNIER ARRAY', desc: 'Rapid quick boosts: 45% faster recharge, 40% cheaper', qbCost: 0.6, qbCd: 0.55 },
};

export const ARMS = {
  two:      { name: 'TWIN ARMS', desc: 'Standard', hp: 0, speed: 1 },
  four:     { name: 'QUAD ARMS', desc: 'Extra arms: dual-wield guns and double strikes', hp: 10, speed: 0.96 },
  gauntlet: { name: 'GAUNTLETS', desc: 'Huge fists: +40% close-range damage', hp: 10, speed: 0.97, meleeDmg: 1.4 },
  long:     { name: 'LONG ARMS', desc: 'Long reach: +18m lunge range, faster strikes', hp: 0, speed: 1, meleeRange: 18, meleeCd: 0.85 },
};

export const HANDS = {
  hands:  { name: 'MANIPULATORS', desc: 'Hold a close-range weapon' },
  blades: { name: 'BLADE HANDS', desc: 'Built-in arm blades: very fast strikes' },
};

// Main (right hand) weapons
export const MAIN = {
  rifle:   { name: 'ASSAULT RIFLE', desc: 'All-rounder', dmg: 5, rate: 0.095, mag: 60, reserve: 180, reload: 1.8, spread: 0.012, pellets: 1, range: 900, color: 0xffc37a, width: 1.3, speed: 1 },
  gatling: { name: 'GATLING', desc: 'Huge mag, low damage', dmg: 2.6, rate: 0.045, mag: 180, reserve: 360, reload: 3.2, spread: 0.028, pellets: 1, range: 700, color: 0xffe08a, width: 1, speed: 0.96 },
  shotgun: { name: 'SHOTGUN', desc: 'Deadly up close', dmg: 3.6, rate: 0.6, mag: 8, reserve: 24, reload: 2.4, spread: 0.075, pellets: 9, range: 260, color: 0xffb070, width: 0.9, speed: 1 },
  sniper:  { name: 'RAIL SNIPER', desc: 'Slow, huge damage', dmg: 30, rate: 1.1, mag: 5, reserve: 15, reload: 2.6, spread: 0, pellets: 1, range: 1500, color: 0x8fe8ff, width: 3, speed: 0.98 },
  megacannon: { name: 'MEGA CANNONS', desc: 'Giant twin arm cannons', dmg: 20, rate: 0.5, mag: 24, reserve: 72, reload: 3.5, splash: 20, shell: true, shellSpeed: 280, color: 0xff8a3a, speed: 1, hidden: true },
  bazooka: { name: 'BAZOOKA', desc: 'Explosive shells', dmg: 26, rate: 1.3, mag: 4, reserve: 8, reload: 3, splash: 14, shell: true, shellSpeed: 240, color: 0xffa040, speed: 0.95 },
};

// Shoulder (side) weapons
export const SIDE = {
  missiles: { name: 'HOMING MISSILES', desc: '4 lock-on missiles', count: 4, regen: 2.4, per: 1, dmg: 18 },
  micro:    { name: 'MICRO MISSILES', desc: 'Swarms of 4 small missiles', count: 12, regen: 0.8, per: 4, dmg: 6 },
  cannon:   { name: 'SHOULDER CANNON', desc: 'Heavy explosive shot', count: 2, regen: 4, per: 1, dmg: 34, shell: true, splash: 18, shellSpeed: 300 },
  artillery: { name: 'ARTILLERY BATTERY', desc: 'Salvos of 6 missiles', count: 24, regen: 0.9, per: 6, dmg: 12, hidden: true },
  none:     { name: 'NONE', desc: 'Lighter: +4% speed', count: 0, regen: 1, per: 0, dmg: 0, speed: 1.04 },
};

// Close-range weapons
export const MELEE = {
  saber:  { name: 'BEAM SABER', desc: 'Fast lunge slash', dmg: 30, cd: 0.7, range: 48, color: 0xff6ab0 },
  axe:    { name: 'HEAT AXE', desc: 'Slower, heavier', dmg: 46, cd: 1.15, range: 42, color: 0xffa040 },
  pile:   { name: 'PILE BUNKER', desc: 'Short range, massive hit', dmg: 65, cd: 1.7, range: 32, color: 0xd0f0ff },
  crush:  { name: 'CRUSHING SWAT', desc: 'Slow area swat', dmg: 30, cd: 3.2, range: 0, aoe: 46, color: 0xffb070, hidden: true },
  blades: { name: 'ARM BLADES', desc: 'From blade hands', dmg: 17, cd: 0.32, range: 40, color: 0x7fffd8 },
};

export const COLORS = [0x56663f, 0x6555b4, 0x67665e, 0xd9ddd8, 0xa83232, 0x2f5fa8, 0x2a2c30, 0xd8782c, 0xb59c6a, 0x3f8a8c];
export const ACCENTS = [0x37432a, 0x25222f, 0x403f3a, 0x8a929a, 0x5a1a1a, 0x1c2f55, 0x141518, 0x6b3a12, 0x5e4f31, 0xc9a23a];
export const EYES = [0xffb347, 0xff3b6b, 0xff5a2a, 0x48f0ff, 0x6bff8a, 0xffffff];

export function defaultLoadout(frame = 'strider') {
  return { size: 'standard', frame, head: frame === 'wraith' ? 'horned' : frame === 'bastion' ? 'visor' : 'mono',
    body: frame === 'wraith' ? 'sleek' : frame === 'bastion' ? 'heavy' : 'standard', legs: frame === 'wraith' ? 'hind' : frame === 'bastion' ? 'quad' : 'standard', mobility: frame === 'wraith' ? 'wings' : 'standard', arms: 'two', hands: 'hands', main: 'rifle', side: frame === 'bastion' ? 'cannon' : 'missiles', melee: 'saber', color: null, accent: null, eye: null };
}

const pick = (v, table, def) => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(table, v) ? v : def);
const col = v => (Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : null);

// Accepts anything (including data from other players) and returns a valid loadout.
export function sanitizeLoadout(lo) {
  const d = defaultLoadout(lo && FRAMES[lo.frame] ? lo.frame : 'strider');
  if (!lo || typeof lo !== 'object') return d;
  return {
    size: pick(lo.size, SIZES, 'standard'), frame: pick(lo.frame, FRAMES, d.frame), head: pick(lo.head, HEADS, d.head), body: pick(lo.body, BODIES, d.body), legs: pick(lo.legs, LEGS, d.legs), mobility: pick(lo.mobility, MOBILITY, d.mobility), arms: pick(lo.arms, ARMS, d.arms), hands: pick(lo.hands, HANDS, d.hands),
    main: pick(lo.main, MAIN, d.main), side: pick(lo.side, SIDE, d.side), melee: pick(lo.melee, MELEE, d.melee) === 'blades' ? 'saber' : pick(lo.melee, MELEE, d.melee),
    color: col(lo.color), accent: col(lo.accent), eye: col(lo.eye),
  };
}

export const loadoutSig = lo => [lo.size, lo.frame, lo.head, lo.body, lo.legs, lo.mobility, lo.arms, lo.hands, lo.main, lo.side, lo.melee, lo.color, lo.accent, lo.eye].join('|');
export const meleeKey = lo => (lo.size === 'giant' ? 'crush' : lo.hands === 'blades' ? 'blades' : lo.melee);

export function loadoutStats(lo) {
  const F = FRAMES[lo.frame], Bo = BODIES[lo.body], Lg = LEGS[lo.legs], A = ARMS[lo.arms], Mo = MOBILITY[lo.mobility] || MOBILITY.standard;
  if (lo.size === 'giant') {
    // Giant armor: 4x size, tanky, artillery-heavy, slow and fuel-hungry
    return { hp: Math.round(F.hp * 4.2), speed: F.speed * 0.5, jump: 0.6, air: 0.45, regen: 0.55, drain: 2.6, g: 4, giant: true, boost: 1, qbCost: 1, qbCd: 1,
      main: MAIN.megacannon, side: SIDE.artillery, melee: { ...MELEE.crush }, meleeKey: 'crush', four: true };
  }
  const mk = meleeKey(lo), base = MELEE[mk];
  const melee = { ...base, dmg: Math.round(base.dmg * (A.meleeDmg || 1)), range: base.range + (A.meleeRange || 0), cd: base.cd * (A.meleeCd || 1) };
  return {
    hp: F.hp + A.hp + Bo.hp + Lg.hp,
    speed: F.speed * A.speed * Bo.speed * Lg.speed * (Mo.speed || 1) * (MAIN[lo.main].speed || 1) * (SIDE[lo.side].speed || 1),
    jump: Lg.jump * (Mo.jump || 1), air: Lg.air * (Mo.air || 1), regen: Bo.regen || 1, drain: Mo.fuel || 1, g: 1, giant: false,
    boost: Mo.boost || 1, qbCost: Mo.qbCost || 1, qbCd: Mo.qbCd || 1,
    main: MAIN[lo.main], side: SIDE[lo.side], melee, meleeKey: mk, four: lo.arms === 'four',
  };
}
