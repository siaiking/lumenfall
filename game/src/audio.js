// Every sound in Lumenfall is synthesized with WebAudio: short oscillators
// and filtered noise, no audio files. Music is a quiet bass pulse with a
// wandering arpeggio, sequenced on the same clock as the game loop.
export class AudioEngine {
  constructor() {
    this.context = null;
    this.muted = false;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.master = null;
    this.musicGain = null;
  }

  /** Creates the context on first user gesture; browsers forbid it before. */
  ensure() {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }
    const Context = window.AudioContext ?? window.webkitAudioContext;
    if (!Context) return;
    this.context = new Context();
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.context.destination);
    this.musicGain = this.context.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  tone({ frequency = 440, end = null, type = 'sine', duration = 0.12, volume = 0.3, when = 0 }) {
    if (!this.context || this.muted) return;
    const start = this.context.currentTime + when;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (end !== null) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, end), start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  noise({ duration = 0.2, volume = 0.25, frequency = 1200, when = 0 }) {
    if (!this.context || this.muted) return;
    const start = this.context.currentTime + when;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(start);
  }

  shoot() {
    this.tone({ frequency: 720, end: 190, type: 'square', duration: 0.07, volume: 0.12 });
  }

  hit() {
    this.tone({ frequency: 220, end: 140, type: 'triangle', duration: 0.05, volume: 0.16 });
  }

  enemyDie() {
    this.noise({ duration: 0.16, volume: 0.2, frequency: 900 });
    this.tone({ frequency: 320, end: 60, type: 'sawtooth', duration: 0.18, volume: 0.14 });
  }

  hurt() {
    this.tone({ frequency: 160, end: 50, type: 'sawtooth', duration: 0.3, volume: 0.3 });
    this.noise({ duration: 0.2, volume: 0.2, frequency: 500 });
  }

  pickup() {
    this.tone({ frequency: 880, end: 1320, type: 'sine', duration: 0.1, volume: 0.18 });
  }

  heal() {
    this.tone({ frequency: 523, type: 'sine', duration: 0.12, volume: 0.2 });
    this.tone({ frequency: 784, type: 'sine', duration: 0.16, volume: 0.2, when: 0.09 });
  }

  dash() {
    this.noise({ duration: 0.14, volume: 0.14, frequency: 2400 });
  }

  waveHorn() {
    this.tone({ frequency: 196, type: 'triangle', duration: 0.4, volume: 0.22 });
    this.tone({ frequency: 294, type: 'triangle', duration: 0.4, volume: 0.2, when: 0.12 });
  }

  bossRoar() {
    this.tone({ frequency: 90, end: 40, type: 'sawtooth', duration: 0.7, volume: 0.3 });
    this.noise({ duration: 0.6, volume: 0.22, frequency: 300 });
  }

  draft() {
    this.tone({ frequency: 660, type: 'sine', duration: 0.1, volume: 0.18 });
    this.tone({ frequency: 880, type: 'sine', duration: 0.1, volume: 0.18, when: 0.08 });
    this.tone({ frequency: 1100, type: 'sine', duration: 0.14, volume: 0.18, when: 0.16 });
  }

  gameOver() {
    this.tone({ frequency: 392, end: 370, type: 'triangle', duration: 0.5, volume: 0.22 });
    this.tone({ frequency: 311, end: 294, type: 'triangle', duration: 0.6, volume: 0.22, when: 0.4 });
    this.tone({ frequency: 233, end: 220, type: 'triangle', duration: 0.9, volume: 0.22, when: 0.8 });
  }

  /** Advances the music sequencer; called with the frame's delta time. */
  updateMusic(delta, intensity) {
    if (!this.context || this.muted) return;
    this.musicTimer -= delta;
    if (this.musicTimer > 0) return;
    this.musicTimer = 0.21;
    const bass = [55, 55, 65.41, 49, 55, 55, 73.42, 82.41];
    const arp = [220, 261.63, 329.63, 440, 329.63, 261.63];
    const step = this.musicStep;
    this.musicStep = (this.musicStep + 1) % 16;
    const bassNote = bass[Math.floor(step / 2) % bass.length];
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = bassNote;
    gain.gain.setValueAtTime(0.5, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.4);
    oscillator.connect(gain).connect(this.musicGain);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.42);
    if (step % 2 === 0) {
      const note = arp[(step / 2 + (intensity > 2 ? 1 : 0)) % arp.length];
      const top = this.context.createOscillator();
      const topGain = this.context.createGain();
      top.type = 'sine';
      top.frequency.value = note * (intensity > 4 ? 2 : 1);
      topGain.gain.setValueAtTime(0.25, this.context.currentTime);
      topGain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.3);
      top.connect(topGain).connect(this.musicGain);
      top.start();
      top.stop(this.context.currentTime + 0.32);
    }
  }
}
