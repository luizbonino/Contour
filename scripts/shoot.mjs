// Regenerate the data-steward guide screenshots from the built app, for either
// locale:  node scripts/shoot.mjs            → English  → docs/images/
//          node scripts/shoot.mjs pt-BR      → Português → docs/images-pt/
//
// One-time setup (Playwright is NOT a project dependency, to keep `npm ci` lean):
//   npm i -D playwright && npx playwright install chromium
// Then:  npm run build  &&  node scripts/shoot.mjs [pt-BR]
//
// Selectors are locale-independent (indices / CSS classes / literal
// placeholders) so the same script drives the UI in any language.
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const APP = pathToFileURL(path.join(ROOT, 'dist/index.html')).href;
const LOCALE = process.argv[2] || 'en';
const IMG = path.join(ROOT, LOCALE === 'en' ? 'docs/images' : 'docs/images-pt');
const NEW_NAME = { en: 'New', 'pt-BR': 'Novo' }[LOCALE] || 'New';
const GRAPH_NAME = { en: 'Graph', 'pt-BR': 'Grafo' }[LOCALE] || 'Graph';
const VIEWPORT = { width: 1680, height: 1020 };
const EXPAND_CSS = `.workbench, .panel, .panel__body, .canvas__inner {
  height: auto !important; max-height: none !important; overflow: visible !important; }`;

const ok = [];
const fail = [];

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  page.on('dialog', (d) => d.accept());
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });

  const wait = (ms) => page.waitForTimeout(ms);
  const shot = async (name, target, opts = {}) => {
    try {
      const file = path.join(IMG, `${name}.png`);
      if (target === 'page') await page.screenshot({ path: file, ...opts });
      else await page.locator(target).first().screenshot({ path: file });
      ok.push(name);
    } catch (e) { fail.push(`${name}: ${e.message.split('\n')[0]}`); }
  };
  const snapSection = async (name, idx) => {
    try {
      await page.locator('.insp-section').nth(idx).screenshot({ path: path.join(IMG, `${name}.png`) });
      ok.push(name);
    } catch (e) { fail.push(`${name}: ${e.message.split('\n')[0]}`); }
  };
  const click = async (sel) => { await page.locator(sel).first().click(); await wait(150); };
  const tab = async (i) => { await page.locator('.nav-tabs .nav-link').nth(i).click(); await wait(250); };
  const setLocale = async (i) => { await page.locator('.lang-switch__btn').nth(i).click(); await wait(250); };
  const openExamples = async () => { await page.locator('.ex-menu').nth(1).locator('button').first().click(); await wait(200); };
  const loadDataset = async () => {
    await openExamples();
    await page.locator('.ex-menu__item').filter({ hasText: 'Dataset' }).first().click();
    await wait(400);
  };
  const pickField = async (label) => {
    await page.locator('.field').filter({ hasText: label }).first().click();
    await wait(150);
  };
  const insp = '.workbench > .panel >> nth=2';

  if (LOCALE !== 'en') await setLocale(1); // switch UI to Portuguese

  // ── Populated states (Dataset example) ────────────────────────────────────
  await openExamples();
  await shot('examples-menu', '.ex-menu__list');
  await page.locator('.ex-menu__item').filter({ hasText: 'Dataset' }).first().click();
  await wait(400);

  await tab(1); // Visual Editor
  await shot('interface-overview', 'page');
  await shot('tabs', '.nav-tabs');
  await shot('file-toolbar', '.app-header__file-toolbar');
  await shot('widget-palette', '.workbench > .panel >> nth=0');
  await shot('field-card', '.field >> nth=0');
  await shot('nested-canvas', '.workbench .panel.canvas');
  await shot('nested-shape-card', '.nested-shape-card');

  // ── Inspector states (panels expanded to full height) ──────────────────────
  await page.addStyleTag({ content: EXPAND_CSS });
  await click('.target-banner');            await shot('schema-settings', insp);
  await pickField('Title');                 await shot('field-inspector', insp);
  await pickField('Access rights');         await shot('enum-inspector', insp);
  await pickField('Publisher');             await shot('iri-class-inspector', insp);
  await pickField('Contact point');         await shot('details-inspector', insp);
  await click('.group-card__header');       await shot('group-inspector', insp);

  // ── Issues panel: induce error + warning, capture, restore ─────────────────
  const pathInput = () => page.locator('input[placeholder="dct:title"]').first();
  const tcInput = () => page.locator('input[placeholder="dcat:Dataset"]').first();
  await pickField('Title'); await pathInput().fill(''); await wait(150);
  await click('.target-banner'); await tcInput().fill(''); await wait(250);
  await click('.issues-toggle');
  await shot('issues-panel', '.issues-panel');
  await tcInput().fill('dcat:Dataset'); await wait(120);
  await pickField('Title'); await pathInput().fill('dct:title'); await wait(150);
  await click('.issues-toggle');

  // ── Form preview + SHACL Code (+ JSON-LD, autocomplete) ────────────────────
  await tab(2); await shot('form-preview-tab', '.preview-pane');
  await tab(0); await wait(300); await shot('shacl-code-tab', 'page');
  // Graph overlay (deterministic layout: spiral seed + fixed warm-up)
  await page.getByRole('button', { name: GRAPH_NAME }).first().click();
  await wait(1800);
  await shot('schema-graph', '.graph-modal');
  await page.keyboard.press('Escape'); await wait(200);
  await page.locator('.syntax-select select').selectOption('jsonld'); await wait(300);
  await shot('syntax-jsonld', 'page');
  await page.locator('.syntax-select select').selectOption('turtle'); await wait(300);
  await page.locator('.turtle-area').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n:x a sh:Node');
  await wait(500);
  await shot('turtle-autocomplete', 'page');

  // ── Blank start ────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: NEW_NAME }).first().click(); await wait(300);
  await tab(1); await shot('blank-start', 'page');

  // ── §6 Power features: one field per feature, capture the section ──────────
  await loadDataset(); await tab(1);
  await pickField('Keyword');
  await page.locator('.insp-check input[type=checkbox]').first().check(); await wait(150);
  await snapSection('inverse-path', 0); // Basic

  await pickField('Title');
  await page.locator('.lang-field__tag').first().fill('en'); await wait(150);
  await page.locator('.trans-row--draft .trans-row__lang-input').first().fill('pt');
  await page.locator('.trans-row--draft input:not(.trans-row__lang-input)').first().fill('Título');
  await page.locator('.trans-row--draft button').first().click(); await wait(150);
  await snapSection('label-languages', 0); // Basic

  await pickField('Issued');
  await page.locator('input[placeholder="≥"]').first().fill('2000-01-01');
  await page.locator('input[placeholder="≤"]').first().fill('2030-12-31'); await wait(150);
  await snapSection('value-range', 1); // Constraints

  await pickField('Description');
  await page.locator('.insp-section').nth(2).locator('input').first().fill('Provide a description in at least one language.');
  await page.locator('.insp-section').nth(2).locator('select').first().selectOption('sh:Warning'); await wait(150);
  await snapSection('validation-message', 2); // Validation message

  await pickField('Publisher');
  await page.getByRole('button', { name: /sh:or/ }).first().click(); await wait(200);
  await snapSection('alt-types', 1); // Constraints

  // ── EN guide only: a Portuguese interface overview ─────────────────────────
  if (LOCALE === 'en') {
    await loadDataset();
    await setLocale(1); // PT
    await tab(1);
    await shot('interface-overview-ptbr', 'page');
  }

  await browser.close();
  console.log(`[${LOCALE}] OK (${ok.length}): ${ok.join(', ')}`);
  if (fail.length) console.log(`[${LOCALE}] FAILED (${fail.length}):\n  ${fail.join('\n  ')}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
