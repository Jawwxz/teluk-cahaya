// audio.js — synthesized sound, no audio files. A WebAudio engine hum
// whose pitch follows the car's speed, plus short blips for pickups and
// UI clicks. Created on the first user gesture (browsers block audio
// before one); M toggles mute.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.35;
    this.master.connect(this.ctx.destination);
    // Engine hum: two detuned saws through a lowpass.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 58;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    osc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    osc2.start();
    this.engineOsc2 = osc2;
  }

  setEngine(speedFrac, driving) {
    if (!this.ctx || !this.engineGain) return;
    const target = driving ? 0.05 + speedFrac * 0.09 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    const freq = 55 + speedFrac * 130;
    this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(freq * 1.03, this.ctx.currentTime, 0.08);
  }

  blip(freq = 880, dur = 0.12, type = 'sine', vol = 0.25) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Two-tone police siren: one oscillator whose pitch swings on a slow LFO.
  startSiren() {
    if (!this.ctx || this.sirenOsc) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 800;
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.55;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.4);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    lfo.start(t);
    this.sirenOsc = osc;
    this.sirenLfo = lfo;
    this.sirenGain = gain;
  }

  stopSiren() {
    if (!this.sirenOsc) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(0.0001, t, 0.1);
    const osc = this.sirenOsc;
    const lfo = this.sirenLfo;
    window.setTimeout(() => {
      try {
        osc.stop();
        lfo.stop();
      } catch (e) {
        // Already stopped; nothing to do.
      }
    }, 400);
    this.sirenOsc = null;
    this.sirenLfo = null;
    this.sirenGain = null;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  // Short rising arpeggio for mission-complete.
  jingle() {
    if (!this.ctx || this.muted) return;
    [660, 830, 990, 1320].forEach((f, i) => {
      window.setTimeout(() => this.blip(f, 0.16, 'sine', 0.28), i * 95);
    });
  }

  noiseBuffer() {
    if (this._noise) return this._noise;
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return buf;
  }

  // Explosion: a noise burst through a falling lowpass + a low sine drop.
  explosion() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(90, t + 0.5);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + 0.6);
    const drop = this.ctx.createOscillator();
    drop.type = 'sine';
    drop.frequency.setValueAtTime(130, t);
    drop.frequency.exponentialRampToValueAtTime(32, t + 0.45);
    const dg = this.ctx.createGain();
    dg.gain.setValueAtTime(0.4, t);
    dg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    drop.connect(dg);
    dg.connect(this.master);
    drop.start(t);
    drop.stop(t + 0.55);
  }
}
