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
  } else if (type === 'megacannon') {
    add(g, box(1.7, 2.2, 1.7), C.D, 0, -0.6, 0);
    for (let i = 0; i < 4; i++) {
      const x = (i % 2 - 0.5) * 0.75, z = (Math.floor(i / 2) - 0.5) * 0.75;
      add(g, cyl(0.24, 0.24, 3.2), C.J, x, -3.0, z);
      add(g, cyl(0.32, 0.32, 0.4), C.Fr, x, -4.5, z);
    }
    mz = -4.8;
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
  const gaunt = o.type === 'gauntlet', long = o.type === 'long';
  const ul = long ? 3.6 : 2.8, hand = long ? 3.9 : gaunt ? 3.4 : 3.0, gw = gaunt ? 1.55 : 1;
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
  add(sh, box(0.85, ul - 0.6, 0.85), C.Fr, s * 0.3, -ul / 2 - 0.2, 0);
  const elbow = group(sh, s * 0.3, -ul, 0);
  add(elbow, cyl(0.45 * gw, 0.45 * gw, 1.0), C.J, 0, 0, 0, 0, 0, PI2);
  add(elbow, taperBox(1.3 * b * gw, hand - 0.4, 1.45 * b * gw, { tx: gaunt ? 0.75 : 0.85, tz: 0.85, bx: gaunt ? 1.15 : 1, bz: gaunt ? 1.1 : 1 }), C.M, 0, -(hand - 0.4) / 2 - 0.1, 0);
  add(elbow, box(0.3, hand - 1, 1.25 * b * gw), C.D, s * 0.72 * b * gw, -hand / 2 + 0.2, 0);
  if (gaunt) for (const k of [-1, 0, 1]) add(elbow, taperBox(0.3, 0.6, 0.35, { tx: 0.3, tz: 0.3 }), C.Fr, k * 0.6, -hand + 0.9, 1.25);
  let blade = null;
  if (o.blade) {
    // Blade hand: long angled blade instead of a fist
    blade = group(elbow, 0, -hand, 0);
    add(blade, box(0.7, 0.7, 0.8), C.J, 0, 0, 0);
    add(blade, taperBox(0.28, 4.6, 1.1, { tz: 0.15, tx: 0.5 }), C.Fr, 0, -2.6, 0.15);
    add(blade, box(0.07, 4.2, 0.09), glow(MELEE.blades.color), 0, -2.5, 0.68);
  } else add(elbow, gaunt ? box(1.7, 1.5, 1.7) : box(0.8, 0.8, 0.9), gaunt ? C.D : C.J, 0, -hand, 0);

  let muzzle = null;
  if (o.weapon) {
    const w = weaponMesh(o.weapon, C);
    if (o.blade) { w.g.position.set(s * 0.95, -1.0, 0.3); w.g.scale.setScalar(0.8); } // forearm-mounted
    else w.g.position.set(0, -hand, gaunt ? 1.3 : 0.75);
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
    m.position.set(0, -hand - 0.1, gaunt ? 0.6 : 0.2);
    elbow.add(m);
  }
  return { sh, elbow, side: s, muzzle, hand, big: o.big, gw, blade: !!o.blade };
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

function buildBody(torso, type, b, C) {
  add(torso, box(1.6, 1.0, 1.3), C.J, 0, 0.2, 0);
  if (type === 'sleek') {
    add(torso, taperBox(2.6 * b, 2.5, 2.0 * b, { bx: 0.6, bz: 0.7, fx: 0.7 }), C.M, 0, 1.8, 0);
    add(torso, taperBox(3.3 * b, 1.0, 2.2 * b, { tx: 0.7, tz: 0.6 }), C.M, 0, 3.35, 0);
    add(torso, taperBox(0.9, 2.4, 1.0, { tx: 0.3, bx: 0.5, tz: 0.4 }), C.D, 0, 2.0, 1.05 * b);
    for (const s of [-1, 1]) add(torso, taperBox(0.18, 3.0, 1.8, { tx: 0.2, tz: 0.3 }), C.D, s * 1.05, 4.2, -1.4, -0.5, 0, s * 0.45);
    add(torso, box(0.4, 0.1, 0.05), C.E, 0, 2.9, 1.6 * b);
  } else if (type === 'heavy') {
    add(torso, taperBox(4.2 * b, 2.8, 2.8 * b, { bx: 0.7, bz: 0.8 }), C.M, 0, 1.9, 0);
    add(torso, taperBox(4.6 * b, 1.2, 3.0 * b, { tx: 0.8, tz: 0.7 }), C.M, 0, 3.6, 0);
    for (const s of [-1, 1]) {
      add(torso, taperBox(1.7, 2.1, 0.5, { bx: 0.8 }), C.D, s * 0.9, 2.0, 1.5 * b, -0.1);
      add(torso, taperBox(0.6, 2.4, 2.4, { bz: 0.7 }), C.D, s * 2.2 * b, 1.7, 0, 0, 0, s * 0.12);
      for (let i = 0; i < 3; i++) add(torso, box(0.9, 0.12, 0.1), C.J, s * 0.9, 1.4 + i * 0.35, 1.78 * b);
    }
    add(torso, box(0.7, 0.14, 0.05), C.E, 0, 3.0, 1.65 * b);
  } else if (type === 'core') {
    add(torso, taperBox(3.2 * b, 2.4, 2.0 * b, { bx: 0.68, bz: 0.8 }), C.M, 0, 1.8, -0.15);
    add(torso, taperBox(3.8 * b, 1.1, 2.5 * b, { tx: 0.78, tz: 0.68 }), C.M, 0, 3.4, 0);
    add(torso, new THREE.IcosahedronGeometry(0.85, 0), C.E, 0, 2.0, 0.95 * b);
    add(torso, new THREE.TorusGeometry(1.1, 0.18, 4, 8), C.Fr, 0, 2.0, 1.0 * b);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(torso, box(0.9, 0.18, 0.4), C.D, s * 1.05, 1.2 + i * 0.6, 1.0 * b, 0, 0, s * (0.3 - i * 0.2));
  } else {
    add(torso, taperBox(3.2 * b, 2.4, 2.2 * b, { bx: 0.68, bz: 0.8 }), C.M, 0, 1.8, 0);
    add(torso, taperBox(3.8 * b, 1.1, 2.5 * b, { tx: 0.78, tz: 0.68 }), C.M, 0, 3.4, 0);
    add(torso, taperBox(1.6, 1.6, 0.5, { tx: 0.7, bx: 0.85 }), C.D, 0, 2.0, 1.15 * b);
    for (const s of [-1, 1]) add(torso, box(0.5, 0.9, 0.2), C.Fr, s * 1.0, 1.5, 1.15 * b);
    add(torso, box(0.55, 0.12, 0.05), C.E, 0, 2.55, 1.42 * b);
  }
}

function buildLegs(hips, type, b, C, T) {
  const legs = [], glows = [];
  const glowDisc = (parent, r, x, y, z) => { const g = add(parent, new THREE.CircleGeometry(r, 10), T, x, y, z, PI2); glows.push(g); return g; };
  if (type === 'hover') {
    const skirt = group(hips, 0, -0.6, 0);
    add(skirt, cyl(2.0 * b, 3.3 * b, 3.0, 8), C.M, 0, -1.5, 0);
    add(skirt, cyl(3.35 * b, 3.0 * b, 0.5, 8), C.D, 0, -3.2, 0);
    for (const s of [-1, 1]) add(skirt, taperBox(0.4, 2.6, 2.6, { tz: 0.5 }), C.D, s * 3.0 * b, -2.0, 0, 0, 0, s * 0.35);
    add(skirt, taperBox(2.0, 2.4, 0.4, { tx: 0.6 }), C.D, 0, -1.7, 2.9 * b, -0.35);
    glowDisc(skirt, 2.7 * b, 0, -3.5, 0);
    return { legs, skirt, glows };
  }
  if (type === 'quad') {
    add(hips, taperBox(2.4 * b, 1.6, 3.8, { tz: 0.8, bx: 0.8 }), C.D, 0, 0.1, -2.6);
    add(hips, taperBox(2.0 * b, 1.0, 2.2, { tx: 0.8 }), C.M, 0, 0.9, -3.1);
    add(hips, taperBox(0.5, 0.5, 2.4, { tx: 0.3, tz: 0.3 }), C.M, 0, 0.7, -5.2, 0.3);
    for (const [front, off] of [[true, 0], [false, Math.PI]]) for (const s of [-1, 1]) {
      const hip = group(hips, s * 1.4 * b, -0.1, front ? 0.9 : -3.6);
      add(hip, cyl(0.55, 0.55, 1.0), C.J, 0, 0, 0, 0, 0, PI2);
      add(hip, taperBox(0.95 * b, 2.6, 1.2 * b, { bx: 0.8 }), C.M, s * 1.0, -0.6, 0, 0, 0, s * 1.05);
      const knee = group(hip, s * 2.0, -1.2, 0);
      add(knee, cyl(0.5, 0.5, 1.1), C.J, 0, 0, 0, 0, 0, PI2);
      add(knee, taperBox(1.1 * b, 5.0, 1.3 * b, { tx: 1.15, bx: 0.6, bz: 0.7 }), C.M, -s * 0.3, -2.6, 0, 0, 0, -s * 0.12);
      add(knee, box(0.5, 2.6, 0.5), C.Fr, -s * 0.1, -2.2, front ? 0.7 : -0.7);
      const foot = group(knee, -s * 0.6, -5.3, 0);
      add(foot, taperBox(1.5, 0.6, 1.8, { tx: 0.7, tz: 0.7 }), C.D, 0, -0.1, 0.2);
      const g = glowDisc(foot, 0.5, 0, -0.42, 0.2);
      legs.push({ hip, knee, foot, glow: g, side: s, phaseOff: off, front });
    }
    return { legs, skirt: null, glows };
  }
  if (type === 'hind') {
    for (const s of [-1, 1]) {
      const hip = group(hips, s * 1.2, -0.3, 0);
      add(hip, taperBox(1.4 * b, 2.8, 1.6 * b, { bx: 0.8, bz: 0.8 }), C.M, 0, -1.2, 0.55, -0.45);
      const knee = group(hip, 0, -2.4, 1.1);
      add(knee, cyl(0.55, 0.55, 1.2 * b), C.J, 0, 0, 0, 0, 0, PI2);
      add(knee, taperBox(1.1 * b, 3.0, 1.25 * b, { tx: 1.1, bx: 0.7 }), C.M, 0, -1.3, -0.75, 0.55);
      add(knee, box(0.45, 2.4, 0.45), C.Fr, 0, -1.1, -0.25, 0.55);
      const ankle = group(knee, 0, -2.5, -1.5);
      add(ankle, cyl(0.42, 0.42, 1.0 * b), C.J, 0, 0, 0, 0, 0, PI2);
      add(ankle, taperBox(0.8 * b, 1.9, 0.9, { tx: 1.1 }), C.D, 0, -0.9, 0.2, -0.2);
      const foot = group(ankle, 0, -1.75, 0.4);
      for (const t of [-1, 0, 1]) add(foot, taperBox(0.38, 0.45, 1.7, { tx: 0.4, tz: 0.2 }), C.D, t * 0.45, -0.05, 0.9, 0, t * 0.3, 0);
      add(foot, taperBox(0.35, 0.4, 1.2, { tz: 0.2 }), C.M, 0, 0, -0.8);
      const g = glowDisc(foot, 0.5, 0, -0.32, 0.2);
      legs.push({ hip, knee, ankle, foot, glow: g, side: s });
    }
    return { legs, skirt: null, glows };
  }
  return { legs, skirt: null, glows }; // standard legs are built inline
}

// Giant armor: winged upper body on huge thruster-tank "legs". Built at normal scale, then scaled 4x.
function buildGiant(lo, F, C, T) {
  const root = new THREE.Group();
  const body = group(root);
  const hips = group(body, 0, 7.2, 0);
  const red = glow(0xd03a3a);
  add(hips, taperBox(3.6, 1.6, 3.0, { tx: 1.1, bx: 0.8 }), C.D);
  for (const [x, z, ry] of [[0, 1.8, 0], [-2.0, 0.9, -0.7], [2.0, 0.9, 0.7], [-2.0, -1.1, -2.4], [2.0, -1.1, 2.4]]) {
    const p = add(hips, taperBox(2.3, 3.6, 0.5, { bx: 1.15 }), C.M, x, -1.4, z);
    p.rotation.order = 'YXZ'; p.rotation.set(-0.25, ry, 0);
    const v = add(p, box(1.3, 0.35, 0.1), red, 0, -0.8, 0.28);
    v.rotation.set(0, 0, 0);
  }
  const legs = [], glows = [];
  for (const s of [-1, 1]) {
    const hip = group(hips, s * 1.5, -0.4, -0.4);
    add(hip, cyl(1.1, 1.1, 1.2, 10), C.J, 0, 0, 0);
    add(hip, cyl(1.3, 1.3, 5.2, 10), C.M, 0, -3.2, 0);
    add(hip, cyl(1.34, 1.34, 0.9, 10), C.Fr, 0, -2.2, 0);
    add(hip, cyl(1.34, 1.34, 0.2, 10), mat(0xc9a23a), 0, -4.6, 0);
    add(hip, new THREE.SphereGeometry(1.3, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), C.M, 0, -5.8, 0);
    for (const k of [-1, 1]) add(hip, box(0.18, 1.0, 0.1), red, k * 0.45, -5.9, 1.22);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      add(hip, cyl(0.3, 0.45, 0.6), C.J, Math.cos(a) * 0.6, -7.0, Math.sin(a) * 0.6);
      glows.push(add(hip, new THREE.CircleGeometry(0.42, 8), T, Math.cos(a) * 0.6, -7.32, Math.sin(a) * 0.6, PI2));
    }
    legs.push({ hip, knee: hip, foot: hip, glow: glows[glows.length - 1], side: s });
  }
  const torso = group(body, 0, 7.6, 0);
  add(torso, box(1.8, 1.2, 1.5), C.J, 0, 0.2, 0);
  add(torso, taperBox(3.6, 2.6, 2.6, { bx: 0.7, bz: 0.8 }), C.M, 0, 1.9, 0);
  add(torso, taperBox(4.2, 1.2, 2.8, { tx: 0.75, tz: 0.7 }), C.M, 0, 3.6, 0);
  for (const s of [-1, 1]) add(torso, box(0.9, 0.3, 0.1), red, s * 0.9, 1.7, 1.32);
  const { head, eye } = buildHead(torso, lo.head, 1, C);
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = group(torso, s * 2.9, 3.4, 0);
    const pd = add(sh, new THREE.SphereGeometry(1.8, 8, 6), C.M, s * 0.4, 0.3, 0);
    pd.scale.set(1.1, 0.9, 1.3);
    for (const [y, z, rz] of [[1.6, 0.6, 0.2], [1.5, -0.6, 0.3], [0.8, 0, 1.0], [0.9, -1.4, 0.8]]) add(sh, new THREE.ConeGeometry(0.25, 1.3, 5), C.Fr, s * (0.6 + rz), y, z, 0, 0, -s * rz);
    add(sh, box(1.0, 2.6, 1.0), C.Fr, s * 0.4, -1.8, 0);
    const elbow = group(sh, s * 0.4, -3.2, 0);
    add(elbow, cyl(0.55, 0.55, 1.2), C.J, 0, 0, 0, 0, 0, PI2);
    add(elbow, taperBox(1.7, 3.0, 1.8, { tx: 0.85 }), C.M, 0, -1.5, 0);
    const w = weaponMesh('megacannon', C);
    w.g.position.set(0, -3.0, 0.2);
    elbow.add(w.g);
    arms.push({ sh, elbow, side: s, muzzle: w.muzzle });
  }
  // Huge swept binder wings
  const wings = [];
  for (const s of [-1, 1]) {
    const wg = group(torso, s * 1.4, 3.8, -1.8);
    wg.rotation.set(-0.55, 0, -s * 0.8);
    add(wg, taperBox(1.7, 11, 0.7, { tx: 0.25, tz: 0.5 }), C.M, 0, 5.5, 0);
    add(wg, taperBox(0.7, 7.5, 0.8, { tx: 0.3 }), C.D, -s * 0.35, 4.5, -0.05);
    for (const y of [2.5, 4.5, 6.5]) add(wg, new THREE.ConeGeometry(0.22, 1.1, 5), C.Fr, s * 0.9, y, 0, 0, 0, -s * 1.3);
    wings.push(wg);
  }
  // Artillery battery on the back
  add(torso, taperBox(3.2, 3.0, 2.0, { tz: 0.8 }), C.D, 0, 2.4, -2.0);
  const sideMuzzles = [];
  for (const s of [-1, 1]) {
    const g = group(torso, s * 1.1, 4.3, -2.0);
    add(g, box(1.4, 1.0, 1.6), C.J, 0, 0, 0);
    for (let i = 0; i < 6; i++) add(g, box(0.3, 0.1, 0.3), glow(0xffb050), -0.4 + (i % 3) * 0.4, 0.52, -0.35 + Math.floor(i / 3) * 0.7);
    for (let i = 0; i < 3; i++) sideMuzzles.push(group(g, -0.4 + i * 0.4, 0.8, 0));
  }
  const thrusters = [];
  for (const s of [-1, 1]) {
    add(torso, cyl(0.6, 0.8, 1.2), C.J, s * 1.0, 0.8, -2.8, 0.6);
    thrusters.push(add(torso, new THREE.ConeGeometry(0.7, 3.4, 6, 1, true), T, s * 1.0, -0.2, -3.6, 0.6 + Math.PI));
  }
  const rig = { root, body, hips, torso, head, eye, legs, skirt: null, glows, legType: 'pods', arms, lowerArms: [], thrusters, wings,
    muzzle: arms[1].muzzle, muzzles: [arms[1].muzzle, arms[0].muzzle], sideMuzzles, frame: lo.frame, loadout: lo, sig: loadoutSig(lo), meleeKey: 'crush', giant: true };
  root.userData.rig = rig;
  outline(root);
  root.scale.setScalar(4);
  return root;
}

// Backpack / mobility unit. Returns flame meshes that scale with thrust.
function buildPack(torso, type, b, C, T) {
  const thrusters = [];
  const flame = (parent, r, len, x, y, z, rx) => { const f = add(parent, new THREE.ConeGeometry(r, len, 6, 1, true), T, x, y, z, rx + Math.PI); thrusters.push(f); return f; };
  const trim = mat(0xe0b030);
  if (type === 'boosters') {
    // Tall twin booster pods rising behind the shoulders
    add(torso, taperBox(2.4 * b, 2.4, 1.2, { tz: 0.8 }), C.D, 0, 2.2, -1.5 * b);
    for (const s of [-1, 1]) {
      const pod = group(torso, s * 1.45 * b, 4.2, -2.3 * b);
      pod.rotation.set(-0.18, 0, -s * 0.08);
      add(pod, taperBox(1.6, 6.2, 1.9, { tx: 0.8, tz: 0.75, bx: 0.9 }), C.M, 0, 0, 0);
      add(pod, taperBox(1.3, 1.4, 1.95, { tx: 0.6 }), C.M, 0, 3.6, 0.1);
      add(pod, box(1.66, 0.25, 1.96), trim, 0, -1.4, 0);
      add(pod, box(0.12, 3.0, 0.5), trim, s * 0.82, 0.6, 0.4);
      for (const k of [-1, 1]) add(pod, box(0.5, 0.6, 0.12), C.J, k * 0.4, 1.8, -0.96);
      add(pod, cyl(0.62, 0.8, 0.9, 8), C.J, 0, -3.5, 0);
      flame(pod, 0.7, 4.0, 0, -5.8, 0, 0);
    }
  } else if (type === 'wings') {
    add(torso, taperBox(2.5 * b, 2.6, 1.4, { tz: 0.8 }), C.D, 0, 2.2, -1.55 * b);
    for (const s of [-1, 1]) {
      for (const [i, ang] of [[0, 0.55], [1, 1.05]]) {
        const w = group(torso, s * 0.9, 3.0 - i * 0.6, -2.0 * b);
        w.rotation.set(-0.35, 0, -s * ang);
        add(w, taperBox(1.0, 5.2 - i, 0.25, { tx: 0.3 }), i ? C.D : C.M, 0, 2.6 - i * 0.5, 0);
        add(w, box(0.08, 3.6 - i, 0.3), glow(0x7fd8ff), s * 0.42, 2.4 - i * 0.5, 0);
      }
      add(torso, cyl(0.42, 0.55, 1.1), C.J, s * 0.75, 1.0, -2.1 * b, 0.6);
      flame(torso, 0.45, 2.4, s * 0.75, 0.15, -2.75 * b, 0.6);
    }
  } else if (type === 'jumpjets') {
    add(torso, taperBox(2.2 * b, 2.2, 1.2, { tz: 0.8 }), C.D, 0, 2.3, -1.5 * b);
    for (const s of [-1, 1]) {
      add(torso, cyl(0.38, 0.5, 1.0), C.J, s * 0.7, 1.3, -2.0 * b, 0.6);
      flame(torso, 0.4, 2.0, s * 0.7, 0.5, -2.6 * b, 0.6);
      // Waist jump jets pointing straight down
      add(torso, box(0.9, 1.6, 1.2), C.D, s * 1.9 * b, -0.6, -0.7);
      add(torso, cyl(0.4, 0.5, 0.5), C.J, s * 1.9 * b, -1.6, -0.7);
      flame(torso, 0.45, 2.6, s * 1.9 * b, -3.0, -0.7, 0);
    }
  } else if (type === 'verniers') {
    add(torso, taperBox(2.5 * b, 2.6, 1.4, { tz: 0.8 }), C.D, 0, 2.2, -1.55 * b);
    for (const s of [-1, 1]) {
      add(torso, cyl(0.42, 0.55, 1.1), C.J, s * 0.75, 1.0, -2.1 * b, 0.6);
      flame(torso, 0.45, 2.4, s * 0.75, 0.15, -2.75 * b, 0.6);
      for (const [y, z, rx] of [[3.6, -1.9, -0.9], [2.8, -2.2, -1.6], [1.6, -1.8, 0.3]]) {
        add(torso, cyl(0.2, 0.28, 0.5), C.J, s * 1.5 * b, y, z * b, rx);
        flame(torso, 0.22, 1.2, s * 1.5 * b, y - 0.5 * Math.cos(rx), z * b - 0.5 * Math.sin(rx), rx);
      }
    }
  } else {
    add(torso, taperBox(2.5 * b, 2.6, 1.4, { tz: 0.8 }), C.D, 0, 2.2, -1.55 * b);
    for (const s of [-1, 1]) {
      add(torso, cyl(0.42, 0.55, 1.1), C.J, s * 0.75, 1.0, -2.1 * b, 0.6);
      flame(torso, 0.45, 2.4, s * 0.75, 0.15, -2.75 * b, 0.6);
    }
  }
  return thrusters;
}

// ---------- Detail pass ----------
// Dark panel lines on every armor piece (one merged LineSegments per animated part keeps draw calls low).
const edgeCache = new WeakMap();
const lineMat = new THREE.LineBasicMaterial({ color: 0x0a0c0f, transparent: true, opacity: 0.85 });
function edgesOf(geo) {
  let e = edgeCache.get(geo);
  if (!e) { e = new THREE.EdgesGeometry(geo, 25); edgeCache.set(geo, e); }
  return e;
}
function outline(root) {
  const holders = [];
  root.traverse(o => { if (!o.isMesh && !o.isLineSegments) holders.push(o); });
  const v = new THREE.Vector3();
  for (const g of holders) {
    const chunks = [];
    let total = 0;
    for (const c of g.children) {
      if (!c.isMesh || !c.material.isMeshStandardMaterial) continue;
      c.updateMatrix();
      const e = edgesOf(c.geometry).attributes.position;
      const arr = new Float32Array(e.count * 3);
      for (let i = 0; i < e.count; i++) { v.fromBufferAttribute(e, i).applyMatrix4(c.matrix); arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; }
      chunks.push(arr); total += arr.length;
    }
    if (!total) continue;
    const all = new Float32Array(total);
    let o = 0;
    for (const a of chunks) { all.set(a, o); o += a.length; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(all, 3));
    const ls = new THREE.LineSegments(geo, lineMat);
    ls.raycast = () => {};
    g.add(ls);
  }
}

// Row of vent slats inside a dark frame
function vents(parent, x, y, z, w, h, n, C, rx = 0) {
  const g = group(parent, x, y, z);
  g.rotation.x = rx;
  add(g, box(w, h, 0.06), C.J, 0, 0, 0);
  for (let i = 0; i < n; i++) add(g, box(w * 0.82, h / (n * 2.2), 0.08), C.Tr, 0, -h / 2 + (i + 0.5) * h / n, 0.03);
  return g;
}
function bolt(parent, x, y, z, r, C, axis = 'z') {
  const m = add(parent, cyl(r, r, 0.12, 6), C.Fr, x, y, z);
  if (axis === 'z') m.rotation.x = PI2; else if (axis === 'x') m.rotation.z = PI2;
  return m;
}

const FRONT = { standard: 1.12, heavy: 1.42, sleek: 0.98, core: 0.9 };
const HALF = { standard: 1.45, heavy: 2.0, sleek: 1.2, core: 1.45 };
function addDetails(rig, lo, C, b) {
  const t = rig.torso, fz = FRONT[lo.body] * b, hw = HALF[lo.body] * b;
  // Chest: twin intake vents, seams, collar bolts, neck, side sensors
  if (lo.body !== 'core') for (const s of [-1, 1]) vents(t, s * hw * 0.55, 1.45, fz + 0.03, 0.75, 0.62, 4, C, -0.1);
  for (const s of [-1, 1]) {
    add(t, box(0.05, 1.7, 1.4 * b), C.J, s * hw * 0.98, 1.9, 0);
    bolt(t, s * hw * 0.75, 3.35, fz * 0.75, 0.11, C);
    bolt(t, s * hw * 0.45, 3.35, fz * 0.75, 0.11, C);
    add(t, box(0.12, 0.12, 0.06), glow(0x6bff8a), s * hw * 0.9, 2.75, fz * 0.72);
    add(t, box(0.5, 0.14, 0.4), C.Tr, s * 0.55, 0.7, 0.62, 0, 0, s * 0.35); // waist V-trim
  }
  add(t, cyl(0.45, 0.55, 0.6, 8), C.J, 0, 3.75, 0.35);
  add(t, box(0.9, 0.5, 0.25), C.D, 0, 0.2, 0.75);
  // Backpack hoses
  for (const s of [-1, 1]) {
    const hose = add(t, new THREE.TorusGeometry(0.45, 0.1, 4, 8, Math.PI), C.J, s * 1.0 * b, 2.9, -1.05 * b);
    hose.rotation.set(0, PI2, 0);
  }
  // Head: antenna + cheek vents + chin
  const h = rig.head;
  if (lo.head !== 'crest') {
    add(h, cyl(0.04, 0.05, 1.8), C.Fr, 0.55, 1.0, -0.3, -0.3, 0, -0.25);
    add(h, cyl(0.03, 0.04, 1.1), C.Fr, -0.5, 0.8, -0.4, -0.4, 0, 0.2);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(h, box(0.06, 0.32, 0.25), C.J, s * (0.62 + i * 0.1), -0.3, 0.95 - i * 0.12);
  add(h, box(0.4, 0.18, 0.2), C.Tr, 0, -0.62, 1.2);
  // Arms
  for (const A of [...rig.arms, ...rig.lowerArms]) {
    const s = A.side, sh = A.sh, el = A.elbow;
    if (A.big) {
      add(sh, box(1.9 * b, 0.14, 0.16), C.Tr, s * 0.5, 1.45, 1.38 * b, 0, 0, s * 0.12);
      for (let i = 0; i < 3; i++) bolt(sh, s * 1.72 * b, 0.9 - i * 0.55, 0.9, 0.12, C, 'x');
      add(sh, cyl(0.22, 0.32, 0.5), C.J, s * 0.5, 0.3, -1.55 * b, PI2);
      add(sh, new THREE.CircleGeometry(0.2, 6), glow(0x7fd8ff, 0.85), s * 0.5, 0.3, -1.81 * b, 0, Math.PI);
      add(sh, box(0.06, 1.8, 2.4 * b), C.J, s * 1.0 * b, 0.4, 0, 0, 0, s * 0.12);
    }
    add(el, taperBox(0.95 * A.gw, 0.9, 0.75, { tz: 0.5 }), C.M, 0, 0.25, -0.62 * A.gw);
    if (!A.blade) add(el, cyl(0.58 * A.gw, 0.58 * A.gw, 0.24, 8), C.Fr, 0, -(A.hand - 0.5), 0);
    add(el, box(0.8 * A.gw, 1.1, 0.06), C.J, 0, -1.4, 0.74 * b * A.gw);
    add(el, box(0.5 * A.gw, 0.12, 0.08), C.Tr, 0, -0.75, 0.76 * b * A.gw);
  }
  // Hips: side hardpoints + skirt trim
  for (const s of [-1, 1]) {
    add(rig.hips, cyl(0.32, 0.32, 0.3, 8), C.Fr, s * 1.9, -0.5, 0, 0, 0, PI2);
    add(rig.hips, box(0.12, 1.2, 0.1), C.Tr, s * 0.3, -0.4, 1.27, -0.15);
  }
  // Legs
  for (const Lg of rig.legs) {
    const s = Lg.side;
    if (lo.legs === 'standard') {
      add(Lg.hip, box(0.06, 2.0, 1.1 * b), C.J, s * 0.66 * b, -1.4, 0);
      vents(Lg.hip, 0, -1.5, 0.76 * b, 0.7, 0.7, 3, C);
      for (const k of [-1, 1]) bolt(Lg.knee, k * 0.64 * b, 0, 0, 0.28, C, 'x');
      add(Lg.knee, box(0.55, 0.12, 0.06), C.Tr, 0, 0.45, 1.18);
      add(Lg.knee, box(0.55, 0.12, 0.06), C.Tr, 0, 0.25, 1.15);
      vents(Lg.knee, 0, -0.9, 1.2 * b, 0.75, 0.6, 3, C, -0.07);
      add(Lg.knee, taperBox(1.3 * b, 0.9, 0.5, { tx: 0.8 }), C.D, 0, -3.05, 0.95 * b, -0.35);
      add(Lg.knee, box(0.06, 2.6, 1.4 * b), C.J, s * 0.72 * b, -1.8, 0);
      add(Lg.foot, box(0.9 * b, 0.12, 0.08), C.Tr, 0, 0.12, 1.55 * b);
    } else if (lo.legs === 'hind') {
      for (const k of [-1, 1]) bolt(Lg.knee, k * 0.62 * b, 0, 0, 0.25, C, 'x');
      add(Lg.knee, box(0.5, 0.12, 0.06), C.Tr, 0, -0.6, -0.15, 0.55);
      vents(Lg.hip, 0, -1.2, 1.25, 0.7, 0.6, 3, C, -0.45);
      for (const k of [-1, 0, 1]) add(Lg.foot, box(0.2, 0.08, 0.3), C.Tr, k * 0.5, 0.15, 1.5, 0, k * 0.3, 0);
    } else if (lo.legs === 'quad') {
      bolt(Lg.knee, 0, 0, 0.6, 0.26, C);
      vents(Lg.knee, -s * 0.3, -2.0, 0.68 * b, 0.6, 0.9, 4, C);
      add(Lg.knee, box(0.8, 0.14, 0.08), C.Tr, -s * 0.3, -1.0, 0.7 * b);
    }
  }
  if (rig.skirt) {
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      add(rig.skirt, box(0.12, 2.2, 0.08), i % 2 ? C.J : C.Tr, Math.sin(a) * 2.75 * b, -1.6, Math.cos(a) * 2.75 * b, 0, a, 0).rotation.order = 'YXZ';
    }
    for (const s of [-1, 1]) vents(rig.skirt, s * 0.9, -1.4, 2.95 * b, 0.6, 0.8, 4, C, -0.35);
  }
}

// spec: frame key string or a loadout object
export function buildMech(spec = 'strider') {
  const lo = typeof spec === 'string' ? defaultLoadout(spec) : sanitizeLoadout(spec);
  const F = FRAMES[lo.frame];
  const b = F.bulk;
  const C = {
    M: mat(lo.color ?? F.main), D: mat(lo.accent ?? F.dark), Fr: mat(F.frame), J: mat(F.joint),
    E: glow(lo.eye ?? F.eye), Tr: mat(F.trim ?? 0xe0b030),
  };
  const T = glow(0x7fd8ff, 0.85);
  if (lo.size === 'giant') return buildGiant(lo, F, C, T);

  const root = new THREE.Group();
  const body = group(root);
  body.scale.set(F.prop[0], F.prop[1], F.prop[0]);
  const hips = group(body, 0, 7.0, 0);

  add(hips, taperBox(2.6 * b, 1.3, 1.8, { tx: 1.1, bx: 0.7 }), C.D);
  add(hips, taperBox(1.1, 1.7, 0.5, { bx: 0.55 }), C.M, 0, -0.35, 1.0, -0.15);
  add(hips, taperBox(1.6, 1.4, 0.5, { bx: 0.7 }), C.M, 0, -0.3, -1.0, 0.15);
  for (const s of [-1, 1]) add(hips, taperBox(0.45, 2.1, 1.9, { bz: 0.75 }), C.M, s * 1.6, -0.6, 0, 0, 0, s * 0.22);

  const { legs, skirt, glows } = buildLegs(hips, lo.legs, b, C, T);
  if (lo.legs === 'standard') for (const s of [-1, 1]) {
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
    glows.push(fg);
  }

  const torso = group(body, 0, 7.6, 0);
  buildBody(torso, lo.body, b, C);

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

  const thrusters = buildPack(torso, lo.mobility, b, C, T);

  const blades = lo.hands === 'blades';
  const melee = blades ? null : lo.melee;
  const arms = [
    buildArm(torso, -1, { x: -2.35 * b, y: 3.0, z: 0, scale: 1, big: true, blade: blades, melee, type: lo.arms }, C, b),
    buildArm(torso, 1, { x: 2.35 * b, y: 3.0, z: 0, scale: 1, big: true, blade: blades, weapon: lo.main, type: lo.arms }, C, b),
  ];
  const lowerArms = lo.arms === 'four' ? [
    buildArm(torso, -1, { x: -1.85 * b, y: 1.2, z: 0.4, scale: 0.78, big: false, blade: blades, melee: melee === 'pile' ? null : melee }, C, b),
    buildArm(torso, 1, { x: 1.85 * b, y: 1.2, z: 0.4, scale: 0.78, big: false, blade: blades, weapon: lo.main }, C, b),
  ] : [];
  const muzzles = [arms[1].muzzle, ...(lowerArms[1] ? [lowerArms[1].muzzle] : [])];
  const sideMuzzles = sideWeapons(torso, lo.side, b, C);

  const rig = { root, body, hips, torso, head, eye, legs, skirt, glows, legType: lo.legs, arms, lowerArms, thrusters, muzzle: muzzles[0], muzzles, sideMuzzles,
    frame: lo.frame, loadout: lo, sig: loadoutSig(lo), meleeKey: meleeKey(lo) };
  root.userData.rig = rig;
  addDetails(rig, lo, C, b);
  outline(root);
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
  const lt = rig.legType, quad = lt === 'quad';
  if (lt === 'pods') {
    rig.legs.forEach(L => {
      ease(L.hip.rotation, 'x', 0.15 + lean * 0.5 + (s.air ? 0.3 : 0) + Math.sin(s.phase + (L.side > 0 ? Math.PI : 0)) * 0.06 * k, a);
      ease(L.hip.rotation, 'z', L.side * 0.08 - s.side / 400, a);
    });
    ease(rig.torso.rotation, 'x', 0.05 + lean * 0.3, a);
    ease(rig.body.rotation, 'z', -s.side / 400, a);
    ease(rig.body.position, 'x', 0, a);
    ease(rig.hips.position, 'y', 7.2 + Math.sin(s.phase * 0.5) * 0.15, a);
    ease(rig.body.rotation, 'x', s.air ? lean * 0.3 : 0, a);
    for (const [i, w] of (rig.wings || []).entries()) ease(w.rotation, 'x', -0.55 - (s.air ? 0.25 : 0) - (s.boost ? 0.2 : 0), a);
  } else if (rig.skirt) {
    // Hover skirt: no legs, the skirt tilts with motion
    ease(rig.skirt.rotation, 'x', lean * 0.3 + (s.air ? 0.15 : 0), a);
    ease(rig.skirt.rotation, 'z', -s.side / 250, a);
    ease(rig.torso.rotation, 'x', 0.05 + lean * 0.5, a);
    ease(rig.body.rotation, 'z', -s.side / 300, a);
    ease(rig.body.position, 'x', 0, a);
    ease(rig.hips.position, 'y', 7.0 + Math.sin(s.phase * 0.7) * 0.2, a);
    ease(rig.body.rotation, 'x', s.air ? lean * 0.4 - s.up / 250 : 0, a);
  } else if (!s.air) {
    rig.legs.forEach((L) => {
      const sl = Math.sin(s.phase + (L.phaseOff || 0));
      const push = Math.max(0, L.side < 0 ? sl : -sl) * k;
      const recover = Math.max(0, L.side < 0 ? -sl : sl) * k;
      if (quad) {
        ease(L.hip.rotation, 'x', sl * 0.4 * k * (L.side < 0 ? 1 : -1), a);
        ease(L.hip.rotation, 'z', L.side * recover * 0.3, a);
        ease(L.knee.rotation, 'z', -L.side * recover * 0.25, a);
      } else if (lt === 'hind') {
        ease(L.hip.rotation, 'z', L.side * (0.06 + push * 0.4), a);
        ease(L.hip.rotation, 'x', -0.1 + push * 0.45 - recover * 0.35, a);
        ease(L.knee.rotation, 'x', recover * 0.5 + k * 0.1, a);
        ease(L.ankle.rotation, 'x', -recover * 0.6 - k * 0.1, a);
        ease(L.foot.rotation, 'x', -L.hip.rotation.x * 0.6, a);
      } else {
        ease(L.hip.rotation, 'z', L.side * (0.06 + push * 0.42), a);
        ease(L.hip.rotation, 'x', -0.15 + push * 0.5 - recover * 0.45, a);
        ease(L.knee.rotation, 'x', 0.3 + recover * 0.9 + k * 0.2, a);
        ease(L.foot.rotation, 'x', -(L.hip.rotation.x + L.knee.rotation.x) * 0.8, a);
      }
    });
    const q = quad ? 0.3 : 1;
    ease(rig.torso.rotation, 'x', 0.05 + lean * 0.55 * q, a);
    ease(rig.body.rotation, 'z', -sw * k * 0.12 * q - s.side / 300, a);
    ease(rig.body.position, 'x', sw * k * 0.5 * q, a);
    ease(rig.hips.position, 'y', 7.0 - k * 0.6 * q - Math.abs(sw) * k * 0.2 * q, a);
    ease(rig.body.rotation, 'x', 0, a);
  } else {
    rig.legs.forEach((L) => {
      if (quad) {
        ease(L.hip.rotation, 'x', (L.front ? -0.35 : 0.45) * (L.side < 0 ? 1 : -1), a);
        ease(L.hip.rotation, 'z', L.side * 0.2, a);
        ease(L.knee.rotation, 'z', -L.side * 0.3, a);
        return;
      }
      ease(L.hip.rotation, 'z', L.side * 0.1, a);
      ease(L.hip.rotation, 'x', 0.25 + lean * 0.7, a);
      ease(L.knee.rotation, 'x', lt === 'hind' ? 0.3 : 0.7 + lean * 0.4, a);
      if (L.ankle) ease(L.ankle.rotation, 'x', -0.5, a);
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
  if (rig.giant) { ease(la.sh.rotation, 'x', -0.35 - aim * 0.6, a); ease(la.sh.rotation, 'z', 0, a); ease(la.elbow.rotation, 'x', -1.35, a); }
  else {
  ease(la.sh.rotation, 'x', s.air ? 0.4 : -0.1 + sw * k * 0.3, a); ease(la.sh.rotation, 'z', 0, a);
  ease(la.elbow.rotation, 'x', s.air ? -0.3 : -0.7, a);
  }
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
for (const g of rig.glows) g.scale.setScalar(rig.skirt ? 0.9 + Math.random() * 0.25 + (s.air ? 0.2 : 0) : s.air ? 0.4 : 1 + Math.random() * 0.25);
}
