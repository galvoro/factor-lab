// Analyse assets/bgm.mp3 in headless Chrome: loudness envelope (where does the
// fade-out start? is there a fade-in?) and tempo (onset autocorrelation), and
// suggest loop points for audio.js (BGM_LOOP). Serve the folder first.
// Usage: node .dev/analyze_bgm.js [baseURL]
const { launch, sleep } = require('./cdp.js');
const BASE = process.argv[2] || 'http://127.0.0.1:8765/';
(async () => {
  const b = await launch({ width: 800, height: 600, port: 9380 });
  try {
    await b.goto(BASE + 'index.html');
    const res = await b.eval(`(async () => {
      const ab = await (await fetch('assets/bgm.mp3')).arrayBuffer();
      const ctx = new OfflineAudioContext(2, 44100, 44100);
      const buf = await ctx.decodeAudioData(ab);
      const sr = buf.sampleRate, n = buf.length, ch = [...Array(buf.numberOfChannels)].map((_, c) => buf.getChannelData(c));
      const mono = new Float32Array(n); ch.forEach(d => { for (let i = 0; i < n; i++) mono[i] += d[i] / ch.length; });
      // RMS per 100 ms
      const hop = Math.round(sr * 0.1), rms = [];
      for (let i = 0; i + hop <= n; i += hop) { let s = 0; for (let k = i; k < i + hop; k++) s += mono[k] * mono[k]; rms.push(Math.sqrt(s / hop)); }
      // onset strength at 10 ms resolution (positive energy flux)
      const h2 = Math.round(sr * 0.01), en = [];
      for (let i = 0; i + h2 <= n; i += h2) { let s = 0; for (let k = i; k < i + h2; k++) s += mono[k] * mono[k]; en.push(Math.log(1e-9 + s)); }
      const on = en.map((v, i) => Math.max(0, v - (en[i - 1] ?? v)));
      // autocorrelation over the middle of the track for lags 0.35-1.6 s
      const a0 = Math.floor(on.length * 0.15), a1 = Math.floor(on.length * 0.75);
      let best = 0, bestLag = 0; const ac = [];
      for (let lag = 35; lag <= 160; lag++) { let s = 0; for (let i = a0; i < a1; i++) s += on[i] * on[i + lag]; ac.push([lag, s]); if (s > best) { best = s; bestLag = lag; } }
      return { dur: buf.duration, sr, channels: buf.numberOfChannels, rms: rms.map(v => +v.toFixed(4)), bestLag, ac: ac.sort((x, y) => y[1] - x[1]).slice(0, 6).map(([l]) => l / 100) };
    })()`);
    const r = res.rms, sec = (i) => (i / 10).toFixed(1);
    const mid = r.slice(Math.floor(r.length * 0.2), Math.floor(r.length * 0.8)).sort((a, b) => a - b);
    const med = mid[Math.floor(mid.length / 2)];
    // smoothed (1 s) envelope relative to the median
    const sm = r.map((_, i) => { const w = r.slice(Math.max(0, i - 5), i + 5); return w.reduce((s, v) => s + v, 0) / w.length / med; });
    let fadeStart = sm.length - 1; while (fadeStart > 0 && sm[fadeStart] < 0.85) fadeStart--;
    let fadeInEnd = 0; while (fadeInEnd < sm.length && sm[fadeInEnd] < 0.85) fadeInEnd++;
    console.log(`duration ${res.dur.toFixed(2)} s, ${res.channels} ch, ${res.sr} Hz`);
    console.log(`median RMS (middle 60%) ${med.toFixed(4)}`);
    console.log(`level reaches 85% of median at ${sec(fadeInEnd)} s; last time at 85%: ${sec(fadeStart)} s`);
    console.log('envelope (1 s smoothed, relative to median), every 2 s:');
    console.log(sm.filter((_, i) => i % 20 === 0).map((v, k) => `${k * 2}s:${v.toFixed(2)}`).join('  '));
    console.log('last 12 s, every 0.5 s:');
    console.log(sm.slice(-120).filter((_, i) => i % 5 === 0).map((v, k) => `${(res.dur - 12 + k * 0.5).toFixed(1)}:${v.toFixed(2)}`).join('  '));
    console.log(`beat-period candidates (s): ${res.ac.join(', ')}  -> ${(60 / (res.bestLag / 100)).toFixed(1)} BPM for the best lag`);
  } finally { await b.close(); }
})();
