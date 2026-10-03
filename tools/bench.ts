// Frame-time benchmark on the real GPU: boosts across the Island and reports
// frame times and how long terrain building takes. Needs `npm run dev` running.
//   [KEYS=KeyW,ShiftLeft] npx tsx tools/bench.ts [seconds] [query]
import { chromium } from 'playwright';

const [seconds = '30', query = 'x=-3300&z=-900&y=180&yaw=-1.5708&mode=fly&time=0.45'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://localhost:${process.env.PORT ?? 5173}/?debug&${query}`);
await page.waitForFunction('window.game');
await page.waitForTimeout(3000);
// Plain strings: the TS loader adds helpers to named functions that don't exist in the page.
await page.evaluate(`(() => {
  const g = window.game;
  window.bench = { frames: [], terrain: [] };
  const orig = g.terrain.update.bind(g.terrain);
  g.terrain.update = (...a) => { const t = performance.now(); const r = orig(...a); window.bench.terrain.push(performance.now() - t); return r; };
  let last = performance.now();
  const tick = () => { const now = performance.now(); window.bench.frames.push(now - last); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})()`);
// Keys to hold, e.g. KEYS=KeyE for fire. Default: boost forward.
for (const k of (process.env.KEYS ?? 'KeyW,ShiftLeft').split(',')) await page.keyboard.down(k);
await page.waitForTimeout(Number(seconds) * 1000);
const r = await page.evaluate(`(() => {
  const { frames, terrain } = window.bench;
  const s = [...frames].sort((a, b) => a - b);
  const pct = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  const ts = [...terrain].sort((a, b) => a - b);
  return {
    frames: frames.length,
    avgFps: (1000 / (frames.reduce((a, b) => a + b, 0) / frames.length)).toFixed(1),
    median: pct(0.5).toFixed(1), p95: pct(0.95).toFixed(1), p99: pct(0.99).toFixed(1), max: s[s.length - 1].toFixed(1),
    over50ms: frames.filter((f) => f > 50).length,
    terrainMedian: ts[Math.floor(ts.length / 2)].toFixed(2), terrainP99: ts[Math.floor(ts.length * 0.99)].toFixed(2), terrainMax: ts[ts.length - 1].toFixed(1),
    x: window.game.player.position.x.toFixed(0),
  };
})()`);
console.log(JSON.stringify(r, null, 1));
await browser.close();
