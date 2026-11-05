// FACTOR FIND — audio module.
//
// WebAudio synth SFX + HTMLAudio BGM. Exposes window.GaltonAudio
// (shared name convention across Galvoro Capsules so a future
// audio.js upgrade can ship everywhere without rewiring callers).
// BGM auto-loops assets/bgm.mp3 when present; the capsule works
// silently when the file is missing.

(function (global) {
  let ctx = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // -------- BGM (auto-loops assets/bgm.mp3 if present) --------
  let bgmEl = null;
  let bgmTargetVolume = 0.18;
  function bgmEnsure() {
    if (bgmEl) return bgmEl;
    try {
      bgmEl = new Audio('assets/bgm.mp3');
      bgmEl.loop = true;
      bgmEl.preload = 'auto';
      bgmEl.volume = muted ? 0 : bgmTargetVolume;
    } catch (e) { bgmEl = null; }
    return bgmEl;
  }
  function bgmStart() {
    const a = bgmEnsure();
    if (!a) return;
    a.volume = muted ? 0 : bgmTargetVolume;
    a.play().catch(() => {});       // ignored before first user gesture
  }
  function bgmStop()  { if (bgmEl) { try { bgmEl.pause(); } catch (e) {} } }
  function bgmSetVolume(v) {
    bgmTargetVolume = Math.max(0, Math.min(1, v));
    if (bgmEl && !muted) bgmEl.volume = bgmTargetVolume;
  }

  function setMuted(m) {
    muted = m;
    if (bgmEl) bgmEl.volume = muted ? 0 : bgmTargetVolume;
  }
  function isMuted() { return muted; }

  // -------- SFX primitives --------
  function tone({ freq = 440, dur = 0.1, type = 'square', gain = 0.08, slide = 0, delay = 0 }) {
    if (muted) return;
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.15, gain = 0.08, filter = 800, delay = 0 }) {
    if (muted) return;
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime + delay;
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = filter; bp.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(c.destination);
    src.start(t0); src.stop(t0 + dur);
  }

  const SFX = {
    click:   () => tone({ freq: 440, dur: 0.03, gain: 0.05 }),
    error:   () => tone({ freq: 180, dur: 0.15, type: 'sawtooth', gain: 0.08 }),
    coin:    () => { tone({ freq: 988,  dur: 0.06 });
                     tone({ freq: 1319, dur: 0.10, delay: 0.06 }); },
    pop:     () => tone({ freq: 900, dur: 0.05, gain: 0.10 }),
    levelup: () => [523, 659, 784, 1047].forEach((f, i) =>
                     tone({ freq: f, dur: 0.12, delay: i * 0.08, gain: 0.08 })),

    // ---- capsule-specific ----
    // Node placed on the canvas.
    place:   () => { tone({ freq: 620, dur: 0.05, type: 'triangle', gain: 0.08 });
                     tone({ freq: 930, dur: 0.06, type: 'triangle', gain: 0.06, delay: 0.04 }); },
    // Path connected.
    connect: () => tone({ freq: 760, dur: 0.05, type: 'triangle', gain: 0.07, slide: 240 }),
    // Something removed.
    erase:   () => tone({ freq: 360, dur: 0.07, type: 'triangle', gain: 0.07, slide: -160 }),
    // FIT pressed: rising sweep while the estimator "runs".
    fit:     () => { noise({ dur: 0.35, filter: 1800, gain: 0.035 });
                     [392, 523, 659].forEach((f, i) => tone({ freq: f, dur: 0.09, type: 'triangle', delay: i * 0.07, gain: 0.05 })); },
    // Verdicts.
    close:   () => [659, 784, 988, 1319].forEach((f, i) =>
                     tone({ freq: f, dur: 0.14, type: 'triangle', delay: i * 0.09, gain: 0.09 })),
    fair:    () => [523, 659, 784].forEach((f, i) =>
                     tone({ freq: f, dur: 0.12, type: 'triangle', delay: i * 0.09, gain: 0.08 })),
    poor:    () => tone({ freq: 240, dur: 0.35, type: 'sawtooth', gain: 0.06, slide: -120 }),
    reveal:  () => { tone({ freq: 440, dur: 0.18, type: 'sine', gain: 0.08 });
                     tone({ freq: 660, dur: 0.24, type: 'sine', gain: 0.07, delay: 0.12 }); },
  };

  global.GaltonAudio = {
    SFX, tone, noise, setMuted, isMuted, ensure,
    bgm: { start: bgmStart, stop: bgmStop, setVolume: bgmSetVolume },
  };
})(window);
