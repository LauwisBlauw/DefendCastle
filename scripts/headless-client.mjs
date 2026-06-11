// Headless browser client for automated game testing.
// Connects a real (headless Chromium) tab to the vite dev server so the
// TEST.* harness and /test-run endpoint work without a desktop browser.
//
// Usage:   node scripts/headless-client.mjs
// Control: POST localhost:9222/eval  (body = JS expression, evaluated in page)
//          GET  localhost:9222/shot  (screenshot -> /tmp/shot.png)
//          GET  localhost:9222/reload
import { chromium } from 'playwright-core';
import http from 'http';

const EXEC = process.env.CHROMIUM_PATH
  || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

const browser = await chromium.launch({
  headless: true,
  executablePath: EXEC,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
// Small viewport: SwiftShader (software GL) fps scales with pixel count,
// and the TEST harness needs a fast game loop far more than a big picture.
const VW = parseInt(process.env.SHOT_W || '480', 10);
const VH = parseInt(process.env.SHOT_H || '320', 10);
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
page.on('console', m => console.log('[console]', m.text().slice(0, 300)));
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173', { waitUntil: 'load' });
console.log('[ctl] page loaded');

http.createServer(async (req, res) => {
  try {
    if (req.url === '/shot') {
      await page.screenshot({ path: '/tmp/shot.png' });
      res.end('ok /tmp/shot.png');
    } else if (req.url === '/eval' && req.method === 'POST') {
      let b = '';
      req.on('data', c => (b += c));
      await new Promise(r => req.on('end', r));
      const out = await page.evaluate(b);
      res.end(JSON.stringify(out ?? null));
    } else if (req.url === '/reload') {
      await page.reload({ waitUntil: 'load' });
      res.end('reloaded');
    } else {
      res.end('endpoints: POST /eval, GET /shot, GET /reload');
    }
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e));
  }
}).listen(9222, () => console.log('[ctl] listening :9222'));
