// Tiny synthesized sound kit (no asset files).
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // Continuous engine: filtered noise + low hum
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    this.engF = ctx.createBiquadFilter(); this.engF.type = 'bandpass'; this.engF.frequency.value = 300; this.engF.Q.value = 0.8;
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    src.connect(this.engF).connect(this.engG).connect(this.master); src.start();
    const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 55;
    const humF = ctx.createBiquadFilter(); humF.type = 'lowpass'; humF.frequency.value = 220;
    this.humG = ctx.createGain(); this.humG.gain.value = 0;
    this.hum = hum;
    hum.connect(humF).connect(this.humG).connect(this.master); hum.start();
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }
  engine(speed, boost, air) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = Math.min(1, speed / 150);
    this.engF.frequency.setTargetAtTime(250 + k * 1400 + (boost ? 600 : 0), t, 0.08);
    this.engG.gain.setTargetAtTime(0.05 + k * 0.22 + (boost ? 0.1 : 0) + (air ? 0.05 : 0), t, 0.1);
    this.hum.frequency.setTargetAtTime(48 + k * 60, t, 0.1);
    this.humG.gain.setTargetAtTime(0.05 + k * 0.05, t, 0.1);
  }
  _noise(dur, freq, q, gain, type = 'bandpass', sweepTo) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur);
  }
  _tone(dur, f0, f1, gain, type = 'square') {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur);
  }
  shot() { this._noise(0.12, 1800, 0.7, 0.35, 'bandpass', 400); this._tone(0.08, 220, 60, 0.15); }
  enemyShot(vol = 0.15) { this._noise(0.1, 900, 1, vol, 'bandpass', 300); }
  stride() { this._noise(0.28, 500, 1.5, 0.22, 'bandpass', 2200); }
  boost() { this._noise(0.45, 300, 0.8, 0.5, 'bandpass', 3000); this._tone(0.3, 90, 40, 0.2, 'sawtooth'); }
  jump() { this._noise(0.35, 200, 0.7, 0.35, 'lowpass', 1200); }
  land(k) { this._noise(0.25, 160, 0.7, 0.2 + k * 0.4, 'lowpass', 60); }
  hit() { this._tone(0.06, 1400, 900, 0.12, 'triangle'); }
  hurt() { this._noise(0.2, 400, 0.5, 0.45, 'lowpass', 80); this._tone(0.2, 120, 50, 0.2); }
  boom(vol = 0.7) { this._noise(0.9, 600, 0.5, vol, 'lowpass', 40); }
  missile() { this._noise(0.5, 800, 1.2, 0.3, 'bandpass', 2500); }
  lock() { this._tone(0.07, 1760, 1760, 0.08, 'square'); }
  beep() { this._tone(0.05, 880, 880, 0.06, 'square'); }
  warn() { this._tone(0.15, 660, 440, 0.12, 'square'); }
}
