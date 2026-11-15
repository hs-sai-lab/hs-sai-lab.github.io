/**
 * Apps Script 전환 빌드 (npm run build:admin:apps-script).
 * - admin/gas-dist/Admin.html: 접수용 프로젝트에 Admin으로 넣는 껍데기(머리, CSS, 로더, data-build, data-parts).
 *   화면 코드는 들어 있지 않고 자리표시(ADMIN_CODE_MARK) 하나만 있습니다.
 * - admin/gas-dist/AdminCode1.html … AdminCodeN.html: 압축한 화면 코드(gzip+base64)를 PART_MAX_BYTES 이하로 나눈 조각.
 *   접수용 doGet(관리 서버 레포 apps-script/intake/Code.gs)이 껍데기의 data-parts 수만큼 이어 붙여 자리표시에 넣습니다.
 *   Apps Script 편집기는 큰 파일(약 370 KB, 한 줄 30만 자)을 저장하지 못해 나눴습니다. 조각은 템플릿으로 해석하지 않습니다.
 * - admin/gas-dist/mock.html: 가짜 google.script.run(mock.ts)을 넣은 로컬 확인용 한 파일. Apps Script에 넣지 않습니다.
 * 기존 빌드(npm run build:admin → admin/out/)와 관리 서버 연결은 바꾸지 않습니다.
 */
import { build } from 'esbuild';
import { bundleOptions } from './bundle-options.mjs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const admin = join(here, '..');
const out = join(admin, 'gas-dist');
/** 관리 화면 그림은 화면에 보이는 폭(최대 174px, 196px)의 두 배로 줄여 넣습니다. */
const IMAGE_WIDTH = { 'sai-lab-black.png': 360, 'hanshin-university.png': 400 };

/** sharp(Next와 함께 설치됨)가 있으면 그림을 줄입니다. 없으면 원본을 그대로 넣습니다. */
const shrinkImages = {
  name: 'shrink-admin-images',
  setup(b) {
    b.onLoad({ filter: /public[\\/]images[\\/]admin[\\/][^\\/]+\.png$/ }, async (args) => {
      const bytes = await readFile(args.path);
      const width = IMAGE_WIDTH[args.path.split(/[\\/]/).pop()];
      try {
        const { default: sharp } = await import('sharp');
        return { contents: await sharp(bytes).resize({ width, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer(), loader: 'dataurl' };
      } catch {
        return { contents: bytes, loader: 'dataurl', warnings: [{ text: `sharp unavailable; ${args.path} not resized` }] };
      }
    });
  },
};

const PRETENDARD = 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';

async function bundle(entry, extra = {}) {
  const result = await build({
    ...bundleOptions,
    entryPoints: [entry],
    write: false,
    outdir: out,
    format: 'iife',
    minify: true,
    plugins: [shrinkImages],
    logLevel: 'warning',
    ...extra,
  });
  const text = (ext) => result.outputFiles.filter((f) => f.path.endsWith(ext)).map((f) => f.text).join('\n');
  return { js: text('.js'), css: text('.css') };
}

/** 접수용 doGet이 화면 코드 조각을 넣는 자리. 껍데기에 정확히 한 번 있어야 합니다. */
const ADMIN_CODE_MARK = '<!--sai-admin-code-->';
/** Apps Script에 넣는 파일 하나의 상한. 이미 저장이 확인된 크기(약 280 KB)보다 넉넉히 작게 둡니다. */
const PART_MAX_BYTES = 150 * 1024;
/** base64 한 줄 길이. atob은 base64 사이의 줄바꿈을 무시합니다. */
const LINE = 1000;
/** 껍데기의 한 줄(CSS 등) 상한. */
const SHELL_LINE_MAX = 120 * 1024;

/** 인라인 <script>·<style> 안에서 태그가 끝나지 않도록 막습니다. */
const safe = (code, tag) => code.replace(new RegExp(`</(${tag})`, 'gi'), '<\\/$1');

/** 압축한 화면 코드를 LINE자 줄로 감아, 줄 경계에서 PART_MAX_BYTES 이하 조각으로 나눕니다. */
function splitPacked(packed) {
  const lines = packed.match(new RegExp(`.{1,${LINE}}`, 'g')) ?? [];
  const parts = [];
  let current = [];
  let size = 0;
  for (const line of lines) {
    if (size + line.length + 1 > PART_MAX_BYTES && current.length) { parts.push(current.join('\n')); current = []; size = 0; }
    current.push(line);
    size += line.length + 1;
  }
  if (current.length) parts.push(current.join('\n'));
  return parts;
}

/**
 * inline=true: 화면 코드를 껍데기 안에 바로 넣은 한 파일(mock.html).
 * inline=false: 자리표시만 있는 껍데기와 조각들(Admin.html + AdminCodeN.html).
 */
function page({ js, css }, before = '', inline = true) {
  // HtmlService embeds the entire page through document.write. A large inline bundle can
  // break that wrapper before our JavaScript runs. Keep the payload ASCII-only and small,
  // then execute the decompressed bundle as a script element inside the HTML Service frame.
  const packed = gzipSync(js).toString('base64');
  const parts = splitPacked(packed);
  // The intake project reads this back (bootstrap) so a tab opened before a new deployment can tell.
  const build = createHash('sha256').update(js).update(css).digest('hex').slice(0, 12);
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>SAI Lab 관리</title>
<base target="_top">
<link rel="stylesheet" href="${PRETENDARD}">
<style>${safe(css, 'style')}</style>
</head>
<body>
<div id="root"></div>
${before}<script id="sai-app-bundle" type="application/octet-stream" data-build="${build}"${inline ? '' : ` data-parts="${parts.length}"`}>
${inline ? parts.join('\n') : ADMIN_CODE_MARK}
</script>
<script>
(async function () {
  const encoded = document.getElementById('sai-app-bundle').textContent.replace(/[^A-Za-z0-9+/=]/g, ''); // base64만 남김(조각 사이 줄바꿈 제거)
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const script = document.createElement('script');
  script.textContent = await new Response(stream).text();
  document.body.appendChild(script);
})().catch(function (error) {
  console.error('SAI Lab management bundle failed to load', error);
  document.getElementById('root').textContent = '관리 화면을 열지 못했습니다. 페이지를 새로고침해 주세요.';
});
</script>
</body>
</html>
`;
  return { html, parts };
}

const app = await bundle(join(here, 'main.tsx'));
const mock = await bundle(join(here, 'mock.ts'));
await mkdir(out, { recursive: true });
// 예전 빌드의 조각(파일 수가 줄었을 때 남는 AdminCodeN)은 지웁니다.
for (const name of await readdir(out)) if (/^AdminCode\d+\.html$/.test(name)) await rm(join(out, name));
const shell = page(app, '', false);
const files = { 'Admin.html': shell.html };
shell.parts.forEach((part, i) => { files[`AdminCode${i + 1}.html`] = `${part}\n`; });

// Apps Script에 넣는 파일마다 크기와 줄 길이를 지킵니다. 껍데기에는 자리표시가 정확히 한 번 있고,
// HtmlService 템플릿 기호(<? ?>)는 없어야 합니다(혹시 템플릿으로 읽혀도 깨지지 않게).
const fail = (message) => { throw new Error(`build:admin:apps-script: ${message}`); };
for (const [name, text] of Object.entries(files)) {
  const bytes = Buffer.byteLength(text);
  if (bytes > PART_MAX_BYTES) fail(`${name} is ${bytes} bytes, over ${PART_MAX_BYTES}`);
  const longest = Math.max(...text.split('\n').map((line) => line.length));
  if (longest > (name === 'Admin.html' ? SHELL_LINE_MAX : LINE)) fail(`${name} has a ${longest}-character line`);
  if (/[^\x09\x0a\x0d\x20-\x7e]/.test(name === 'Admin.html' ? '' : text)) fail(`${name} is not plain ASCII`);
}
if (shell.html.split(ADMIN_CODE_MARK).length !== 2) fail('Admin.html must hold the code mark exactly once');
if (/<\?|\?>/.test(shell.html)) fail('Admin.html must not contain <? or ?>');
// 조각을 다시 이어 붙이면 한 파일 빌드와 같은 코드가 됩니다.
const single = page(app);
const joined = shell.html.replace(ADMIN_CODE_MARK, shell.parts.join('\n')).replace(` data-parts="${shell.parts.length}"`, '');
if (joined !== single.html) fail('joined parts differ from the single-file page');
// 페이지에 실제로 찍힌 로더의 정리 규칙으로 조각을 풀면 원래 화면 코드가 나와야 합니다.
const cleanup = /textContent\.replace\(\/(.+?)\/g, ''\)/.exec(shell.html);
if (!cleanup) fail('loader cleanup not found in Admin.html');
let decoded = null;
try { decoded = gunzipSync(Buffer.from(shell.parts.join('\n').replace(new RegExp(cleanup[1], 'g'), ''), 'base64')).toString('utf8'); }
catch { decoded = null; }
if (decoded !== app.js) fail('the loader would not decode the joined parts back to the app');

for (const [name, text] of Object.entries(files)) await writeFile(join(out, name), text);
const mockPage = page(app, `<script>${safe(mock.js, 'script')}</script>\n`).html;
await writeFile(join(out, 'mock.html'), mockPage);
const kb = (s) => `${Math.round(Buffer.byteLength(s) / 1024)} KB`;
console.log(`admin/gas-dist: ${Object.entries(files).map(([name, text]) => `${name} ${kb(text)}`).join(', ')}; mock.html ${kb(mockPage)}`);
