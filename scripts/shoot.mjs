// Regenerate the data-steward guide screenshots from the built app.
//
// One-time setup (Playwright is NOT a project dependency, to keep `npm ci` lean):
//   npm i -D playwright && npx playwright install chromium
// Then:
//   npm run build        # produce dist/index.html
//   node scripts/shoot.mjs
//
// Drives dist/index.html headlessly (mostly via click-to-add, which the app
// supports) and writes PNGs into docs/images/. @2x for crisp output.
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const APP = pathToFileURL(path.join(ROOT, 'dist/index.html')).href;
const IMG = path.join(ROOT, 'docs/images');
const VIEWPORT = { width: 1680, height: 1020 };

// Make panels render at full content height for element captures (the inspector
// scrolls internally otherwise).
const EXPAND_CSS = `.workbench, .panel, .panel__body, .canvas__inner {
  height: auto !important; max-height: none !important; overflow: visible !important; }`;

const ok = [];
const fail = [];

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });

  const wait = (ms) => page.waitForTimeout(ms);
  const shot = async (name, target, opts = {}) => {
    try {
      const file = path.join(IMG, `${name}.png`);
      if (target === 'page') await page.screenshot({ path: file, ...opts });
      else await page.locator(target).first().screenshot({ path: file });
      ok.push(name);
    } catch (e) {
      fail.push(`${name}: ${e.message.split('\n')[0]}`);
    }
  };
  const click = async (sel) => { await page.locator(sel).first().click(); await wait(150); };
  const clickText = async (re) => { await page.getByText(re, { exact: false }).first().click(); await wait(150); };
  const tab = async (label) => { await page.getByRole('button', { name: label }).first().click(); await wait(250); };

  // ── Load the Dataset example for the populated states ──────────────────────
  const openExamples = async (name = 'Examples') => {
    await page.getByRole('button', { name }).first().click();
    await wait(200);
  };
  const loadDataset = async (name) => {
    await openExamples(name);
    await page.locator('.ex-menu__item').filter({ hasText: 'Dataset' }).first().click();
    await wait(400);
  };
  await openExamples();
  await shot('examples-menu', '.ex-menu__list');
  await page.locator('.ex-menu__item').filter({ hasText: 'Dataset' }).first().click();
  await wait(400);

  await tab('Visual Editor');
  await shot('interface-overview', 'page');
  await shot('tabs', '.nav-tabs');
  await shot('file-toolbar', '.app-header__file-toolbar');
  await shot('widget-palette', '.workbench > .panel >> nth=0');
  await shot('field-card', '.field >> nth=0');
  await shot('nested-canvas', '.workbench .panel.canvas');
  await shot('nested-shape-card', '.nested-shape-card');

  // ── Inspector states (expand panels to full height first) ──────────────────
  const insp = '.workbench > .panel >> nth=2';
  await page.addStyleTag({ content: EXPAND_CSS });
  await click('.target-banner');               await shot('schema-settings', insp);
  await page.locator('.field').filter({ hasText: 'Title' }).first().click(); await wait(150);
  await shot('field-inspector', insp);
  await page.locator('.field').filter({ hasText: 'Access rights' }).first().click(); await wait(150);
  await shot('enum-inspector', insp);
  await page.locator('.field').filter({ hasText: 'Publisher' }).first().click(); await wait(150);
  await shot('iri-class-inspector', insp);
  await page.locator('.field').filter({ hasText: 'Contact point' }).first().click(); await wait(150);
  await shot('details-inspector', insp);
  await page.locator('.group-card__header').first().click(); await wait(150);
  await shot('group-inspector', insp);

  // ── Issues panel: induce a couple of issues (error + warning), then expand ──
  await page.locator('.field').filter({ hasText: 'Title' }).first().click(); await wait(120);
  const pathInput = page.locator('.form-row').filter({ hasText: 'Property path' }).locator('input').first();
  const savedPath = await pathInput.inputValue();
  await pathInput.fill(''); await wait(150);                 // → "no path" error
  await click('.target-banner');
  const tc = page.locator('.form-row').filter({ hasText: 'Target class' }).locator('input').first();
  const savedTc = await tc.inputValue();
  await tc.fill(''); await wait(250);                        // → "no target class" warning
  await click('.issues-toggle');
  await shot('issues-panel', '.issues-panel');
  // restore both so later shots show the intact schema
  await tc.fill(savedTc); await wait(120);
  await page.locator('.field').filter({ hasText: 'Title' }).first().click(); await wait(120);
  await pathInput.fill(savedPath); await wait(150);
  await click('.issues-toggle');

  // ── Form preview ───────────────────────────────────────────────────────────
  await tab('Form Preview');
  await shot('form-preview-tab', '.preview-pane');

  // ── SHACL Code tab + syntax/JSON-LD + autocomplete ─────────────────────────
  await tab('SHACL Code');
  await wait(300);
  await shot('shacl-code-tab', 'page');
  // JSON-LD export
  await page.locator('.syntax-select select').selectOption('jsonld'); await wait(300);
  await shot('syntax-jsonld', 'page');
  await page.locator('.syntax-select select').selectOption('turtle'); await wait(300);
  // autocomplete: type a partial predicate at the end of the textarea
  const ta = page.locator('.turtle-area');
  await ta.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n:x a sh:Node');
  await wait(500);
  await shot('turtle-autocomplete', 'page');

  // ── Blank-start (New) ──────────────────────────────────────────────────────
  page.on('dialog', (d) => d.accept()); // confirm "discard?"
  await page.getByRole('button', { name: /New/ }).first().click();
  await wait(300);
  await tab('Visual Editor');
  await shot('blank-start', 'page');

  // ── PT-BR overview ─────────────────────────────────────────────────────────
  await loadDataset();
  await page.getByRole('button', { name: 'PT' }).first().click(); await wait(300);
  await tab('Editor Visual');
  await shot('interface-overview-ptbr', 'page');

  // ── §6 Power features: configure one field per feature, capture the section ─
  await page.getByRole('button', { name: 'EN' }).first().click(); await wait(200);
  await loadDataset();
  await tab('Visual Editor');
  const snapSection = async (name, title) => {
    try {
      await page.locator('.insp-section').filter({ hasText: title }).first()
        .screenshot({ path: path.join(IMG, `${name}.png`) });
      ok.push(name);
    } catch (e) { fail.push(`${name}: ${e.message.split('\n')[0]}`); }
  };
  const pickField = async (label) => {
    await page.locator('.field').filter({ hasText: label }).first().click();
    await wait(150);
  };

  // Inverse path (Keyword)
  await pickField('Keyword');
  await page.locator('.insp-check input[type=checkbox]').first().check(); await wait(150);
  await snapSection('inverse-path', 'Basic');

  // Multilingual label (Title)
  await pickField('Title');
  await page.locator('.lang-field__tag').first().fill('en'); await wait(150);
  await page.locator('.trans-row--draft .trans-row__lang-input').first().fill('pt');
  await page.locator('.trans-row--draft input:not(.trans-row__lang-input)').first().fill('Título');
  await page.locator('.trans-row--draft button').first().click(); await wait(150);
  await snapSection('label-languages', 'Basic');

  // Value range (Issued — a date field)
  await pickField('Issued');
  await page.locator('.form-row').filter({ hasText: 'Min (≥)' }).locator('input').first().fill('2000-01-01');
  await page.locator('.form-row').filter({ hasText: 'Max (≤)' }).locator('input').first().fill('2030-12-31');
  await wait(150);
  await snapSection('value-range', 'Constraints');

  // Validation message (Description)
  await pickField('Description');
  await page.locator('.form-row').filter({ hasText: 'Message (sh:message)' }).locator('input').first()
    .fill('Provide a description in at least one language.');
  await page.locator('.form-row').filter({ hasText: 'Severity' }).locator('select').first().selectOption('sh:Warning');
  await wait(150);
  await snapSection('validation-message', 'Validation message');

  // Alternative value types (Publisher)
  await pickField('Publisher');
  await page.getByRole('button', { name: /alternative value types/i }).first().click(); await wait(200);
  await snapSection('alt-types', 'Constraints');

  await browser.close();
  console.log(`\nOK (${ok.length}): ${ok.join(', ')}`);
  if (fail.length) console.log(`\nFAILED (${fail.length}):\n  ${fail.join('\n  ')}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
