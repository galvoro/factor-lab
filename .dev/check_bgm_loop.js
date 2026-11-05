// Checks the seamless BGM loop: rebuilds what is heard around the jump
// (end of the loop -> loopStart) and compares sample jumps and loudness at
// the seam with the rest of the track. Usage: node .dev/check_bgm_loop.js [baseURL]
const { launch } = require('./cdp.js');
const BASE = process.argv[2] || 'http://127.0.0.1:8765/';
(async () => {
  const b = await launch({ width: 800, height: 600, port: 9382 });
  try {
    await b.goto(BASE + 'index.html');
    const r = await b.eval(`(async () => {
      const ab = await (await fetch('assets/bgm.mp3')).arrayBuffer();
      const c = new OfflineAudioContext(2, 44100, 44100);
      const raw = await c.decodeAudioData(ab);
      const L = GaltonAudio._loop.makeLoop(c, raw);
      const sr = L.buf.sampleRate, xs = Math.round(L.loopStart * sr), xe = Math.round(L.loopEnd * sr);
      const d = L.buf.getChannelData(0);
      // heard signal around the seam: 4 s before the end, then 4 s from loopStart
      const pre = d.subarray(xe - 4 * sr, xe), post = d.subarray(xs, xs + 4 * sr);
      const heard = new Float32Array(pre.length + post.length); heard.set(pre); heard.set(post, pre.length);
      const seam = pre.length;
      const jump = Math.abs(heard[seam] - heard[seam - 1]);
      // typical adjacent-sample differences in the track
      let diffs = []; for (let i = 1; i < raw.length; i += 97) diffs.push(Math.abs(raw.getChannelData(0)[i] - raw.getChannelData(0)[i - 1]));
      diffs.sort((a, b) => a - b);
      const rms = (a, i, w) => { let s = 0; for (let k = i; k < i + w; k++) s += a[k] * a[k]; return Math.sqrt(s / w); };
      const w = Math.round(0.1 * sr), env = [];
      for (let i = 0; i + w <= heard.length; i += w) env.push(+rms(heard, i, w).toFixed(3));
      return { loopStart: L.loopStart, loopEnd: L.loopEnd, cycle: L.loopEnd - L.loopStart, jump, p50: diffs[Math.floor(diffs.length / 2)], p99: diffs[Math.floor(diffs.length * 0.99)], env };
    })()`);
    console.log(`loop: first pass 0 -> ${r.loopEnd.toFixed(3)} s, then cycles ${r.loopStart.toFixed(3)} -> ${r.loopEnd.toFixed(3)} s (${r.cycle.toFixed(3)} s = ${(r.cycle / 2.1636).toFixed(2)} bars)`);
    console.log(`sample jump at the seam: ${r.jump.toFixed(4)} (track: median ${r.p50.toFixed(4)}, 99th percentile ${r.p99.toFixed(4)})`);
    console.log('loudness (RMS per 100 ms) from 4 s before to 4 s after the seam (| = seam):');
    console.log(r.env.slice(0, 40).join(' ') + '  |  ' + r.env.slice(40).join(' '));
  } finally { await b.close(); }
})();
