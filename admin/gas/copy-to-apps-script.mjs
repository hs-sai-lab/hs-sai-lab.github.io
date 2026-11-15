#!/usr/bin/env node
/**
 * Apps Script에 붙여 넣을 파일을 하나씩 복사하는 페이지: `npm run copy:admin:apps-script [-- 더 넣을 파일 …]`
 * admin/gas-dist의 Admin.html과 AdminCode1..N.html(Admin.html의 data-parts 수만큼), 그리고 인자로 준 파일
 * (예: 관리 서버 레포의 apps-script/intake/Code.gs)을 보여 주고, [복사]를 누르면 그 파일 내용을 클립보드에 넣습니다.
 * Apps Script 편집기에서 같은 이름의 파일을 열어 전부 고르고 붙여 넣은 뒤 저장합니다.
 *
 * 보안(업로드 도구 화면과 같은 규칙): 127.0.0.1의 임의 포트에만 열고, 실행마다 만든 토큰이 든 첫 주소(브라우저를 여는 데만
 * 씀)와 X-SAI-Token 헤더가 있어야 답합니다. Host를 확인하고 CORS 허용 헤더는 보내지 않습니다. 실행할 때 정한 파일만
 * 내주고 경로를 받지 않습니다. 페이지를 닫거나 10분 동안 쓰지 않으면 끝납니다.
 */
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'gas-dist');

/** 붙여 넣을 파일 목록: [{ name: Apps Script 파일 이름, file: 디스크 경로 }]. */
export function filesToCopy(extra = []) {
  const shell = fs.readFileSync(path.join(dist, 'Admin.html'), 'utf8');
  const parts = Number((/data-parts="(\d+)"/.exec(shell) ?? [])[1] ?? 0);
  const list = [{ name: 'Admin', file: path.join(dist, 'Admin.html') }];
  for (let i = 1; i <= parts; i += 1) list.push({ name: `AdminCode${i}`, file: path.join(dist, `AdminCode${i}.html`) });
  for (const file of extra) list.push({ name: path.basename(file).replace(/\.html$/, ''), file: path.resolve(file) });
  for (const item of list) if (!fs.existsSync(item.file)) throw new Error(`없는 파일: ${item.name}. 먼저 npm run build:admin:apps-script`);
  return list;
}

const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));

function page(nonce, list) {
  const rows = list.map((item, i) => `<tr><td><code>${item.name}</code></td><td>${Math.round(fs.statSync(item.file).size / 1024)} KB</td>
<td><button data-i="${i}">복사</button> <span id="s${i}"></span></td></tr>`).join('\n');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Apps Script 붙여 넣기</title>
<style nonce="${nonce}">body{font:15px/1.6 -apple-system,sans-serif;margin:32px;max-width:640px}td{padding:6px 14px 6px 0}
button{font:inherit;padding:4px 14px}code{font-size:15px}</style></head><body>
<h1>Apps Script 붙여 넣기</h1>
<p>[복사]를 누른 뒤 Apps Script 편집기에서 같은 이름의 파일을 열고, 전부 고른 뒤(⌘A) 붙여 넣고(⌘V) 저장(⌘S)합니다.
파일이 없으면 + → HTML로 그 이름의 파일을 만듭니다. 위에서부터 차례로 하세요.</p>
<table>${rows}</table>
<p><button id="done">다 했습니다(이 페이지 끝내기)</button></p>
<script nonce="${nonce}">
const token = new URLSearchParams(location.search).get('t') || sessionStorage.getItem('t');
sessionStorage.setItem('t', token || '');
history.replaceState(null, '', '/');
for (const button of document.querySelectorAll('button[data-i]')) {
  button.addEventListener('click', async () => {
    const mark = document.getElementById('s' + button.dataset.i);
    try {
      const res = await fetch('/api/file?i=' + button.dataset.i, { headers: { 'X-SAI-Token': token } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await navigator.clipboard.writeText(await res.text());
      mark.textContent = '복사됨';
    } catch (error) { mark.textContent = '복사하지 못했습니다: ' + error.message; }
  });
}
document.getElementById('done').addEventListener('click', () => {
  fetch('/api/bye', { method: 'POST', headers: { 'X-SAI-Token': token } }).finally(() => { document.body.textContent = '끝냈습니다. 이 탭을 닫아도 됩니다.'; });
});
</script></body></html>`;
}

/** 서버를 엽니다. 반환: { port, url, close, closed }. url은 브라우저를 여는 데만 쓰고 출력하지 않습니다. */
export async function startCopy({ extra = [], idleMs = 10 * 60 * 1000, tickMs = 10_000 } = {}) {
  const list = filesToCopy(extra);
  const token = randomBytes(32).toString('hex');
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  let lastSeen = Date.now();
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  let shut = false;
  const close = () => {
    if (shut) return;
    shut = true;
    clearInterval(timer);
    server.close();
    server.closeAllConnections?.();
    resolveClosed();
  };
  const timer = setInterval(() => { if (Date.now() - lastSeen > idleMs) close(); }, tickMs);
  const headers = { 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
    'X-Frame-Options': 'DENY', 'Cross-Origin-Resource-Policy': 'same-origin' };
  const refuse = (res, status = 403) => { res.writeHead(status, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }); res.end('허용되지 않은 요청입니다.'); };
  server.on('request', (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.headers.host !== `127.0.0.1:${port}`) return refuse(res);
    if (req.method === 'GET' && url.pathname === '/') {
      if (!same(url.searchParams.get('t'), token)) return refuse(res);
      lastSeen = Date.now();
      const nonce = randomBytes(16).toString('base64');
      res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` });
      return res.end(page(nonce, list));
    }
    if (!same(req.headers['x-sai-token'], token)) return refuse(res);
    lastSeen = Date.now();
    if (req.method === 'POST' && url.pathname === '/api/bye') { res.writeHead(204, headers); res.end(); return close(); }
    if (req.method === 'GET' && url.pathname === '/api/file') {
      const item = list[Number(url.searchParams.get('i'))];
      if (!item) return refuse(res, 404);
      res.writeHead(200, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(fs.readFileSync(item.file));
    }
    return refuse(res, 404);
  });
  return { port, url: `http://127.0.0.1:${port}/?t=${token}`, close, closed, list };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startCopy({ extra: process.argv.slice(2) }).then((copy) => {
    spawn('open', [copy.url], { stdio: 'ignore', detached: true }).unref();
    console.log(`Apps Script 붙여 넣기: 브라우저에서 열었습니다 (127.0.0.1:${copy.port}). 파일 ${copy.list.map((item) => item.name).join(', ')}.`);
    console.log('페이지에서 [다 했습니다]를 누르거나 10분 동안 쓰지 않으면 끝납니다. 지금 끝내려면 Ctrl+C.');
    process.on('SIGINT', () => { copy.close(); });
    copy.closed.then(() => { console.log('끝냈습니다.'); process.exit(0); });
  }, (error) => { console.error(`멈춤: ${error?.message ?? error}`); process.exitCode = 1; });
}
