import { chromium } from 'playwright-core';
import http from 'http';
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
page.on('console', m => console.log('[B]', m.text().slice(0, 200)));
await page.goto('http://localhost:5173/?test&headless', { waitUntil: 'load' });
console.log('[B] loaded');
http.createServer(async (req, res) => {
  try {
    if (req.url === '/shot') { await page.screenshot({ path: '/tmp/shotB.png' }); res.end('ok'); }
    else if (req.url === '/eval' && req.method === 'POST') {
      let b = ''; req.on('data', c => (b += c)); await new Promise(r => req.on('end', r));
      res.end(JSON.stringify((await page.evaluate(b)) ?? null));
    } else if (req.url === '/reload') { await page.reload({ waitUntil: 'load' }); res.end('reloaded'); }
    else res.end('B');
  } catch (e) { res.statusCode = 500; res.end(String(e)); }
}).listen(9223, () => console.log('[B] :9223'));
