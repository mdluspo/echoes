import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A small development server. No dependencies or network installation needed.
const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function argument(name, fallback) {
  const flag = args.indexOf(name);
  if (flag === -1) return fallback;
  return args[flag + 1] && !args[flag + 1].startsWith('--') ? args[flag + 1] : fallback;
}
const host = argument('--host', '127.0.0.1');
const initialPort = Number(argument('--port', process.env.PORT || '5173'));
if (!Number.isInteger(initialPort) || initialPort < 1 || initialPort > 65535) {
  console.error('Please choose a port between 1 and 65535.');
  process.exit(1);
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const clients = new Set();
const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Invalid URL'); return; }
  if (pathname === '/__events' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filename = path.resolve(root, relative);
  const ext = path.extname(filename);
  const allowed = relative === 'index.html' || relative.startsWith('src/');
  if (!allowed || !filename.startsWith(root + path.sep) || !types[ext]) {
    res.writeHead(404).end('Not found'); return;
  }
  try {
    if (!(await stat(filename)).isFile()) throw new Error('Not a file');
    const bytes = await readFile(filename);
    res.writeHead(200, { 'Content-Type': types[ext] + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404).end('Not found'); }
});

let reloadTimer;
const watchers = ['src', 'index.html'].map(name => watch(path.join(root, name), () => {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    for (const client of clients) client.write('data: reload\n\n');
  }, 100);
}));
let port = initialPort;
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && port < Math.min(initialPort + 10, 65535)) {
    server.listen(++port, host);
  } else { console.error(error.message); process.exitCode = 1; shutdown(); }
});
server.on('listening', () => {
  console.log('\n  ECHOES · the room remembers\n');
  console.log(`  Play: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}\n`);
  console.log('  Edit src/ to reload. Press Ctrl+C to stop.\n');
});
server.listen(port, host);
const heartbeat = setInterval(() => { for (const client of clients) client.write(': heartbeat\n\n'); }, 15000);
function shutdown() {
  clearInterval(heartbeat);
  clearTimeout(reloadTimer);
  for (const watcher of watchers) watcher.close();
  for (const client of clients) client.end();
  server.close();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
