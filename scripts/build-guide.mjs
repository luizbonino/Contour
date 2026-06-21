// Build standalone, self-contained HTML versions of the data-steward guide
// (English + Brazilian Portuguese) into dist/guide/ and dist/guide/pt-BR/, so
// they can be opened from the app in a separate window. The Markdown files stay
// the single source of truth; guide images are copied next to each page.
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';

const ROOT = process.cwd();
marked.use(gfmHeadingId());

const favicon =
  'data:image/svg+xml;base64,' + readFileSync(path.join(ROOT, 'public/favicon.svg')).toString('base64');
const mark = readFileSync(path.join(ROOT, 'src/assets/contour-icon.svg'), 'utf8');

const STYLE = `<style>
  :root {
    --ink: #1b2a4a; --accent: #0e7c7b; --accent-dark: #0a5f5e;
    --sand: #eae7e0; --card: #fcfbf8; --border: #e4e0d6;
    --text: #3a3d45; --muted: #8a8c94; --code-bg: #faf8f3;
    --sans: 'IBM Plex Sans', system-ui, sans-serif;
    --mono: 'IBM Plex Mono', ui-monospace, Menlo, monospace;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: var(--sand); color: var(--text);
    font-family: var(--sans); font-size: 16px; line-height: 1.65; -webkit-font-smoothing: antialiased; }
  .topbar { position: sticky; top: 0; z-index: 10; background: var(--card);
    border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px;
    padding: 12px 24px; }
  .topbar svg { height: 30px; width: 30px; display: block; }
  .topbar .wm { font-family: var(--sans); font-weight: 600; font-size: 18px;
    letter-spacing: -0.015em; color: var(--ink); }
  .topbar .tag { font-family: var(--mono); font-weight: 500; font-size: 8.5px;
    letter-spacing: 0.17em; text-transform: uppercase; color: var(--accent); margin-top: 2px; }
  .topbar .spacer { flex: 1; }
  .topbar a.btn { font-weight: 600; font-size: 14px; color: var(--ink); text-decoration: none;
    border: 1px solid var(--border); border-radius: 999px; padding: 6px 14px; background: #fff; }
  .topbar a.btn:hover { border-color: var(--accent); color: var(--accent-dark); }
  main { max-width: 860px; margin: 0 auto; padding: 40px 24px 96px; }
  main h1 { font-size: 34px; line-height: 1.15; letter-spacing: -0.02em; color: var(--ink); margin: 0 0 8px; }
  main h2 { font-size: 24px; letter-spacing: -0.01em; color: var(--ink); margin: 44px 0 12px;
    padding-top: 14px; border-top: 1px solid var(--border); }
  main h3 { font-size: 18px; color: var(--ink); margin: 28px 0 8px; }
  main h4 { font-size: 15px; color: var(--ink); margin: 22px 0 6px; }
  a { color: var(--accent-dark); text-decoration: none; }
  a:hover { text-decoration: underline; }
  p, li { font-size: 16px; }
  code { font-family: var(--mono); font-size: 0.86em; background: var(--code-bg);
    border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; color: var(--ink); }
  pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 14px 16px; overflow-x: auto; }
  pre code { background: none; border: 0; padding: 0; }
  img { max-width: 100%; height: auto; border: 1px solid var(--border); border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,32,60,.06); margin: 12px 0; }
  blockquote { margin: 16px 0; padding: 10px 16px; background: var(--card);
    border: 1px solid var(--border); border-left: 4px solid var(--accent); border-radius: 6px; }
  blockquote p { margin: 6px 0; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; display: block; overflow-x: auto; }
  th, td { border: 1px solid var(--border); padding: 7px 10px; text-align: left; font-size: 14px; }
  th { background: var(--code-bg); color: var(--ink); }
  hr { border: 0; border-top: 1px solid var(--border); margin: 32px 0; }
  :target { scroll-margin-top: 70px; }
</style>`;

function buildGuide(opts) {
  const { mdPath, imgDir, outDir, htmlLang, title, openHref, openLabel, switchHref, switchLabel } = opts;
  const body = marked.parse(readFileSync(path.join(ROOT, mdPath), 'utf8'));
  const out = path.join(ROOT, outDir);
  mkdirSync(out, { recursive: true });
  cpSync(path.join(ROOT, imgDir), path.join(out, 'images'), { recursive: true });

  const html = `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="icon" type="image/svg+xml" href="${favicon}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
${STYLE}
</head>
<body>
  <div class="topbar">
    ${mark}
    <div><div class="wm">Contour</div><div class="tag">Visual schemas. Clean SHACL.</div></div>
    <div class="spacer"></div>
    <a class="btn" href="${switchHref}">${switchLabel}</a>
    <a class="btn" href="${openHref}" target="_blank" rel="noopener">${openLabel}</a>
  </div>
  <main>
${body}
  </main>
</body>
</html>
`;
  const file = path.join(out, 'index.html');
  writeFileSync(file, html);
  console.log(`guide → ${path.relative(ROOT, file)} (${(html.length / 1024).toFixed(0)} KB)`);
}

buildGuide({
  mdPath: 'docs/data-steward-guide.md', imgDir: 'docs/images', outDir: 'dist/guide',
  htmlLang: 'en', title: 'Contour — Data steward guide',
  openHref: '../', openLabel: 'Open the editor ↗',
  switchHref: 'pt-BR/', switchLabel: 'Português',
});
buildGuide({
  mdPath: 'docs/data-steward-guide.pt-BR.md', imgDir: 'docs/images-pt', outDir: 'dist/guide/pt-BR',
  htmlLang: 'pt-BR', title: 'Contour — Guia do data steward',
  openHref: '../../', openLabel: 'Abrir o editor ↗',
  switchHref: '../', switchLabel: 'English',
});
