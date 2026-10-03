// Local-only static preview. Never serves env files, backend code or private data.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
http.createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end(); return; }
  if (pathname === '/') pathname = '/contact.html';
  const allowed = /^\/(contact|maths_gpt|privacy)\.html$/.test(pathname)
    || /^\/(assets|css|js)\/[a-zA-Z0-9_./-]+$/.test(pathname);
  const file = path.resolve(root, '.' + pathname);
  if (!allowed || !file.startsWith(root + path.sep) || !types[path.extname(file)]) {
    response.writeHead(404).end(); return;
  }
  fs.readFile(file, (error, content) => {
    if (error) { response.writeHead(404).end(); return; }
    // Test a theme without changing the saved account preference or production code.
    const theme = new URL(request.url, 'http://localhost').searchParams.get('theme');
    if (pathname === '/contact.html' && ['light', 'dark'].includes(theme)) {
      content = content.toString().replace('</body>', `<script>document.addEventListener('DOMContentLoaded',()=>document.body.setAttribute('data-theme','${theme}'));</script></body>`);
    }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store' }).end(content);
  });
}).listen(8766, '127.0.0.1', () => console.log('Contact preview: http://127.0.0.1:8766/contact.html'));
