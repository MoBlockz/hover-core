// Peer-to-peer PvP over WebRTC (PeerJS). Host relays state + events in a star.
// Works on static hosting (GitHub Pages): no game server needed.
const PREFIX = 'hovercore-v2-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_PLAYERS = 8;

export function makeCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export class Net {
  constructor(handlers) {
    this.h = handlers; // { onWorld(list), onEvent(e), onStatus(text), onDisconnect() }
    this.peer = null; this.conns = new Map(); this.conn = null;
    this.isHost = false; this.id = null; this.code = null;
    this.states = new Map(); this.myState = null; this.timer = null;
  }
  get online() { return !!this.id; }

  _peer(id) {
    if (!window.Peer) throw new Error('Network library failed to load (check your connection).');
    return id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 });
  }

  host(code) {
    return new Promise((resolve, reject) => {
      this.isHost = true; this.code = code;
      const peer = this.peer = this._peer(PREFIX + code);
      peer.on('open', () => {
        this.id = 'H';
        this.timer = setInterval(() => this._broadcastWorld(), 66);
        resolve();
      });
      peer.on('error', err => {
        if (!this.id) reject(new Error(err.type === 'unavailable-id' ? 'That room code is already in use.' : 'Could not reach the matchmaking server.'));
        else this.h.onStatus?.('Network: ' + err.type);
      });
      peer.on('connection', conn => {
        conn.on('open', () => {
          if (this.conns.size >= MAX_PLAYERS - 1) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 200); return; }
          this.conns.set(conn.peer, conn);
          this._relay({ type: 'join', from: conn.peer });
        });
        conn.on('data', d => this._hostData(conn.peer, d));
        conn.on('close', () => {
          if (!this.conns.delete(conn.peer)) return;
          this.states.delete(conn.peer);
          this._relay({ type: 'leave', from: conn.peer });
        });
        conn.on('error', () => {});
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch {} });
    });
  }

  join(code) {
    return new Promise((resolve, reject) => {
      this.isHost = false; this.code = code;
      const peer = this.peer = this._peer();
      const fail = msg => { if (!this.id) { reject(new Error(msg)); this.close(); } };
      const to = setTimeout(() => fail('Room not found or host unreachable.'), 12000);
      peer.on('open', () => {
        const conn = this.conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        conn.on('open', () => { clearTimeout(to); this.id = peer.id; resolve(); });
        conn.on('data', d => {
          if (d.t === 'w') this.h.onWorld?.(d.p.filter(s => s.id !== this.id), d.m);
          else if (d.t === 'e') this.h.onEvent?.(d.e);
          else if (d.t === 'full') fail('Room is full.');
        });
        conn.on('close', () => { if (this.id) this.h.onDisconnect?.(); });
      });
      peer.on('error', err => {
        clearTimeout(to);
        if (!this.id) fail(err.type === 'peer-unavailable' ? 'Room not found.' : 'Could not reach the matchmaking server.');
        else this.h.onStatus?.('Network: ' + err.type);
      });
    });
  }

  _hostData(from, d) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 's' && d.s && typeof d.s === 'object') { d.s.id = from; this.states.set(from, d.s); }
    else if (d.t === 'e' && d.e && typeof d.e === 'object') { d.e.from = from; this._relay(d.e, from); }
  }

  // Host: deliver event locally and to every client except `except`.
  _relay(e, except) {
    this.h.onEvent?.(e);
    for (const [id, c] of this.conns) if (id !== except && c.open) c.send({ t: 'e', e });
  }

  _broadcastWorld() {
    const list = [...this.states.values()];
    if (this.myState) list.push({ ...this.myState, id: 'H' });
    for (const c of this.conns.values()) if (c.open) c.send({ t: 'w', p: list, m: this.map });
    this.h.onWorld?.([...this.states.values()]);
  }

  sendState(s) {
    if (!this.id) return;
    if (this.isHost) this.myState = s;
    else if (this.conn?.open) this.conn.send({ t: 's', s });
  }

  sendEvent(e) {
    if (!this.id) return;
    e.from = this.id;
    if (this.isHost) { for (const c of this.conns.values()) if (c.open) c.send({ t: 'e', e }); }
    else if (this.conn?.open) this.conn.send({ t: 'e', e });
  }

  get playerCount() { return this.isHost ? this.conns.size + 1 : null; }

  close() {
    clearInterval(this.timer);
    try { this.peer?.destroy(); } catch {}
    this.peer = null; this.conn = null; this.conns.clear(); this.states.clear(); this.id = null; this.myState = null;
  }
}
