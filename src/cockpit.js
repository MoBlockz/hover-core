// First-person cockpit: canopy frame, dashboard and live canvas screens, attached to the camera.
import * as THREE from 'three';

function screen(w, h, px = 256) {
  const c = document.createElement('canvas');
  c.width = px; c.height = Math.round(px * h / w);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false }));
  return { c, g: c.getContext('2d'), tex, mesh };
}

export class Cockpit {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.rig = new THREE.Group(); // receives sway/inertia offsets
    this.root.add(this.rig);
    camera.add(this.root);
    const metal = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.55, metalness: 0.6, flatShading: true, fog: false });
    const metal2 = new THREE.MeshStandardMaterial({ color: 0x3d444b, roughness: 0.6, metalness: 0.5, flatShading: true, fog: false });
    const olive = new THREE.MeshStandardMaterial({ color: 0x46533a, roughness: 0.7, metalness: 0.3, flatShading: true, fog: false });
    this.mats = { metal, metal2, olive };
    const led = (c) => new THREE.MeshBasicMaterial({ color: c, fog: false, toneMapped: false });
    this.ledMats = [led(0x48ffd0), led(0xffb02e), led(0xff4a4a)];

    // Parts get positioned in layout() so the frame hugs the screen edges at any aspect ratio.
    this.top = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), metal);
    this.topLip = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), olive);
    this.pillars = [-1, 1].map(() => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), metal));
    this.struts = [-1, 1].map(() => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), metal2));
    this.dashGroup = new THREE.Group();
    this.dash = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), metal);
    this.dashLip = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), olive);
    this.sideConsoles = [-1, 1].map(() => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), metal2));
    for (const m of [this.top, this.topLip, ...this.pillars, ...this.struts, this.dashLip, ...this.sideConsoles, this.dashGroup]) this.rig.add(m);
    this.dashGroup.add(this.dash);

    this.radar = screen(0.3, 0.3, 256);
    this.status = screen(0.36, 0.2, 256);
    this.weapons = screen(0.36, 0.2, 256);
    for (const s of [this.radar, this.status, this.weapons]) this.dashGroup.add(s.mesh);

    this.leds = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.009, 0.004), this.ledMats[i % 3]);
      this.dashGroup.add(m); this.leds.push(m);
    }
    this.sticks = [-1, 1].map(s => {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.16, 6), metal2);
      shaft.position.y = 0.08;
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.09, 6), olive);
      grip.position.y = 0.17; grip.rotation.x = 0.2;
      const btn = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.008, 0.016), this.ledMats[s < 0 ? 0 : 2]);
      btn.position.set(0, 0.218, 0.006);
      g.add(shaft, grip, btn);
      this.rig.add(g);
      return g;
    });
    this.layout();
  }

  layout() {
    const cam = this.camera;
    const d = 0.6; // depth of the frame plane
    const hh = Math.tan(THREE.MathUtils.degToRad(cam.userData.baseFov || cam.fov) / 2) * d;
    const hw = hh * Math.max(cam.aspect, 0.6);
    const z = -d;
    const T = 0.05 * (d / 0.6);
    // Top canopy bar
    this.top.scale.set(hw * 2.4, T * 1.1, 0.12); this.top.position.set(0, hh + T * 0.15, z); this.top.rotation.x = 0.35;
    this.topLip.scale.set(hw * 2.2, T * 0.25, 0.05); this.topLip.position.set(0, hh - T * 0.4, z + 0.02);
    // A-pillars leaning inward toward the top
    this.pillars.forEach((p, i) => {
      const s = i ? 1 : -1;
      p.scale.set(T * 1.3, hh * 2.6, 0.08);
      p.position.set(s * (hw * 0.94), 0, z);
      p.rotation.set(0, s * 0.35, s * 0.1);
    });
    // Thin canopy struts converging toward the center top
    this.struts.forEach((p, i) => {
      const s = i ? 1 : -1;
      p.scale.set(T * 0.35, hh * 1.0, 0.03);
      p.position.set(s * hw * 0.55, hh * 0.78, z - 0.02);
      p.rotation.set(0, 0, s * 0.95);
    });
    // Dashboard
    const dashTop = -hh * 0.66, dh = hh * 0.62;
    this.dashGroup.position.set(0, dashTop - dh * 0.42, z); this.dashGroup.rotation.set(-0.55, 0, 0);
    this.dash.scale.set(hw * 2.2, dh, 0.02); this.dash.position.set(0, 0, -0.012);
    this.dashLip.scale.set(hw * 2.1, 0.012, 0.03); this.dashLip.position.set(0, dashTop + 0.003, z + 0.01);
    this.sideConsoles.forEach((p, i) => {
      const s = i ? 1 : -1;
      p.scale.set(hw * 0.4, hh * 0.9, 0.25); p.position.set(s * hw * 1.08, -hh * 0.55, z + 0.05); p.rotation.set(-0.3, -s * 0.5, 0);
    });
    // Screens sit on the dash face (local space of dashGroup)
    const sc = Math.min(dh / 0.3, hw / 0.75) * 0.85;
    this.radar.mesh.position.set(0, dh * 0.02, 0.002); this.radar.mesh.scale.setScalar(sc);
    this.status.mesh.position.set(-hw * 0.42, dh * 0.08, 0.002); this.status.mesh.rotation.set(0, 0.2, 0); this.status.mesh.scale.setScalar(sc);
    this.weapons.mesh.position.set(hw * 0.42, dh * 0.08, 0.002); this.weapons.mesh.rotation.set(0, -0.2, 0); this.weapons.mesh.scale.setScalar(sc);
    this.leds.forEach((m, i) => {
      const s = i < 7 ? -1 : 1, k = i % 7;
      m.position.set(s * (hw * 0.72 + (k % 2) * 0.03), dh * 0.3 - Math.floor(k / 2) * 0.022, 0.004);
    });
    this.sticks.forEach((g, i) => { const s = i ? 1 : -1; g.position.set(s * hw * 0.66, -hh * 1.12, z + 0.12); });
    this.hh = hh; this.hw = hw;
  }

  animate(t, mx, my, rise) {
    this.leds.forEach((m, i) => { m.visible = Math.sin(t * (2 + i * 0.7) + i) > -0.6; });
    this.sticks[0].rotation.set(my * 0.35, 0, -mx * 0.35);
    this.sticks[1].rotation.set(-rise * 0.3, 0, 0);
  }

  // data: { yaw, blips:[{dx,dz,c,air}], hp, maxHp, energy, overheat, mode, speed, alt, ammo, reloading, msl, mslMax, locked, frame }
  draw(data) {
    // Radar
    {
      const { g, c } = this.radar, W = c.width, C = W / 2;
      g.fillStyle = '#04130f'; g.fillRect(0, 0, W, W);
      g.strokeStyle = 'rgba(80,255,190,0.35)'; g.lineWidth = 2;
      for (const r of [0.33, 0.66, 0.95]) { g.beginPath(); g.arc(C, C, C * r, 0, Math.PI * 2); g.stroke(); }
      g.beginPath(); g.moveTo(C, 6); g.lineTo(C, W - 6); g.moveTo(6, C); g.lineTo(W - 6, C); g.stroke();
      const sweep = (performance.now() / 900) % (Math.PI * 2);
      const gr = g.createConicGradient ? g.createConicGradient(sweep - Math.PI / 2, C, C) : null;
      if (gr) { gr.addColorStop(0, 'rgba(80,255,190,0.35)'); gr.addColorStop(0.12, 'rgba(80,255,190,0)'); gr.addColorStop(1, 'rgba(80,255,190,0)'); g.fillStyle = gr; g.beginPath(); g.arc(C, C, C * 0.95, 0, Math.PI * 2); g.fill(); }
      const range = 700, cs = Math.cos(data.yaw), sn = Math.sin(data.yaw);
      for (const b of data.blips) {
        // rotate world offset into view space (forward = up on radar)
        const rx = b.dx * cs - b.dz * sn, rz = b.dx * sn + b.dz * cs;
        let px = rx / range, py = rz / range;
        const L = Math.hypot(px, py); if (L > 0.95) { px *= 0.95 / L; py *= 0.95 / L; }
        g.fillStyle = b.c;
        const x = C + px * C, y = C + py * C;
        if (b.air) { g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 7, y + 5); g.lineTo(x - 7, y + 5); g.fill(); }
        else g.fillRect(x - 6, y - 6, 12, 12);
      }
      g.fillStyle = '#cffff0'; g.beginPath(); g.moveTo(C, C - 12); g.lineTo(C + 8, C + 9); g.lineTo(C - 8, C + 9); g.fill();
      g.font = 'bold 18px monospace'; g.fillStyle = 'rgba(120,255,210,0.8)'; g.fillText('700m', 8, 22);
      this.radar.tex.needsUpdate = true;
    }
    // Status
    {
      const { g, c } = this.status, W = c.width, Hh = c.height;
      g.fillStyle = '#071018'; g.fillRect(0, 0, W, Hh);
      g.font = 'bold 20px monospace'; g.fillStyle = '#9fe7ff';
      g.fillText(data.frame + ' // ' + data.mode, 10, 26);
      const bar = (y, label, v, col) => {
        g.fillStyle = '#7fa9b8'; g.fillText(label, 10, y + 16);
        g.strokeStyle = '#2d4b58'; g.strokeRect(90, y, W - 100, 20);
        g.fillStyle = col; g.fillRect(92, y + 2, (W - 104) * Math.max(0, Math.min(1, v)), 16);
      };
      bar(44, 'ARMOR', data.hp / data.maxHp, data.hp / data.maxHp < 0.3 ? '#ff4a4a' : '#5dffa1');
      bar(76, 'GEN', data.energy / 100, data.overheat ? '#ff5a2a' : '#45d4ff');
      g.fillStyle = data.overheat ? '#ff5a2a' : '#7fa9b8';
      g.fillText(data.overheat ? '! OVERHEAT' : `ALT ${Math.round(data.alt)}m`, 10, 128);
      this.status.tex.needsUpdate = true;
    }
    // Weapons
    {
      const { g, c } = this.weapons, W = c.width, Hh = c.height;
      g.fillStyle = '#100c07'; g.fillRect(0, 0, W, Hh);
      g.font = 'bold 20px monospace'; g.fillStyle = '#ffcf8a';
      g.fillText('R: 90mm RIFLE', 10, 26);
      g.font = 'bold 34px monospace';
      g.fillText(data.reloading ? 'RELOAD' : String(data.ammo).padStart(2, '0'), 10, 66);
      g.font = 'bold 20px monospace'; g.fillText('L: MISSILES', 10, 98);
      for (let i = 0; i < data.mslMax; i++) { g.fillStyle = i < data.msl ? '#ffb02e' : '#3a2a14'; g.fillRect(150 + i * 24, 82, 18, 18); }
      g.fillStyle = data.locked ? '#ff4a4a' : '#6b5a40';
      g.fillText(data.locked ? '◆ LOCK' : '◇ NO LOCK', 10, 128);
      this.weapons.tex.needsUpdate = true;
    }
  }
}
