// Sound effects made in code with WebAudio: wind that rises with speed,
// wing beats, and splashes.

export class Sound {
  private ctx?: AudioContext;
  private windGain?: GainNode;
  private windFilter?: BiquadFilterNode;
  private noise?: AudioBuffer;
  private lastFlap = 0;
  private fireGain?: GainNode;

  /** Browsers only allow sound after the player clicks, so start on the first click. */
  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const ctx = (this.ctx = new AudioContext());
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(ctx.destination);
    src.start();

    // Fire breath: a roaring rumble that plays while breathing.
    const fire = ctx.createBufferSource();
    fire.buffer = this.noise;
    fire.loop = true;
    const ff = ctx.createBiquadFilter();
    ff.type = 'lowpass';
    ff.frequency.value = 700;
    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0;
    fire.connect(ff).connect(this.fireGain).connect(ctx.destination);
    fire.start();
  }

  fire(on: boolean) {
    if (!this.ctx || !this.fireGain) return;
    this.fireGain.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, on ? 0.05 : 0.15);
  }

  /** A monster's roar: a low growl that slides down. */
  roar(gain = 0.35) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140 + Math.random() * 60, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 1.1);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
    osc.connect(f).connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.4);
    this.burst(300, gain * 0.6, 1.0);
  }

  swish() { this.burst(2500, 0.3, 0.25, 'bandpass'); }
  hit() { this.burst(400, 0.6, 0.3); }
  bite() { this.burst(1800, 0.5, 0.18, 'highpass'); }
  hurt() { this.burst(160, 0.8, 0.5); }

  /** speed in m/s; flap is the wing-beat phase in radians. */
  update(speed: number, flap: number, flying: boolean, underwater: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.windGain || !this.windFilter) return;
    const t = ctx.currentTime;
    const loud = underwater ? 0.02 : Math.min(0.35, 0.02 + speed * speed * 0.0003);
    this.windGain.gain.setTargetAtTime(loud, t, 0.3);
    this.windFilter.frequency.setTargetAtTime(underwater ? 200 : 300 + speed * 40, t, 0.3);
    // One "whump" each time the wings come down.
    const beat = Math.floor(flap / (Math.PI * 2));
    if (flying && beat !== this.lastFlap) this.whump(0.5);
    this.lastFlap = beat;
  }

  private burst(freq: number, gain: number, duration: number, type: BiquadFilterType = 'lowpass') {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
  }

  whump(gain: number) { this.burst(220, gain, 0.35); }
  splash() { this.burst(1400, 0.4, 0.7, 'bandpass'); }
}
