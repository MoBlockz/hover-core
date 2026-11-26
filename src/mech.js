// Low-poly modular mech builder + procedural animation.
// Mech faces +Z, origin at the feet. ~12.5m tall.
import * as THREE from 'three';
import { FRAMES, MELEE, defaultLoadout, sanitizeLoadout, loadoutSig, meleeKey } from './loadout.js';
export { FRAMES };

const mats = new Map();
function mat(color) {
  if (!mats.has(color)) mats.set(color, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, metalness: 0.35 }));
  return mats.get(color);
}
const glows = new Map();
export function glow(color, opacity = 1) {
  const k = color + ':' + opacity;
  if (!glows.has(k)) glows.set(k, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, blending: opacity < 1 ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: opacity >= 1 }));
  return glows.get(k);
}

// Box whose top/bottom (and front) faces can be scaled/shifted -> angular armor plates.
export function taperBox(w, h, d, o = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const top = y > 0, front = z > 0;
    x *= top ? (o.tx ?? 1) : (o.bx ?? 1);
    z *= top ? (o.tz ?? 1) : (o.bz ?? 1);
    if (top) { x += o.sx ?? 0; z += o.sz ?? 0; }
    if (front) { x *= o.fx ?? 1; y *= o.fy ?? 1; }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function add(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}
function group(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
const cyl = (r1, r2, h, s = 6) => new THREE.CylinderGeometry(r1, r2, h, s);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const PI2 = Math.PI / 2;

// Handheld gun, laid out along -Y (the forearm axis) so it points forward when the elbow is raised.
function weaponMesh(type, C) {
  const g = new THREE.Group();
  let mz = -5.3;
  if (type === 'gatling') {
    add(g, cyl(0.75, 0.75, 1.6, 8), C.D, 0, -0.2, 0);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(g, cyl(0.13, 0.13, 4.2, 5), C.Fr, Math.cos(a) * 0.38, -2.9, Math.sin(a) * 0.38); }
    add(g, box(1.0, 1.3, 1.3), C.J, 0, 0.5, -0.95);
    mz = -5.0;
  } else if (type === 'shotgun') {
    add(g, box(0.75, 3.2, 0.95), C.J, 0, -1.2, 0);
    add(g, cyl(0.3, 0.3, 1.6), C.Fr, 0, -3.5, 0.15);
    add(g, box(0.55, 1.2, 0.6), C.D, 0, -2.0, 0.65);
    mz = -4.3;
  } else if (type === 'sniper') {
    add(g, box(0.45, 3.6, 0.7), C.J, 0, -1.0, 0);
    add(g, cyl(0.13, 0.13, 4.8), C.Fr, 0, -5.2, 0.1);
    add(g, cyl(0.22, 0.22, 1.6), C.D, 0, -0.8, 0.62);
    add(g, box(0.3, 0.9, 0.2), C.D, 0, -2.2, -0.45);
    mz = -7.6;
  } else if (type === 'bazooka') {
    add(g, cyl(0.62, 0.62, 6, 8), C.D, 0, -1.6, 0.2);
    add(g, cyl(0.8, 0.62, 0.8, 8), C.J, 0, -4.8, 0.2);
    add(g, cyl(0.7, 0.62, 0.6, 8), C.J, 0, 1.5, 0.2);
    add(g, box(0.4, 1.0, 0.6), C.J, 0, 0.2, -0.5);
    mz = -5.3;
  } else { // rifle
    add(g, box(0.55, 4.2, 0.8), C.J, 0, -1.2, 0);
    add(g, box(0.4, 1.0, 0.9), C.D, 0, 0.2, -0.6);
    add(g, cyl(0.16, 0.16, 2.0), C.Fr, 0, -4.2, 0.1);
    add(g, box(0.4, 0.9, 0.7), C.D, 0, -0.8, 0.7);
  }
  const muzzle = group(g, 0, mz, 0.1);
  return { g, muzzle };
}

// Close-range weapon held in the hand; blade extends along +Z (points up/forward when the arm is raised).
function meleeMesh(type, C) {
  const g = new THREE.Group();
  const col = MELEE[type].color;
  if (type === 'saber') {
    add(g, cyl(0.2, 0.2, 1.3), C.J, 0, 0, 0, PI2);
    add(g, cyl(0.3, 0.12, 7.2, 6), glow(col, 0.85), 0, 0, 4.2, PI2);
    add(g, cyl(0.1, 0.05, 7.0, 4), glow(0xffffff), 0, 0, 4.1, PI2);
  } else if (type === 'axe') {
    add(g, cyl(0.16, 0.16, 5.5), C.J, 0, 0, 1.8, PI2);
    add(g, taperBox(0.25, 2.2, 1.8, { tz: 0.3 }), C.Fr, 0, -1.0, 4.0);
    add(g, box(0.3, 2.3, 0.12), glow(col), 0, -1.05, 4.95);
  }
  return g;
}

function buildArm(torso, s, o, C, b) {
  const sh = group(torso, o.x, o.y, o.z);
  sh.scale.setScalar(o.scale);
  if (o.big) {
    add(sh, taperBox(2.2 * b, 2.5 * b, 2.9 * b, { tx: 1.08, tz: 1.05, bx: 0.78, bz: 0.85 }), C.M, s * 0.5, 0.4, 0, 0, 0, s * 0.12);
    add(sh, box(2.35 * b, 0.32, 3.0 * b), C.D, s * 0.5, -0.9, 0, 0, 0, s * 0.12);
    add(sh, taperBox(0.5, 1.0, 2.0, { tz: 0.6 }), C.Fr, s * 1.55 * b, 0.6, 0, 0, 0, s * 0.12);
  } else {
    add(sh, cyl(0.7, 0.7, 1.2, 6), C.J, 0, 0, 0, 0, 0, PI2);
    add(sh, taperBox(1.4, 1.4, 1.8, { bx: 0.7 }), C.M, s * 0.3, 0.3, 0, 0, 0, s * 0.15);
  }
  add(sh, box(0.85, 2.2, 0.85), C.Fr, s * 0.3, -1.6, 0);
  const elbow = group(sh, s * 0.3, -2.8, 0);
  add(elbow, cyl(0.45, 0.45, 1.0), C.J, 0, 0, 0, 0, 0, PI2);
  add(elbow, taperBox(1.3 * b, 2.6, 1.45 * b, { tx: 0.85, tz: 0.85 }), C.M, 0, -1.4, 0);
  add(elbow, box(0.3, 2.0, 1.25 * b), C.D, s * 0.72 * b, -1.3, 0);
  let blade = null;
  if (o.blade) {
    // Blade hand: long angled blade instead of a fist
    blade = group(elbow, 0, -3.0, 0);
    add(blade, box(0.7, 0.7, 0.8), C.J, 0, 0, 0);
    add(blade, taperBox(0.28, 4.6, 1.1, { tz: 0.15, tx: 0.5 }), C.Fr, 0, -2.6, 0.15);
    add(blade, box(0.07, 4.2, 0.09), glow(MELEE.blades.color), 0, -2.5, 0.68);
  } else add(elbow, box(0.8, 0.8, 0.9), C.J, 0, -3.0, 0);

  let muzzle = null;
  if (o.weapon) {
    const w = weaponMesh(o.weapon, C);
    if (o.blade) { w.g.position.set(s * 0.95, -1.0, 0.3); w.g.scale.setScalar(0.8); } // forearm-mounted
    else w.g.position.set(0, -3.0, 0.75);
    elbow.add(w.g);
    muzzle = w.muzzle;
  }
  if (o.melee === 'pile') {
    const p = group(elbow, s * 0.95, -1.4, 0);
    add(p, box(0.9, 2.6, 1.1), C.D, 0, 0, 0);
    add(p, cyl(0.22, 0.06, 3.4), mat(0xc8d4dc), 0, -2.6, 0);
    add(p, box(0.95, 0.3, 1.15), glow(MELEE.pile.color), 0, 0.9, 0);
  } else if (o.melee) {
    const m = meleeMesh(o.melee, C);
    m.position.set(0, -3.1, 0.2);
    elbow.add(m);
  }
  return { sh, elbow, side: s, muzzle };
}

function sideWeapons(torso, type, b, C) {
  const muzzles = [];
  const at = s => ({ x: s * 2.85 * b, y: 5.2 * Math.max(1, b * 0.95), z: -0.4 });
  if (type === 'missiles') {
    const p = at(1), g = group(torso, p.x, p.y, p.z);
    add(g, taperBox(1.7, 1.3, 2.4, { tz: 0.9 }), C.D, 0, 0, 0);
    for (let i = 0; i < 6; i++) add(g, box(0.36, 0.3, 0.1), C.J, -0.45 + (i % 3) * 0.45, 0.25 - Math.floor(i / 3) * 0.5, 1.21);
    muzzles.push(group(g, 0, 0, 1.4));
  } else if (type === 'micro') {
    for (const s of [-1, 1]) {
      const p = at(s), g = group(torso, p.x, p.y - 0.2, p.z);
      add(g, box(1.2, 0.9, 1.8), C.D, 0, 0, 0);
      for (let i = 0; i < 4; i++) add(g, box(0.22, 0.2, 0.1), glow(0xffb050), -0.3 + (i % 2) * 0.6, 0.2 - Math.floor(i / 2) * 0.4, 0.91);
      muzzles.push(group(g, 0, 0, 1.0));
    }
  } else if (type === 'cannon') {
    const p = at(-1), g = group(torso, p.x, p.y, p.z);
    add(g, taperBox(1.4, 1.3, 3.0, { tx: 0.8 }), C.D, 0, 0, 0);
    add(g, cyl(0.32, 0.32, 5, 6), C.J, 0, 0.1, 3.4, PI2);
    add(g, cyl(0.42, 0.42, 0.6, 6), C.Fr, 0, 0.1, 5.9, PI2);
    muzzles.push(group(g, 0, 0.1, 6.3));
  }
  return muzzles;
}

function buildHead(torso, type, b, C) {
  const head = group(torso, 0, 3.7, 0.75);
  let eye;
  if (type === 'visor') {
    add(head, taperBox(1.9 * b, 1.3, 2.2 * b, { tx: 0.8, tz: 0.8 }), C.M, 0, 0.1, 0.3);
    add(head, box(1.8, 0.5, 0.4), C.D, 0, 0.4, 1.45);
    eye = add(head, box(1.5, 0.14, 0.1), C.E, 0, 0.05, 1.45);
    add(head, box(0.6, 0.5, 1.6), C.D, 0, 0.9, 0.1);
  } else if (type === 'crest') {
    add(head, taperBox(1.5 * b, 1.4, 1.8 * b, { tx: 0.75, tz: 0.8 }), C.Fr, 0, 0.1, 0.4);
    add(head, taperBox(1.2, 0.6, 0.6, { tx: 0.6 }), C.D, 0, -0.45, 1.25);
    for (const s of [-1, 1]) {
      add(head, box(0.32, 0.12, 0.1), C.E, s * 0.32, 0.15, 1.31);
      add(head, taperBox(0.18, 1.9, 0.18, { tx: 0.3, tz: 0.3 }), mat(0xd8b23a), s * 0.55, 1.15, 1.1, 0, 0, -s * 0.85);
    }
    add(head, box(0.3, 0.3, 0.2), C.E, 0, 0.75, 1.15);
    eye = head.children[2];
  } else {
    // mono / horned: low dome with a single eye
    const dome = add(head, new THREE.SphereGeometry(1, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), C.M, 0, -0.15, 0);
    dome.scale.set(1.0 * b, 0.9, 1.45 * b);
    add(head, taperBox(1.5, 0.7, 1.1, { tx: 0.8, fx: 0.7 }), C.D, 0, -0.25, 0.95);
    add(head, box(1.15, 0.22, 0.4), C.J, 0, 0.05, 1.42);
    eye = add(head, new THREE.SphereGeometry(0.2, 6, 4), C.E, 0, 0.05, 1.6);
    if (type === 'horned') {
      for (const s of [-1, 1]) add(head, taperBox(0.2, 1.8, 0.32, { tx: 0.2, tz: 0.2 }), C.D, s * 0.6, 0.85, 0.5, -0.55, 0, s * 0.45);
    } else add(head, taperBox(0.22, 0.45, 2.2, { tz: 0.6 }), C.M, 0, 0.8, 0.1);
  }
  return { head, eye };
}

// spec: frame key string or a loadout object
export function buildMech(spec = 'strider') {
  const lo = typeof spec === 'string' ? defaultLoadout(spec) : sanitizeLoadout(spec);
  const F = FRAMES[lo.frame];
  const b = F.bulk;
  const C = {
    M: mat(lo.color ?? F.main), D: mat(lo.accent ?? F.dark), Fr: mat(F.frame), J: mat(F.joint),
    E: glow(lo.eye ?? F.eye),
  };
  const T = glow(0x7fd8ff, 0.85);

  const root = new THREE.Group();
  const body = group(root);
  const hips = group(body, 0, 7.0, 0);

  add(hips, taperBox(2.6 * b, 1.3, 1.8, { tx: 1.1, bx: 0.7 }), C.D);
  add(hips, taperBox(1.1, 1.7, 0.5, { bx: 0.55 }), C.M, 0, -0.35, 1.0, -0.15);
  add(hips, taperBox(1.6, 1.4, 0.5, { bx: 0.7 }), C.M, 0, -0.3, -1.0, 0.15);
  for (const s of [-1, 1]) add(hips, taperBox(0.45, 2.1, 1.9, { bz: 0.75 }), C.M, s * 1.6, -0.6, 0, 0, 0, s * 0.22);

  const legs = [];
  for (const s of [-1, 1]) {
    const hip = group(hips, s * 1.15, -0.3, 0);
    add(hip, taperBox(1.3 * b, 2.9, 1.5 * b, { bx: 0.82, bz: 0.82 }), C.M, 0, -1.4, 0);
    add(hip, box(0.7, 2.6, 0.7), C.Fr, 0, -1.6, -0.6);
    const knee = group(hip, 0, -2.9, 0);
    add(knee, cyl(0.55, 0.55, 1.2 * b), C.J, 0, 0, 0, 0, 0, PI2);
    add(knee, taperBox(1.2 * b, 1.5, 0.9, { tz: 0.4, sz: 0.25, tx: 0.7 }), C.M, 0, 0.1, 0.75);
    add(knee, taperBox(1.55 * b, 3.4, 2.0 * b, { tx: 0.72, tz: 0.68 }), C.M, 0, -1.7, -0.05);
    add(knee, taperBox(1.1 * b, 2.6, 0.35, { tx: 0.8 }), C.D, 0, -1.8, 1.0 * b, -0.07);
    add(knee, box(0.9, 1.6, 0.4), C.Fr, 0, -1.4, -1.05 * b);
    const foot = group(knee, 0, -3.2, 0);
    add(foot, taperBox(1.5 * b, 0.8, 3.0 * b, { tx: 0.7, tz: 0.8 }), C.D, 0, -0.2, 0.45);
    add(foot, taperBox(1.3 * b, 0.6, 1.3, { tx: 0.45, tz: 0.3, sz: -0.2 }), C.M, 0, -0.3, 2.3 * b);
    add(foot, taperBox(0.5, 0.55, 1.5, { tx: 0.4, tz: 0.3 }), C.M, 0, -0.25, -1.4 * b, 0.25);
    const fg = add(foot, new THREE.CircleGeometry(0.55, 8), T, 0, -0.62, 0.4, PI2);
    legs.push({ hip, knee, foot, glow: fg, side: s });
  }

  const torso = group(body, 0, 7.6, 0);
  add(torso, box(1.6, 1.0, 1.3), C.J, 0, 0.2, 0);
  add(torso, taperBox(3.2 * b, 2.4, 2.2 * b, { bx: 0.68, bz: 0.8 }), C.M, 0, 1.8, 0);
  add(torso, taperBox(3.8 * b, 1.1, 2.5 * b, { tx: 0.78, tz: 0.68 }), C.M, 0, 3.4, 0);
  add(torso, taperBox(1.6, 1.6, 0.5, { tx: 0.7, bx: 0.85 }), C.D, 0, 2.0, 1.15 * b);
  for (const s of [-1, 1]) add(torso, box(0.5, 0.9, 0.2), C.Fr, s * 1.0, 1.5, 1.15 * b);
  add(torso, box(0.55, 0.12, 0.05), C.E, 0, 2.55, 1.42 * b);

  const { head, eye } = buildHead(torso, lo.head, b, C);

  if (lo.frame === 'wraith') {
    let prev = hips;
    for (let i = 0; i < 4; i++) {
      const seg = group(prev, 0, i ? -0.1 : -0.5, i ? -1.4 : -1.2);
      add(seg, taperBox(0.6 - i * 0.1, 0.6 - i * 0.1, 1.5, { tz: 0.8 }), i % 2 ? C.D : C.M, 0, 0, -0.7);
      seg.rotation.x = 0.25;
      prev = seg;
    }
  }

  // Backpack thrusters
  add(torso, taperBox(2.5 * b, 2.6, 1.4, { tz: 0.8 }), C.D, 0, 2.2, -1.55 * b);
  const thrusters = [];
  for (const s of [-1, 1]) {
    add(torso, cyl(0.42, 0.55, 1.1), C.J, s * 0.75, 1.0, -2.1 * b, 0.6);
    thrusters.push(add(torso, new THREE.ConeGeometry(0.45, 2.4, 6, 1, true), T, s * 0.75, 0.15, -2.75 * b, 0.6 + Math.PI));
  }

  const blades = lo.hands === 'blades';
  const melee = blades ? null : lo.melee;
  const arms = [
    buildArm(torso, -1, { x: -2.35 * b, y: 3.0, z: 0, scale: 1, big: true, blade: blades, melee }, C, b),
    buildArm(torso, 1, { x: 2.35 * b, y: 3.0, z: 0, scale: 1, big: true, blade: blades, weapon: lo.main }, C, b),
  ];
  const lowerArms = lo.arms === 'four' ? [
    buildArm(torso, -1, { x: -1.85 * b, y: 1.2, z: 0.4, scale: 0.78, big: false, blade: blades, melee: melee === 'pile' ? null : melee }, C, b),
    buildArm(torso, 1, { x: 1.85 * b, y: 1.2, z: 0.4, scale: 0.78, big: false, blade: blades, weapon: lo.main }, C, b),
  ] : [];
  const muzzles = [arms[1].muzzle, ...(lowerArms[1] ? [lowerArms[1].muzzle] : [])];
  const sideMuzzles = sideWeapons(torso, lo.side, b, C);

  const rig = { root, body, hips, torso, head, eye, legs, arms, lowerArms, thrusters, muzzle: muzzles[0], muzzles, sideMuzzles,
    frame: lo.frame, loadout: lo, sig: loadoutSig(lo), meleeKey: meleeKey(lo) };
  root.userData.rig = rig;
  return root;
}

function ease(obj, key, target, a) { obj[key] += (target - obj[key]) * a; }
const lerp = (a, b, t) => a + (b - a) * t;

// Melee swing pose for one arm. p: 0..1 progress.
function swingPose(A, p, pile) {
  if (pile) { // straight punch
    const k = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7;
    A.sh.rotation.x = lerp(-0.4, -1.55, k);
    A.elbow.rotation.x = lerp(-1.2, 0, k);
    return;
  }
  if (p < 0.25) { const k = p / 0.25; A.sh.rotation.x = lerp(-0.3, -2.7, k); A.elbow.rotation.x = lerp(-0.8, -0.3, k); A.sh.rotation.z = lerp(0, A.side * 0.4, k); }
  else if (p < 0.55) { const k = (p - 0.25) / 0.3; A.sh.rotation.x = lerp(-2.7, -0.1, k); A.elbow.rotation.x = lerp(-0.3, -1.0, k); A.sh.rotation.z = lerp(A.side * 0.4, -A.side * 0.3, k); }
  else { const k = (p - 0.55) / 0.45; A.sh.rotation.x = lerp(-0.1, -0.4, k); A.elbow.rotation.x = lerp(-1.0, -0.8, k); A.sh.rotation.z = lerp(-A.side * 0.3, 0, k); }
}

// s: { fwd, side, up, speed, air, phase, boost, dt, aimPitch, swing: {t, arm} }
export function animateMech(rig, s) {
  if (!Number.isFinite(s.phase) || !Number.isFinite(s.speed)) return;
  const a = 1 - Math.exp(-s.dt * 10);
  const k = Math.min(1, s.speed / 90);
  const lean = THREE.MathUtils.clamp(s.fwd / 120, -0.35, 0.6);
  const sw = Math.sin(s.phase);
  if (!s.air) {
    rig.legs.forEach((L, i) => {
      const push = Math.max(0, i === 0 ? sw : -sw) * k;
      const recover = Math.max(0, i === 0 ? -sw : sw) * k;
      ease(L.hip.rotation, 'z', L.side * (0.06 + push * 0.42), a);
      ease(L.hip.rotation, 'x', -0.15 + push * 0.5 - recover * 0.45, a);
      ease(L.knee.rotation, 'x', 0.3 + recover * 0.9 + k * 0.2, a);
      ease(L.foot.rotation, 'x', -(L.hip.rotation.x + L.knee.rotation.x) * 0.8, a);
    });
    ease(rig.torso.rotation, 'x', 0.05 + lean * 0.55, a);
    ease(rig.body.rotation, 'z', -sw * k * 0.12 - s.side / 300, a);
    ease(rig.body.position, 'x', sw * k * 0.5, a);
    ease(rig.hips.position, 'y', 7.0 - k * 0.6 - Math.abs(sw) * k * 0.2, a);
    ease(rig.body.rotation, 'x', 0, a);
  } else {
    rig.legs.forEach((L) => {
      ease(L.hip.rotation, 'z', L.side * 0.1, a);
      ease(L.hip.rotation, 'x', 0.25 + lean * 0.7, a);
      ease(L.knee.rotation, 'x', 0.7 + lean * 0.4, a);
      ease(L.foot.rotation, 'x', 0.5, a);
    });
    ease(rig.torso.rotation, 'x', lean * 0.5, a);
    ease(rig.body.rotation, 'x', lean * 0.5 - s.up / 200, a);
    ease(rig.body.rotation, 'z', -s.side / 200, a);
    ease(rig.body.position, 'x', 0, a);
    ease(rig.hips.position, 'y', 7.0, a);
  }
  // Arms: right arms aim guns, left arms hold close-range weapons.
  const [la, ra] = rig.arms;
  const aim = s.aimPitch || 0;
  ease(ra.sh.rotation, 'x', -0.35 - aim * 0.6, a); ease(ra.sh.rotation, 'z', 0, a);
  ease(ra.elbow.rotation, 'x', -1.35, a);
  ease(la.sh.rotation, 'x', s.air ? 0.4 : -0.1 + sw * k * 0.3, a); ease(la.sh.rotation, 'z', 0, a);
  ease(la.elbow.rotation, 'x', s.air ? -0.3 : -0.7, a);
  for (const L of rig.lowerArms) {
    ease(L.sh.rotation, 'x', L.side > 0 ? -0.2 - aim * 0.5 : -0.3, a);
    ease(L.sh.rotation, 'z', 0, a);
    ease(L.elbow.rotation, 'x', L.side > 0 ? -1.4 : -0.9, a);
  }
  let twist = 0;
  if (s.swing && s.swing.t < 1) {
    const p = s.swing.t, pile = rig.meleeKey === 'pile';
    const arm = rig.meleeKey === 'blades' ? rig.arms[s.swing.arm % 2] : la;
    swingPose(arm, p, pile);
    const lower = rig.lowerArms.length ? (rig.meleeKey === 'blades' ? rig.lowerArms[(s.swing.arm + 1) % 2] : rig.lowerArms[0]) : null;
    if (lower && !pile) swingPose(lower, Math.max(0, p - 0.12), false);
    twist = Math.sin(p * Math.PI) * 0.45 * (arm.side > 0 ? 1 : -1);
  }
  ease(rig.torso.rotation, 'y', twist, s.swing && s.swing.t < 1 ? 0.5 : a);
  ease(rig.head.rotation, 'x', -aim * 0.4, a);
  const t = 0.4 + (s.boost ? 1.4 : 0) + (s.air ? 0.4 : 0) + k * 0.4;
  for (const th of rig.thrusters) th.scale.set(1, t * (0.85 + Math.random() * 0.3), 1);
  for (const L of rig.legs) L.glow.scale.setScalar(s.air ? 0.4 : 1 + Math.random() * 0.25);
}
