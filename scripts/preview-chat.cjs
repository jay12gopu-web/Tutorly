// Development-only loopback preview. No production API, credentials, or user data.
// Run: node scripts/preview-chat.cjs
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {execFile} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const host = '127.0.0.1';
const port = 8767;
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'none'; object-src 'none'; base-uri 'self'; frame-src 'self'; form-action 'none'";
const bootstrap = '<script src="/__preview/bootstrap.js"></script>';

http.createServer((request, response) => {
  if (request.headers.host !== `${host}:${port}`) { response.writeHead(403).end('Loopback preview only.'); return; }
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end('Preview has no write API.'); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname); }
  catch (_) { response.writeHead(400).end(); return; }
  if (pathname === '/') pathname = '/maths_gpt.html';
  if (pathname === '/__preview/curriculum-catalog.json') {
    const grade = new URL(request.url, `http://${host}:${port}`).searchParams.get('grade') || '9';
    if (!/^(?:[1-9]|1[0-2])$/.test(grade)) { response.writeHead(400).end(); return; }
    execFile('python', [path.join(root,'scripts','audit-preview-catalog.py'),grade],
      {cwd:root, timeout:15000, maxBuffer:1000000}, (error, output) => {
        response.writeHead(error ? 503 : 200, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
        response.end(error ? '{"available":false,"message":"Local curriculum preview unavailable"}' : output);
      });
    return;
  }
  const isBootstrap = pathname === '/__preview/bootstrap.js';
  const isEducationRegistry = pathname === '/data/education-registry.json';
  const isPage = /^\/[a-zA-Z0-9_-]+\.html$/.test(pathname);
  const isAsset = /^\/(assets|images|css|js|shared|frontend)\/[a-zA-Z0-9_./-]+$/.test(pathname);
  const hasPrivateSegment = pathname.split('/').some(segment => segment.startsWith('.') || ['backend', 'uploads', 'node_modules', 'data'].includes(segment));
  const file = isBootstrap ? path.join(root, 'tests', 'fixtures', 'chat-preview-bootstrap.js') : path.resolve(root, '.' + pathname);
  const extension = path.extname(file).toLowerCase();
  if ((!isBootstrap && !isEducationRegistry && (!isPage && !isAsset || hasPrivateSegment)) || !file.startsWith(root + path.sep) || !types[extension]) {
    response.writeHead(404).end('Not served by this frontend preview.'); return;
  }
  fs.realpath(file, (resolveError, resolved) => {
    if (resolveError || !resolved.startsWith(root + path.sep)) { response.writeHead(404).end(); return; }
    fs.readFile(resolved, (error, data) => {
      if (error) { response.writeHead(404).end(); return; }
      let body = data;
      if (extension === '.html') {
        body = data.toString('utf8')
          .replace(/<link\b[^>]*(?:href=["']https?:\/\/)[^>]*>/gi, '')
          .replace(/<head>/i, `<head>${bootstrap}`);
      }
      response.writeHead(200, { 'Content-Type': types[extension], 'Cache-Control': 'no-store',
        'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
      response.end(request.method === 'HEAD' ? undefined : body);
    });
  });
}).listen(port, host, () => console.log(`Local fixture preview: http://${host}:${port}/maths_gpt.html\nUse Preview controls → Local student fixture to test history and Live Board. No real account or provider is used.`));
