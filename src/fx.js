// Pooled visual effects: particles, tracers, flashes, speed lines.
import * as THREE from 'three';

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Particles {
  constructor(scene, max = 1600) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.data = Array.from({ length: max }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, drag: 1, grav: 0 }));
    this.pos.fill(-99999);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.2, map: dotTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.i = 0;
  }
  spawn(x, y, z, vx, vy, vz, life, color, drag = 1, grav = 0) {
    const i = this.i = (this.i + 1) % this.max;
    const d = this.data[i];
    d.life = d.max = life; d.vx = vx; d.vy = vy; d.vz = vz; d.drag = drag; d.grav = grav;
    d.r = ((color >> 16) & 255) / 255; d.g = ((color >> 8) & 255) / 255; d.b = (color & 255) / 255;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
  }
  burst(p, n, speed, life, color, grav = 0, spread = 1) {
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), v = speed * (0.3 + Math.random() * 0.7);
      this.spawn(p.x, p.y, p.z, Math.cos(th) * s * v * spread, u * v, Math.sin(th) * s * v * spread, life * (0.5 + Math.random() * 0.5), color, 2.5, grav);
    }
  }
  update(dt) {
    const P = this.pos, C = this.col;
    for (let i = 0; i < this.max; i++) {
      const d = this.data[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { P[i * 3 + 1] = -99999; C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = 0; continue; }
      const f = Math.exp(-d.drag * dt);
      d.vx *= f; d.vy = d.vy * f - d.grav * dt; d.vz *= f;
      P[i * 3] += d.vx * dt; P[i * 3 + 1] += d.vy * dt; P[i * 3 + 2] += d.vz * dt;
      const a = d.life / d.max;
      C[i * 3] = d.r * a; C[i * 3 + 1] = d.g * a; C[i * 3 + 2] = d.b * a;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
export class Tracers {
  constructor(scene, n = 48) {
    const geo = new THREE.CylinderGeometry(0.12, 0.12, 1, 4, 1, true);
    geo.translate(0, 0.5, 0);
    this.items = Array.from({ length: n }, () => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffc37a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false;
      scene.add(m);
      return { m, t: 0, max: 0.1 };
    });
    this.i = 0;
  }
  add(a, b, color = 0xffc37a, width = 1, life = 0.09) {
    const it = this.items[this.i = (this.i + 1) % this.items.length];
    const d = b.clone().sub(a), len = d.length();
    it.m.position.copy(a);
    it.m.quaternion.setFromUnitVectors(UP, d.divideScalar(len || 1));
    it.m.scale.set(width, len, width);
    it.m.material.color.setHex(color);
    it.m.visible = true; it.t = it.max = life;
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.m.visible) continue;
      it.t -= dt;
      if (it.t <= 0) it.m.visible = false;
      else it.m.material.opacity = it.t / it.max;
    }
  }
}

export class Flashes {
  constructor(scene, n = 24) {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    this.items = Array.from({ length: n }, () => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffaa55, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      return { m, t: 0, max: 1, size: 1 };
    });
    this.i = 0;
  }
  add(p, size, color = 0xffaa55, life = 0.35) {
    const it = this.items[this.i = (this.i + 1) % this.items.length];
    it.m.position.copy(p); it.m.material.color.setHex(color);
    it.m.visible = true; it.t = it.max = life; it.size = size;
    it.m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.m.visible) continue;
      it.t -= dt;
      if (it.t <= 0) { it.m.visible = false; continue; }
      const k = 1 - it.t / it.max;
      it.m.scale.setScalar(it.size * (0.4 + k));
      it.m.material.opacity = 1 - k;
    }
  }
}

// Streaks around the camera that stretch along velocity: sells the speed.
export class SpeedLines {
  constructor(scene, n = 90) {
    this.n = n;
    this.pts = Array.from({ length: n }, () => new THREE.Vector3(1e5, 0, 0));
    this.arr = new Float32Array(n * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.arr, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this._d = new THREE.Vector3();
  }
  update(dt, camPos, vel) {
    const sp = vel.length();
    const k = THREE.MathUtils.clamp((sp - 55) / 90, 0, 1);
    this.mat.opacity = k * 0.55;
    if (k <= 0) { this.lines.visible = false; return; }
    this.lines.visible = true;
    const dir = this._d.copy(vel).divideScalar(sp || 1);
    const len = sp * 0.06;
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[i];
      const rel = p.clone().sub(camPos);
      const along = rel.dot(dir);
      const radial = rel.clone().addScaledVector(dir, -along).length();
      if (along < -10 || along > 140 || radial > 45 || radial < 6) {
        // respawn ahead in a tube around the flight path
        const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 34;
        const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
        const up2 = new THREE.Vector3().crossVectors(side, dir);
        p.copy(camPos).addScaledVector(dir, 40 + Math.random() * 100).addScaledVector(side, Math.cos(a) * r).addScaledVector(up2, Math.sin(a) * r);
      }
      this.arr.set([p.x, p.y, p.z, p.x - dir.x * len, p.y - dir.y * len, p.z - dir.z * len], i * 6);
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
