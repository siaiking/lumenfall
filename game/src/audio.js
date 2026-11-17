// Every sound in Lumenfall is synthesized with WebAudio: short oscillators
// and filtered noise, no audio files. Music is a quiet bass pulse with a
// wandering arpeggio, sequenced on the same clock as the game loop. The
// Gloomlord gets its own darker, faster layer (v8), crossfaded in while it
// lives; a low drone and occasional shimmer fill the arena's quiet (v8).
// Everything routes through one master gain, so M silences music, effects
// and ambience together.
export class AudioEngine {
  constructor() {
    this.context = null;
    this.muted = false;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.master = null;
    this.musicGain = null;
    // Boss layer (v8): a second music bus, silent until a boss is alive.
    this.bossGain = null;
    this.bossMode = false;
    this.bossStep = 0;
    // Ambience (v8): a low drone plus occasional shimmer pings.
    this.ambientGain = null;
    this.droneNodes = null;
    this.ambientOn = false;
    this.shimmerTimer = 5;
    this.ambientWave = 0;
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
    this.bossGain = this.context.createGain();
    this.bossGain.gain.value = 0;
    this.bossGain.connect(this.master);
    this.ambientGain = this.context.createGain();
    this.ambientGain.gain.value = 0.05;
    this.ambientGain.connect(this.master);
    this.startAmbient();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  /**
   * Switches the music layer (v8): the boss layer crossfades in over about
   * half a second while the normal layer fades out, and back again when the
   * boss falls. Safe to call before any context exists — it just records
   * the mode for when the music starts.
   */
  setBossMode(active) {
    const next = Boolean(active);
    if (next === this.bossMode && this.context) return;
    this.bossMode = next;
    if (!this.context) return;
    const now = this.context.currentTime;
    const fade = (gain, target) => {
      if (gain?.gain?.setTargetAtTime) gain.gain.setTargetAtTime(target, now, 0.4);
      else if (gain) gain.gain.value = target;
    };
    fade(this.musicGain, next ? 0 : 0.16);
    fade(this.bossGain, next ? 0.22 : 0);
  }

  /** True while the boss music layer is the active one. */
  isBossMode() {
    return this.bossMode;
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
    // A whoosh: filtered noise plus a quick rising sweep, quiet enough to
    // sit under the music instead of on top of it.
    this.noise({ duration: 0.14, volume: 0.14, frequency: 2400 });
    this.tone({ frequency: 300, end: 900, type: 'sine', duration: 0.12, volume: 0.07 });
  }

  shield() {
    this.tone({ frequency: 1046, type: 'sine', duration: 0.1, volume: 0.2 });
    this.tone({ frequency: 1568, type: 'sine', duration: 0.16, volume: 0.16, when: 0.07 });
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

  // --- New effects (v8): one distinct voice per event, all kept quiet ---
  // so no single cue shouts over the music.

  /** An elite Hollow arrives: a bright two-note gold chime. */
  eliteSpawn() {
    this.tone({ frequency: 988, type: 'sine', duration: 0.12, volume: 0.13 });
    this.tone({ frequency: 1319, type: 'sine', duration: 0.18, volume: 0.12, when: 0.09 });
  }

  /** A meteor's warning ring blooms: a falling whistle from the dark. */
  meteorWarn() {
    this.tone({ frequency: 1200, end: 320, type: 'sawtooth', duration: 0.5, volume: 0.08 });
  }

  /** A meteor lands: a deep boom under a short burst of rubble noise. */
  meteorImpact() {
    this.tone({ frequency: 70, end: 30, type: 'sine', duration: 0.35, volume: 0.28 });
    this.noise({ duration: 0.25, volume: 0.2, frequency: 500 });
  }

  /** A boulder crushes the Warden: a low thud and a crunch. */
  boulderHit() {
    this.tone({ frequency: 75, end: 35, type: 'sine', duration: 0.25, volume: 0.25 });
    this.noise({ duration: 0.15, volume: 0.18, frequency: 300 });
  }

  /** A danger zone ignites: a crackling swell as the floor catches. */
  zoneIgnite() {
    this.noise({ duration: 0.4, volume: 0.12, frequency: 2200 });
    this.tone({ frequency: 180, end: 90, type: 'sawtooth', duration: 0.3, volume: 0.1 });
  }

  /** A mutated wave begins: a darker horn, a minor third below the wave's. */
  mutationHorn() {
    this.tone({ frequency: 220, type: 'triangle', duration: 0.5, volume: 0.2 });
    this.tone({ frequency: 261.63, type: 'triangle', duration: 0.5, volume: 0.18, when: 0.14 });
  }

  /** A synergy lands on a draft pick: a quick four-note gold arpeggio. */
  synergy() {
    const notes = [660, 880, 1108.7, 1318.5];
    notes.forEach((frequency, index) => {
      this.tone({ frequency, type: 'sine', duration: 0.12, volume: 0.15, when: index * 0.07 });
    });
  }

  /** The Gloomlord calls its minions: a low pulse under a hollow whisper. */
  bossSummon() {
    this.tone({ frequency: 110, end: 55, type: 'sawtooth', duration: 0.4, volume: 0.16 });
    this.noise({ duration: 0.35, volume: 0.1, frequency: 420 });
  }

  /** The Gloomlord falls: a slow descending minor chord over the kill. */
  bossDown() {
    this.tone({ frequency: 220, end: 207.65, type: 'triangle', duration: 0.7, volume: 0.2 });
    this.tone({ frequency: 164.81, end: 155.56, type: 'triangle', duration: 0.8, volume: 0.18, when: 0.15 });
    this.tone({ frequency: 110, end: 103.83, type: 'triangle', duration: 1.0, volume: 0.2, when: 0.3 });
  }

  /**
   * The arena's ambience (v8): two detuned low sines beating slowly against
   * each other, started with the context and kept very quiet. The title
   * screen never creates a context, so it stays silent until the first
   * gesture; after that the drone is only a faint floor under everything.
   */
  startAmbient() {
    if (!this.context || this.ambientOn) return;
    const droneGain = this.context.createGain();
    droneGain.gain.value = 0.06;
    droneGain.connect(this.ambientGain);
    const nodes = [];
    for (const frequency of [55, 55.6]) {
      const oscillator = this.context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(droneGain);
      oscillator.start();
      nodes.push(oscillator);
    }
    this.droneNodes = nodes;
    this.ambientOn = true;
  }

  /** Stops the drone oscillators; a later startAmbient can bring it back. */
  stopAmbient() {
    if (!this.droneNodes) return;
    for (const node of this.droneNodes) {
      try {
        node.stop();
      } catch {
        // Already stopped: the drone is gone either way.
      }
    }
    this.droneNodes = null;
    this.ambientOn = false;
  }

  /**
   * Advances the ambience: an occasional shimmer ping, high and faint,
   * whose pitch drifts with the wave so later waves sound a little
   * brighter; the drone itself swells a touch as the waves climb.
   */
  updateAmbient(delta, wave = 1) {
    if (!this.context || this.muted || !this.ambientOn) return;
    if (wave !== this.ambientWave) {
      this.ambientWave = wave;
      const level = 0.035 + Math.min(0.02, wave * 0.002);
      if (this.ambientGain?.gain?.setTargetAtTime) {
        this.ambientGain.gain.setTargetAtTime(level, this.context.currentTime, 1.0);
      } else if (this.ambientGain) {
        this.ambientGain.gain.value = level;
      }
    }
    this.shimmerTimer -= delta;
    if (this.shimmerTimer > 0) return;
    this.shimmerTimer = 4 + Math.random() * 5;
    const scale = [880, 1046.5, 1174.66, 1318.51, 1567.98];
    const note = scale[(wave + Math.floor(Math.random() * scale.length)) % scale.length];
    this.tone({ frequency: note, type: 'sine', duration: 1.4, volume: 0.03 });
  }

  /**
   * Advances the music sequencer; called with the frame's delta time.
   * Pass `bossActive` (a boss alive on the field) and the layer switches
   * itself: faster steps, a minor arpeggio and a low drum under the bass
   * while the Gloomlord lives, back to the wandering major line after.
   */
  updateMusic(delta, intensity, bossActive) {
    if (bossActive !== undefined && bossActive !== this.bossMode) this.setBossMode(bossActive);
    if (!this.context || this.muted) return;
    this.musicTimer -= delta;
    if (this.musicTimer > 0) return;
    this.musicTimer = this.bossMode ? 0.14 : 0.21;
    const bus = this.bossMode ? this.bossGain : this.musicGain;
    const bass = this.bossMode
      ? [55, 49, 55, 46.25, 55, 65.41, 49, 58.27]
      : [55, 55, 65.41, 49, 55, 55, 73.42, 82.41];
    // A minor arpeggio for the boss (A C D E G F), the wandering major
    // line for the ordinary waves.
    const arp = this.bossMode
      ? [220, 261.63, 293.66, 329.63, 392, 349.23]
      : [220, 261.63, 329.63, 440, 329.63, 261.63];
    const step = this.bossMode ? this.bossStep : this.musicStep;
    if (this.bossMode) this.bossStep = (this.bossStep + 1) % 16;
    else this.musicStep = (this.musicStep + 1) % 16;
    const bassNote = bass[Math.floor(step / 2) % bass.length];
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = bassNote;
    gain.gain.setValueAtTime(0.5, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.4);
    oscillator.connect(gain).connect(bus);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.42);
    if (step % 2 === 0) {
      const note = arp[(step / 2 + (intensity > 2 ? 1 : 0)) % arp.length];
      const top = this.context.createOscillator();
      const topGain = this.context.createGain();
      top.type = 'sine';
      top.frequency.value = note * (intensity > 4 && !this.bossMode ? 2 : 1);
      topGain.gain.setValueAtTime(0.25, this.context.currentTime);
      topGain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.3);
      top.connect(topGain).connect(bus);
      top.start();
      top.stop(this.context.currentTime + 0.32);
    }
    if (this.bossMode && step % 4 === 0) {
      // The boss layer's drum: a short lowpassed thump every fourth step.
      const length = Math.max(1, Math.floor(this.context.sampleRate * 0.12));
      const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 240;
      const drumGain = this.context.createGain();
      drumGain.gain.setValueAtTime(0.3, this.context.currentTime);
      drumGain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.12);
      source.connect(filter).connect(drumGain).connect(bus);
      source.start();
    }
  }
}
