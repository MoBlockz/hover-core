// Training arena: deterministic (seeded) so every PvP client builds the same map.
import * as THREE from 'three';

export const ARENA_HALF = 700;
export const CEILING = 460;

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#2b3a44'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 14, 2 + Math.random() * 14);
  }
  g.strokeStyle = '#4f7d86'; g.lineWidth = 4; g.strokeRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(79,125,134,0.45)'; g.lineWidth = 2;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 512); g.moveTo(0, i * 128); g.lineTo(512, i * 128); g.stroke(); }
  g.fillStyle = 'rgba(255,190,80,0.5)'; g.fillRect(0, 0, 40, 6); g.fillRect(0, 0, 6, 40);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(14, 14);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#e0a52a';
  for (let i = -64; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i - 48, 64); g.lineTo(i - 64, 64); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildArena(scene) {
  const colliders = [];
  const R = rng(1337);
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.2, ...extra });
  const concrete = std(0x5b6670), concreteDark = std(0x3e4851), steel = std(0x707c86, { metalness: 0.5, roughness: 0.5 });
  const lightStrip = new THREE.MeshBasicMaterial({ color: 0x7ff3ff });
  const warnStrip = new THREE.MeshBasicMaterial({ color: 0xffa640 });
  const hazard = new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.8 });

  // Sky dome with vertex-colored gradient
  const skyGeo = new THREE.SphereGeometry(3000, 24, 12);
  const cols = [], top = new THREE.Color(0x0c1a2e), mid = new THREE.Color(0x46657e), hor = new THREE.Color(0xd9a77a);
  const p = skyGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const h = p.getY(i) / 3000;
    const c = h > 0.08 ? mid.clone().lerp(top, Math.min(1, (h - 0.08) / 0.6)) : hor.clone().lerp(mid, Math.max(0, (h + 0.05) / 0.13));
    cols.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));

  scene.fog = new THREE.Fog(0x52687a, 350, 2200);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x3a3328, 1.6));
  const sun = new THREE.DirectionalLight(0xffd9a8, 2.6);
  sun.position.set(-400, 600, 300);
  scene.add(sun);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.9, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), std(0x4d4a40));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.5;
  scene.add(outer);

  function block(x, y0, z, w, h, d, material = concrete, collide = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y0 + h / 2, z);
    scene.add(m);
    if (collide) colliders.push(new THREE.Box3(new THREE.Vector3(x - w / 2, y0, z - d / 2), new THREE.Vector3(x + w / 2, y0 + h, z + d / 2)));
    return m;
  }

  // Perimeter walls with light strips
  const H = 150, Wt = 24;
  for (const s of [-1, 1]) {
    block(0, 0, s * (ARENA_HALF + Wt / 2), ARENA_HALF * 2 + Wt * 2, H, Wt, concreteDark);
    block(s * (ARENA_HALF + Wt / 2), 0, 0, Wt, H, ARENA_HALF * 2, concreteDark);
    block(0, 20, s * (ARENA_HALF - 0.6), ARENA_HALF * 2, 1.2, 1, lightStrip, false);
    block(s * (ARENA_HALF - 0.6), 20, 0, 1, 1.2, ARENA_HALF * 2, lightStrip, false);
    block(0, 0, s * (ARENA_HALF - 1), ARENA_HALF * 2, 6, 1.5, hazard, false);
    block(s * (ARENA_HALF - 1), 0, 0, 1.5, 6, ARENA_HALF * 2, hazard, false);
  }
  // Wall-top floodlight pylons
  for (let i = -3; i <= 3; i++) for (const s of [-1, 1]) {
    block(i * 200, H, s * (ARENA_HALF + 6), 6, 30, 6, steel, false);
    block(i * 200, H + 30, s * (ARENA_HALF + 6), 16, 4, 4, warnStrip, false);
    block(s * (ARENA_HALF + 6), H, i * 200, 6, 30, 6, steel, false);
    block(s * (ARENA_HALF + 6), H + 30, i * 200, 4, 4, 16, warnStrip, false);
  }

  // Four tall towers + bridges: things to fly around/under
  for (const x of [-260, 260]) for (const z of [-260, 260]) {
    block(x, 0, z, 40, 230, 40, concrete);
    block(x, 230, z, 70, 6, 70, steel);
    block(x, 236, z, 6, 12, 6, warnStrip, false);
    for (const y of [40, 100, 160]) block(x, y, z, 41, 2, 41, lightStrip, false);
  }
  for (const z of [-260, 260]) { block(0, 130, z, 480, 8, 18, steel); block(0, 128, z, 480, 2, 19, lightStrip, false); }
  block(-260, 70, 0, 18, 8, 480, steel);

  // Central ring of pillars
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    block(Math.cos(a) * 95, 0, Math.sin(a) * 95, 16, 30 + (i % 3) * 18, 16, i % 2 ? concrete : concreteDark);
  }
  block(0, 0, 0, 40, 4, 40, hazard);

  // Gates (fly-through arches)
  for (const z of [-470, 470]) {
    block(-45, 0, z, 14, 80, 14, steel); block(45, 0, z, 14, 80, 14, steel);
    block(0, 80, z, 104, 12, 14, concreteDark); block(0, 78, z, 90, 2, 15, warnStrip, false);
  }
  for (const x of [-470, 470]) {
    block(x, 0, -45, 14, 60, 14, steel); block(x, 0, 45, 14, 60, 14, steel);
    block(x, 60, 0, 14, 10, 104, concreteDark);
  }

  // Seeded scatter of cover blocks
  const spawns = [[0, 520], [0, -520], [520, 0], [-520, 0], [400, 420], [-400, -420], [420, -400], [-420, 400]];
  let placed = 0, guard = 0;
  while (placed < 34 && guard++ < 500) {
    const x = (R() * 2 - 1) * 620, z = (R() * 2 - 1) * 620;
    if (Math.hypot(x, z) < 140) continue;
    if (spawns.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 70)) continue;
    if (colliders.some(c => x > c.min.x - 40 && x < c.max.x + 40 && z > c.min.z - 40 && z < c.max.z + 40)) continue;
    const w = 18 + R() * 40, d = 10 + R() * 30, h = 8 + R() * 32;
    const m = block(x, 0, z, w, h, d, R() < 0.3 ? concreteDark : concrete);
    if (R() < 0.5) block(x, h, z, w + 1, 1, d + 1, R() < 0.5 ? lightStrip : warnStrip, false);
    m.rotation.y = 0; // keep axis aligned for collision
    placed++;
  }

  // Distant low-poly mountains
  const rock = std(0x5e5a4c);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 + R() * 0.1;
    const r = 1400 + R() * 700, h = 250 + R() * 450;
    const m = new THREE.Mesh(new THREE.ConeGeometry(220 + R() * 260, h, 5 + Math.floor(R() * 3)), rock);
    m.position.set(Math.cos(a) * r, h / 2 - 5, Math.sin(a) * r);
    m.rotation.y = R() * 6;
    scene.add(m);
  }

  return {
    colliders,
    spawns: spawns.map(([x, z]) => ({ x, z, yaw: Math.atan2(x, z) })), // yaw facing the center
    dummyPads: [[-90, -330], [0, -360], [90, -330], [-180, 330], [180, 330], [330, 140], [-330, -140]],
  };
}

const _box = new THREE.Box3(), _v = new THREE.Vector3();

// Highest walkable surface under (x,z) not above feetY+step.
export function groundAt(colliders, x, z, feetY, r = 2, step = 4) {
  let g = 0;
  for (const c of colliders) {
    if (x > c.min.x - r && x < c.max.x + r && z > c.min.z - r && z < c.max.z + r && c.max.y <= feetY + step && c.max.y > g) g = c.max.y;
  }
  return g;
}

// Push a vertical box (feet-based) out of colliders. Returns true if standing on a top face.
export function resolveCollisions(colliders, pos, eye, R, H, vel) {
  let onTop = false;
  for (const c of colliders) {
    const feet = pos.y - eye;
    if (pos.x + R <= c.min.x || pos.x - R >= c.max.x || pos.z + R <= c.min.z || pos.z - R >= c.max.z || feet + H <= c.min.y || feet >= c.max.y) continue;
    const px1 = c.max.x - (pos.x - R), px2 = (pos.x + R) - c.min.x;
    const pz1 = c.max.z - (pos.z - R), pz2 = (pos.z + R) - c.min.z;
    const py1 = c.max.y - feet, py2 = (feet + H) - c.min.y;
    const m = Math.min(px1, px2, pz1, pz2, py1 * 0.6, py2);
    if (m === px1) { pos.x += px1; if (vel.x < 0) vel.x *= -0.25; }
    else if (m === px2) { pos.x -= px2; if (vel.x > 0) vel.x *= -0.25; }
    else if (m === pz1) { pos.z += pz1; if (vel.z < 0) vel.z *= -0.25; }
    else if (m === pz2) { pos.z -= pz2; if (vel.z > 0) vel.z *= -0.25; }
    else if (m === py1 * 0.6) { pos.y += py1; if (vel.y < 0) vel.y = 0; onTop = true; }
    else { pos.y -= py2; if (vel.y > 0) vel.y = 0; }
  }
  return onTop;
}

// Distance along ray to first arena surface (or Infinity).
export function rayArena(colliders, ray, maxDist) {
  let best = maxDist;
  if (ray.direction.y < -1e-4) {
    const t = -ray.origin.y / ray.direction.y;
    if (t > 0 && t < best) best = t;
  }
  for (const c of colliders) {
    if (ray.intersectBox(c, _v)) {
      const d = _v.distanceTo(ray.origin);
      if (d < best) best = d;
    }
  }
  return best;
}

export function pointInArena(colliders, p) {
  if (p.y <= 0) return true;
  for (const c of colliders) if (c.containsPoint(p)) return true;
  return false;
}
