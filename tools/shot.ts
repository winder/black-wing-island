// Screenshots the game for checking how things look: `npx tsx tools/shot.ts out.png "x=..&z=..&mode=fly"`.
import { chromium } from 'playwright';

const [out = 'shot.png', query = '', wait = '4000', frames = '1'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text()); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const base = `http://localhost:${process.env.PORT ?? 5173}/`;
await page.goto(query === "title" ? base : `${base}?debug&${query}`);
await page.waitForTimeout(Number(wait));
for (let f = 0; f < Number(frames); f++) {
  await page.screenshot({ path: Number(frames) > 1 ? out.replace(/\.png$/, `-${f}.png`) : out });
  await page.waitForTimeout(120);
}
await browser.close();
