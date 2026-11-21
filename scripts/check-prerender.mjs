// Dev-only: the pages that paint themselves from data.js must still carry their
// words in the raw HTML, and hydration must replace that seed cleanly.
import { chromium } from 'playwright';

const BASE = process.env.PORTFOLIO_PREVIEW_URL || 'http://localhost:5173';
const fails = [];
const check = (ok, label) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) fails.push(label);
};

// 1. raw HTML, no JS at all
const strip = (h) =>
  h
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

for (const [path, min, needle] of [
  ['/home', 750, 'Tendervise AI'],
  ['/journey', 500, 'Pasir Salak'],
  ['/experience', 700, 'JAAVIS'],
  ['/blog', 5000, 'Pydantic'],
]) {
  const raw = await (await fetch(BASE + path)).text();
  const words = strip(raw).split(' ').length;
  check(words >= min, `${path}: ${words} words in the source (want ${min}+)`);
  check(strip(raw).includes(needle), `${path}: source mentions "${needle}"`);
  const blocks = [...raw.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  let parsed = 0;
  for (const b of blocks) {
    try {
      JSON.parse(b[1]);
      parsed++;
    } catch {}
  }
  check(blocks.length > 0 && parsed === blocks.length, `${path}: ${parsed}/${blocks.length} JSON-LD blocks parse`);
}

// 2. with JS, the seed is gone and the real UI is there
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.route('**/api/**', route => route.fulfill({json: {offline: true, comments: [], items: []}}));
for (const [path, rows] of [['/experience', 6], ['/journey', 6], ['/home#work', 4]]) {
  await page.goto(BASE + path);
  await page.locator('.front .file-list button').first().waitFor();
  check((await page.locator('.front .file-list button').count()) === rows, path + ' opens its entries');
  check((await page.locator('#document-source').count()) === 0, path + ' replaces the static document');
}
await page.goto(BASE + '/blog#learning-rag-the-hard-way');
const title = await page.locator('.front .reader h1').textContent();
check(/RAG/i.test(title), 'Blog deep link opens the requested article');
await browser.close();
if (errors.length) {
  console.log('\nconsole/page errors:');
  errors.forEach((e) => console.log('  ' + e));
  fails.push('console errors');
}
console.log(fails.length ? `\n${fails.length} failed` : '\nall good');
process.exitCode = fails.length ? 1 : 0;
