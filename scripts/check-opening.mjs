// Read-only browser checks for the opening. No account or database writes.
// Uses the same installed Edge/Playwright setup as the other visual checks.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const OUT = '.shots/opening';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const watch = (target) => target.on('pageerror', (error) => errors.push(error.message));
watch(page);

async function ready(target) {
  await target.waitForSelector('.opening[data-state="ready"]', { timeout: 30000 });
}
async function home(target) {
  await target.waitForSelector('.opening', { state: 'detached', timeout: 20000 });
  await target.waitForSelector('.opening-replay', { state: 'attached' });
  assert.equal(await target.locator('html').evaluate((el) => el.classList.contains('opening-active')), false);
  assert.equal(await target.locator('#content').evaluate((el) => el.inert), false);
  assert.equal(await target.locator('.hero-title').first().textContent(), 'Varakorn');
}
async function seek(target, progress) {
  await target.locator('.opening').evaluate((el, p) => {
    el.scrollTo({ top: (el.scrollHeight - el.clientHeight) * p, behavior: 'instant' });
  }, progress);
  await target.waitForFunction((p) => Math.abs(Number(document.querySelector('.opening')?.dataset.progress) - p) < .003, progress);
}
async function shot(target, name) {
  await target.screenshot({ path: `${OUT}/${name}.png` });
}

try {
  await page.goto(`${BASE}/home?intro=1`);
  await ready(page);
  assert.equal(await page.locator('#content').evaluate((el) => el.inert), true);
  await shot(page, '01-eyes-desktop');
  await page.mouse.move(140, 320);
  await page.waitForTimeout(450);
  await shot(page, '01a-eyes-follow-left');
  await page.mouse.move(1300, 320);
  await page.waitForTimeout(450);
  await shot(page, '01b-eyes-follow-right');
  await page.mouse.move(720, 450);
  // Keyboard focus stays in the opening, and the visible advance control works.
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.opening__skip').evaluate((el) => document.activeElement === el), true);
  await page.locator('.opening__hint').click();
  await page.waitForFunction(() => Number(document.querySelector('.opening')?.dataset.progress) > .1);
  await page.mouse.move(720, 450);
  await page.mouse.wheel(0, 1000);
  await page.waitForFunction(() => Number(document.querySelector('.opening')?.dataset.progress) > .25);
  await seek(page, .23);
  await shot(page, '01c-kneeling-desktop');
  await seek(page, .305);
  await shot(page, '02-left-pull-desktop');
  assert.ok(Number((await page.locator('.opening__tension-number').textContent()).replace('%', '')) > 65);
  await seek(page, .432);
  await shot(page, '03-right-pull-desktop');
  await seek(page, .552);
  await shot(page, '04-third-pull-desktop');
  await seek(page, .672);
  await shot(page, '05-fourth-pull-desktop');
  await seek(page, .745);
  assert.equal(await page.locator('.opening').getAttribute('data-state'), 'ready', 'Chains stay attached before the rise finishes');
  await shot(page, '05b-almost-standing');
  // Standing itself triggers the release and finale without another scroll.
  await page.keyboard.press('End');
  await page.waitForSelector('.opening[data-state="freed"]', { timeout: 10000 });
  await page.waitForTimeout(350);
  await shot(page, '06-standing-chain-break-desktop');
  await page.waitForSelector('.opening[data-state="shattering"]', { timeout: 10000 });
  await page.waitForTimeout(600);
  await shot(page, '07-shatter-desktop');
  await page.waitForSelector('.opening[data-state="404"]', { timeout: 10000 });
  await page.waitForTimeout(350);
  await shot(page, '08-404-desktop');
  await home(page);
  assert.equal(await page.locator('.hero-title').first().evaluate((el) => document.activeElement === el), true);
  await page.waitForTimeout(900);
  await shot(page, '09-home-desktop');
  await page.reload();
  await home(page);
  assert.equal(await page.locator('.opening').count(), 0);
  console.log('PASS: eye tracking shots, kneeling rise, four pulls, standing release, shatter, 404, automatic home, session persistence');

  await page.evaluate(() => scrollTo({ top: 800, behavior: 'instant' }));
  const before = await page.evaluate(() => scrollY);
  await page.locator('.opening-replay').click();
  await ready(page);
  await page.keyboard.press('Escape');
  await home(page);
  assert.equal(await page.evaluate(() => scrollY), before);
  assert.equal(await page.locator('.opening-replay').evaluate((el) => document.activeElement === el), true);
  await page.locator('.opening-replay').click();
  await ready(page);
  await page.locator('.opening__skip').click();
  await home(page);
  console.log('PASS: replay, Escape, skip, focus restoration, scroll restoration');

  await page.locator('.opening-replay').click();
  await ready(page);
  await page.setViewportSize({ width: 900, height: 800 });
  await home(page);
  assert.equal(await page.locator('.opening-replay').isVisible(), false);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.opening-replay').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.opening').count(), 0);
  console.log('PASS: resizing below desktop exits the intro and hides replay');

  for (const [name, viewport, touch] of [
    ['phone', { width: 390, height: 844 }, true],
    ['phone-landscape', { width: 844, height: 390 }, true],
    ['wide-touch-tablet', { width: 1280, height: 800 }, true],
    ['small-desktop-window', { width: 900, height: 800 }, false],
  ]) {
    const mobile = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
    const phone = await mobile.newPage();
    watch(phone);
    const introRequests = [];
    phone.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.endsWith('.vrm') || path.endsWith('/intro/scene.js')) introRequests.push(path);
    });
    // Even an explicit replay URL cannot show the intro on a mobile device.
    await phone.goto(`${BASE}/home?intro=1`);
    await home(phone);
    assert.equal(await phone.locator('.opening').count(), 0);
    assert.equal(await phone.locator('.opening-replay').isVisible(), false);
    assert.deepEqual(introRequests, [], `${name} must not download the intro scene or model`);
    if (name === 'phone') await shot(phone, '10-mobile-direct-home');
    await mobile.close();
    console.log(`PASS: ${name} goes directly home with no intro, replay or character download`);
  }
  const reduced = await browser.newContext({ reducedMotion: 'reduce' });
  const quiet = await reduced.newPage();
  watch(quiet);
  let modelRequests = 0;
  quiet.on('request', (request) => { if (request.url().endsWith('.vrm')) modelRequests++; });
  await quiet.goto(`${BASE}/home?intro=1`);
  await home(quiet);
  assert.equal(modelRequests, 0);
  assert.equal(await quiet.locator('.opening-replay').isVisible(), false);
  await reduced.close();
  console.log('PASS: reduced motion bypasses animation and model download');

  const fallback = await browser.newContext();
  const broken = await fallback.newPage();
  watch(broken);
  await broken.route('**/*.vrm', (route) => route.fulfill({ status: 404, body: 'Missing test character' }));
  await broken.goto(`${BASE}/home?intro=1`);
  await home(broken);
  await fallback.close();

  const noGpu = await browser.newContext();
  const flat = await noGpu.newPage();
  watch(flat);
  await flat.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (/webgl/.test(type)) return null;
      return original.call(this, type, ...args);
    };
  });
  await flat.goto(`${BASE}/home?intro=1`);
  await home(flat);
  await noGpu.close();
  console.log('PASS: missing character and unavailable WebGL still reveal the home');

  await page.goto(`${BASE}/home?intro=1`);
  await ready(page);
  await page.evaluate(() => {
    const canvas = document.querySelector('.opening__canvas');
    canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();
  });
  await home(page);
  await page.goto(`${BASE}/home#about`);
  await home(page);
  assert.equal(await page.locator('.opening').count(), 0);
  console.log('PASS: context loss fallback and direct section links');
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log(`Opening checks passed. Screenshots: ${OUT}/`);
} finally {
  await browser.close();
}
