// Training arena: deterministic (seeded) so every PvP client builds the same map.
import * as THREE from 'three';

export const ARENA_HALF = 700;
export const CEILING = 460;
export const SPACE_R = 1300;

// Maps without a floor (space) skip the y=0 ground plane.
let FLOOR = true;
export function setFloor(v) { FLOOR = v; }

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
  lightStrip.color.multiplyScalar(2.5); warnStrip.color.multiplyScalar(2.5);
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
    crateSpots: [[0, null, 150], [0, null, -150], [150, null, 0], [-150, null, 0], [380, null, 380], [-380, null, -380], [380, null, -380], [-380, null, 380]],
    dummyPads: [[-90, -330], [0, -360], [90, -330], [-180, 330], [180, 330], [330, 140], [-330, -140]],
  };
}

const _box = new THREE.Box3(), _v = new THREE.Vector3();

// Highest walkable surface under (x,z) not above feetY+step.
export function groundAt(colliders, x, z, feetY, r = 2, step = 4) {
  let g = FLOOR ? 0 : -1e9;
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
  if (FLOOR && ray.direction.y < -1e-4) {
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
  if (FLOOR && p.y <= 0) return true;
  for (const c of colliders) if (c.containsPoint(p)) return true;
  return false;
}

function planetTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const bands = ['#2c4a78', '#3d6a9e', '#6f9ac2', '#c9d7e3', '#4f7fae', '#24406b', '#86aacb', '#33598a'];
  for (let y = 0; y < 256; y++) {
    g.fillStyle = bands[Math.floor((y / 256) * bands.length + Math.sin(y * 0.15) * 0.6 + bands.length) % bands.length];
    g.fillRect(0, y, 512, 1);
  }
  for (let i = 0; i < 260; i++) {
    g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.12) + ')';
    g.beginPath(); g.ellipse(Math.random() * 512, Math.random() * 256, 10 + Math.random() * 60, 2 + Math.random() * 5, 0, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Zero-gravity space battlefield: asteroids, an orbital station, stars and a planet.
export function buildSpace(root) {
  const colliders = [];
  const R = rng(4242);
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, metalness: 0.35, ...extra });
  const hull = std(0x8a929c, { metalness: 0.6, roughness: 0.45 }), hullDark = std(0x3a4049, { metalness: 0.6, roughness: 0.5 });
  const rock = std(0x6b6258, { roughness: 0.95, metalness: 0.05 }), rockDark = std(0x4a443e, { roughness: 0.95, metalness: 0.05 });
  const strip = new THREE.MeshBasicMaterial({ color: 0x7ff3ff }), warn = new THREE.MeshBasicMaterial({ color: 0xffa640 });
  strip.color.multiplyScalar(2.5); warn.color.multiplyScalar(2.5);
  const panel = new THREE.MeshStandardMaterial({ color: 0x1d3b7a, emissive: 0x0a1a44, metalness: 0.8, roughness: 0.25 });

  // Deep-space backdrop with nebula tint
  const skyGeo = new THREE.SphereGeometry(4000, 32, 16);
  const cols = [], p = skyGeo.attributes.position;
  const a = new THREE.Color(0x020308), b = new THREE.Color(0x1a0f33), c2 = new THREE.Color(0x0b2240);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / 4000, y = p.getY(i) / 4000;
    const k = Math.max(0, Math.sin(x * 3 + y * 2) * 0.5 + 0.5) * Math.max(0, 1 - Math.abs(y + 0.2) * 1.6);
    const col = a.clone().lerp(x > 0 ? b : c2, k * 0.9);
    cols.push(col.r, col.g, col.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  root.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));

  // Stars
  const n = 3500, sp = new Float32Array(n * 3), sc = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = R() * 2 - 1, th = R() * Math.PI * 2, s = Math.sqrt(1 - u * u), r = 3000 + R() * 800;
    sp.set([Math.cos(th) * s * r, u * r, Math.sin(th) * s * r], i * 3);
    const tint = R(), br = 0.5 + R() * 0.5;
    sc.set(tint < 0.2 ? [br * 0.7, br * 0.8, br] : tint < 0.3 ? [br, br * 0.85, br * 0.6] : [br, br, br], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  root.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false })));

  // Planet + atmosphere + sun glare
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 32), new THREE.MeshStandardMaterial({ map: planetTexture(), roughness: 0.9, metalness: 0, fog: false }));
  planet.position.set(-1500, -1300, -2600); planet.rotation.z = 0.35;
  root.add(planet);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1160, 48, 32), new THREE.MeshBasicMaterial({ color: 0x5fb0ff, transparent: true, opacity: 0.16, side: THREE.BackSide, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
  atmo.position.copy(planet.position);
  root.add(atmo);
  const sunDir = new THREE.Vector3(1, 0.45, 0.35).normalize();
  const sunGlow = new THREE.Mesh(new THREE.CircleGeometry(160, 32), new THREE.MeshBasicMaterial({ color: 0xfff0c8, fog: false, transparent: true, opacity: 0.95 }));
  sunGlow.position.copy(sunDir).multiplyScalar(3600); sunGlow.lookAt(0, 0, 0);
  root.add(sunGlow);
  root.add(new THREE.HemisphereLight(0x8fb0ff, 0x221a14, 0.7));
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
  sun.position.copy(sunDir).multiplyScalar(500);
  root.add(sun);

  function block(x, y, z, w, h, d, material, collide = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    root.add(m);
    if (collide) colliders.push(new THREE.Box3(new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2), new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2)));
    return m;
  }

  // Orbital station at the center: hub, octagonal ring, spokes, solar wings
  block(0, 0, 0, 70, 170, 70, hull);
  block(0, 95, 0, 40, 20, 40, hullDark);
  block(0, -95, 0, 40, 20, 40, hullDark);
  for (const y of [-50, 0, 50]) block(0, y, 0, 71, 3, 71, strip, false);
  const segs = 16, ringR = 210;
  for (let i = 0; i < segs; i++) {
    const ang = (i / segs) * Math.PI * 2, x = Math.cos(ang) * ringR, z = Math.sin(ang) * ringR;
    const len = 2 * ringR * Math.tan(Math.PI / segs) + 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 22, 26), i % 2 ? hull : hullDark);
    m.position.set(x, 0, z); m.rotation.y = -ang + Math.PI / 2;
    root.add(m);
    const s = new THREE.Mesh(new THREE.BoxGeometry(len, 2, 27), strip); s.position.copy(m.position); s.rotation.copy(m.rotation); root.add(s);
    const rot = m.rotation.y, hx = Math.abs(Math.cos(rot)) * len / 2 + Math.abs(Math.sin(rot)) * 13, hz = Math.abs(Math.sin(rot)) * len / 2 + Math.abs(Math.cos(rot)) * 13;
    colliders.push(new THREE.Box3(new THREE.Vector3(x - hx * 0.8, -11, z - hz * 0.8), new THREE.Vector3(x + hx * 0.8, 11, z + hz * 0.8)));
  }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const L = ringR - 35;
    block(dx * (35 + L / 2), 0, dz * (35 + L / 2), dx ? L : 10, 10, dz ? L : 10, hullDark);
  }
  for (const s of [-1, 1]) {
    block(0, s * 130, 0, 14, 60, 14, hullDark);
    for (const k of [-1, 1]) {
      block(k * 120, s * 150, 0, 200, 3, 60, panel);
      block(k * 120, s * 150, 0, 200, 4, 2, warn, false);
    }
  }

  const crateSpots = [[0, 0, 330], [0, 0, -330], [330, 60, 0], [-330, -60, 0], [520, 240, 380], [-520, -240, -380], [380, -260, -520], [-380, 260, 520]];
  const spawns = [[700, 120, 0], [-700, -120, 0], [0, 200, 700], [0, -200, -700], [500, 420, 500], [-500, -420, -500], [520, -380, -480], [-520, 380, 480]]
    .map(([x, y, z]) => ({ x, y, z, yaw: Math.atan2(x, z) }));

  // Seeded asteroid field (each asteroid's collider is a box inside its rock)
  const avoid = [...crateSpots, ...spawns.map(s => [s.x, s.y, s.z])];
  let placed = 0, guard = 0;
  while (placed < 48 && guard++ < 800) {
    const u = R() * 2 - 1, th = R() * Math.PI * 2, s = Math.sqrt(1 - u * u), dist = 300 + R() * 900;
    const x = Math.cos(th) * s * dist, y = u * dist * 0.7, z = Math.sin(th) * s * dist;
    const r = 14 + R() * 46;
    if (avoid.some(([ax, ay, az]) => Math.hypot(ax - x, ay - y, az - z) < r + 70)) continue;
    if (Math.hypot(x, z) < ringR + 60 + r && Math.abs(y) < 60 + r) continue;
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const pa = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const k = 0.8 + Math.sin(v.x * 0.21 + v.y * 0.13) * 0.12 + Math.cos(v.z * 0.17) * 0.1; pa.setXYZ(i, v.x * k, v.y * k * 0.85, v.z * k); }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, placed % 3 ? rock : rockDark);
    m.position.set(x, y, z); m.rotation.set(R() * 3, R() * 3, R() * 3);
    root.add(m);
    const h = r * 0.62;
    colliders.push(new THREE.Box3(new THREE.Vector3(x - h, y - h, z - h), new THREE.Vector3(x + h, y + h, z + h)));
    placed++;
  }
  // Drifting debris (visual only)
  for (let i = 0; i < 70; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2 + R() * 8, 1 + R() * 4, 2 + R() * 10), R() < 0.5 ? hull : hullDark);
    m.position.set((R() * 2 - 1) * 1100, (R() * 2 - 1) * 700, (R() * 2 - 1) * 1100);
    m.rotation.set(R() * 6, R() * 6, R() * 6);
    root.add(m);
  }
  return { colliders, spawns, crateSpots, dummyPads: [], radius: SPACE_R };
}
