import * as THREE from 'three';
import { buildArena, groundAt, resolveCollisions, rayArena, pointInArena, ARENA_HALF, CEILING } from './arena.js';
import { buildMech, animateMech, FRAMES, glow } from './mech.js';
import { Particles, Tracers, Flashes, SpeedLines } from './fx.js';
import { Sfx } from './audio.js';
import { Net, makeCode } from './net.js';
import { Cockpit } from './cockpit.js';
import { sanitizeLoadout, loadoutSig, loadoutStats, defaultLoadout, MAIN, SIDE, MELEE, HEADS, ARMS, HANDS, BODIES, LEGS, SIZES, MOBILITY, COLORS, ACCENTS, EYES } from './loadout.js';

const $ = id => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);

// ---------- Tuning ----------
const EYE = 10, RAD = 3.5, HGT = 13, HOVER = 1.1, BASE_FOV = 72;
// Player body size (giant armor = 4x)
let PG = 1, PE = EYE, PR = RAD, PH = HGT;
const T = {
  groundAccel: 75, groundMax: 50,
  sprintMax: 128, stridePeriod: 0.36, strideImpulse: 27, strideAngle: 0.42,
  airAccel: 80, airMax: 85, airBoostAccel: 190, airBoostMax: 180,
  qbImpulse: 85, jumpVel: 40,
};

// ---------- Settings ----------
const settings = Object.assign({ sens: 1, invert: false, autoLevel: true, spar: true, frame: 'strider', view: 'cockpit', aim: 1, name: '', muted: false },
  JSON.parse(localStorage.getItem('hovercore') || '{}'));
const saveSettings = () => localStorage.setItem('hovercore', JSON.stringify(settings));
settings.loadout = sanitizeLoadout({ ...defaultLoadout(settings.frame), ...(settings.loadout || {}), frame: settings.frame });
delete settings.view;
// Current loadout stats (hp, speed, main/side/melee weapon tables)
const W = () => loadoutStats(settings.loadout);
function setLoadout(patch) {
  settings.loadout = sanitizeLoadout({ ...settings.loadout, ...patch });
  settings.frame = settings.loadout.frame;
  saveSettings();
  updatePreview();
}
const TP_TIME = 10, TP_COOLDOWN = 10;

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
  reserve: 0, emptyT: 0, meleeCd: 0, swingT: 1, swingArm: 0, lunge: null, extraHit: null, gunIdx: 0, tpT: 0, tpCd: 0,
};


// ---------- Input ----------
const keys = {};
const input = { mx: 0, my: 0, fire: false, rise: false, dive: false, sprintHold: false, sprintToggle: false, autoSprint: false, qb: false, msl: false, melee: false };
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
  if (e.code === 'KeyF') input.melee = true;
  if (e.code === 'KeyV') toggleView();
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
  if (e.button === 1) { e.preventDefault(); input.melee = true; }
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
bindButton('bMelee', () => input.melee = true);
bindButton('bRise', () => input.rise = true, () => input.rise = false, true);
bindButton('bDive', () => input.dive = true, () => input.dive = false);
bindButton('bBoost', () => { input.sprintToggle = !input.sprintToggle; }, null);
$('viewBtn').addEventListener('click', () => toggleView());
// Third person is a timed ability: 10s on, then a 10s cooldown.
function toggleView() {
  if (state !== 'playing') return;
  if (P.tpT > 0) { P.tpT = 0; P.tpCd = TP_COOLDOWN; showMsg('COCKPIT VIEW', 1); return; }
  if (P.tpCd > 0) { showMsg(`3RD-PERSON RECHARGING · ${Math.ceil(P.tpCd)}s`, 1, 'bad'); sfx.beep(); return; }
  P.tpT = TP_TIME; showMsg('THIRD-PERSON VIEW · 10s', 1);
}
function tickView(dt) {
  if (P.tpT > 0) {
    P.tpT -= dt;
    if (P.tpT <= 0) { P.tpT = 0; P.tpCd = TP_COOLDOWN; showMsg('COCKPIT VIEW · 3RD-PERSON RECHARGING', 1.4); }
  } else if (P.tpCd > 0) {
    P.tpCd -= dt;
    if (P.tpCd <= 0) { P.tpCd = 0; showMsg('3RD-PERSON READY', 1, 'good'); }
  }
  const b = $('viewBtn');
  b.textContent = P.tpT > 0 ? '👁 ' + Math.ceil(P.tpT) : P.tpCd > 0 ? Math.ceil(P.tpCd) + 's' : '👁';
  b.classList.toggle('active', P.tpT > 0);
  b.classList.toggle('cool', P.tpCd > 0);
}

// ---------- Stop the mobile browser from zooming the page ----------
// iOS Safari ignores user-scalable=no, so block pinch / double-tap zoom ourselves.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = performance.now();
  if (now - lastTouchEnd < 350 && !e.target.closest?.('input,select,details,summary')) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
// If the page still ends up zoomed (e.g. after focusing a text box), snap it back.
function resetZoom() {
  const vv = window.visualViewport;
  if (!vv || vv.scale <= 1.01) return;
  const meta = document.querySelector('meta[name=viewport]');
  const orig = meta.dataset.orig || (meta.dataset.orig = meta.content);
  // Re-applying initial-scale (with a changed string) makes iOS/Android reset the zoom.
  meta.content = 'width=device-width,initial-scale=1.0,maximum-scale=1.0';
  setTimeout(() => { meta.content = orig; window.scrollTo(0, 0); }, 60);
}
window.visualViewport?.addEventListener('resize', () => { if (state === 'playing') resetZoom(); });
setInterval(() => { if (state === 'playing') resetZoom(); }, 1000);
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
  P.mode = 'ground'; P.blend = 0.45; if (P.vel.y < 0) P.vel.y = 0;
  if (impact > 0.15) { P.shake = Math.max(P.shake, impact * 0.8); sfx.land(impact); dustRing(P.pos.x, P.pos.y - PE, P.pos.z, (26 * impact + 8) * PG); }
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
  obj.userData.swingT = 1;
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
const ai = mechTarget('ai', { frame: 'wraith', head: 'horned', arms: 'two', hands: 'hands', main: 'rifle', side: 'none', melee: 'saber' }, 'SPARRING AI', 100);
Object.assign(ai, { pos: V(0, EYE + HOVER, -520), mode: 'ground', yaw: 0, strideT: 0, side: 1, fireT: 3, burst: 0, burstT: 0,
  orbitDir: 1, wantDist: 180, thinkT: 0, airT: 0, altTarget: 80, qbCd: 0, stuckT: 0 });
targets.push(ai);

// Ammo supply crates (refill reserve + side weapon). Each client has its own.
const crates = [[0, 150], [0, -150], [150, 0], [-150, 0], [380, 380], [-380, -380], [380, -380], [-380, 380]].map(([x, z]) => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(5, 4, 5), new THREE.MeshStandardMaterial({ color: 0x4d5a3a, flatShading: true })));
  for (const y of [-1.2, 1.2]) { const st = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.4, 5.2), glow(0x6bff8a)); st.position.y = y; g.add(st); }
  const y = groundAt(arena.colliders, x, z, 200, 0) + 3.5;
  g.position.set(x, y, z);
  scene.add(g);
  return { g, x, y, z, respawnT: 0 };
});
function updateCrates(dt, time) {
  for (const c of crates) {
    if (c.respawnT > 0) { c.respawnT -= dt; c.g.visible = c.respawnT <= 0; continue; }
    c.g.visible = true;
    c.g.rotation.y += dt * 1.2; c.g.position.y = c.y + Math.sin(time * 2 + c.x) * 0.6;
    if (state !== 'playing' || !P.alive) continue;
    if (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 6.5 + PR && Math.abs(P.pos.y - PE - c.y) < 12 * PG) {
      const ws = W();
      P.reserve = ws.main.reserve; P.ammo = ws.main.mag; P.reloadT = 0; P.msl = ws.side.count;
      c.respawnT = 25; c.g.visible = false;
      particles.burst(c.g.position, 30, 25, 0.6, 0x6bff8a);
      sfx.lock(); showMsg('AMMO RESUPPLIED', 1.2, 'good');
    }
  }
}
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
a.swingT = Math.min(1, (a.swingT ?? 1) + dt / 0.4);
  animateMech(a.obj.userData.rig, { fwd: lv.z, side: lv.x, up: a.vel.y, speed: hs, air: a.mode === 'air', phase: a.phase, boost: hs > 80, dt, aimPitch: Math.atan2(toP.y, fd), swing: { t: a.swingT, arm: 0 } });
  a.center.set(a.pos.x, a.pos.y - EYE + 8, a.pos.z);
  placeShadow(a.shadow, a.pos.x, a.pos.y - EYE, a.pos.z);
  if (a.mode === 'ground' && hs > 30 && Math.random() < 0.5) particles.spawn(a.pos.x + (Math.random() - 0.5) * 4, a.pos.y - EYE + 0.4, a.pos.z + (Math.random() - 0.5) * 4, -a.vel.x * 0.2, 3, -a.vel.z * 0.2, 0.5, 0x7a8c96, 2, 1);

  // Fire bursts at the player
  if (!P.alive || state !== 'playing') return;
  // Close range: lunge and slash with the beam saber
  a.meleeCd = (a.meleeCd ?? 2) - dt;
  if (dist < 40 && a.meleeCd <= 0) { a.meleeCd = 2.6; a.vel.addScaledVector(toP.clone().normalize(), 130); a.swingT = 0; a.pendingHit = 0.22; }
  if (a.pendingHit > 0 && (a.pendingHit -= dt) <= 0) {
    if (a.pos.distanceTo(playerCenter()) < 17 + PR) { takeDamage(10, 'ai', a.pos); slashFx(P.pos.clone().add(V(0, -2, 0)), camera.quaternion, MELEE.saber.color, 0.8); }
  }
  a.fireT -= dt;
  if (a.fireT <= 0 && dist < 520 && hasLOS(a.center, P.pos)) { a.burst = 4; a.burstT = 0; a.fireT = 2.0 + Math.random() * 1.5; }
  if (a.burst > 0 && (a.burstT -= dt) <= 0) {
    a.burst--; a.burstT = 0.13;
    const muzzle = a.obj.userData.rig.muzzle.getWorldPosition(V());
    const speed = 340, tFlight = dist / speed;
    const aim = playerCenter().addScaledVector(P.vel, tFlight * 0.75);
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
      const c = playerCenter();
      const seg = s.m.position.clone().sub(prev), L = seg.length();
      const tt = clamp(c.clone().sub(prev).dot(seg) / (L * L || 1), 0, 1);
      if (prev.clone().addScaledVector(seg, tt).distanceTo(c) < (PG > 1 ? 18 : 5.5)) { takeDamage(s.dmg, s.from, prev); dead = true; particles.burst(s.m.position, 12, 20, 0.3, 0xff7aa8); }
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
function spawnMissile(p, v, target, owner, cosmetic, dmg = 18, size = 1) {
  const m = new THREE.Mesh(mslGeo, mslMat);
  m.position.copy(p); m.scale.setScalar(size);
  scene.add(m);
  missiles.push({ m, v: v.clone(), target, owner, cosmetic, life: 4.5, dmg, size });
}

// Explosive shells (bazooka / shoulder cannon)
const shells = [];
const shellGeo = new THREE.IcosahedronGeometry(0.75, 0);
function spawnShell(p, v, dmg, splash, cosmetic, color = 0xffa040, size = 1) {
  const m = new THREE.Mesh(shellGeo, glow(color));
  m.position.copy(p); m.scale.setScalar(size);
  scene.add(m);
  shells.push({ m, v: v.clone(), dmg, splash, cosmetic, life: 4, color });
}
function updateShells(dt) {
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    s.m.position.addScaledVector(s.v, dt);
    s.v.y -= 6 * dt; s.life -= dt;
    const p = s.m.position;
    particles.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 4, 1, (Math.random() - 0.5) * 4, 0.5, s.color, 2);
    let boom = s.life <= 0 || pointInArena(arena.colliders, p);
    if (!boom) for (const t of liveTargets()) if (t.center.distanceTo(p) < 6.5) { boom = true; break; }
    if (!boom && s.cosmetic && P.alive && p.distanceTo(P.pos) < 6.5) boom = true;
    if (!boom) continue;
    explode(p.clone(), Math.max(0.7, s.splash / 14));
    if (!s.cosmetic) for (const t of liveTargets()) {
      const d = t.center.distanceTo(p), r = s.splash + 4;
      if (d < r) damageTarget(t, Math.round(s.dmg * clamp(1.2 - d / r, 0.4, 1)), p);
    }
    scene.remove(s.m); shells.splice(i, 1);
  }
}

// Close-range slash arcs
const slashes = [];
const slashGeo = new THREE.RingGeometry(5, 7.2, 18, 1, 0, 2.5);
function slashFx(pos, quat, color, size = 1) {
  const m = new THREE.Mesh(slashGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  m.position.copy(pos); m.quaternion.copy(quat); m.rotateZ(-0.4 + Math.random() * 0.8 + (Math.random() < 0.5 ? Math.PI : 0));
  m.scale.setScalar(size);
  scene.add(m);
  slashes.push({ m, t: 0.22 });
}
function updateSlashes(dt) {
  for (let i = slashes.length - 1; i >= 0; i--) {
    const s = slashes[i];
    s.t -= dt;
    s.m.material.opacity = Math.max(0, s.t / 0.22);
    s.m.scale.multiplyScalar(1 + dt * 2.5);
    if (s.t <= 0) { scene.remove(s.m); s.m.material.dispose(); slashes.splice(i, 1); }
  }
}
function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const s = missiles[i];
    s.life -= dt;
    let tgtPos = null;
    if (s.target === 'me') tgtPos = P.alive ? playerCenter() : null;
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
      if (!s.cosmetic && s.target !== 'me') damageTarget(s.target, s.dmg, s.m.position);
    }
    if (boom) { explode(s.m.position.clone(), 0.6 * s.size); scene.remove(s.m); missiles.splice(i, 1); }
  }
}

function camForward() { return V(0, 0, -1).applyQuaternion(P.viewQ); }
const thirdPerson = () => P.tpT > 0;
// Point on the crosshair ray closest to the mech: shots start here so 3rd-person aim matches the reticle.
function aimOrigin() {
  if (!thirdPerson()) return P.pos.clone();
  const f = camForward(), c = camera.position;
  return c.clone().addScaledVector(f, Math.max(0, P.pos.clone().sub(c).dot(f)));
}
function muzzlePos(i = 0) {
  if (thirdPerson() && ownMech && ownMech.visible) {
    ownMech.updateMatrixWorld(true);
    const m = ownMech.userData.rig.muzzles;
    return m[i % m.length].getWorldPosition(V());
  }
  return (i ? V(PG > 1 ? -2.2 : 2.8, PG > 1 ? -2.4 : -3.8, -3.5) : V(2.2, -2.4, -4)).multiplyScalar(PG).applyQuaternion(P.viewQ).add(P.pos);
}
function sideMuzzlePos(i) {
  if (thirdPerson() && ownMech && ownMech.visible) {
    const m = ownMech.userData.rig.sideMuzzles;
    if (m.length) { ownMech.updateMatrixWorld(true); return m[i % m.length].getWorldPosition(V()); }
  }
  return V(i % 2 ? -3 : 3, 1.5, -2).multiplyScalar(PG).applyQuaternion(P.viewQ).add(P.pos);
}
// Where the crosshair is pointing (first wall/target hit)
function aimPoint(ao, dir, range = 900) {
  _ray.set(ao, dir);
  const wall = rayArena(arena.colliders, _ray, range);
  const hit = rayTargets(ao, dir, wall);
  return ao.clone().addScaledVector(dir, hit.t ? hit.dist : wall);
}
// Aim assist: gently pull the view toward a target near the crosshair.
function aimMagnet(dt, f, o, t, ang, cone) {
  if (!t || settings.aim <= 0 || !P.alive || ang > cone || ang < 1e-4) return;
  const sp = P.vel.length();
  if (!(input.fire || sp > 50 || P.locked)) return;
  const k = 1 - ang / cone;
  const step = Math.min(ang, (0.5 + sp / 120) * settings.aim * k * dt);
  if (step <= 1e-5) return;
  const want = t.center.clone().sub(o).normalize();
  if (P.mode === 'ground') {
    const dy = Math.atan2(-want.x, -want.z) - P.yaw, dyw = Math.atan2(Math.sin(dy), Math.cos(dy));
    const dp = Math.atan2(want.y, Math.hypot(want.x, want.z)) - P.pitch;
    const tot = Math.hypot(dyw, dp) || 1;
    P.yaw += dyw / tot * step; P.pitch = clamp(P.pitch + dp / tot * step, -1.45, 1.45);
  } else {
    const full = new THREE.Quaternion().setFromUnitVectors(f, want);
    P.q.premultiply(new THREE.Quaternion().slerp(full, Math.min(1, step / ang))).normalize();
  }
}

function updateWeapons(dt) {
  const ws = W(), M = ws.main, S = ws.side;
  P.fireCd -= dt;
  if (P.reloadT > 0 && (P.reloadT -= dt) <= 0) { const n = Math.min(M.mag - P.ammo, P.reserve); P.ammo += n; P.reserve -= n; }
  if (input.fire && P.ammo <= 0 && P.reserve <= 0 && P.alive && (P.emptyT -= dt) <= 0) { P.emptyT = 1.5; sfx.beep(); showMsg('OUT OF AMMO · FIND A SUPPLY CRATE', 1.4, 'bad'); }
  if (P.msl < S.count && (P.mslT -= dt) <= 0) { P.msl++; P.mslT = S.regen; }

  // Lock-on: closest target to the reticle inside a cone
  const f = camForward(), ao = aimOrigin();
  let cand = null, ca = 0.45;
  for (const t of liveTargets()) {
    const d = t.center.clone().sub(ao), L = d.length();
    if (L > 750) continue;
    const a = f.angleTo(d.divideScalar(L));
    if (a < ca && hasLOS(P.pos, t.center)) { ca = a; cand = t; }
  }
  const cone = (isTouch ? 0.11 : 0.07) * settings.aim; // ~6 deg touch / 4 deg mouse at default
  if (!M.noAssist) aimMagnet(dt, f, ao, cand, ca, cone * 2.2);
  if (cand && cand === P.lock) P.lockT += dt; else { P.lock = cand; P.lockT = 0; }
  const wasLocked = P.locked;
  P.locked = !!P.lock && P.lockT > 0.45;
  if (P.locked && !wasLocked) sfx.lock();

  if (!P.alive) { input.msl = false; return; }
  if (input.fire && P.fireCd <= 0 && P.reloadT <= 0 && P.ammo > 0) {
    // Quad arms dual-wield: faster fire, alternating guns
    P.fireCd = M.rate / (ws.four ? 1.6 : 1); P.ammo--; P.lastShot = performance.now();
    if (P.ammo <= 0 && P.reserve > 0) P.reloadT = M.reload;
    else if (P.ammo <= 0) showMsg('OUT OF AMMO · FIND A SUPPLY CRATE', 1.6, 'bad');
    P.gunIdx = ws.four ? 1 - P.gunIdx : 0;
    const mz = muzzlePos(P.gunIdx);
    // Auto-aim: shots near a target bend onto it (helps hitting at Gundam speeds)
    const assisted = !M.noAssist && cand && ca < cone && cand.center.distanceTo(ao) < (M.range || 900);
    const base = assisted ? cand.center.clone().sub(ao).normalize() : f.clone();
    if (M.shell) {
      const dir = aimPoint(ao, base).sub(mz).normalize();
      const v = dir.multiplyScalar(M.shellSpeed).add(P.vel.clone().multiplyScalar(0.5));
      spawnShell(mz, v, M.dmg, M.splash, false, M.color, 1);
      if (mode === 'pvp') net.sendEvent({ type: 'shell', p: vArr(mz), v: vArr(v), c: M.color, s: 1 });
      P.shake = Math.max(P.shake, 0.4); sfx.missile();
    } else {
      const ends = [];
      const spread = M.pellets > 1 ? M.spread : assisted ? M.spread * 0.3 : M.spread;
      for (let k = 0; k < M.pellets; k++) {
        const dir = base.clone().add(V((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread)).normalize();
        _ray.set(ao, dir);
        const wall = rayArena(arena.colliders, _ray, M.range);
        const hit = rayTargets(ao, dir, wall);
        const end = ao.clone().addScaledVector(dir, hit.t ? hit.dist : wall);
        tracers.add(mz, end, M.color, M.width);
        if (hit.t) { damageTarget(hit.t, M.dmg, end); particles.burst(end, 6, 25, 0.35, 0xffe0a0, 15); }
        else if (wall < M.range) particles.burst(end, 5, 20, 0.4, 0xc8c0a8, 20);
        ends.push(vArr(end));
      }
      particles.burst(mz, 4 + M.pellets, 15, 0.12, 0xffd08a);
      P.shake = Math.max(P.shake, M.dmg >= 20 || M.pellets > 1 ? 0.35 : 0.08);
      if (M.dmg >= 20 || M.pellets > 1) P.fovKick = Math.max(P.fovKick, 4);
      sfx.shot();
      if (mode === 'pvp') net.sendEvent({ type: 'shot', a: vArr(mz), bs: ends, c: M.color, w: M.width });
    }
  }
  if (input.msl) {
    input.msl = false;
    if (S.count && P.msl > 0) {
      const n = Math.min(S.per, P.msl);
      P.msl -= n; if (P.mslT <= 0) P.mslT = S.regen;
      const tgt = P.locked ? P.lock : null;
      for (let i = 0; i < n; i++) {
        const p = sideMuzzlePos(i);
        if (S.shell) {
          const v = aimPoint(ao, tgt ? tgt.center.clone().sub(ao).normalize() : f).sub(p).normalize().multiplyScalar(S.shellSpeed).add(P.vel.clone().multiplyScalar(0.5));
          spawnShell(p, v, S.dmg, S.splash, false, 0xff7a3a, 1.5);
          if (mode === 'pvp') net.sendEvent({ type: 'shell', p: vArr(p), v: vArr(v), c: 0xff7a3a, s: 1.5 });
          P.shake = Math.max(P.shake, 0.6); P.fovKick = Math.max(P.fovKick, 6);
        } else {
          const sp = S.per > 1 ? 40 : 0;
          const v = f.clone().multiplyScalar(90).add(V(0, 25, 0)).add(V((Math.random() - 0.5) * sp, Math.random() * sp * 0.5, (Math.random() - 0.5) * sp)).add(P.vel);
          const size = S.per > 1 ? 0.6 : 1;
          spawnMissile(p, v, tgt, 'me', false, S.dmg, size);
          if (mode === 'pvp') net.sendEvent({ type: 'msl', p: vArr(p), v: vArr(v), target: tgt ? tgt.id : null, d: S.dmg, s: size });
        }
      }
      sfx.missile();
    } else sfx.beep();
  }
}
// Close-range attack: lunge at the nearest target in front and strike.
function updateMelee(dt) {
  const ws = W(), MM = ws.melee;
  P.meleeCd -= dt;
  if (P.swingT < 1) P.swingT = Math.min(1, P.swingT + dt / (ws.meleeKey === 'blades' ? 0.3 : 0.42));
  if (P.extraHit && (P.extraHit.t -= dt) <= 0) {
    const e = P.extraHit; P.extraHit = null;
    if (e.target.alive && e.target.center.distanceTo(P.pos) < 20) meleeHit(e.target, Math.round(MM.dmg * 0.5), false);
  }
  if (input.melee && ws.giant) {
    input.melee = false;
    if (P.alive && P.meleeCd <= 0) {
      P.meleeCd = MM.cd; P.swingT = 0; P.swingArm++;
      const c = playerCenter();
      for (const t of liveTargets()) if (t.center.distanceTo(c) < MM.aoe) meleeHit(t, MM.dmg, false);
      const fp = c.clone().addScaledVector(camForward(), 22);
      slashFx(fp, camera.quaternion, MM.color, 4);
      sfx.slash(); P.shake = Math.max(P.shake, 0.5);
      if (mode === 'pvp') net.sendEvent({ type: 'slash', p: vArr(fp), q: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w], c: MM.color, arm: P.swingArm });
    } else if (P.alive) sfx.beep();
  }
  if (input.melee) {
    input.melee = false;
    if (P.alive && P.meleeCd <= 0) {
      P.meleeCd = MM.cd; P.swingT = 0; P.swingArm++;
      const f = camForward();
      let best = null, ba = 0.7;
      for (const t of liveTargets()) {
        const d = t.center.clone().sub(P.pos), L = d.length();
        if (L > MM.range + 20) continue;
        const a = f.angleTo(d.divideScalar(L));
        if (a < ba && hasLOS(P.pos, t.center)) { ba = a; best = t; }
      }
      if (best) {
        if (P.mode === 'ground' && best.center.y - P.pos.y > 6) { toAir(); P.blend = 0; }
        P.lunge = { t: best, time: 0.3 };
        P.fovKick = Math.max(P.fovKick, 10);
      } else {
        P.vel.addScaledVector(f, 45);
        P.lunge = null;
      }
      slashFx(P.pos.clone().addScaledVector(f, 9), camera.quaternion, MM.color, 0.9);
      sfx.slash();
      P.shake = Math.max(P.shake, 0.2);
      if (mode === 'pvp') net.sendEvent({ type: 'slash', p: vArr(P.pos.clone().addScaledVector(f, 9)), q: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w], c: MM.color, arm: P.swingArm });
    } else if (P.alive) sfx.beep();
  }
  const L = P.lunge;
  if (!L) return;
  L.time -= dt;
  if (!L.t.alive) { P.lunge = null; return; }
  const d = L.t.center.clone().sub(P.pos), dist = d.length();
  P.vel.lerp(d.normalize().multiplyScalar(Math.min(280, dist / 0.1)), 1 - Math.exp(-dt * 20));
  if (dist < 11 || L.time <= 0) {
    P.lunge = null;
    if (dist < 17) {
      meleeHit(L.t, MM.dmg, true);
      if (ws.four) P.extraHit = { t: 0.13, target: L.t };
    }
  }
}
function meleeHit(t, dmg, first) {
  const MM = W().melee;
  damageTarget(t, dmg, t.center);
  slashFx(t.center.clone(), camera.quaternion, MM.color, 1.2);
  particles.burst(t.center, 30, 40, 0.5, MM.color, 5);
  flashes.add(t.center, 4, MM.color, 0.2);
  P.shake = Math.max(P.shake, 0.6);
  sfx.boom(0.25);
  if (first) P.vel.multiplyScalar(0.2);
  if (t.vel && t.kind === 'ai') t.vel.addScaledVector(t.center.clone().sub(P.pos).normalize(), 70);
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
  P.pos.set(sp.x, PE + HOVER, sp.z); P.vel.set(0, 0, 0);
  P.yaw = sp.yaw; P.pitch = 0; P.mode = 'ground'; groundQuat(P.viewQ);
  P.hp = P.maxHp; P.energy = 100; P.overheat = false; P.alive = true;
  P.ammo = W().main.mag; P.reserve = W().main.reserve; P.reloadT = 0; P.msl = W().side.count; P.invuln = 2; P.lunge = null;
  $('dead').classList.remove('show');
}

// ---------- Player movement ----------
const _wish = V(), _hv = V();
function updatePlayer(dt, time) {
  const ws0 = W(), fs = ws0.speed, bs = ws0.boost;
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
        const gain = T.strideImpulse * fs * clamp(1.45 - spd / (T.sprintMax * fs * bs), 0.25, 1.45);
        P.vel.addScaledVector(dir, gain);
        P.energy -= 3.2 * W().drain;
        P.rollKick = P.strideSide * 0.07;
        P.shake = Math.max(P.shake, 0.12);
        sfx.stride();
        const side = V(Math.cos(P.yaw), 0, -Math.sin(P.yaw)).multiplyScalar(P.strideSide * 2.5);
        for (let i = 0; i < 14; i++) particles.spawn(P.pos.x + side.x, P.pos.y - PE + 0.4, P.pos.z + side.z, -dir.x * 30 + (Math.random() - 0.5) * 16, 2 + Math.random() * 5, -dir.z * 30 + (Math.random() - 0.5) * 16, 0.6, 0x9fd8ff, 2.5, 3);
      }
      P.vel.addScaledVector(_wish, 32 * fs * dt);
      P.phase += dt * Math.PI / T.stridePeriod;
      max = T.sprintMax * fs * bs;
      P.energy += 6 * dt;
    } else {
      P.strideT = Math.min(P.strideT, 0.05);
      P.vel.addScaledVector(_wish, T.groundAccel * fs * dt);
      P.phase += dt * spd / 14;
      max = T.groundMax * fs;
      P.energy += 30 * W().regen * dt;
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
    if (hs > max && !P.lunge) _hv.multiplyScalar(Math.exp(-dt * 2.6 * (hs - max) / max));
    P.vel.x = _hv.x; P.vel.z = _hv.z;
    // Hover spring
    const feet = P.pos.y - PE;
    const g = groundAt(arena.colliders, P.pos.x, P.pos.z, feet, PR * 0.6, 4 * PG);
    if (feet - g > 7) toAir();
    else P.vel.y += ((g + HOVER + Math.sin(time * 3) * 0.12 - feet) * 70 - P.vel.y * 12) * dt;
    // Jump / take off
    if (input.riseHeld && P.mode === 'ground' && !P.overheat && P.energy > 6) {
      P.vel.y = Math.max(P.vel.y, T.jumpVel * W().jump); P.energy -= 4 * W().drain;
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
    // While boosting you fly where you look: look down to dive, up to climb.
    const autoFwd = wantSprint && Math.abs(mx) < 0.1 && !vert ? 1 : 0;
    const fwdIn = Math.abs(my) > 0.05 ? my : autoFwd;
    const fy = f.y;
    const thrust = f.multiplyScalar(fwdIn).addScaledVector(r, mx).addScaledVector(u, vert);
    if (thrust.length() > 1) thrust.normalize();
    P.boosting = wantSprint && thrust.length() > 0.1;
    const acc = (P.boosting ? T.airBoostAccel * bs : T.airAccel) * fs * W().air * (P.overheat ? 0.2 : 1);
    P.vel.addScaledVector(thrust, acc * dt);
    P.vel.y -= (P.overheat ? 30 : thrust.length() > 0.1 ? 3 : 12) * dt;
    if (P.boosting && fwdIn > 0 && fy < -0.25) P.vel.y += fy * 45 * dt; // dive assist
    P.vel.multiplyScalar(Math.exp(-0.45 * dt));
    const max = (P.boosting ? T.airBoostMax * bs : T.airMax) * fs * W().air, s = P.vel.length();
    if (s > max && !P.lunge) P.vel.multiplyScalar(Math.exp(-dt * 2.6 * (s - max) / max));
    // Flight always burns fuel; boosting/climbing burns much more.
    P.energy -= dt * (1.5 + (P.boosting ? 14 : 0) + (input.riseHeld ? 4 : 0)) * W().drain;
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
      P.energy -= 14 * W().drain * W().qbCost; P.qbCd = 0.45 * W().qbCd;
      P.shake = Math.max(P.shake, 0.55); P.fovKick = 14;
      sfx.boost();
      for (let i = 0; i < 40; i++) particles.spawn(P.pos.x - dir.x * 6, P.pos.y - 4, P.pos.z - dir.z * 6, -dir.x * 80 + (Math.random() - 0.5) * 30, -dir.y * 80 + (Math.random() - 0.5) * 30, -dir.z * 80 + (Math.random() - 0.5) * 30, 0.4, 0x9fe8ff, 3);
    } else sfx.beep();
  }

  // Generator
  if (P.energy <= 0 && !P.overheat) { P.overheat = true; sfx.warn(); showMsg('GENERATOR OVERHEAT', 1.5, 'bad'); }
  P.energy = clamp(P.energy, 0, 100);
  if (P.overheat && P.energy >= 25) P.overheat = false;

  // Integrate with sub-steps for solid collisions at high speed
  const steps = Math.max(1, Math.ceil(P.vel.length() * dt / 2.5));
  const vyBefore = P.vel.y;
  let landed = false;
  for (let i = 0; i < steps; i++) {
    P.pos.addScaledVector(P.vel, dt / steps);
    if (resolveCollisions(arena.colliders, P.pos, PE, PR, PH, P.vel)) landed = true;
  }
  P.pos.x = clamp(P.pos.x, -ARENA_HALF + PR, ARENA_HALF - PR);
  P.pos.z = clamp(P.pos.z, -ARENA_HALF + PR, ARENA_HALF - PR);
  if (P.pos.y > CEILING) { P.pos.y = CEILING; P.vel.y = Math.min(0, P.vel.y); }
  const feet = P.pos.y - PE;
  if (feet < 0) { P.pos.y = PE; if (P.vel.y < 0) P.vel.y = 0; landed = true; }
  if (P.mode === 'air') {
    const g = groundAt(arena.colliders, P.pos.x, P.pos.z, feet, PR * 0.6, 4 * PG);
    if ((landed || feet <= g + HOVER + 0.4) && P.vel.y <= 2 && !input.riseHeld) {
      // Boost-dive into the ground: convert the drop into skating speed
      if (vyBefore < -15 && input.sprintHold) {
        const fyaw = facingYaw(), h = V(P.vel.x, 0, P.vel.z);
        const dirH = h.lengthSq() > 25 ? h.normalize() : V(-Math.sin(fyaw), 0, -Math.cos(fyaw));
        P.vel.addScaledVector(dirH, Math.min(70, -vyBefore * 0.6));
        dustRing(P.pos.x, feet, P.pos.z, 30);
      }
      toGround(clamp(-vyBefore / 45, 0, 1) * (input.sprintHold ? 0.5 : 1));
    }
  }
}

// ---------- Camera ----------
const _tq = new THREE.Quaternion();
let ownMech = null, camThird = 24;
function rebuildOwnMech() {
  if (ownMech) scene.remove(ownMech);
  ownMech = buildMech(settings.loadout);
  ownMech.visible = false;
  scene.add(ownMech);
}
function poseOwnMech(dt, show) {
  if (!ownMech) return;
  ownMech.visible = show && P.alive && camThird > 6;
  if (!ownMech.visible) return;
  const yaw = facingYaw() + Math.PI, f = camForward();
  const tilt = P.mode === 'air' ? -Math.asin(clamp(f.y, -1, 1)) * 0.7 : 0;
  ownMech.position.set(P.pos.x, P.pos.y - PE, P.pos.z);
  ownMech.rotation.set(tilt, yaw, P.mode === 'ground' ? -P.roll * 1.5 : 0, 'YXZ');
  const lv = P.vel.clone().applyAxisAngle(AY, -yaw);
  animateMech(ownMech.userData.rig, { fwd: lv.z, side: lv.x, up: P.vel.y, speed: Math.hypot(P.vel.x, P.vel.z), air: P.mode === 'air', phase: P.phase, boost: P.boosting, dt, aimPitch: P.mode === 'ground' ? P.pitch : 0, swing: { t: P.swingT, arm: P.swingArm } });
}
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
  const tp = thirdPerson();
  if (tp) {
    // Chase camera behind and above the mech, pulled in front of walls.
    const pivot = P.pos.clone().add(V(0, 1.5, 0));
    const back = V(6.5, 4.5, 24 + clamp(sp / 200, 0, 1) * 6).multiplyScalar(PG).applyQuaternion(P.viewQ); // over the right shoulder
    const L = back.length();
    _ray.set(pivot, back.clone().divideScalar(L));
    const hitD = rayArena(arena.colliders, _ray, L + 2);
    camThird = Math.min(L, hitD - 2.5);
    camera.position.copy(pivot).addScaledVector(back, Math.max(3, camThird) / L);
    if (camera.position.y < 1.5) camera.position.y = 1.5;
  } else if (P.mode === 'ground') camera.position.y += Math.sin(P.phase * 2) * 0.12 * clamp(sp / 80, 0, 1);
  poseOwnMech(dt, tp);
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
  placeShadow(P.shadow, P.pos.x, P.pos.y - PE, P.pos.z, P.alive);
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
        const lo = sanitizeLoadout(s.lo || { frame: s.f });
        const sig = loadoutSig(lo);
        if (r && r.sig !== sig) { removeRemote(s.id); r = null; }
        if (!r) {
          r = mechTarget('remote', lo, '', 100);
          r.g = lo.size === 'giant' ? 4 : 1;
          if (r.g > 1) { r.spheres = MECH_SPHERES.map(q => ({ y: q.y * r.g, r: q.r * r.g })); r.shadow.userData.size = 9 * r.g; }
          r.id = s.id; r.sig = sig; r.pos = V(...s.p); r.net = V(...s.p); r.netVel = V(); r.yaw = 0; r.swingT = 1; r.swingArm = 0;
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
        const ends = Array.isArray(e.bs) ? e.bs.slice(0, 12) : Array.isArray(e.b) ? [e.b] : [];
        for (const b of ends) if (Array.isArray(b)) tracers.add(V(...e.a), V(...b), Number.isInteger(e.c) ? e.c : 0xff9a7a, clamp(+e.w || 1.3, 0.5, 3));
        const d = V(...e.a).distanceTo(P.pos);
        sfx.enemyShot(clamp(0.3 - d / 2000, 0.02, 0.3));
      } else if (e.type === 'msl' && Array.isArray(e.p) && e.from !== net.id) {
        const tgt = e.target === net.id ? 'me' : remotes.get(e.target) || null;
        spawnMissile(V(...e.p), V(...e.v), tgt, e.from, true, 0, clamp(+e.s || 1, 0.4, 1.5));
        if (tgt === 'me') { showMsg('⚠ MISSILE INCOMING', 1.2, 'bad'); sfx.warn(); }
      } else if (e.type === 'shell' && Array.isArray(e.p) && e.from !== net.id) {
        spawnShell(V(...e.p), V(...e.v), 0, clamp(+e.s || 1, 0.5, 2) * 12, true, Number.isInteger(e.c) ? e.c : 0xffa040, clamp(+e.s || 1, 0.5, 2));
      } else if (e.type === 'slash' && Array.isArray(e.p) && e.from !== net.id) {
        const r = remotes.get(e.from);
        if (r) { r.swingT = 0; r.swingArm = +e.arm || 0; }
        if (Array.isArray(e.q)) slashFx(V(...e.p), new THREE.Quaternion(...e.q).normalize(), Number.isInteger(e.c) ? e.c : 0xff6ab0, 0.9);
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
    r.obj.position.set(r.pos.x, r.pos.y - EYE * r.g, r.pos.z);
    r.obj.rotation.y = r.yaw + Math.PI;
    const lv = r.netVel.clone().applyAxisAngle(AY, -(r.yaw + Math.PI));
    const hs = Math.hypot(r.netVel.x, r.netVel.z);
    r.phase += r.air ? dt : (r.boost ? dt * Math.PI / T.stridePeriod : dt * hs / 14);
r.swingT = Math.min(1, r.swingT + dt / 0.4);
    animateMech(r.obj.userData.rig, { fwd: lv.z, side: lv.x, up: r.netVel.y, speed: hs, air: r.air, phase: r.phase, boost: r.boost, dt, aimPitch: r.pitch, swing: { t: r.swingT, arm: r.swingArm } });
    r.center.set(r.pos.x, r.pos.y - EYE * r.g + 8 * r.g, r.pos.z);
    placeShadow(r.shadow, r.pos.x, r.pos.y - EYE * r.g, r.pos.z, r.alive);
  }
}
let sendT = 0;
function sendState(dt) {
  if (!net?.online || (sendT -= dt) > 0) return;
  sendT = 1 / 15;
  const f = forwardOf(P.viewQ);
  net.sendState({
    n: myName(), f: settings.frame, lo: settings.loadout, p: vArr(P.pos), v: vArr(P.vel), y: facingYaw(), pi: Math.round(Math.asin(clamp(f.y, -1, 1)) * 100) / 100,
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
  // Supply crate markers (shown when running low)
  if (P.reserve < loadoutStats(settings.loadout).main.mag) {
    hg.font = '600 11px "Share Tech Mono", monospace'; hg.textAlign = 'center';
    for (const c of crates) {
      if (!c.g.visible) continue;
      const cp = V(c.x, c.y, c.z), d = cp.clone().sub(P.pos);
      if (d.dot(f) <= 0) continue;
      const sc = project(cp);
      if (!sc) continue;
      hg.strokeStyle = hg.fillStyle = '#6bff8a'; hg.lineWidth = 1.5;
      hg.beginPath(); hg.moveTo(sc.x, sc.y - 9); hg.lineTo(sc.x + 9, sc.y); hg.lineTo(sc.x, sc.y + 9); hg.lineTo(sc.x - 9, sc.y); hg.closePath(); hg.stroke();
      hg.fillText(`AMMO ${Math.round(d.length())}m`, sc.x, sc.y - 14);
    }
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
  $('alt').textContent = Math.round(Math.max(0, P.pos.y - PE));
  $('armorFill').style.width = (P.hp / P.maxHp * 100) + '%';
  $('armorFill').classList.toggle('low', P.hp / P.maxHp < 0.3);
  $('enFill').style.width = P.energy + '%';
  $('enFill').classList.toggle('hot', P.overheat);
  const ws = loadoutStats(settings.loadout);
  $('mainName').textContent = ws.main.name;
  $('ammoTxt').textContent = P.reloadT > 0 ? 'RELOAD' : P.ammo + '/' + P.reserve;
  $('bFire').classList.toggle('empty', P.ammo <= 0 && P.reserve <= 0);
  $('sideName').textContent = ws.side.count ? ws.side.name : '';
  $('mslTxt').textContent = ws.side.count ? (ws.side.count <= 4 ? '▮'.repeat(P.msl) + '▯'.repeat(ws.side.count - P.msl) : P.msl + '/' + ws.side.count) : '';
  $('meleeTxt').textContent = P.meleeCd > 0 ? '…' : 'READY';
  $('meleeName').textContent = ws.melee.name;
  $('bMelee').style.setProperty('--cd', clamp(P.meleeCd / ws.melee.cd, 0, 1));
  $('bMsl').textContent = ws.side.count ? (ws.side.shell ? 'CNN' : 'MSL') : '—';
  $('modeTxt').textContent = P.mode === 'air' ? (P.boosting ? 'FLIGHT · BOOST' : 'FLIGHT') : (P.sprinting ? 'SKATE · BOOST' : 'HOVER');
  $('reticle').classList.toggle('locked', P.locked);
  dmgFlash = Math.max(0, dmgFlash - dt * 1.5);
  $('dmgFlash').style.opacity = dmgFlash;
  $('boostFx').style.opacity = P.boosting ? clamp(sp / 200, 0.2, 0.9) : P.fovKick / 14;

  // Cockpit screens at ~10Hz
  if ((screenT -= dt) <= 0) {
    screenT = 0.1;
    const blips = [];
    for (const c of crates) if (c.g.visible) blips.push({ dx: c.x - P.pos.x, dz: c.z - P.pos.z, c: '#6bff8a', air: false });
    for (const t of liveTargets()) blips.push({ dx: t.center.x - P.pos.x, dz: t.center.z - P.pos.z, c: t.kind === 'remote' || t.kind === 'ai' ? '#ff5a5a' : '#ffd36a', air: t.kind === 'drone' || t.air || (t.mode === 'air') });
    cockpit.draw({ yaw: facingYaw(), blips, hp: P.hp, maxHp: P.maxHp, energy: P.energy, overheat: P.overheat, mode: P.mode === 'air' ? 'FLIGHT' : 'HOVER', alt: P.pos.y - PE,
      ammo: P.ammo, reloading: P.reloadT > 0, msl: P.msl, mslMax: ws.side.count, locked: P.locked, frame: FRAMES[settings.frame].name,
      mainName: ws.main.name, sideName: ws.side.name, meleeName: ws.melee.name, meleeReady: P.meleeCd <= 0 });
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
    b.onclick = () => { setLoadout(defaultLoadout(k)); buildFramePicker(); };
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
function playerCenter() { return V(P.pos.x, P.pos.y - PE + 8 * PG, P.pos.z); }
function applyFrameStats() {
  P.maxHp = W().hp;
  const g = W().g, oldPE = PE;
  PG = g; PE = EYE * g; PR = RAD * g; PH = HGT * g;
  P.pos.y += PE - oldPE;
  P.shadow.userData.size = 10 * g;
  P.hp = Math.min(P.hp, P.maxHp);
}
function begin() {
  sfx.start();
  applyFrameStats();
  rebuildOwnMech();
  P.tpT = 0; P.tpCd = 0;
  respawn();
  P.kills = 0; P.deaths = 0;
  for (const t of targets) { t.alive = true; t.hp = t.maxHp; }
  if (mode === 'training') { respawnTarget(ai); $('modeTag').textContent = 'TRAINING ARENA'; }
  resume();
  if (mode === 'training') {
    const tips = isTouch
      ? ['LEFT THUMB: MOVE · RIGHT: LOOK', 'PUSH STICK TO EDGE OR TAP BOOST TO SKATE-SPRINT', 'HOLD RISE TO FLY — LOOK ANYWHERE', 'QB = INSTANT DASH · ⚔ = CLOSE-RANGE LUNGE', '👁 = THIRD PERSON FOR 10s']
      : ['WASD MOVE · MOUSE LOOK', 'HOLD SHIFT TO SKATE-SPRINT', 'HOLD SPACE TO FLY — LOOK ANYWHERE', 'Q = QUICK BOOST · E / RMB = SIDE WEAPON', 'F / MIDDLE CLICK = CLOSE-RANGE LUNGE · V = 3RD PERSON 10s'];
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
$('btnResume').onclick = () => { applyFrameStats(); if (ownMech?.userData.rig.sig !== loadoutSig(settings.loadout)) rebuildOwnMech(); resume(); };
$('btnLeave').onclick = () => { if (mode === 'pvp') leaveMatch(); else showMenu(false); };
$('pilotName').value = settings.name;
$('pilotName').oninput = e => { settings.name = e.target.value.slice(0, 16).toUpperCase(); saveSettings(); };
$('roomCode').oninput = e => { e.target.value = e.target.value.toUpperCase(); };
$('sens').value = settings.sens; $('sens').oninput = e => { settings.sens = +e.target.value; saveSettings(); };
$('invert').checked = settings.invert; $('invert').onchange = e => { settings.invert = e.target.checked; saveSettings(); };
$('autoLevel').checked = settings.autoLevel; $('autoLevel').onchange = e => { settings.autoLevel = e.target.checked; saveSettings(); };
$('aim').value = settings.aim; $('aim').oninput = e => { settings.aim = +e.target.value; saveSettings(); };
$('spar').checked = settings.spar; $('spar').onchange = e => { settings.spar = e.target.checked; saveSettings(); };
$('controlsHelp').innerHTML = isTouch
  ? 'Left thumb: move (push to the edge to skate-sprint) · Right thumb: look · FIRE can be dragged to aim · RISE to fly · While boosting you fly where you look: look down to dive · ⚔ close-range lunge · 👁 third person for 10s (10s cooldown)'
  : 'WASD move · Mouse look · Shift skate-sprint / air boost · Space rise / fly · Ctrl or C dive · V third person (10s, 10s cooldown) · Q quick boost · LMB fire · E / RMB side weapon · F / MMB close-range · R reset · M mute';
buildFramePicker();

const HANGAR = [
  ['SIZE', 'size', SIZES], ['FRAME', 'frame', FRAMES], ['HEAD', 'head', HEADS], ['BODY', 'body', BODIES], ['LEGS', 'legs', LEGS], ['MOBILITY', 'mobility', MOBILITY], ['ARMS', 'arms', ARMS], ['HANDS', 'hands', HANDS],
  ['MAIN WEAPON', 'main', MAIN], ['SIDE WEAPON', 'side', SIDE], ['CLOSE RANGE', 'melee', MELEE],
];
const hex = c => '#' + c.toString(16).padStart(6, '0');
function buildHangar() {
  const lo = settings.loadout, body = $('hangarBody');
  body.innerHTML = '';
  for (const [title, key, table] of HANGAR) {
    const sec = document.createElement('div'); sec.className = 'sec';
    sec.innerHTML = `<h3>${title}</h3>`;
    const row = document.createElement('div'); row.className = 'opts';
    const giantLock = lo.size === 'giant' && ['body', 'legs', 'mobility', 'arms', 'hands', 'main', 'side', 'melee'].includes(key);
    const locked = giantLock || (key === 'melee' && lo.hands === 'blades');
    for (const [k, o] of Object.entries(table)) {
      if ((key === 'melee' && k === 'blades') || o.hidden) continue;
      const b = document.createElement('button');
      b.className = 'opt' + (lo[key] === k && !locked ? ' sel' : '');
      b.disabled = locked;
      b.innerHTML = `<b>${o.name}</b><small>${o.desc || ''}</small>`;
      b.onclick = () => { setLoadout({ [key]: k }); if (key === 'melee' || key === 'hands' || key === 'arms') { preview.swingT = 0; preview.demoT = 3.5; } buildHangar(); };
      row.appendChild(b);
    }
    sec.appendChild(row);
    if (giantLock) sec.insertAdjacentHTML('beforeend', '<p class="note">Giant armor uses its own artillery loadout.</p>');
    else if (locked) sec.insertAdjacentHTML('beforeend', '<p class="note">Blade hands use their built-in ARM BLADES.</p>');
    body.appendChild(sec);
  }
  for (const [title, key, list] of [['MAIN COLOR', 'color', COLORS], ['ACCENT COLOR', 'accent', ACCENTS], ['EYE COLOR', 'eye', EYES]]) {
    const sec = document.createElement('div'); sec.className = 'sec';
    sec.innerHTML = `<h3>${title}</h3>`;
    const row = document.createElement('div'); row.className = 'swatches';
    const def = document.createElement('button');
    def.className = 'sw def' + (lo[key] == null ? ' sel' : ''); def.textContent = 'AUTO';
    def.onclick = () => { setLoadout({ [key]: null }); buildHangar(); };
    row.appendChild(def);
    for (const c of list) {
      const b = document.createElement('button');
      b.className = 'sw' + (lo[key] === c ? ' sel' : '');
      b.style.background = hex(c);
      b.onclick = () => { setLoadout({ [key]: c }); buildHangar(); };
      row.appendChild(b);
    }
    sec.appendChild(row);
    body.appendChild(sec);
  }
  const st = loadoutStats(lo);
  const dps = Math.round(st.main.dmg * (st.main.pellets || 1) / st.main.rate * (st.four ? 1.6 : 1));
  $('hangarStats').innerHTML = `<span>ARMOR <b>${st.hp}</b></span><span>SPEED <b>${Math.round(st.speed * 100)}%</b></span><span>MAIN DPS <b>${dps}</b></span><span>SIDE <b>${st.side.count ? st.side.dmg + '×' + st.side.count : '—'}</b></span><span>MELEE <b>${st.melee.dmg}${st.four ? '+' + Math.round(st.melee.dmg * 0.5) : ''}</b></span>`;
}
$('btnHangar').onclick = () => { $('menu').classList.add('hangar'); buildHangar(); };
$('hangarDone').onclick = () => { $('menu').classList.remove('hangar'); buildFramePicker(); };
$('hangarReset').onclick = () => { setLoadout(defaultLoadout(settings.loadout.frame)); buildHangar(); };
if (new URLSearchParams(location.search).get('room')) $('roomCode').value = new URLSearchParams(location.search).get('room').toUpperCase().slice(0, 4);

// Spinning mech preview behind the menu
const preview = { obj: null, swingT: 1, demoT: 0 };
function updatePreview() {
  if (preview.obj) scene.remove(preview.obj);
  preview.obj = buildMech(settings.loadout);
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
    tickView(dt);
    updateMelee(dt);
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
if ($('menu').classList.contains('hangar') && (preview.demoT -= dt) <= 0) { preview.demoT = 3.5; preview.swingT = 0; }
      preview.swingT = Math.min(1, preview.swingT + dt / 0.5);
      animateMech(preview.obj.userData.rig, { fwd: 0, side: 0, up: 0, speed: 0, air: false, phase: time, boost: false, dt, aimPitch: 0, swing: { t: preview.swingT, arm: Math.floor(time / 3.5) } });
      const pg = settings.loadout.size === 'giant' ? 3.6 : 1;
      camera.position.set(Math.sin(a) * 26 * pg, (9 + Math.sin(time * 0.3) * 2) * pg, 470 + Math.cos(a) * 26 * pg);
      camera.lookAt(0, 7 * pg, 470);
      camera.rotateY(innerWidth > innerHeight ? 0.42 : 0);
      if (camera.fov !== BASE_FOV) { camera.fov = BASE_FOV; camera.updateProjectionMatrix(); }
    }
    sfx.engine(0, false, false);
    if (net?.online && mode === 'pvp') { updatePlayer(dt, time); sendState(dt); }
  }
  cockpit.root.visible = state !== 'menu' && !thirdPerson();
  if (ownMech && state === 'menu') ownMech.visible = false;
  updateTargets(dt, time);
  updateCrates(dt, time);
  updateRemotes(dt);
  updateEnemyShots(dt);
  updateMissiles(dt);
  updateShells(dt);
  updateSlashes(dt);
  particles.update(dt);
  tracers.update(dt);
  flashes.update(dt);
  speedLines.update(dt, camera.position, state === 'playing' ? P.vel : V());
  drawHUD(dt);
  renderer.render(scene, camera);
}
frame();

window.__hover = { P, input, settings, T, targets, remotes, W, setLoadout, buildMech, scene, get state() { return state; } };
