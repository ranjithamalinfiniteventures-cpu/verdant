/* Procedural audio. Nothing is sampled — every sound is synthesised on the fly,
   which is what lets a 6-shots-per-second weapon stay listenable: each shot gets
   its own pitch, pan and level, and the whole layer ducks as fire density rises.

   Drop an mp3/ogg at assets/audio/music.* and loadTrack() will crossfade to it
   instead of the generative bed. */

const MUSIC_ENABLED = false;

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const rand  = (a, b) => a + Math.random() * (b - a);

// D natural minor — warm, slightly melancholy, sits well under magenta and teal
const SCALE = [0, 2, 3, 5, 7, 8, 10];
const ROOT  = 146.83; // D3
const note  = (deg, oct = 0) =>
  ROOT * Math.pow(2, oct + Math.floor(deg / 7) + SCALE[((deg % 7) + 7) % 7] / 12);

class AudioEngine {
  constructor(){
    this.ready = false;
    this.enabled = true;
    this.vol = { master: 0.85, sfx: 0.75, music: 0.24 };
    try {
      const saved = JSON.parse(localStorage.getItem('verdant.audio.v2') || 'null');
      if (saved) Object.assign(this.vol, saved.vol ?? {}), this.enabled = saved.enabled ?? true;
    } catch {}
    this._shots = [];
    this._pickupStep = 0;
    this._pickupAt = 0;
    this._intensity = 0;
  }

  /* Browsers block audio until a gesture, so everything is built lazily on the
     first real input rather than at load. */
  init(){
    // If the context was ever constructed before a real gesture it comes up
    // suspended, and an early-return here would leave the game silent forever.
    if (this.ready){
      this.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.ready = true;

    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? this.vol.master : 0;

    // a gentle bus limiter so a wave of deaths never clips
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -8; lim.knee.value = 6;
    lim.ratio.value = 8; lim.attack.value = 0.004; lim.release.value = 0.16;

    this.master.connect(lim).connect(ctx.destination);

    this.sfxBus = ctx.createGain();   this.sfxBus.gain.value = this.vol.sfx;
    this.musBus = ctx.createGain();   this.musBus.gain.value = 0;
    this.sfxBus.connect(this.master);
    this.musBus.connect(this.master);

    // generated impulse response — cheaper and more controllable than shipping a wav
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(1.9, 2.6);
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.26;
    this.verb.connect(this.verbGain).connect(this.master);

    // Reverb sends have to sit BEHIND the volume buses. Wired straight into the
    // convolver, turning the music down still leaves its tail audible.
    this.sfxVerb = ctx.createGain(); this.sfxVerb.gain.value = this.vol.sfx;
    this.musVerb = ctx.createGain(); this.musVerb.gain.value = 0;
    this.sfxVerb.connect(this.verb);
    this.musVerb.connect(this.verb);

    this.noiseBuf = this._noise(1.0);

    // Background music is off. Not muted — never started, so the drone
    // oscillators, the LFO and the chord scheduler cost nothing. Flip
    // MUSIC_ENABLED to bring it back.
    if (MUSIC_ENABLED) this._startMusic();
    this.resume();
  }

  resume(){
    if (this.ctx && ['suspended', 'interrupted'].includes(this.ctx.state)){
      // A later real gesture can retry if the browser refuses this attempt.
      this.ctx.resume().catch(() => {});
    }
  }

  _noise(sec){
    const n = Math.floor(this.ctx.sampleRate * sec);
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  _impulse(sec, decay){
    const rate = this.ctx.sampleRate, n = Math.floor(rate * sec);
    const b = this.ctx.createBuffer(2, n, rate);
    for (let c = 0; c < 2; c++){
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++){
        const t = i / n;
        // darken the tail so the reverb reads as a big room, not a metal box
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - t * 0.35);
      }
    }
    return b;
  }

  /* ------------------------------------------------------------- voices -- */
  _env(node, t, { a = 0.004, d = 0.12, peak = 1, sus = 0 }){
    const g = node.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d);
    return t + a + d;
  }

  tone({ freq, type = 'sine', dur = 0.15, a = 0.004, gain = 0.3, slide = null,
         cutoff = null, q = 1, pan = 0, verb = 0, delay = 0, detune = 0 }){
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(slide, 1), t + dur);

    const g = ctx.createGain();
    this._env(g, t, { a, d: dur, peak: gain });

    let node = o;
    if (cutoff){
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.Q.value = q;
      f.frequency.setValueAtTime(cutoff, t);
      node.connect(f); node = f;
    }
    const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    node.connect(g).connect(p);
    p.connect(this.sfxBus);
    if (verb > 0){
      const vg = ctx.createGain(); vg.gain.value = verb;
      p.connect(vg).connect(this.sfxVerb);
    }
    o.start(t); o.stop(t + dur + a + 0.05);
    o.onended = () => { try { o.disconnect(); g.disconnect(); p.disconnect(); } catch {} };
  }

  noise({ dur = 0.12, gain = 0.25, type = 'bandpass', freq = 1200, q = 1,
          sweep = null, pan = 0, verb = 0, delay = 0 }){
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(sweep, 20), t + dur);
    const g = ctx.createGain();
    this._env(g, t, { a: 0.003, d: dur, peak: gain });
    const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    s.connect(f).connect(g).connect(p);
    p.connect(this.sfxBus);
    if (verb > 0){
      const vg = ctx.createGain(); vg.gain.value = verb;
      p.connect(vg).connect(this.sfxVerb);
    }
    s.start(t); s.stop(t + dur + 0.06);
    s.onended = () => { try { s.disconnect(); f.disconnect(); g.disconnect(); p.disconnect(); } catch {} };
  }

  /* ------------------------------------------------------------- sounds -- */

  /** The one that plays constantly, so it gets the most care. */
  shot(){
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this._shots = this._shots.filter(t => now - t < 0.6);
    this._shots.push(now);
    // the more we're firing, the quieter each shot — otherwise it fatigues fast
    const duck = 1 / (1 + this._shots.length * 0.16);
    const p = rand(-0.35, 0.35);
    const f = rand(760, 900);
    this.tone({ freq: f, type: 'sawtooth', dur: 0.075, gain: 0.30 * duck,
                slide: f * 0.36, cutoff: 2600, q: 3, pan: p });
    this.tone({ freq: f * 2.01, type: 'sine', dur: 0.05, gain: 0.13 * duck,
                slide: f * 0.9, pan: p });
    this.noise({ dur: 0.035, gain: 0.09 * duck, freq: 3400, sweep: 1200, q: 0.8, pan: p });
  }

  /* One voice per weapon. The gun you hear six times a second has to sit low and
     tight; the one you fire twice a second can afford to be enormous. */
  gun(id = 'laser'){
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this._shots = this._shots.filter(t => now - t < 0.6);
    this._shots.push(now);
    const duck = 1 / (1 + this._shots.length * 0.16);
    const p = rand(-0.35, 0.35);

    switch (id){
      case 'scatter': {
        // forceful: a low boom, a wide blast of air, then shells hitting the deck
        this.tone({ freq: 148, type: 'sawtooth', dur: 0.24, gain: 0.40 * duck, slide: 50, cutoff: 900, q: 2, pan: p, verb: 0.3 });
        this.noise({ dur: 0.17, gain: 0.32 * duck, type: 'lowpass', freq: 2800, sweep: 380, q: 0.9, pan: p });
        for (let i = 0; i < 2; i++)
          this.noise({ dur: 0.05, gain: 0.05 * duck, type: 'bandpass', freq: rand(3600, 6000), q: 3, pan: p, delay: 0.13 + i * 0.06 });
        break;
      }
      case 'rapid': {
        // thirteen a second, so it has to be tiny or it becomes a drill
        const f = rand(1120, 1360);
        this.tone({ freq: f, type: 'square', dur: 0.032, gain: 0.115 * duck, slide: f * 0.45, cutoff: 3400, q: 2, pan: p });
        this.noise({ dur: 0.018, gain: 0.04 * duck, freq: 4400, sweep: 1800, q: 1, pan: p });
        break;
      }
      case 'rail': {
        // precise, then powerful: a fast rising charge and a hard crack with tail
        this.tone({ freq: 380, type: 'sine', dur: 0.09, gain: 0.10, slide: 1700, pan: p });
        this.tone({ freq: 2400, type: 'sawtooth', dur: 0.11, gain: 0.30, slide: 280, cutoff: 5400, q: 6, pan: p, delay: 0.07 });
        this.tone({ freq: 88, type: 'sine', dur: 0.45, gain: 0.30, slide: 42, delay: 0.07, verb: 0.55 });
        this.noise({ dur: 0.34, gain: 0.13, type: 'bandpass', freq: 3200, sweep: 520, q: 0.8, delay: 0.07, verb: 0.6 });
        break;
      }
      case 'plasma': {
        // heavy and soft-edged — a shove of air rather than a crack
        this.tone({ freq: 205, type: 'sine', dur: 0.32, gain: 0.32, slide: 66, verb: 0.45, pan: p });
        this.tone({ freq: 620, type: 'triangle', dur: 0.2, gain: 0.13, slide: 210, pan: p });
        this.noise({ dur: 0.24, gain: 0.10, type: 'lowpass', freq: 1500, sweep: 280, q: 1.5, pan: p });
        break;
      }
      default: this.shot();
    }
  }

  /** Impact voice, so hitting with a rail does not sound like hitting with a needle. */
  impactFor(id){
    switch (id){
      case 'scatter': this.noise({ dur: 0.07, gain: 0.11, freq: 1800, sweep: 500, q: 1.1, pan: rand(-0.3, 0.3) }); break;
      case 'rapid':   this.noise({ dur: 0.03, gain: 0.05, freq: 3400, sweep: 1600, q: 1.4, pan: rand(-0.3, 0.3) }); break;
      case 'rail':    this.tone({ freq: 300, type: 'sawtooth', dur: 0.13, gain: 0.16, slide: 90, cutoff: 2200, q: 4, verb: 0.4 });
                      this.noise({ dur: 0.1, gain: 0.11, freq: 2600, sweep: 700, q: 1.2 }); break;
      case 'plasma':  this.tone({ freq: 130, type: 'sine', dur: 0.26, gain: 0.2, slide: 55, verb: 0.5 });
                      this.noise({ dur: 0.2, gain: 0.1, type: 'lowpass', freq: 1100, sweep: 260, q: 1.4 }); break;
      default: this.hit();
    }
  }

  hit(){
    this.noise({ dur: 0.05, gain: 0.085, freq: 2600, sweep: 900, q: 1.2, pan: rand(-0.3, 0.3) });
    this.tone({ freq: rand(420, 520), type: 'square', dur: 0.04, gain: 0.04, slide: 200 });
  }

  /** Spore pop: a wet burst with a low thump under it. */
  kill(){
    const p = rand(-0.4, 0.4);
    this.noise({ dur: 0.19, gain: 0.23, freq: 1900, sweep: 260, q: 1.4, pan: p, verb: 0.35 });
    this.tone({ freq: 150, type: 'sine', dur: 0.17, gain: 0.27, slide: 62, pan: p });
    this.tone({ freq: rand(300, 380), type: 'triangle', dur: 0.1, gain: 0.09, slide: 120, pan: p });
  }

  /** Streak ladder: pickups in quick succession climb the scale, then reset. */
  pickup(){
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now - this._pickupAt > 1.5) this._pickupStep = 0;
    this._pickupAt = now;
    const deg = this._pickupStep;
    this._pickupStep = Math.min(this._pickupStep + 1, 11);
    const f = note(deg, 2);
    this.tone({ freq: f, type: 'triangle', dur: 0.13, gain: 0.16, a: 0.002, verb: 0.3, pan: rand(-0.2, 0.2) });
    this.tone({ freq: f * 2, type: 'sine', dur: 0.09, gain: 0.07, a: 0.002 });
  }

  hurt(){
    this.noise({ dur: 0.16, gain: 0.30, type: 'lowpass', freq: 900, sweep: 180, q: 2 });
    this.tone({ freq: 190, type: 'sawtooth', dur: 0.2, gain: 0.27, slide: 70, cutoff: 700, q: 4 });
  }

  dead(){
    [0, 3, 7].forEach((d, i) =>
      this.tone({ freq: note(7 - d, 0), type: 'triangle', dur: 0.7, gain: 0.16,
                  a: 0.01, verb: 0.6, delay: i * 0.14, slide: note(7 - d, 0) * 0.6 }));
    this.noise({ dur: 1.1, gain: 0.13, type: 'lowpass', freq: 500, sweep: 90, q: 1.5, verb: 0.5 });
  }

  /** Warm major swell — the payoff for clearing a room. */
  clear(){
    [0, 2, 4, 7].forEach((deg, i) =>
      this.tone({ freq: note(deg, 1), type: 'triangle', dur: 1.5, gain: 0.135,
                  a: 0.09, verb: 0.75, delay: i * 0.07, pan: (i - 1.5) * 0.22 }));
    this.tone({ freq: note(0, 0), type: 'sine', dur: 1.7, gain: 0.17, a: 0.12, verb: 0.5 });
  }

  door(){
    this.noise({ dur: 0.55, gain: 0.2, type: 'bandpass', freq: 320, sweep: 4200, q: 0.7, verb: 0.5 });
    this.tone({ freq: note(0, 1), type: 'sine', dur: 0.7, gain: 0.13, a: 0.14, slide: note(4, 2), verb: 0.6 });
  }

  /** The door growing shut behind you: a thud, then rustle. */
  seal(){
    this.tone({ freq: 110, type: 'sine', dur: 0.34, gain: 0.20, slide: 46, verb: 0.4 });
    this.noise({ dur: 0.5, gain: 0.11, type: 'bandpass', freq: 2400, sweep: 700, q: 0.6, verb: 0.4 });
    for (let i = 0; i < 5; i++)
      this.noise({ dur: 0.09, gain: 0.045, type: 'bandpass', freq: rand(1500, 3800),
                   q: 3, delay: 0.05 + i * 0.07, pan: rand(-0.6, 0.6) });
  }

  spawn(){
    this.tone({ freq: rand(80, 105), type: 'sine', dur: 0.22, gain: 0.055, slide: 200, verb: 0.3 });
    this.noise({ dur: 0.14, gain: 0.03, type: 'bandpass', freq: 700, sweep: 1900, q: 1.5 });
  }

  /** Lasher whip: a fast air-slash with a bite at the end. */
  lash(){
    const p = rand(-0.5, 0.5);
    this.noise({ dur: 0.16, gain: 0.16, type: 'bandpass', freq: 600, sweep: 5200, q: 1.1, pan: p });
    this.tone({ freq: 220, type: 'sawtooth', dur: 0.12, gain: 0.1, slide: 900, cutoff: 3000, q: 5, pan: p });
  }

  /** Thornbeast committing to a charge: a low shove you feel more than hear. */
  charge(){
    this.tone({ freq: 74, type: 'sawtooth', dur: 0.42, gain: 0.24, slide: 150, cutoff: 420, q: 3, verb: 0.3 });
    this.noise({ dur: 0.34, gain: 0.12, type: 'lowpass', freq: 380, sweep: 1100, q: 1.4 });
  }

  /** UI press. Short and dry — it fires on every card and button. */
  tap(){
    this.noise({ dur: 0.024, gain: 0.30, type: 'bandpass', freq: 2600, q: 1.6 });
    this.tone({ freq: 1180, type: 'triangle', dur: 0.03, gain: 0.22, slide: 820 });
  }

  /** Selection confirmed — two rising notes, so choosing feels like a reward. */
  confirm(){
    this.tone({ freq: note(2, 2), type: 'triangle', dur: 0.11, gain: 0.15, a: 0.003, verb: 0.3 });
    this.tone({ freq: note(4, 2), type: 'triangle', dur: 0.18, gain: 0.15, a: 0.003, delay: 0.075, verb: 0.4 });
    this.tone({ freq: note(0, 1), type: 'sine', dur: 0.24, gain: 0.09, a: 0.01, delay: 0.075 });
  }

  /* A footstep runs two or three times a second, so it has to be felt more than
     heard: a soft low thud with a whisper of scuff, randomised so a run never
     turns into a metronome. */
  step(intensity = 1, foot = 0){
    if (!this.ready) return;
    /* Levels are set against the music bed (~0.046 RMS), not against silence.
       The first pass sat at 0.006 and was completely masked in normal play. */
    const p = rand(-0.2, 0.2) + (foot ? 0.12 : -0.12);
    // trimmed from 0.15: there is no music left to compete with, and four of
    // these a second sit far more exposed in a dry mix
    const g = 0.105 * (0.55 + intensity * 0.45);
    // left and right foot are pitched slightly apart so a run reads as two feet
    const base = (foot ? 118 : 134) * rand(0.94, 1.06);
    this.tone({ freq: base, type: 'sine', dur: 0.075, gain: g, slide: base * 0.45, pan: p });
    this.noise({ dur: 0.05, gain: g * 0.5, type: 'lowpass', freq: rand(780, 1080), sweep: 250, q: 1.1, pan: p });
  }

  ui(){ this.tone({ freq: 880, type: 'sine', dur: 0.05, gain: 0.1 }); }

  /* -------------------------------------------------------------- music -- */
  _startMusic(){
    const ctx = this.ctx;

    this.musFilter = ctx.createBiquadFilter();
    this.musFilter.type = 'lowpass';
    this.musFilter.frequency.value = 700;
    this.musFilter.Q.value = 0.6;
    this.musFilter.connect(this.musBus);

    const vg = ctx.createGain(); vg.gain.value = 0.5;
    this.musFilter.connect(vg).connect(this.musVerb);

    // sustained drone: three slightly detuned voices, never restarted
    this.drone = [];
    for (const [mult, det, pan] of [[1, -7, -0.4], [1, 6, 0.4], [1.5, 3, 0]]){
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = ROOT * 0.5 * mult;
      o.detune.value = det;
      const g = ctx.createGain(); g.gain.value = 0.055;
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      o.connect(g).connect(p).connect(this.musFilter);
      o.start();
      this.drone.push({ o, g });
    }

    // slow breathing on the drone so it never sits still
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lfoG = ctx.createGain(); lfoG.gain.value = 180;
    lfo.connect(lfoG).connect(this.musFilter.frequency);
    lfo.start();

    this.musBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.musBus.gain.exponentialRampToValueAtTime(this.vol.music, ctx.currentTime + 4);
    this.musVerb.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.musVerb.gain.exponentialRampToValueAtTime(this.vol.music, ctx.currentTime + 4);

    this._chordAt = 0;
    this._plinkAt = 0;
    this._chord = 0;
  }

  /** Called every frame with 0..1 combat pressure. */
  setIntensity(v){
    this._intensity += (clamp(v, 0, 1) - this._intensity) * 0.02;
  }

  update(){
    if (!this.ready || !this.enabled || !this.musFilter) return;
    const ctx = this.ctx, now = ctx.currentTime, k = this._intensity;

    // the bed opens up as the room fills
    this.musFilter.frequency.setTargetAtTime(560 + k * 1500, now, 1.2);
    for (const d of this.drone) d.g.gain.setTargetAtTime(0.05 + k * 0.045, now, 1.5);

    // a chord voicing every ~9s, drifting through the mode
    if (now > this._chordAt){
      this._chordAt = now + rand(8, 11);
      this._chord = (this._chord + (Math.random() < 0.5 ? 2 : 3)) % 7;
      const base = this._chord;
      [0, 2, 4].forEach((iv, i) => {
        const f = note(base + iv, 1);
        const o = ctx.createOscillator();
        o.type = i === 0 ? 'triangle' : 'sine';
        o.frequency.value = f;
        o.detune.value = rand(-6, 6);
        const g = ctx.createGain();
        const t0 = now + i * 0.12;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.05, t0 + 2.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 8);
        const p = ctx.createStereoPanner(); p.pan.value = (i - 1) * 0.45;
        o.connect(g).connect(p).connect(this.musFilter);
        o.start(t0); o.stop(t0 + 8.2);
        o.onended = () => { try { o.disconnect(); g.disconnect(); p.disconnect(); } catch {} };
      });
    }

    // sparse plucks that only show up when there's pressure
    if (k > 0.18 && now > this._plinkAt){
      this._plinkAt = now + rand(0.5, 1.6) / (0.4 + k);
      const deg = this._chord + [0, 2, 4, 6, 7][Math.floor(Math.random() * 5)];
      this.tone({ freq: note(deg, 2), type: 'triangle', dur: 0.5,
                  gain: 0.035 + k * 0.03, a: 0.006, verb: 0.8, pan: rand(-0.6, 0.6) });
    }
  }

  /* Duck the music under a transition so the door reads as a moment. */
  duck(amount = 0.25, seconds = 0.9){
    if (!this.ready || !this.musFilter) return;
    const now = this.ctx.currentTime;
    for (const g of [this.musBus.gain, this.musVerb.gain]){
      g.cancelScheduledValues(now);
      g.setTargetAtTime(this.vol.music * amount, now, 0.08);
      g.setTargetAtTime(this.vol.music, now + seconds, 0.5);
    }
  }

  /* ------------------------------------------------------------ control -- */
  setEnabled(on){
    this.enabled = on;
    if (this.ready) this.master.gain.setTargetAtTime(on ? this.vol.master : 0, this.ctx.currentTime, 0.05);
    this._save();
    return on;
  }
  toggle(){ this.init(); return this.setEnabled(!this.enabled); }

  setVolume(which, v){
    this.vol[which] = clamp(v, 0, 1);
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    // the 4s start-up fade is still on the timeline; without cancelling it a
    // volume change gets dragged back toward the scheduled value
    for (const g of [this.master.gain, this.sfxBus.gain, this.sfxVerb.gain,
                     this.musBus.gain, this.musVerb.gain]) g.cancelScheduledValues(now);
    if (which === 'master' && this.enabled) this.master.gain.setTargetAtTime(this.vol.master, now, 0.05);
    if (which === 'sfx'){
      this.sfxBus.gain.setTargetAtTime(this.vol.sfx, now, 0.05);
      this.sfxVerb.gain.setTargetAtTime(this.vol.sfx, now, 0.05);
    }
    if (which === 'music'){
      this.musBus.gain.setTargetAtTime(this.vol.music, now, 0.2);
      this.musVerb.gain.setTargetAtTime(this.vol.music, now, 0.2);
    }
    this._save();
  }

  _save(){
    try { localStorage.setItem('verdant.audio.v2', JSON.stringify({ vol: this.vol, enabled: this.enabled })); } catch {}
  }

  /** Optional: swap the generative bed for a real track dropped in assets/audio. */
  async loadTrack(url){
    if (!this.ready || !this.musFilter) return false;
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      src.connect(this.musFilter);
      src.start();
      for (const d of this.drone) d.g.gain.setTargetAtTime(0, this.ctx.currentTime, 1.5);
      this._track = src;
      this.musFilter.frequency.setTargetAtTime(18000, this.ctx.currentTime, 1);
      return true;
    } catch { return false; }
  }
}

export const audio = new AudioEngine();

// Capture UI gestures too: story/cards stop propagation before canvas input.
if (typeof window !== 'undefined' && window.addEventListener){
  window.addEventListener('pointerdown', () => audio.init(), { capture:true });
  window.addEventListener('keydown', () => audio.init(), { capture:true });
}
