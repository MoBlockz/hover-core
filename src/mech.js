// Low-poly mech builder + procedural animation.
// Mech faces +Z, origin at the feet. ~12.5m tall.
import * as THREE from 'three';

export const FRAMES = {
  strider: { name: 'STRIDER', desc: 'Balanced frame', main: 0x56663f, dark: 0x37432a, frame: 0x8d949a, joint: 0x272b2f, eye: 0xffb347, hp: 100, speed: 1, bulk: 1 },
  wraith:  { name: 'WRAITH',  desc: 'Fast, light armor', main: 0x6555b4, dark: 0x25222f, frame: 0x9aa0b5, joint: 0x1a1922, eye: 0xff3b6b, hp: 85, speed: 1.12, bulk: 0.92 },
  bastion: { name: 'BASTION', desc: 'Heavy, slower', main: 0x67665e, dark: 0x403f3a, frame: 0x86867f, joint: 0x24241f, eye: 0xff5a2a, hp: 125, speed: 0.9, bulk: 1.14 },
};

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

export function buildMech(frameKey = 'strider') {
  const F = FRAMES[frameKey] || FRAMES.strider;
  const b = F.bulk;
  const M = mat(F.main), D = mat(F.dark), Fr = mat(F.frame), J = mat(F.joint);
  const E = glow(F.eye), T = glow(0x7fd8ff, 0.85);

  const root = new THREE.Group();
  const body = group(root);
  const hips = group(body, 0, 7.0, 0);

  // Pelvis + skirt armor
  add(hips, taperBox(2.6 * b, 1.3, 1.8, { tx: 1.1, bx: 0.7 }), D);
  add(hips, taperBox(1.1, 1.7, 0.5, { bx: 0.55 }), M, 0, -0.35, 1.0, -0.15);
  add(hips, taperBox(1.6, 1.4, 0.5, { bx: 0.7 }), M, 0, -0.3, -1.0, 0.15);
  for (const s of [-1, 1]) add(hips, taperBox(0.45, 2.1, 1.9, { bz: 0.75 }), M, s * 1.6, -0.6, 0, 0, 0, s * 0.22);

  const legs = [];
  for (const s of [-1, 1]) {
    const hip = group(hips, s * 1.15, -0.3, 0);
    add(hip, taperBox(1.3 * b, 2.9, 1.5 * b, { bx: 0.82, bz: 0.82 }), M, 0, -1.4, 0);
    add(hip, new THREE.BoxGeometry(0.7, 2.6, 0.7), Fr, 0, -1.6, -0.6);
    const knee = group(hip, 0, -2.9, 0);
    add(knee, new THREE.CylinderGeometry(0.55, 0.55, 1.2 * b, 6), J, 0, 0, 0, 0, 0, Math.PI / 2);
    add(knee, taperBox(1.2 * b, 1.5, 0.9, { tz: 0.4, sz: 0.25, tx: 0.7 }), M, 0, 0.1, 0.75);
    add(knee, taperBox(1.55 * b, 3.4, 2.0 * b, { tx: 0.72, tz: 0.68 }), M, 0, -1.7, -0.05);
    add(knee, taperBox(1.1 * b, 2.6, 0.35, { tx: 0.8 }), D, 0, -1.8, 1.0 * b, -0.07);
    add(knee, new THREE.BoxGeometry(0.9, 1.6, 0.4), Fr, 0, -1.4, -1.05 * b);
    const foot = group(knee, 0, -3.2, 0);
    add(foot, taperBox(1.5 * b, 0.8, 3.0 * b, { tx: 0.7, tz: 0.8 }), D, 0, -0.2, 0.45);
    add(foot, taperBox(1.3 * b, 0.6, 1.3, { tx: 0.45, tz: 0.3, sz: -0.2 }), M, 0, -0.3, 2.3 * b);
    add(foot, taperBox(0.5, 0.55, 1.5, { tx: 0.4, tz: 0.3 }), M, 0, -0.25, -1.4 * b, 0.25);
    const fg = add(foot, new THREE.CircleGeometry(0.55, 8), T, 0, -0.62, 0.4, Math.PI / 2);
    legs.push({ hip, knee, foot, glow: fg, side: s });
  }

  const torso = group(body, 0, 7.6, 0);
  add(torso, new THREE.BoxGeometry(1.6, 1.0, 1.3), J, 0, 0.2, 0);
  add(torso, taperBox(3.2 * b, 2.4, 2.2 * b, { bx: 0.68, bz: 0.8 }), M, 0, 1.8, 0);
  add(torso, taperBox(3.8 * b, 1.1, 2.5 * b, { tx: 0.78, tz: 0.68 }), M, 0, 3.4, 0);
  add(torso, taperBox(1.6, 1.6, 0.5, { tx: 0.7, bx: 0.85 }), D, 0, 2.0, 1.15 * b);
  for (const s of [-1, 1]) add(torso, new THREE.BoxGeometry(0.5, 0.9, 0.2), Fr, s * 1.0, 1.5, 1.15 * b);
  add(torso, new THREE.BoxGeometry(0.55, 0.12, 0.05), glow(F.eye), 0, 2.55, 1.42 * b);

  // Head: low dome set forward between the shoulders, single sliding mono-eye.
  const head = group(torso, 0, 3.7, 0.75);
  const dome = add(head, new THREE.SphereGeometry(1, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), M, 0, -0.15, 0);
  dome.scale.set(1.0 * b, 0.9, 1.45 * b);
  add(head, taperBox(1.5, 0.7, 1.1, { tx: 0.8, fx: 0.7 }), D, 0, -0.25, 0.95);
  add(head, new THREE.BoxGeometry(1.15, 0.22, 0.4), J, 0, 0.05, 1.42);
  const eye = add(head, new THREE.SphereGeometry(0.2, 6, 4), E, 0, 0.05, 1.6);
  add(head, taperBox(0.22, 0.45, 2.2, { tz: 0.6 }), M, 0, 0.8, 0.1);

  if (frameKey === 'wraith') {
    for (const s of [-1, 1]) add(head, taperBox(0.18, 1.6, 0.3, { tx: 0.2, tz: 0.2 }), D, s * 0.6, 0.8, 0.6, -0.5, 0, s * 0.45);
    let prev = hips;
    for (let i = 0; i < 4; i++) {
      const seg = group(prev, 0, i ? -0.1 : -0.5, i ? -1.4 : -1.2);
      add(seg, taperBox(0.6 - i * 0.1, 0.6 - i * 0.1, 1.5, { tz: 0.8 }), i % 2 ? D : M, 0, 0, -0.7);
      seg.rotation.x = 0.25;
      prev = seg;
    }
  }
  if (frameKey === 'bastion') {
    add(head, new THREE.BoxGeometry(1.7, 0.5, 0.4), D, 0, 0.35, 1.25);
    add(torso, taperBox(1.4, 1.3, 3.6, { tx: 0.8 }), D, -2.4, 4.9, 0.3);
    add(torso, new THREE.CylinderGeometry(0.3, 0.3, 1.6, 6), J, -2.4, 4.9, 2.4, Math.PI / 2);
  }

  // Backpack thrusters
  add(torso, taperBox(2.5 * b, 2.6, 1.4, { tz: 0.8 }), D, 0, 2.2, -1.55 * b);
  const thrusters = [];
  for (const s of [-1, 1]) {
    add(torso, new THREE.CylinderGeometry(0.42, 0.55, 1.1, 6), J, s * 0.75, 1.0, -2.1 * b, 0.6);
    const tg = add(torso, new THREE.ConeGeometry(0.45, 2.4, 6, 1, true), T, s * 0.75, 0.15, -2.75 * b, 0.6 + Math.PI);
    thrusters.push(tg);
  }

  // Shoulders + arms
  const arms = [];
  let muzzle = null;
  for (const s of [-1, 1]) {
    const sh = group(torso, s * 2.35 * b, 3.0, 0);
    add(sh, taperBox(2.2 * b, 2.5 * b, 2.9 * b, { tx: 1.08, tz: 1.05, bx: 0.78, bz: 0.85 }), M, s * 0.5, 0.4, 0, 0, 0, s * 0.12);
    add(sh, new THREE.BoxGeometry(2.35 * b, 0.32, 3.0 * b), D, s * 0.5, -0.9, 0, 0, 0, s * 0.12);
    add(sh, taperBox(0.5, 1.0, 2.0, { tz: 0.6 }), Fr, s * 1.55 * b, 0.6, 0, 0, 0, s * 0.12);
    add(sh, new THREE.BoxGeometry(0.85, 2.2, 0.85), Fr, s * 0.3, -1.6, 0);
    const elbow = group(sh, s * 0.3, -2.8, 0);
    add(elbow, new THREE.CylinderGeometry(0.45, 0.45, 1.0, 6), J, 0, 0, 0, 0, 0, Math.PI / 2);
    add(elbow, taperBox(1.3 * b, 2.6, 1.45 * b, { tx: 0.85, tz: 0.85 }), M, 0, -1.4, 0);
    add(elbow, new THREE.BoxGeometry(0.3, 2.0, 1.25 * b), D, s * 0.72 * b, -1.3, 0);
    add(elbow, new THREE.BoxGeometry(0.8, 0.8, 0.9), J, 0, -3.0, 0);
    if (s === 1) {
      // Rifle along forearm (-y) so it points forward when the elbow is raised.
      const gun = group(elbow, 0, -3.0, 0.75);
      add(gun, new THREE.BoxGeometry(0.55, 4.2, 0.8), J, 0, -1.2, 0);
      add(gun, new THREE.BoxGeometry(0.4, 1.0, 0.9), D, 0, 0.2, -0.6);
      add(gun, new THREE.CylinderGeometry(0.16, 0.16, 2.0, 6), Fr, 0, -4.2, 0.1);
      add(gun, new THREE.BoxGeometry(0.4, 0.9, 0.7), D, 0, -0.8, 0.7);
      muzzle = group(gun, 0, -5.3, 0.1);
    }
    arms.push({ sh, elbow, side: s });
  }

  root.traverse(o => { if (o.isMesh) o.castShadow = false; });
  const rig = { root, body, hips, torso, head, eye, legs, arms, thrusters, muzzle, frame: frameKey, cur: {} };
  root.userData.rig = rig;
  return root;
}

function ease(obj, key, target, a) { obj[key] += (target - obj[key]) * a; }

// s: { fwd, side, up, speed, air, phase, boost, dt, aimPitch }
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
  // Arms: right arm aims rifle, left arm counterbalances.
  const [la, ra] = rig.arms;
  ease(ra.sh.rotation, 'x', -0.35 - (s.aimPitch || 0) * 0.6, a);
  ease(ra.elbow.rotation, 'x', -1.35, a);
  ease(la.sh.rotation, 'x', s.air ? 0.4 : -0.1 + sw * k * 0.3, a);
  ease(la.elbow.rotation, 'x', s.air ? -0.3 : -0.7, a);
  ease(rig.head.rotation, 'x', -(s.aimPitch || 0) * 0.4, a);
  const t = 0.4 + (s.boost ? 1.4 : 0) + (s.air ? 0.4 : 0) + k * 0.4;
  for (const th of rig.thrusters) th.scale.set(1, t * (0.85 + Math.random() * 0.3), 1);
  for (const L of rig.legs) L.glow.scale.setScalar(s.air ? 0.4 : 1 + Math.random() * 0.25);
}
