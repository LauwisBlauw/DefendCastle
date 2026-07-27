import { defineConfig } from 'vite';

// Connected SSE clients (browser tabs)
const clients = new Set();

// Last battle result pushed from the browser
let lastResult = null;

// Accumulating history of the last 50 results
const resultHistory = [];

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // three.js is the bulk of the bundle and changes only on dependency
        // bumps — splitting it lets browsers cache it across game updates.
        manualChunks: { three: ['three'] },
      },
    },
  },
  plugins: [
    {
      name: 'test-api',
      configureServer(server) {

        // POST /test-run
        // Body: { script: string, enter?: boolean }
        // Pushes script to all connected browser tabs via SSE
        // Example:
        //   curl -s -X POST http://localhost:5173/test-run \
        //     -H 'Content-Type: application/json' \
        //     -d '{"script":"spawn(\"grunt\",5)"}'
        server.middlewares.use('/test-run', (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.setHeader('Content-Type', 'application/json');

          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
          if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'POST only' })); return; }

          let body = '';
          req.on('data', chunk => (body += chunk));
          req.on('end', () => {
            try {
              const payload = JSON.parse(body);
              if (!payload.script) { res.statusCode = 400; res.end(JSON.stringify({ error: 'missing script' })); return; }
              const msg = `data: ${JSON.stringify(payload)}\n\n`;
              clients.forEach(c => c.write(msg));
              res.end(JSON.stringify({ ok: true, clients: clients.size }));
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'invalid JSON' }));
            }
          });
        });

        // GET  /test-result → last battle result as JSON
        // POST /test-result ← browser pushes result after TEST.battle() completes
        server.middlewares.use('/test-result', (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'application/json');
          if (req.method === 'GET') {
            res.end(JSON.stringify(lastResult ?? { error: 'no result yet — run TEST.battle() first' }));
            return;
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => (body += chunk));
            req.on('end', () => {
              try {
                lastResult = JSON.parse(body);
                // Append to history (capped at 50)
                const entry = { ...lastResult, _savedAt: new Date().toISOString() };
                resultHistory.push(entry);
                if (resultHistory.length > 50) resultHistory.shift();
                res.end(JSON.stringify({ ok: true }));
              }
              catch { res.statusCode = 400; res.end(JSON.stringify({ error: 'invalid JSON' })); }
            });
            return;
          }
          res.statusCode = 405; res.end();
        });

        // GET /test-history  — last 50 battle results as JSON array
        server.middlewares.use('/test-history', (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'application/json');
          if (req.method === 'GET') { res.end(JSON.stringify(resultHistory)); return; }
          res.statusCode = 405; res.end();
        });

        // POST /test-reload  — force a full page reload in all connected browsers
        // Useful to unstick a hung script (_scriptRunning stuck = true)
        // Usage:  curl -s -X POST http://localhost:5173/test-reload
        server.middlewares.use('/test-reload', (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'application/json');
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
          // Push a reload script to all SSE clients
          const reloadMsg = `data: ${JSON.stringify({ script: 'window.location.reload();', _force: true })}\n\n`;
          // Also send Vite HMR full-reload via WebSocket
          server.hot?.send({ type: 'full-reload' });
          clients.forEach(c => c.write(reloadMsg));
          res.end(JSON.stringify({ ok: true, clients: clients.size }));
        });

        // GET /test-events  — SSE stream the browser subscribes to
        server.middlewares.use('/test-events', (req, res) => {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('Access-Control-Allow-Origin', '*');
          if (res.flushHeaders) res.flushHeaders();
          clients.add(res);
          // Keep-alive ping every 20 s
          const ping = setInterval(() => res.write(': ping\n\n'), 20000);
          req.on('close', () => { clients.delete(res); clearInterval(ping); });
        });

      },
    },
  ],
});
