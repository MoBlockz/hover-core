import * as THREE from 'three';
import { buildArena, groundAt, resolveCollisions, rayArena, pointInArena, ARENA_HALF, CEILING } from './arena.js';
import { buildMech, animateMech, FRAMES, glow } from './mech.js';
import { Particles, Tracers, Flashes, SpeedLines } from './fx.js';
import { Sfx } from './audio.js';
import { Net, makeCode } from './net.js';
import { Cockpit } from './cockpit.js';

const $ = id => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);

// ---------- Tuning ----------
const EYE = 10, RAD = 3.5, HGT = 13, HOVER = 1.1, BASE_FOV = 72;
const T = {
  groundAccel: 75, groundMax: 50,
  sprintMax: 128, stridePeriod: 0.36, strideImpulse: 27, strideAngle: 0.42,
  airAccel: 80, airMax: 85, airBoostAccel: 190, airBoostMax: 180,
  qbImpulse: 85, jumpVel: 40,
};

// ---------- Settings ----------
const settings = Object.assign({ sens: 1, invert: false, autoLevel: true, spar: true, frame: 'strider', name: '', muted: false },
  JSON.parse(localStorage.getItem('hovercore') || '{}'));
const saveSettings = () => localStorage.setItem('hovercore', JSON.stringify(settings));

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.05, 6000);
camera.userData.baseFov = BASE_FOV;
scene.add(camera);
const arena = buildArena(scene);
const cockpit = new Cockpit(camera);
const particles = new Particles(scene);
const tracers = new Tracers(scene);
const flashes = new Flashes(scene);
const speedLines = new SpeedLines(scene);
const sfx = new Sfx();
sfx.setMuted(settings.muted);

const hud = $('hudCanvas'), hg = hud.getContext('2d');
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  cockpit.layout();
  hud.width = innerWidth; hud.height = innerHeight;
}
addEventListener('resize', resize);
resize();

// Blob shadows so altitude is readable
const shadowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function makeShadow(size = 9) {
  const m = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  m.scale.setScalar(size); m.renderOrder = 1; m.userData.size = size;
  scene.add(m);
  return m;
}
function placeShadow(sh, x, feetY, z, visible = true) {
  const g = groundAt(arena.colliders, x, z, feetY + 0.5, 0);
  const h = feetY - g;
  sh.visible = visible && h < 300;
  sh.position.set(x, g + 0.08, z);
  sh.scale.setScalar(sh.userData.size * (1 + h / 60));
  sh.material.opacity = clamp(1 - h / 250, 0.15, 1);
}

// ---------- Player ----------
const P = {
  pos: V(0, EYE + HOVER, 520), vel: V(), mode: 'ground', yaw: 0, pitch: 0,
  q: new THREE.Quaternion(), viewQ: new THREE.Quaternion(), blend: 0, lookIdle: 0,
  energy: 100, overheat: false, hp: 100, maxHp: 100, alive: true, deadT: 0,
  strideT: 0, strideSide: 1, phase: 0, sprinting: false, boosting: false, qbCd: 0,
  fireCd: 0, ammo: 60, reloadT: 0, msl: 4, mslT: 0, lock: null, lockT: 0, locked: false,
  shake: 0, roll: 0, rollKick: 0, fovKick: 0, kills: 0, deaths: 0, lastShot: 0,
  shadow: makeShadow(10), sway: V(), prevVel: V(), invuln: 0,
};
const AMMO_MAX = 60, MSL_MAX = 4;

// ---------- Input ----------
const keys = {};
const input = { mx: 0, my: 0, fire: false, rise: false, dive: false, sprintHold: false, sprintToggle: false, autoSprint: false, qb: false, msl: false };
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, edgeT: 0 };
let lookPtr = null;
const look = { dx: 0, dy: 0 };
let state = 'menu'; // menu | playing | paused
let mode = 'training'; // training | pvp

function addLook(dxPx, dyPx, scale) {
  look.dx += dxPx * scale * settings.sens;
  look.dy += dyPx * scale * settings.sens * (settings.invert ? -1 : 1);
}

addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (state !== 'playing') return;
  if (e.code === 'KeyQ') input.qb = true;
  if (e.code === 'KeyE') input.msl = true;
  if (e.code === 'KeyM') { settings.muted = !settings.muted; sfx.setMuted(settings.muted); saveSettings(); }
  if (e.code === 'KeyR' && mode === 'training') respawn();
  if (e.code === 'Tab') { e.preventDefault(); $('scores').classList.add('big'); }
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Tab') $('scores').classList.remove('big'); });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; input.fire = false; });

const canvas = renderer.domElement;
function lockPointer() { try { const p = canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch {} }
canvas.addEventListener('mousedown', e => {
  if (isTouch || state !== 'playing') return;
  if (!document.pointerLockElement) { lockPointer(); return; }
  if (e.button === 0) input.fire = true;
  if (e.button === 2) input.msl = true;
});
addEventListener('mouseup', e => { if (e.button === 0) input.fire = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => { if (document.pointerLockElement === canvas) addLook(e.movementX, e.movementY, 0.0022); });
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && state === 'playing' && !isTouch) pause();
});

// Touch: left side floating stick, right side drag-look, buttons.
const touchLayer = $('touch');
touchLayer.addEventListener('pointerdown', e => {
  if (state !== 'playing' || e.target !== touchLayer) return;
  e.preventDefault();
  if (e.clientX < innerWidth * 0.42 && stick.id === null) {
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
    $('stickBase').style.cssText = `display:block;left:${e.clientX}px;top:${e.clientY}px`;
    $('stickKnob').style.transform = '';
  } else if (lookPtr === null) {
    lookPtr = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  try { touchLayer.setPointerCapture(e.pointerId); } catch {}
});
touchLayer.addEventListener('pointermove', e => {
  if (e.pointerId === stick.id) {
    const R = 62;
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
    const L = Math.hypot(dx, dy);
    if (L > R * 1.6) { // drag the base along so the stick never "runs out"
      stick.ox = e.clientX - dx / L * R * 1.6; stick.oy = e.clientY - dy / L * R * 1.6;
      $('stickBase').style.left = stick.ox + 'px'; $('stickBase').style.top = stick.oy + 'px';
      dx = e.clientX - stick.ox; dy = e.clientY - stick.oy;
    }
    const m = Math.min(1, Math.hypot(dx, dy) / R), a = Math.atan2(dy, dx);
    stick.x = Math.cos(a) * m; stick.y = Math.sin(a) * m;
    $('stickKnob').style.transform = `translate(${stick.x * R}px,${stick.y * R}px)`;
  } else if (lookPtr && e.pointerId === lookPtr.id) {
    addLook(e.clientX - lookPtr.x, e.clientY - lookPtr.y, 0.0048);
    lookPtr.x = e.clientX; lookPtr.y = e.clientY;
  }
});
const endTouch = e => {
  if (e.pointerId === stick.id) { stick.id = null; stick.x = stick.y = 0; stick.edgeT = 0; $('stickBase').style.display = 'none'; }
  if (lookPtr && e.pointerId === lookPtr.id) lookPtr = null;
};
touchLayer.addEventListener('pointerup', endTouch);
touchLayer.addEventListener('pointercancel', endTouch);

function bindButton(id, down, up, dragLook = false) {
  const b = $(id);
  let last = null;
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    try { b.setPointerCapture(e.pointerId); } catch {}
    b.classList.add('on');
    last = { id: e.pointerId, x: e.clientX, y: e.clientY };
    down();
  });
  if (dragLook) b.addEventListener('pointermove', e => {
    if (!last || e.pointerId !== last.id) return;
    addLook(e.clientX - last.x, e.clientY - last.y, 0.0048);
    last.x = e.clientX; last.y = e.clientY;
  });
  const release = e => { if (last && e.pointerId === last.id) { last = null; b.classList.remove('on'); up?.(); } };
  b.addEventListener('pointerup', release);
  b.addEventListener('pointercancel', release);
}
bindButton('bFire', () => input.fire = true, () => input.fire = false, true);
bindButton('bMsl', () => input.msl = true);
bindButton('bQB', () => input.qb = true);
bindButton('bRise', () => input.rise = true, () => input.rise = false, true);
bindButton('bDive', () => input.dive = true, () => input.dive = false);
bindButton('bBoost', () => { input.sprintToggle = !input.sprintToggle; }, null);
$('pauseBtn').addEventListener('click', () => pause());

function readInput(dt) {
  let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + stick.x;
  let my = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - stick.y;
  const L = Math.hypot(mx, my);
  if (L > 1) { mx /= L; my /= L; }
  input.mx = mx; input.my = my;
  // Push the touch stick to the rim to auto-sprint
  const sm = Math.hypot(stick.x, stick.y);
  stick.edgeT = sm > 0.93 ? stick.edgeT + dt : 0;
  input.autoSprint = stick.edgeT > 0.22;
  if (L < 0.1 && input.sprintToggle && P.mode === 'ground' && P.vel.length() < 8) input.sprintToggle = false;
  $('bBoost').classList.toggle('on', input.sprintToggle || input.autoSprint);
  input.sprintHold = keys.ShiftLeft || keys.ShiftRight || input.sprintToggle || input.autoSprint;
  input.riseHeld = input.rise || keys.Space;
  input.diveHeld = input.dive || keys.ControlLeft || keys.KeyC;
}

// ---------- Orientation ----------
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const AX = V(1, 0, 0), AY = V(0, 1, 0), AZ = V(0, 0, 1);
function groundQuat(out, roll = 0) { _e.set(P.pitch, P.yaw, roll, 'YXZ'); return out.setFromEuler(_e); }
function forwardOf(q) { return V(0, 0, -1).applyQuaternion(q); }
function toAir() {
  if (P.mode === 'air') return;
  groundQuat(P.q);
  P.mode = 'air';
}
function toGround(impact = 0) {
  if (P.mode === 'ground') return;
  const f = forwardOf(P.q), u = V(0, 1, 0).applyQuaternion(P.q);
  if (Math.abs(f.y) > 0.97) P.yaw = Math.atan2(-u.x * Math.sign(-f.y), -u.z * Math.sign(-f.y));
  else P.yaw = Math.atan2(-f.x, -f.z);
  P.pitch = clamp(Math.asin(clamp(f.y, -1, 1)), -1.2, 1.2);
  P.mode = 'ground'; P.blend = 0.45;
  if (impact > 0.15) { P.shake = Math.max(P.shake, impact * 0.8); sfx.land(impact); dustRing(P.pos.x, P.pos.y - EYE, P.pos.z, 26 * impact + 8); }
}
function facingYaw() {
  if (P.mode === 'ground') return P.yaw;
  const f = forwardOf(P.q);
  return Math.abs(f.y) > 0.97 ? P.yaw : Math.atan2(-f.x, -f.z);
}

function applyLook(dt) {
  const dx = look.dx, dy = look.dy; look.dx = look.dy = 0;
  if (!P.alive) return;
  if (P.mode === 'ground') {
    P.yaw -= dx; P.pitch = clamp(P.pitch - dy, -1.45, 1.45);
  } else {
    // Free 6-DOF look while flying: rotate about the cockpit's own axes, no pitch limit.
    P.q.multiply(_q.setFromAxisAngle(AY, -dx)).multiply(_q2.setFromAxisAngle(AX, -dy)).normalize();
    P.lookIdle = Math.abs(dy) > 0.0005 ? 0 : P.lookIdle + dt;
    if (settings.autoLevel && P.lookIdle > 0.6) {
      const f = forwardOf(P.q), r = V(1, 0, 0).applyQuaternion(P.q), u = V(0, 1, 0).applyQuaternion(P.q);
      const w = clamp(1 - f.y * f.y * 1.3, 0, 1);
      const phi = Math.atan2(r.y, u.y);
      P.q.multiply(_q.setFromAxisAngle(AZ, -phi * Math.min(1, dt * 2.2) * w)).normalize();
    }
  }
}

// ---------- Effects helpers ----------
function dustRing(x, y, z, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 25 + Math.random() * 25;
    particles.spawn(x, y + 0.5, z, Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s, 0.7, 0x8fa4ae, 2.5, 2);
  }
}
function explode(p, size = 1, sound = true) {
  flashes.add(p, 7 * size, 0xffaa55, 0.45);
  flashes.add(p, 4 * size, 0xffffff, 0.18);
  particles.burst(p, Math.round(60 * size), 45 * size, 1.1, 0xff9a3a, 12);
  particles.burst(p, Math.round(30 * size), 25 * size, 1.6, 0x6b7680, -2);
  if (sound) { const d = p.distanceTo(P.pos); sfx.boom(clamp(1 - d / 900, 0.05, 0.8)); }
  const d = p.distanceTo(P.pos);
  if (d < 150) P.shake = Math.max(P.shake, (1 - d / 150) * 0.8 * size);
}
function showMsg(text, dur = 2, cls = '') {
  const m = $('msg');
  m.textContent = text; m.className = 'show ' + cls;
  clearTimeout(showMsg.t); showMsg.t = setTimeout(() => (m.className = ''), dur * 1000);
}
function feed(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  $('feed').prepend(d);
  setTimeout(() => d.remove(), 6000);
  while ($('feed').children.length > 5) $('feed').lastChild.remove();
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Targets (training) ----------
const targets = []; // {kind, obj, hp, maxHp, alive, respawnT, spheres, center(), name, shadow, ...}
const MECH_SPHERES = [{ y: 9, r: 3.8 }, { y: 4.2, r: 3.0 }];
function mechTarget(kind, frame, name, hp) {
  const obj = buildMech(frame);
  scene.add(obj);
  return { kind, obj, frame, hp, maxHp: hp, alive: true, respawnT: 0, spheres: MECH_SPHERES, name, shadow: makeShadow(9),
    center: V(), vel: V(), phase: Math.random() * 6, air: false };
}

arena.dummyPads.forEach(([x, z], i) => {
  const t = mechTarget('dummy', 'strider', 'TARGET', 60);
  t.home = V(x, 0, z); t.slide = i % 2 ? 40 : 0; t.slideSpeed = 0.5 + Math.random() * 0.4;
  t.obj.position.copy(t.home); t.obj.rotation.y = Math.atan2(-x, -z);
  targets.push(t);
});

const droneGeo = new THREE.OctahedronGeometry(2.2, 0), droneRing = new THREE.TorusGeometry(3.2, 0.3, 4, 8);
const droneMat = new THREE.MeshStandardMaterial({ color: 0x9aa6b0, flatShading: true, metalness: 0.6, roughness: 0.4 });
for (let i = 0; i < 5; i++) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(droneGeo, droneMat));
  const ring = new THREE.Mesh(droneRing, glow(0xff5050)); ring.rotation.x = Math.PI / 2; g.add(ring);
  scene.add(g);
  targets.push({ kind: 'drone', obj: g, hp: 20, maxHp: 20, alive: true, respawnT: 0, spheres: [{ y: 0, r: 3.4 }], name: 'DRONE', center: V(), vel: V(),
    orbit: { cx: (i - 2) * 160, cz: (i % 2 ? 1 : -1) * 120, r: 90 + i * 25, h: 60 + i * 30, s: (i % 2 ? 1 : -1) * (0.25 + i * 0.05), a: i } });
}

// Sparring partner AI
const ai = mechTarget('ai', 'wraith', 'SPARRING AI', 100);
Object.assign(ai, { pos: V(0, EYE + HOVER, -520), mode: 'ground', yaw: 0, strideT: 0, side: 1, fireT: 3, burst: 0, burstT: 0,
  orbitDir: 1, wantDist: 180, thinkT: 0, airT: 0, altTarget: 80, qbCd: 0, stuckT: 0 });
targets.push(ai);

function setTargetVisible(t, v) { t.obj.visible = v; if (t.shadow) t.shadow.visible = v; }

function updateTargets(dt, time) {
  const training = mode === 'training';
  for (const t of targets) {
    const enabled = training && (t.kind !== 'ai' || settings.spar);
    if (!enabled) { setTargetVisible(t, false); continue; }
    if (!t.alive) {
      setTargetVisible(t, false);
      if ((t.respawnT -= dt) <= 0) respawnTarget(t);
      continue;
    }
    setTargetVisible(t, true);
    if (t.kind === 'dummy') {
      const off = t.slide ? Math.sin(time * t.slideSpeed) * t.slide : 0;
      const yaw = t.obj.rotation.y;
      const nx = t.home.x + Math.cos(yaw) * off, nz = t.home.z - Math.sin(yaw) * off;
      t.vel.set((nx - t.obj.position.x) / dt, 0, (nz - t.obj.position.z) / dt);
      t.obj.position.set(nx, 0, nz);
      t.phase += dt * Math.abs(t.vel.length()) / 8;
      animateMech(t.obj.userData.rig, { fwd: 0, side: t.slide ? t.vel.length() : 0, up: 0, speed: t.vel.length() * 1.5, air: false, phase: t.phase, boost: false, dt, aimPitch: 0 });
      t.center.set(t.obj.position.x, 8, t.obj.position.z);
      placeShadow(t.shadow, nx, 0, nz);
    } else if (t.kind === 'drone') {
      const o = t.orbit; o.a += o.s * dt;
      const p = V(o.cx + Math.cos(o.a) * o.r, o.h + Math.sin(o.a * 2.3) * 15, o.cz + Math.sin(o.a) * o.r);
      t.vel.copy(p).sub(t.obj.position).divideScalar(dt);
      t.obj.position.copy(p);
      t.obj.rotation.y += dt * 2;
      t.center.copy(p);
    } else if (t.kind === 'ai') updateAI(t, dt);
  }
}

function respawnTarget(t) {
  t.alive = true; t.hp = t.maxHp;
  if (t.kind === 'ai') {
    const sp = farthestSpawn([P.pos]);
    t.pos.set(sp.x, EYE + HOVER, sp.z); t.vel.set(0, 0, 0); t.mode = 'ground';
  }
}

function farthestSpawn(avoid) {
  let best = arena.spawns[0], bd = -1;
  for (const s of arena.spawns) {
    let d = Infinity;
    for (const a of avoid) d = Math.min(d, Math.hypot(a.x - s.x, a.z - s.z));
    d += Math.random() * 60;
    if (d > bd) { bd = d; best = s; }
  }
  return best;
}

// ---------- AI ----------
const enemyShots = [];
const shotGeo = new THREE.BoxGeometry(0.5, 0.5, 6);
const shotMat = new THREE.MeshBasicMaterial({ color: 0xff7aa8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
function updateAI(a, dt) {
  const toP = P.pos.clone().sub(a.pos);
  const dist = toP.length();
  const flat = V(toP.x, 0, toP.z), fd = flat.length() || 1;
  flat.divideScalar(fd);
  a.thinkT -= dt;
  if (a.thinkT <= 0) {
    a.thinkT = 1.2 + Math.random() * 1.6;
    if (Math.random() < 0.3) a.orbitDir *= -1;
    a.wantDist = 130 + Math.random() * 160;
    if (a.mode === 'ground' && Math.random() < 0.25) { a.mode = 'air'; a.vel.y = 40; a.airT = 4 + Math.random() * 4; a.altTarget = 50 + Math.random() * 120; }
  }
  const tangent = V(-flat.z, 0, flat.x).multiplyScalar(a.orbitDir);
  const wish = tangent.addScaledVector(flat, clamp((fd - a.wantDist) / a.wantDist, -1, 1) * 1.2).normalize();
  const sp = Math.hypot(a.vel.x, a.vel.z);
  if (a.mode === 'ground') {
    a.strideT -= dt;
    if (a.strideT <= 0) {
      a.strideT = T.stridePeriod * 1.1; a.side *= -1;
      a.vel.addScaledVector(wish.clone().applyAxisAngle(AY, a.side * T.strideAngle), 22 * clamp(1.3 - sp / 100, 0.2, 1.3));
    }
    a.vel.addScaledVector(wish, 35 * dt);
    a.phase += dt * Math.PI / (T.stridePeriod * 1.1);
    const feet = a.pos.y - EYE, g = groundAt(arena.colliders, a.pos.x, a.pos.z, feet, RAD * 0.6);
    a.vel.y += ((g + HOVER - feet) * 60 - a.vel.y * 11) * dt;
    if (feet - g > 8) { a.mode = 'air'; a.airT = 0.1; a.altTarget = 0; }
  } else {
    a.vel.addScaledVector(wish, 70 * dt);
    a.airT -= dt;
    const alt = a.pos.y - EYE;
    if (a.airT > 0) a.vel.y += ((a.altTarget - alt) * 1.5 - a.vel.y) * dt * 2;
    else a.vel.y -= 25 * dt;
    const feet = a.pos.y - EYE, g = groundAt(arena.colliders, a.pos.x, a.pos.z, feet, RAD * 0.6);
    if (a.airT <= 0 && feet <= g + HOVER + 0.6) a.mode = 'ground';
  }
  // Dodge when the player is shooting at us
  a.qbCd -= dt;
  if (a.qbCd <= 0 && performance.now() - P.lastShot < 250 && Math.random() < 0.04) {
    a.qbCd = 1.6;
    a.vel.addScaledVector(V(-flat.z, 0, flat.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1), 70);
    particles.burst(a.pos, 20, 30, 0.4, 0x7fd8ff);
  }
  const hs = Math.hypot(a.vel.x, a.vel.z), max = a.mode === 'air' ? 95 : 100;
  const drag = Math.exp(-dt * (hs > max ? 2.5 : 0.4));
  a.vel.x *= drag; a.vel.z *= drag;
  const before = a.pos.clone();
  a.pos.addScaledVector(a.vel, dt);
  a.pos.x = clamp(a.pos.x, -ARENA_HALF + 10, ARENA_HALF - 10); a.pos.z = clamp(a.pos.z, -ARENA_HALF + 10, ARENA_HALF - 10);
  a.pos.y = Math.min(a.pos.y, CEILING);
  if (resolveCollisions(arena.colliders, a.pos, EYE, RAD, HGT, a.vel) && a.mode === 'air' && a.airT <= 0) a.mode = 'ground';
  if (a.pos.distanceTo(before) < hs * dt * 0.4 && hs > 20) { a.stuckT += dt; if (a.stuckT > 0.3) { a.orbitDir *= -1; a.mode = 'air'; a.vel.y = 45; a.airT = 1.5; a.altTarget = 60; a.stuckT = 0; } } else a.stuckT = 0;

  a.yaw = Math.atan2(toP.x, toP.z);
  a.obj.position.set(a.pos.x, a.pos.y - EYE, a.pos.z);
  a.obj.rotation.y = a.yaw;
  const lv = a.vel.clone().applyAxisAngle(AY, -a.yaw);
  animateMech(a.obj.userData.rig, { fwd: lv.z, side: lv.x, up: a.vel.y, speed: hs, air: a.mode === 'air', phase: a.phase, boost: hs > 80, dt, aimPitch: Math.atan2(toP.y, fd) });
  a.center.set(a.pos.x, a.pos.y - EYE + 8, a.pos.z);
  placeShadow(a.shadow, a.pos.x, a.pos.y - EYE, a.pos.z);
  if (a.mode === 'ground' && hs > 30 && Math.random() < 0.5) particles.spawn(a.pos.x + (Math.random() - 0.5) * 4, a.pos.y - EYE + 0.4, a.pos.z + (Math.random() - 0.5) * 4, -a.vel.x * 0.2, 3, -a.vel.z * 0.2, 0.5, 0x7a8c96, 2, 1);

  // Fire bursts at the player
  if (!P.alive || state !== 'playing') return;
  a.fireT -= dt;
  if (a.fireT <= 0 && dist < 520 && hasLOS(a.center, P.pos)) { a.burst = 4; a.burstT = 0; a.fireT = 2.0 + Math.random() * 1.5; }
  if (a.burst > 0 && (a.burstT -= dt) <= 0) {
    a.burst--; a.burstT = 0.13;
    const muzzle = a.obj.userData.rig.muzzle.getWorldPosition(V());
    const speed = 340, tFlight = dist / speed;
    const aim = P.pos.clone().add(V(0, -3, 0)).addScaledVector(P.vel, tFlight * 0.75);
    const spread = 0.012 + P.vel.length() / 4500;
    const dir = aim.sub(muzzle).normalize().add(V((Math.random() - 0.5) * spread * 2, (Math.random() - 0.5) * spread * 2, (Math.random() - 0.5) * spread * 2)).normalize();
    fireEnemyShot(muzzle, dir.multiplyScalar(speed), 3, 'ai');
    flashes.add(muzzle, 1.5, 0xff7aa8, 0.08);
    sfx.enemyShot(clamp(0.3 - dist / 2000, 0.03, 0.3));
  }
}
function fireEnemyShot(p, v, dmg, from) {
  const m = new THREE.Mesh(shotGeo, shotMat);
  m.position.copy(p); m.lookAt(p.clone().add(v));
  scene.add(m);
  enemyShots.push({ m, v, life: 2, dmg, from });
}
function updateEnemyShots(dt) {
  for (let i = enemyShots.length - 1; i >= 0; i--) {
    const s = enemyShots[i];
    const prev = s.m.position.clone();
    s.m.position.addScaledVector(s.v, dt);
    s.life -= dt;
    let dead = s.life <= 0;
    // segment vs player sphere
    if (!dead && P.alive) {
      const c = V(P.pos.x, P.pos.y - 3, P.pos.z);
      const seg = s.m.position.clone().sub(prev), L = seg.length();
      const tt = clamp(c.clone().sub(prev).dot(seg) / (L * L || 1), 0, 1);
      if (prev.clone().addScaledVector(seg, tt).distanceTo(c) < 5.5) { takeDamage(s.dmg, s.from, prev); dead = true; particles.burst(s.m.position, 12, 20, 0.3, 0xff7aa8); }
    }
    if (!dead && pointInArena(arena.colliders, s.m.position)) { dead = true; particles.burst(s.m.position, 10, 18, 0.35, 0xff9fc0, 10); }
    if (dead) { scene.remove(s.m); enemyShots.splice(i, 1); }
  }
}

// ---------- Hit testing ----------
const _ray = new THREE.Ray();
function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return Infinity;
  const t = -b - Math.sqrt(h);
  return t > 0 ? t : Infinity;
}
function hasLOS(a, b) {
  const d = b.clone().sub(a), L = d.length();
  _ray.set(a, d.divideScalar(L));
  return rayArena(arena.colliders, _ray, L) >= L - 1;
}
function liveTargets() {
  const list = [];
  if (mode === 'training') { for (const t of targets) if (t.alive && t.obj.visible) list.push(t); }
  else for (const r of remotes.values()) if (r.alive) list.push(r);
  return list;
}
function rayTargets(o, d, maxDist) {
  let best = null, bt = maxDist;
  for (const t of liveTargets()) {
    const base = t.kind === 'drone' ? t.center : t.obj.position;
    for (const s of t.spheres) {
      const tt = raySphere(o, d, V(base.x, base.y + s.y, base.z), s.r);
      if (tt < bt) { bt = tt; best = t; }
    }
  }
  return { t: best, dist: bt };
}

function damageTarget(t, dmg, at) {
  showHitMarker();
  sfx.hit();
  if (t.kind === 'remote') { net.sendEvent({ type: 'hit', target: t.id, dmg }); return; }
  t.hp -= dmg;
  if (t.hp <= 0 && t.alive) {
    t.alive = false; t.respawnT = t.kind === 'ai' ? 6 : t.kind === 'drone' ? 5 : 4;
    explode(t.center.clone(), t.kind === 'drone' ? 0.7 : 1.3);
    P.kills++;
    feed(`<b>${esc(myName())}</b> destroyed <i>${t.name}</i>`);
    if (t.kind === 'ai') showMsg('SPARRING AI DOWN', 1.6, 'good');
  }
}

let hitMarkT = 0;
function showHitMarker() { hitMarkT = 0.15; }

// ---------- Weapons ----------
const missiles = [];
const mslGeo = new THREE.ConeGeometry(0.4, 2.6, 5).rotateX(Math.PI / 2);
const mslMat = new THREE.MeshStandardMaterial({ color: 0xd6d6c8, flatShading: true });
function spawnMissile(p, v, target, owner, cosmetic) {
  const m = new THREE.Mesh(mslGeo, mslMat);
  m.position.copy(p);
  scene.add(m);
  missiles.push({ m, v: v.clone(), target, owner, cosmetic, life: 4.5 });
}
function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const s = missiles[i];
    s.life -= dt;
    let tgtPos = null;
    if (s.target === 'me') tgtPos = P.alive ? V(P.pos.x, P.pos.y - 3, P.pos.z) : null;
    else if (s.target && s.target.alive) tgtPos = s.target.center;
    const speed = Math.min(300, s.v.length() + 260 * dt);
    const dir = s.v.clone().normalize();
    if (tgtPos && s.life < 4.3) {
      const want = tgtPos.clone().sub(s.m.position).normalize();
      const ang = dir.angleTo(want), turn = Math.min(ang, 2.8 * dt);
      if (ang > 1e-4) dir.applyAxisAngle(V().crossVectors(dir, want).normalize(), turn);
    }
    s.v.copy(dir).multiplyScalar(speed);
    s.m.position.addScaledVector(s.v, dt);
    s.m.lookAt(s.m.position.clone().add(dir));
    particles.spawn(s.m.position.x, s.m.position.y, s.m.position.z, -dir.x * 20, -dir.y * 20, -dir.z * 20, 0.35, 0xffb050, 3);
    particles.spawn(s.m.position.x, s.m.position.y, s.m.position.z, (Math.random() - 0.5) * 3, 1, (Math.random() - 0.5) * 3, 1.2, 0x55595e, 1);
    let boom = s.life <= 0 || pointInArena(arena.colliders, s.m.position);
    if (!boom && tgtPos && s.m.position.distanceTo(tgtPos) < 6) {
      boom = true;
      if (!s.cosmetic && s.target !== 'me') damageTarget(s.target, 18, s.m.position);
    }
    if (boom) { explode(s.m.position.clone(), 0.6); scene.remove(s.m); missiles.splice(i, 1); }
  }
}

function camForward() { return V(0, 0, -1).applyQuaternion(P.viewQ); }
function muzzlePos() { return V(2.2, -2.4, -4).applyQuaternion(P.viewQ).add(P.pos); }

function updateWeapons(dt) {
  P.fireCd -= dt;
  if (P.reloadT > 0 && (P.reloadT -= dt) <= 0) P.ammo = AMMO_MAX;
  if (P.msl < MSL_MAX && (P.mslT -= dt) <= 0) { P.msl++; P.mslT = 2.4; }

  // Lock-on: closest target to the reticle inside a cone
  const f = camForward();
  let cand = null, ca = 0.45;
  for (const t of liveTargets()) {
    const d = t.center.clone().sub(P.pos), L = d.length();
    if (L > 750) continue;
    const a = f.angleTo(d.divideScalar(L));
    if (a < ca && hasLOS(P.pos, t.center)) { ca = a; cand = t; }
  }
  if (cand && cand === P.lock) P.lockT += dt; else { P.lock = cand; P.lockT = 0; }
  const wasLocked = P.locked;
  P.locked = !!P.lock && P.lockT > 0.45;
  if (P.locked && !wasLocked) sfx.lock();

  if (!P.alive) { input.msl = false; return; }
  if (input.fire && P.fireCd <= 0 && P.reloadT <= 0) {
    P.fireCd = 0.095; P.ammo--; P.lastShot = performance.now();
    if (P.ammo <= 0) { P.reloadT = 1.8; P.ammo = 0; }
    let dir = f.clone();
    // Light aim assist toward the locked/nearest target (helps on touch at Gundam speeds)
    const assist = isTouch ? 0.07 : 0.035;
    if (P.lock && ca < assist) dir = P.lock.center.clone().sub(P.pos).normalize();
    dir.add(V((Math.random() - 0.5) * 0.012, (Math.random() - 0.5) * 0.012, (Math.random() - 0.5) * 0.012)).normalize();
    _ray.set(P.pos, dir);
    const wall = rayArena(arena.colliders, _ray, 900);
    const hit = rayTargets(P.pos, dir, wall);
    const end = P.pos.clone().addScaledVector(dir, hit.t ? hit.dist : wall);
    const mz = muzzlePos();
    tracers.add(mz, end, 0xffc37a, 1.3);
    particles.burst(mz, 4, 15, 0.12, 0xffd08a);
    if (hit.t) { damageTarget(hit.t, 5, end); particles.burst(end, 10, 25, 0.35, 0xffe0a0, 15); }
    else if (wall < 900) particles.burst(end, 8, 20, 0.4, 0xc8c0a8, 20);
    P.shake = Math.max(P.shake, 0.08);
    sfx.shot();
    if (mode === 'pvp') net.sendEvent({ type: 'shot', a: vArr(mz), b: vArr(end) });
  }
  if (input.msl) {
    input.msl = false;
    if (P.msl > 0) {
      P.msl--; if (P.mslT <= 0) P.mslT = 2.4;
      const tgt = P.locked ? P.lock : null;
      const p = V(P.msl % 2 ? -3 : 3, 1.5, -2).applyQuaternion(P.viewQ).add(P.pos);
      const v = f.clone().multiplyScalar(90).add(V(0, 25, 0)).add(P.vel);
      spawnMissile(p, v, tgt, 'me', false);
      sfx.missile();
      if (mode === 'pvp') net.sendEvent({ type: 'msl', p: vArr(p), v: vArr(v), target: tgt ? tgt.id : null });
    } else sfx.beep();
  }
}
const vArr = v => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100];

// ---------- Damage / death ----------
let dmgFlash = 0;
const dmgDirs = []; // {ang, t}
function takeDamage(dmg, from, srcPos) {
  if (!P.alive || P.invuln > 0) return;
  P.hp -= dmg;
  dmgFlash = Math.min(1, dmgFlash + 0.35);
  P.shake = Math.max(P.shake, 0.25);
  sfx.hurt();
  if (srcPos) {
    const d = srcPos.clone().sub(P.pos);
    const local = d.applyQuaternion(P.viewQ.clone().invert());
    dmgDirs.push({ ang: Math.atan2(local.x, -local.z), t: 1 });
  }
  if (P.hp <= 0) die(from);
}
function die(from) {
  P.hp = 0; P.alive = false; P.deadT = 3.5; P.deaths++;
  explode(P.pos.clone(), 1.5);
  $('dead').classList.add('show');
  if (mode === 'pvp') {
    net.sendEvent({ type: 'kill', killer: from, victim: net.id });
    onKill(from, net.id);
  } else feed(`<i>SPARRING AI</i> destroyed <b>${esc(myName())}</b>`);
}
function respawn() {
  const avoid = mode === 'pvp' ? [...remotes.values()].map(r => r.pos) : (settings.spar ? [ai.pos] : []);
  const sp = avoid.length ? farthestSpawn(avoid) : mode === 'pvp' ? arena.spawns[Math.floor(Math.random() * arena.spawns.length)] : arena.spawns[0];
  P.pos.set(sp.x, EYE + HOVER, sp.z); P.vel.set(0, 0, 0);
  P.yaw = sp.yaw; P.pitch = 0; P.mode = 'ground'; groundQuat(P.viewQ);
  P.hp = P.maxHp; P.energy = 100; P.overheat = false; P.alive = true;
  P.ammo = AMMO_MAX; P.reloadT = 0; P.msl = MSL_MAX; P.invuln = 2;
  $('dead').classList.remove('show');
}

// ---------- Player movement ----------
const _wish = V(), _hv = V();
function updatePlayer(dt, time) {
  const F = FRAMES[settings.frame], fs = F.speed;
  P.qbCd -= dt; P.invuln -= dt;
  if (!P.alive) {
    P.vel.multiplyScalar(Math.exp(-dt * 2));
    if ((P.deadT -= dt) <= 0) respawn();
    return;
  }
  const mx = input.mx, my = input.my;
  const wantSprint = input.sprintHold && !P.overheat;

  if (P.mode === 'ground') {
    const fwd = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), right = V(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    _wish.copy(fwd).multiplyScalar(my).addScaledVector(right, mx);
    const wl = Math.min(1, _wish.length());
    _hv.set(P.vel.x, 0, P.vel.z);
    const spd = _hv.length();
    P.sprinting = wantSprint && wl > 0.2;
    let max;
    if (P.sprinting) {
      // Ice-skater sprint: alternating diagonal pushes, glide in between.
      P.strideT -= dt;
      if (P.strideT <= 0) {
        P.strideT = T.stridePeriod; P.strideSide *= -1;
        const dir = _wish.clone().normalize().applyAxisAngle(AY, P.strideSide * T.strideAngle);
        const gain = T.strideImpulse * fs * clamp(1.45 - spd / (T.sprintMax * fs), 0.25, 1.45);
        P.vel.addScaledVector(dir, gain);
        P.energy -= 3.2;
        P.rollKick = P.strideSide * 0.07;
        P.shake = Math.max(P.shake, 0.12);
        sfx.stride();
        const side = V(Math.cos(P.yaw), 0, -Math.sin(P.yaw)).multiplyScalar(P.strideSide * 2.5);
        for (let i = 0; i < 14; i++) particles.spawn(P.pos.x + side.x, P.pos.y - EYE + 0.4, P.pos.z + side.z, -dir.x * 30 + (Math.random() - 0.5) * 16, 2 + Math.random() * 5, -dir.z * 30 + (Math.random() - 0.5) * 16, 0.6, 0x9fd8ff, 2.5, 3);
      }
      P.vel.addScaledVector(_wish, 32 * fs * dt);
      P.phase += dt * Math.PI / T.stridePeriod;
      max = T.sprintMax * fs;
      P.energy += 6 * dt;
    } else {
      P.strideT = Math.min(P.strideT, 0.05);
      P.vel.addScaledVector(_wish, T.groundAccel * fs * dt);
      P.phase += dt * spd / 14;
      max = T.groundMax * fs;
      P.energy += 30 * dt;
    }
    // Carve: bend velocity toward the stick direction like a skate edge.
    _hv.set(P.vel.x, 0, P.vel.z);
    if (wl > 0.2 && spd > 4) {
      const ang = Math.atan2(_hv.x * _wish.z - _hv.z * _wish.x, _hv.x * _wish.x + _hv.z * _wish.z);
      const rate = (P.sprinting ? 1.9 : 3.2) * dt;
      const turn = clamp(-ang, -rate, rate);
      _hv.applyAxisAngle(AY, turn).multiplyScalar(1 - Math.abs(turn) * 0.04);
    }
    const drag = wl > 0.1 ? 0.22 : 1.2;
    _hv.multiplyScalar(Math.exp(-drag * dt));
    const hs = _hv.length();
    if (hs > max) _hv.multiplyScalar(Math.exp(-dt * 2.6 * (hs - max) / max));
    P.vel.x = _hv.x; P.vel.z = _hv.z;
    // Hover spring
    const feet = P.pos.y - EYE;
    const g = groundAt(arena.colliders, P.pos.x, P.pos.z, feet, RAD * 0.6);
    if (feet - g > 7) toAir();
    else P.vel.y += ((g + HOVER + Math.sin(time * 3) * 0.12 - feet) * 70 - P.vel.y * 12) * dt;
    // Jump / take off
    if (input.riseHeld && P.mode === 'ground' && !P.overheat && P.energy > 8) {
      P.vel.y = Math.max(P.vel.y, T.jumpVel); P.energy -= 6;
      toAir(); sfx.jump(); dustRing(P.pos.x, feet, P.pos.z, 30);
      P.shake = Math.max(P.shake, 0.3);
    }
    // ground dust trail
    if (hs > 25 && Math.random() < hs / 90) particles.spawn(P.pos.x + (Math.random() - 0.5) * 5, feet + 0.3, P.pos.z + (Math.random() - 0.5) * 5, -P.vel.x * 0.15, 2, -P.vel.z * 0.15, 0.5, 0x84939c, 2, 1);
    P.boosting = P.sprinting;
  } else {
    // Free flight: thrust follows the cockpit's orientation.
    const f = forwardOf(P.q), r = V(1, 0, 0).applyQuaternion(P.q), u = V(0, 1, 0).applyQuaternion(P.q);
    const vert = (input.riseHeld ? 1 : 0) - (input.diveHeld ? 1 : 0);
    const thrust = f.multiplyScalar(my).addScaledVector(r, mx).addScaledVector(u, vert);
    if (thrust.length() > 1) thrust.normalize();
    P.boosting = wantSprint && thrust.length() > 0.1;
    const acc = (P.boosting ? T.airBoostAccel : T.airAccel) * fs * (P.overheat ? 0.2 : 1);
    P.vel.addScaledVector(thrust, acc * dt);
    P.vel.y -= (P.overheat ? 30 : thrust.length() > 0.1 ? 3 : 12) * dt;
    P.vel.multiplyScalar(Math.exp(-0.45 * dt));
    const max = (P.boosting ? T.airBoostMax : T.airMax) * fs, s = P.vel.length();
    if (s > max) P.vel.multiplyScalar(Math.exp(-dt * 2.6 * (s - max) / max));
    P.energy -= dt * (1.5 + (P.boosting ? 20 : 0) + (input.riseHeld ? 5 : 0));
    P.phase += dt;
    if (P.boosting) {
      const back = forwardOf(P.q).multiplyScalar(-1);
      for (let i = 0; i < 2; i++) particles.spawn(P.pos.x + back.x * 6 + (Math.random() - 0.5) * 3, P.pos.y - 4 + back.y * 6, P.pos.z + back.z * 6 + (Math.random() - 0.5) * 3, back.x * 60 + P.vel.x, back.y * 60 + P.vel.y, back.z * 60 + P.vel.z, 0.25, 0x7fd8ff, 3);
    }
  }

  // Quick boost: instant dash
  if (input.qb) {
    input.qb = false;
    if (P.qbCd <= 0 && P.energy >= 14 && !P.overheat) {
      let dir;
      if (P.mode === 'ground') {
        dir = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)).multiplyScalar(my || (mx ? 0 : 1)).addScaledVector(V(Math.cos(P.yaw), 0, -Math.sin(P.yaw)), mx);
      } else {
        dir = forwardOf(P.q).multiplyScalar(my || (mx ? 0 : 1)).addScaledVector(V(1, 0, 0).applyQuaternion(P.q), mx);
      }
      dir.normalize();
      P.vel.addScaledVector(dir, T.qbImpulse * fs);
      P.energy -= 14; P.qbCd = 0.45;
      P.shake = Math.max(P.shake, 0.55); P.fovKick = 14;
      sfx.boost();
      for (let i = 0; i < 40; i++) particles.spawn(P.pos.x - dir.x * 6, P.pos.y - 4, P.pos.z - dir.z * 6, -dir.x * 80 + (Math.random() - 0.5) * 30, -dir.y * 80 + (Math.random() - 0.5) * 30, -dir.z * 80 + (Math.random() - 0.5) * 30, 0.4, 0x9fe8ff, 3);
    } else sfx.beep();
  }

  // Generator
  if (P.energy <= 0 && !P.overheat) { P.overheat = true; sfx.warn(); showMsg('GENERATOR OVERHEAT', 1.5, 'bad'); }
  P.energy = clamp(P.energy, 0, 100);
  if (P.overheat && P.energy >= 40) P.overheat = false;

  // Integrate with sub-steps for solid collisions at high speed
  const steps = Math.max(1, Math.ceil(P.vel.length() * dt / 2.5));
  const vyBefore = P.vel.y;
  let landed = false;
  for (let i = 0; i < steps; i++) {
    P.pos.addScaledVector(P.vel, dt / steps);
    if (resolveCollisions(arena.colliders, P.pos, EYE, RAD, HGT, P.vel)) landed = true;
  }
  P.pos.x = clamp(P.pos.x, -ARENA_HALF + RAD, ARENA_HALF - RAD);
  P.pos.z = clamp(P.pos.z, -ARENA_HALF + RAD, ARENA_HALF - RAD);
  if (P.pos.y > CEILING) { P.pos.y = CEILING; P.vel.y = Math.min(0, P.vel.y); }
  const feet = P.pos.y - EYE;
  if (feet < 0) { P.pos.y = EYE; if (P.vel.y < 0) P.vel.y = 0; landed = true; }
  if (P.mode === 'air') {
    const g = groundAt(arena.colliders, P.pos.x, P.pos.z, feet, RAD * 0.6);
    if ((landed || feet <= g + HOVER + 0.4) && P.vel.y <= 2 && !input.riseHeld) toGround(clamp(-vyBefore / 45, 0, 1));
  }
}

// ---------- Camera ----------
const _tq = new THREE.Quaternion();
let shakeT = 0;
function updateCamera(dt, time) {
  const sp = P.vel.length();
  if (P.mode === 'ground') {
    const right = V(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    const lat = P.vel.dot(right);
    P.rollKick *= Math.exp(-dt * 5);
    P.roll += ((-lat / 260) + P.rollKick - P.roll) * (1 - Math.exp(-dt * 6));
    groundQuat(_tq, P.roll);
  } else {
    P.roll *= Math.exp(-dt * 4);
    _tq.copy(P.q);
  }
  P.blend -= dt;
  if (P.blend > 0) P.viewQ.slerp(_tq, 1 - Math.exp(-dt * 9)); else P.viewQ.copy(_tq);
  camera.quaternion.copy(P.viewQ);
  P.shake *= Math.exp(-dt * 6);
  shakeT += dt * 40;
  const s = P.shake * 0.35;
  camera.position.copy(P.pos);
  if (P.mode === 'ground') camera.position.y += Math.sin(P.phase * 2) * 0.12 * clamp(sp / 80, 0, 1);
  camera.position.add(V(Math.sin(shakeT * 1.3) * s, Math.sin(shakeT * 1.7 + 1) * s, Math.sin(shakeT * 1.1 + 2) * s).applyQuaternion(P.viewQ));
  camera.quaternion.multiply(_q.setFromEuler(new THREE.Euler(Math.sin(shakeT * 0.9) * P.shake * 0.01, Math.sin(shakeT * 1.2) * P.shake * 0.01, 0)));
  P.fovKick *= Math.exp(-dt * 4);
  const fov = BASE_FOV + clamp(sp / 180, 0, 1) * 16 + P.fovKick;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // Cockpit inertia: lags behind acceleration
  const acc = P.vel.clone().sub(P.prevVel).divideScalar(Math.max(dt, 1e-3));
  P.prevVel.copy(P.vel);
  const localAcc = acc.applyQuaternion(P.viewQ.clone().invert());
  P.sway.lerp(localAcc.multiplyScalar(-0.00012).clampLength(0, 0.03), 1 - Math.exp(-dt * 8));
  cockpit.rig.position.copy(P.sway);
  cockpit.animate(time, input.mx, input.my, input.riseHeld ? 1 : input.diveHeld ? -1 : 0);
  // own shadow
  placeShadow(P.shadow, P.pos.x, P.pos.y - EYE, P.pos.z, P.alive);
}

// ---------- PvP ----------
const remotes = new Map();
let net = null;
function myName() { return settings.name || 'PILOT'; }
function nameOf(id) { if (net && id === net.id) return myName(); if (id === 'ai') return 'SPARRING AI'; return remotes.get(id)?.name || 'PILOT'; }

function makeNet() {
  return new Net({
    onWorld(list) {
      const seen = new Set();
      for (const s of list) {
        if (!s || !s.id || !Array.isArray(s.p)) continue;
        seen.add(s.id);
        let r = remotes.get(s.id);
        const frame = FRAMES[s.f] ? s.f : 'strider';
        if (r && r.frame !== frame) { removeRemote(s.id); r = null; }
        if (!r) {
          r = mechTarget('remote', frame, '', 100);
          r.id = s.id; r.pos = V(...s.p); r.net = V(...s.p); r.netVel = V(); r.yaw = 0;
          remotes.set(s.id, r);
        }
        r.net.set(...s.p); r.netVel.set(...(s.v || [0, 0, 0]));
        r.yaw = +s.y || 0; r.pitch = +s.pi || 0; r.air = !!s.a; r.boost = !!s.b;
        r.alive = !!s.al; r.hp = +s.h || 0; r.maxHp = +s.mh || 100;
        r.name = String(s.n || 'PILOT').slice(0, 16); r.k = +s.k || 0; r.d = +s.d || 0;
      }
      for (const id of [...remotes.keys()]) if (!seen.has(id)) removeRemote(id);
    },
    onEvent(e) {
      if (!e || !e.type) return;
      if (e.type === 'hit' && e.target === net.id) takeDamage(+e.dmg || 0, e.from, remotes.get(e.from)?.pos);
      else if (e.type === 'shot' && Array.isArray(e.a) && e.from !== net.id) {
        tracers.add(V(...e.a), V(...e.b), 0xff9a7a, 1.3);
        const d = V(...e.a).distanceTo(P.pos);
        sfx.enemyShot(clamp(0.3 - d / 2000, 0.02, 0.3));
      } else if (e.type === 'msl' && Array.isArray(e.p) && e.from !== net.id) {
        const tgt = e.target === net.id ? 'me' : remotes.get(e.target) || null;
        spawnMissile(V(...e.p), V(...e.v), tgt, e.from, true);
        if (tgt === 'me') { showMsg('⚠ MISSILE INCOMING', 1.2, 'bad'); sfx.warn(); }
      } else if (e.type === 'kill' && e.victim !== net.id) onKill(e.killer, e.victim);
      else if (e.type === 'join') feed(`<i>A pilot joined</i>`);
      else if (e.type === 'leave') feed(`<i>${esc(nameOf(e.from))} left</i>`);
    },
    onStatus(t) { feed(`<i>${esc(t)}</i>`); },
    onDisconnect() { showMsg('DISCONNECTED FROM HOST', 3, 'bad'); leaveMatch(); },
  });
}
function onKill(killer, victim) {
  if (killer === net?.id && victim !== net.id) { P.kills++; showMsg('PILOT DESTROYED', 1.4, 'good'); }
  const r = remotes.get(victim);
  if (r) explode(r.center.clone(), 1.5);
  feed(`<b>${esc(nameOf(killer))}</b> destroyed <b>${esc(nameOf(victim))}</b>`);
}
function removeRemote(id) {
  const r = remotes.get(id);
  if (!r) return;
  scene.remove(r.obj); scene.remove(r.shadow);
  remotes.delete(id);
}
function updateRemotes(dt) {
  for (const r of remotes.values()) {
    r.net.addScaledVector(r.netVel, dt); // extrapolate between packets
    r.pos.lerp(r.net, 1 - Math.exp(-dt * 14));
    r.obj.visible = r.alive; r.shadow.visible = r.alive;
    r.obj.position.set(r.pos.x, r.pos.y - EYE, r.pos.z);
    r.obj.rotation.y = r.yaw + Math.PI;
    const lv = r.netVel.clone().applyAxisAngle(AY, -(r.yaw + Math.PI));
    const hs = Math.hypot(r.netVel.x, r.netVel.z);
    r.phase += r.air ? dt : (r.boost ? dt * Math.PI / T.stridePeriod : dt * hs / 14);
    animateMech(r.obj.userData.rig, { fwd: lv.z, side: lv.x, up: r.netVel.y, speed: hs, air: r.air, phase: r.phase, boost: r.boost, dt, aimPitch: r.pitch });
    r.center.set(r.pos.x, r.pos.y - EYE + 8, r.pos.z);
    placeShadow(r.shadow, r.pos.x, r.pos.y - EYE, r.pos.z, r.alive);
  }
}
let sendT = 0;
function sendState(dt) {
  if (!net?.online || (sendT -= dt) > 0) return;
  sendT = 1 / 15;
  const f = forwardOf(P.viewQ);
  net.sendState({
    n: myName(), f: settings.frame, p: vArr(P.pos), v: vArr(P.vel), y: facingYaw(), pi: Math.round(Math.asin(clamp(f.y, -1, 1)) * 100) / 100,
    a: P.mode === 'air' ? 1 : 0, b: P.boosting ? 1 : 0, h: Math.max(0, Math.round(P.hp)), mh: P.maxHp, al: P.alive ? 1 : 0, k: P.kills, d: P.deaths,
  });
}

async function startPvP(host) {
  const code = host ? makeCode() : $('roomCode').value.trim().toUpperCase();
  if (!host && !/^[A-Z0-9]{4}$/.test(code)) { notice('Enter the 4-character room code.'); return; }
  notice(host ? 'Creating room…' : 'Joining room ' + code + '…');
  net?.close();
  net = makeNet();
  try {
    if (host) await net.host(code); else await net.join(code);
  } catch (err) {
    notice(err.message || String(err)); net.close(); net = null; return;
  }
  mode = 'pvp';
  $('modeTag').textContent = 'PvP ROOM ' + code;
  begin();
  showMsg(host ? `ROOM ${code} — SHARE THIS CODE` : `JOINED ROOM ${code}`, 4);
}
function leaveMatch() {
  net?.close(); net = null;
  for (const id of [...remotes.keys()]) removeRemote(id);
  mode = 'training';
  state = 'menu';
  showMenu(false);
}

// ---------- HUD ----------
function project(p) {
  const v = p.clone().project(camera);
  if (v.z > 1) return null;
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
}
let screenT = 0, scoreT = 0;
function drawHUD(dt) {
  const W = innerWidth, H = innerHeight;
  hg.clearRect(0, 0, W, H);
  if (state !== 'playing') return;
  const f = camForward();
  // Target brackets
  for (const t of liveTargets()) {
    const d = t.center.clone().sub(P.pos);
    const dist = d.length();
    if (d.dot(f) <= 0 || dist > 1400) continue;
    const s = project(t.center);
    if (!s) continue;
    const size = clamp(2600 / dist, 14, 70);
    const locked = t === P.lock && P.locked;
    const locking = t === P.lock && !P.locked;
    hg.strokeStyle = locked ? '#ff4a4a' : t.kind === 'remote' || t.kind === 'ai' ? '#ff9a5a' : '#ffd36a';
    hg.lineWidth = locked ? 2.5 : 1.5;
    const L = size * 0.35;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      hg.beginPath();
      hg.moveTo(s.x + sx * size, s.y + sy * size - sy * L); hg.lineTo(s.x + sx * size, s.y + sy * size); hg.lineTo(s.x + sx * size - sx * L, s.y + sy * size);
      hg.stroke();
    }
    if (locking) {
      const k = 1 - P.lockT / 0.45, rr = size + 30 * k;
      hg.beginPath(); hg.moveTo(s.x, s.y - rr); hg.lineTo(s.x + rr, s.y); hg.lineTo(s.x, s.y + rr); hg.lineTo(s.x - rr, s.y); hg.closePath(); hg.stroke();
    }
    hg.font = '600 11px "Share Tech Mono", monospace'; hg.fillStyle = hg.strokeStyle; hg.textAlign = 'center';
    if (locked || locking || t.kind === 'ai' || t.kind === 'remote' || dist < 260) hg.fillText(t.kind === 'dummy' || t.kind === 'drone' ? `${Math.round(dist)}m` : `${t.name} ${Math.round(dist)}m`, s.x, s.y - size - 6);
    if (t.kind !== 'drone') {
      const bw = size * 1.6;
      hg.fillStyle = 'rgba(0,0,0,0.5)'; hg.fillRect(s.x - bw / 2, s.y + size + 5, bw, 4);
      hg.fillStyle = hg.strokeStyle; hg.fillRect(s.x - bw / 2, s.y + size + 5, bw * clamp(t.hp / t.maxHp, 0, 1), 4);
    }
    if (locked) { hg.fillStyle = '#ff4a4a'; hg.fillText('LOCK', s.x, s.y + size + 22); }
  }
  // Velocity vector marker (where you're actually going)
  if (P.vel.length() > 15) {
    const s = project(P.pos.clone().addScaledVector(P.vel, 3));
    if (s && P.vel.clone().normalize().dot(f) > 0.2) {
      hg.strokeStyle = 'rgba(120,255,220,0.8)'; hg.lineWidth = 1.5;
      hg.beginPath(); hg.arc(s.x, s.y, 7, 0, Math.PI * 2); hg.moveTo(s.x - 14, s.y); hg.lineTo(s.x - 7, s.y); hg.moveTo(s.x + 7, s.y); hg.lineTo(s.x + 14, s.y); hg.moveTo(s.x, s.y - 7); hg.lineTo(s.x, s.y - 13); hg.stroke();
    }
  }
  // Damage direction arcs
  for (let i = dmgDirs.length - 1; i >= 0; i--) {
    const d = dmgDirs[i];
    if ((d.t -= dt) <= 0) { dmgDirs.splice(i, 1); continue; }
    hg.strokeStyle = `rgba(255,60,60,${d.t})`; hg.lineWidth = 6;
    hg.beginPath(); hg.arc(W / 2, H / 2, Math.min(W, H) * 0.22, d.ang - Math.PI / 2 - 0.25, d.ang - Math.PI / 2 + 0.25); hg.stroke();
  }
  // Hit marker
  if (hitMarkT > 0) {
    hitMarkT -= dt;
    hg.strokeStyle = '#fff'; hg.lineWidth = 2;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { hg.beginPath(); hg.moveTo(W / 2 + a * 8, H / 2 + b * 8); hg.lineTo(W / 2 + a * 15, H / 2 + b * 15); hg.stroke(); }
  }

  // DOM readouts
  const sp = P.vel.length();
  $('spd').textContent = Math.round(sp * 3.6);
  $('alt').textContent = Math.round(Math.max(0, P.pos.y - EYE));
  $('armorFill').style.width = (P.hp / P.maxHp * 100) + '%';
  $('armorFill').classList.toggle('low', P.hp / P.maxHp < 0.3);
  $('enFill').style.width = P.energy + '%';
  $('enFill').classList.toggle('hot', P.overheat);
  $('ammoTxt').textContent = P.reloadT > 0 ? 'RELOAD' : P.ammo;
  $('mslTxt').textContent = '▮'.repeat(P.msl) + '▯'.repeat(MSL_MAX - P.msl);
  $('modeTxt').textContent = P.mode === 'air' ? (P.boosting ? 'FLIGHT · BOOST' : 'FLIGHT') : (P.sprinting ? 'SKATE · BOOST' : 'HOVER');
  $('reticle').classList.toggle('locked', P.locked);
  dmgFlash = Math.max(0, dmgFlash - dt * 1.5);
  $('dmgFlash').style.opacity = dmgFlash;
  $('boostFx').style.opacity = P.boosting ? clamp(sp / 200, 0.2, 0.9) : P.fovKick / 14;

  // Cockpit screens at ~10Hz
  if ((screenT -= dt) <= 0) {
    screenT = 0.1;
    const blips = [];
    for (const t of liveTargets()) blips.push({ dx: t.center.x - P.pos.x, dz: t.center.z - P.pos.z, c: t.kind === 'remote' || t.kind === 'ai' ? '#ff5a5a' : '#ffd36a', air: t.kind === 'drone' || t.air || (t.mode === 'air') });
    cockpit.draw({ yaw: facingYaw(), blips, hp: P.hp, maxHp: P.maxHp, energy: P.energy, overheat: P.overheat, mode: P.mode === 'air' ? 'FLIGHT' : 'HOVER', alt: P.pos.y - EYE,
      ammo: P.ammo, reloading: P.reloadT > 0, msl: P.msl, mslMax: MSL_MAX, locked: P.locked, frame: FRAMES[settings.frame].name });
  }
  if ((scoreT -= dt) <= 0) {
    scoreT = 0.5;
    if (mode === 'pvp') {
      const rows = [{ n: myName() + ' (you)', k: P.kills, d: P.deaths }, ...[...remotes.values()].map(r => ({ n: r.name, k: r.k, d: r.d }))].sort((a, b) => b.k - a.k);
      $('scores').innerHTML = `<div class="hd">PILOTS ${rows.length}</div>` + rows.map(r => `<div><span>${esc(r.n)}</span><b>${r.k}/${r.d}</b></div>`).join('');
    } else {
      $('scores').innerHTML = `<div><span>DESTROYED</span><b>${P.kills}</b></div>`;
    }
  }
}

// ---------- Menu ----------
function notice(t) { $('notice').textContent = t; }
function buildFramePicker() {
  const wrap = $('frames');
  wrap.innerHTML = '';
  for (const [k, F] of Object.entries(FRAMES)) {
    const b = document.createElement('button');
    b.className = 'frame' + (settings.frame === k ? ' sel' : '');
    b.innerHTML = `<i style="background:#${F.main.toString(16).padStart(6, '0')}"></i><b>${F.name}</b><small>${F.desc}</small>`;
    b.onclick = () => { settings.frame = k; saveSettings(); buildFramePicker(); updatePreview(); };
    wrap.appendChild(b);
  }
}
function showMenu(paused) {
  state = paused ? 'paused' : 'menu';
  $('menu').classList.remove('hidden');
  $('menu').classList.toggle('paused', paused);
  $('hud').classList.add('hidden');
  input.fire = false; input.rise = input.dive = false; input.mx = input.my = 0;
  for (const k in keys) keys[k] = false;
  if (document.pointerLockElement) document.exitPointerLock();
}
function pause() { if (state === 'playing') showMenu(true); }
function applyFrameStats() {
  const F = FRAMES[settings.frame];
  P.maxHp = F.hp;
  P.hp = Math.min(P.hp, P.maxHp);
}
function begin() {
  sfx.start();
  applyFrameStats();
  respawn();
  P.kills = 0; P.deaths = 0;
  for (const t of targets) { t.alive = true; t.hp = t.maxHp; }
  if (mode === 'training') { respawnTarget(ai); $('modeTag').textContent = 'TRAINING ARENA'; }
  resume();
  if (mode === 'training') {
    const tips = isTouch
      ? ['LEFT THUMB: MOVE · RIGHT: LOOK', 'PUSH STICK TO EDGE OR TAP BOOST TO SKATE-SPRINT', 'HOLD RISE TO FLY — LOOK ANYWHERE', 'QB = INSTANT DASH · MSL = HOMING MISSILE']
      : ['WASD MOVE · MOUSE LOOK', 'HOLD SHIFT TO SKATE-SPRINT', 'HOLD SPACE TO FLY — LOOK ANYWHERE', 'Q = QUICK BOOST · E / RMB = MISSILE'];
    tips.forEach((t, i) => setTimeout(() => state === 'playing' && showMsg(t, 2.6), 400 + i * 3000));
  }
}
function resume() {
  state = 'playing';
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (isTouch) {
    document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  } else lockPointer();
  clock.getDelta();
}

$('btnTrain').onclick = () => { net?.close(); net = null; mode = 'training'; begin(); };
$('btnHost').onclick = () => startPvP(true);
$('btnJoin').onclick = () => startPvP(false);
$('btnResume').onclick = () => { applyFrameStats(); resume(); };
$('btnLeave').onclick = () => { if (mode === 'pvp') leaveMatch(); else showMenu(false); };
$('pilotName').value = settings.name;
$('pilotName').oninput = e => { settings.name = e.target.value.slice(0, 16).toUpperCase(); saveSettings(); };
$('roomCode').oninput = e => { e.target.value = e.target.value.toUpperCase(); };
$('sens').value = settings.sens; $('sens').oninput = e => { settings.sens = +e.target.value; saveSettings(); };
$('invert').checked = settings.invert; $('invert').onchange = e => { settings.invert = e.target.checked; saveSettings(); };
$('autoLevel').checked = settings.autoLevel; $('autoLevel').onchange = e => { settings.autoLevel = e.target.checked; saveSettings(); };
$('spar').checked = settings.spar; $('spar').onchange = e => { settings.spar = e.target.checked; saveSettings(); };
$('controlsHelp').innerHTML = isTouch
  ? 'Left thumb: move (push to the edge to skate-sprint) · Right thumb: look · FIRE can be dragged to aim · RISE to fly'
  : 'WASD move · Mouse look · Shift skate-sprint / air boost · Space rise / fly · Ctrl or C dive · Q quick boost · LMB fire · E / RMB missile · R reset · M mute';
buildFramePicker();
if (new URLSearchParams(location.search).get('room')) $('roomCode').value = new URLSearchParams(location.search).get('room').toUpperCase().slice(0, 4);

// Spinning mech preview behind the menu
const preview = { obj: null };
function updatePreview() {
  if (preview.obj) scene.remove(preview.obj);
  preview.obj = buildMech(settings.frame);
  preview.obj.position.set(0, 0, 470);
  scene.add(preview.obj);
}
updatePreview();

// ---------- Main loop ----------
const clock = new THREE.Clock();
let time = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.max(1e-3, Math.min(clock.getDelta(), 1 / 30));
  time += dt;
  if (state === 'playing') {
    preview.obj.visible = false;
    readInput(dt);
    applyLook(dt);
    updatePlayer(dt, time);
    updateWeapons(dt);
    updateCamera(dt, time);
    sendState(dt);
    sfx.engine(P.vel.length(), P.boosting, P.mode === 'air');
  } else {
    // Menu: orbit camera around the selected frame
    preview.obj.visible = state === 'menu';
    if (state === 'menu') {
      const a = time * 0.25;
      preview.obj.rotation.y = 0;
      animateMech(preview.obj.userData.rig, { fwd: 0, side: 0, up: 0, speed: 0, air: false, phase: time, boost: false, dt, aimPitch: 0 });
      camera.position.set(Math.sin(a) * 26, 9 + Math.sin(time * 0.3) * 2, 470 + Math.cos(a) * 26);
      camera.lookAt(0, 7, 470);
      camera.rotateY(innerWidth > innerHeight ? 0.42 : 0);
      if (camera.fov !== BASE_FOV) { camera.fov = BASE_FOV; camera.updateProjectionMatrix(); }
    }
    sfx.engine(0, false, false);
    if (net?.online && mode === 'pvp') { updatePlayer(dt, time); sendState(dt); }
  }
  cockpit.root.visible = state !== 'menu';
  updateTargets(dt, time);
  updateRemotes(dt);
  updateEnemyShots(dt);
  updateMissiles(dt);
  particles.update(dt);
  tracers.update(dt);
  flashes.update(dt);
  speedLines.update(dt, camera.position, state === 'playing' ? P.vel : V());
  drawHUD(dt);
  renderer.render(scene, camera);
}
frame();

window.__hover = { P, input, settings, T, targets, remotes, get state() { return state; } };
