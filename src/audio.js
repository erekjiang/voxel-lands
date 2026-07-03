// 程序化音效（WebAudio 合成，不使用任何音频素材）。
// 全部 try/catch 包裹，音频失败绝不影响游戏。

export class Sfx {
  constructor() {
    this.ctx = null;
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    } catch { /* 忽略 */ }
  }

  // 短噪声脉冲，经低通滤波：挖掘 / 放置的“噗”声
  thud(freq, dur, vol) {
    try {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      const len = Math.max(1, (ctx.sampleRate * dur) | 0);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      src.connect(lp).connect(g).connect(ctx.destination);
      src.start();
    } catch { /* 忽略 */ }
  }

  breakBlock() { this.thud(700 + Math.random() * 250, 0.1, 0.35); }
  place() { this.thud(1300 + Math.random() * 200, 0.06, 0.25); }
  click() { this.thud(2000, 0.03, 0.15); }

  // 正弦滑音：生物跳跃的“啵嘤”声（按距离衰减）
  boing(dist) {
    try {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      const vol = 0.16 * Math.max(0, 1 - dist / 18);
      if (vol <= 0.01) return;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(260, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.15);
    } catch { /* 忽略 */ }
  }

  bounce(dist) {
    const vol = 0.3 * Math.max(0, 1 - dist / 24);
    if (vol > 0.02) this.thud(500, 0.07, vol);
  }

  kick() { this.thud(420, 0.09, 0.4); }
  gulp() { this.thud(900, 0.05, 0.3); this.thud(600, 0.08, 0.3); }
  hurt() { this.thud(220, 0.14, 0.5); }
  eat() { this.thud(950, 0.06, 0.3); setTimeout(() => this.thud(800, 0.06, 0.3), 120); }
  died() { this.thud(160, 0.4, 0.5); }

  // 爆虫引信的嘶嘶声
  hiss() {
    try {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      const dur = 1.4;
      const len = (ctx.sampleRate * dur) | 0;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + dur);
      src.connect(hp).connect(g).connect(ctx.destination);
      src.start();
    } catch { /* 忽略 */ }
  }

  explode() {
    try {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      const dur = 0.55;
      const len = (ctx.sampleRate * dur) | 0;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, ctx.currentTime);
      lp.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.55, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      src.connect(lp).connect(g).connect(ctx.destination);
      src.start();
    } catch { /* 忽略 */ }
  }
}
