// Find loop points for assets/bgm.mp3: precise bar length (long-lag onset
// autocorrelation), then for each loop length that is a whole number of bars
// and ends before the fade-out, how similar the music right after the seam
// would be to the real opening (band-energy spectrogram, cosine similarity).
// Usage: node .dev/loop_points.js [baseURL] [fadeStartSeconds]
const { launch } = require('./cdp.js');
const BASE = process.argv[2] || 'http://127.0.0.1:8765/';
const FADE = +(process.argv[3] || 65.3);
(async () => {
  const b = await launch({ width: 800, height: 600, port: 9381 });
  try {
    await b.goto(BASE + 'index.html');
    const out = await b.eval(`(async () => {
      const ab = await (await fetch('assets/bgm.mp3')).arrayBuffer();
      const buf = await new OfflineAudioContext(2, 44100, 44100).decodeAudioData(ab);
      const sr = buf.sampleRate, n = buf.length;
      const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
      const mono = new Float32Array(n); for (let i = 0; i < n; i++) mono[i] = (L[i] + R[i]) / 2;
      // onset envelope, 5 ms hops
      const hop = Math.round(sr * 0.005), en = [];
      for (let i = 0; i + hop <= n; i += hop) { let s = 0; for (let k = i; k < i + hop; k++) s += mono[k] * mono[k]; en.push(Math.log(1e-9 + s)); }
      const sm = en.map((_, i) => { let s = 0, c = 0; for (let k = Math.max(0, i - 2); k <= Math.min(en.length - 1, i + 2); k++) { s += en[k]; c++; } return s / c; });
      const on = sm.map((v, i) => Math.max(0, v - (sm[i - 1] ?? v)));
      const ac = (lag, a0, a1) => { let s = 0; for (let i = a0; i < a1; i++) s += on[i] * on[i + lag]; return s; };
      const a0 = Math.floor(on.length * 0.05), a1 = Math.floor(on.length * 0.55);
      // coarse beat ~0.545 s; refine via the lag of ~16 beats (4 bars)
      let bestB = 0, bestS = -1;
      for (let lag = Math.round(16 * 0.50 / 0.005); lag <= Math.round(16 * 0.60 / 0.005); lag++) { const s = ac(lag, a0, a1); if (s > bestS) { bestS = s; bestB = lag; } }
      const beat = bestB * 0.005 / 16;
      // band-energy spectrogram: 2048-pt FFT, 1024 hop, 24 log bands 60 Hz - 8 kHz
      const N = 2048, H = 1024, frames = [];
      const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
      const edges = [...Array(25)].map((_, k) => 60 * Math.pow(8000 / 60, k / 24));
      const re = new Float32Array(N), im = new Float32Array(N);
      function fft() {
        for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
        for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len; for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) {
          const wr = Math.cos(ang * k), wi = Math.sin(ang * k), xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi, xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
          re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi; } }
      }
      for (let s = 0; s + N <= n; s += H) {
        for (let i = 0; i < N; i++) { re[i] = mono[s + i] * win[i]; im[i] = 0; }
        fft();
        const bands = new Float32Array(24);
        for (let k = 1; k < N / 2; k++) { const f = k * sr / N; for (let bnd = 0; bnd < 24; bnd++) if (f >= edges[bnd] && f < edges[bnd + 1]) { bands[bnd] += re[k] * re[k] + im[k] * im[k]; break; } }
        frames.push(Array.from(bands, v => Math.log(1e-6 + v)));
      }
      const fs = sr / H;
      const cos = (a, b2) => { let ab = 0, aa = 0, bb = 0; const ma = a.reduce((x, y) => x + y) / a.length, mb = b2.reduce((x, y) => x + y) / b2.length; for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b2[i] - mb; ab += x * y; aa += x * x; bb += y * y; } return ab / Math.sqrt(aa * bb); };
      const bar = 4 * beat, X = bar, cands = [];
      for (let k = 12; k * bar + X <= ${FADE}; k++) {
        const Lsec = k * bar;
        // compare 2 bars starting at the seam (A[L..L+2bar]) with the opening (A[0..2bar])
        const f0 = Math.round(Lsec * fs), m = Math.round(2 * bar * fs);
        let s = 0; for (let t = 0; t < m; t++) s += cos(frames[f0 + t], frames[t]);
        // and the 2 bars before the seam vs. the 2 bars before the loop's end on the other side? keep simple
        cands.push({ k, L: +Lsec.toFixed(3), end: +(Lsec + X).toFixed(3), sim: +(s / m).toFixed(3) });
      }
      return { beat, bpm: 60 / beat, bar, cands };
    })()`);
    console.log(`beat ${out.beat.toFixed(4)} s (${out.bpm.toFixed(2)} BPM), bar ${out.bar.toFixed(4)} s`);
    console.log('loop length (bars) | loop end before fade (s) | similarity of seam to opening');
    out.cands.forEach(c => console.log(`${String(c.k).padStart(3)} bars  L=${c.L.toFixed(2)} s  end=${c.end.toFixed(2)} s  sim=${c.sim}`));
  } finally { await b.close(); }
})();
