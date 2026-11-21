import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.PORTFOLIO_PREVIEW_URL || 'http://127.0.0.1:5173';
const out = '.shots/retro';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];
async function pageFor(options) {
  const context = await browser.newContext(options);
  // Exercise the UI without creating visits or contacting the live database.
  await context.route('**/api/**', (route) =>
    route.fulfill({ json: { items: [], comments: [], testimonials: [], offline: true } }),
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.setDefaultTimeout(6000);
  return page;
}
try {
  const pc = await pageFor({ viewport: { width: 1366, height: 820 } });
  await pc.goto(base);
  await pc.locator('.shortcut').first().waitFor();
  await pc.locator('.boot').waitFor({ state: 'hidden' });
  assert.equal(await pc.locator('.shortcut:visible').count(), 10);
  await pc.screenshot({ path: out + '/desktop.png' });
  await pc.locator('.shortcut[data-launch="about"]').click();
  await pc.locator('.retro-window.front h1').waitFor();
  await pc.locator('.shortcut[data-launch="projects"]').click();
  assert.equal(await pc.locator('.retro-window:visible').count(), 2);
  await pc.getByRole('button', { name: /Kratos-Sync/ }).click();
  assert.equal(await pc.locator('.front h1').textContent(), 'Kratos-Sync');
  const bar = pc.locator('.front .titlebar');
  const pos = await bar.boundingBox();
  await pc.mouse.move(pos.x + 90, pos.y + 13);
  await pc.mouse.down();
  await pc.mouse.move(pos.x + 51, pos.y + 50);
  await pc.mouse.up();
  assert.ok((await bar.boundingBox()).x < pos.x - 25, 'title bar moves window');
  const beforeResize = await pc.locator('.front').boundingBox();
  await pc.mouse.move(beforeResize.x + beforeResize.width - 5,beforeResize.y + beforeResize.height - 5);
  await pc.mouse.down();
  await pc.mouse.move(beforeResize.x + beforeResize.width - 80,beforeResize.y + beforeResize.height - 60);
  await pc.mouse.up();
  assert.ok((await pc.locator('.front').boundingBox()).width < beforeResize.width - 40, 'resize grip changes window size');
  await pc.locator('.front [data-win=max]').click();
  assert.ok((await pc.locator('.front').boundingBox()).width >= 1365);
  await pc.locator('.front [data-win=min]').click();
  await pc.locator('[data-launch=projects].shortcut').click();
  assert.equal(await pc.locator('.front h1').textContent(), 'Kratos-Sync');
  await pc.locator('.front [data-win=close]').click();
  await pc.screenshot({ path: out + '/window.png' });
  await pc.goto(base + '/blog#learning-rag-the-hard-way');
  assert.match(await pc.locator('.front h1').innerText(), /RAG/);
  await pc.getByRole('searchbox').fill('zzzzz');
  assert.ok(await pc.getByText('No matching entries.').count());
  await pc.goto(base + '/experience/ai-specialist-p10x-media');
  await pc.locator('.front [data-guestbook]').waitFor();
  assert.match(await pc.locator('.front h1').innerText(), /P10X/);
  for (const path of [
    'privacy',
    'terms',
    'account',
    'contact',
    'journey',
    'home#resume',
    'home#chat',
    'home#guestbook',
  ]) {
    await pc.goto(base + '/' + path);
    await pc.locator('.front .reader, .front .chat-room').first().waitFor({ state: 'attached' });
  }
  console.log('Desktop apps, window management, search and direct links passed.');

  for (const [width, height] of [
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    const phone = await pageFor({ viewport: { width, height }, isMobile: true, hasTouch: true });
    await phone.goto(base + '/home');
    await phone.locator('.boot').waitFor({ state: 'hidden' });
    await phone.locator('.pocket-status').waitFor();
    const control = (key) => phone.locator('[data-control=' + key + ']').tap();
    if (width === 390) await phone.screenshot({ path: out + '/handheld.png' });
    const bounds = await phone.locator('[data-control=start]').boundingBox();
    assert.ok(
      bounds.y >= 0 && bounds.y + bounds.height <= height + 1,
      'Start stays on the console',
    );
    assert.equal(
      await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await control('right');
    await control('a');
    assert.match(await phone.locator('.front .titlebar').innerText(), /Projects/);
    await control('down');
    assert.match(await phone.locator('[data-pad-focus]:focus').innerText(),/Abang Mystery/);
    await control('up');
    await control('a');
    assert.equal(await phone.locator('.front .reader:visible h1').innerText(), 'Tendervise AI');
    if (width === 390) await phone.screenshot({ path: out + '/handheld-reader.png' });
    await control('down');
    await control('select');
    assert.equal(await phone.locator('.front h1').innerText(), 'Help');
    await control('b');
    assert.equal(await phone.locator('.front .reader:visible h1').innerText(), 'Tendervise AI');
    await control('b');
    assert.ok(await phone.locator('.front .file-list').isVisible());
    await control('start');
    await control('select');
    assert.equal(await phone.locator('.front h1').innerText(), 'Help');
    await control('b');
    await phone.locator('[data-launch=experience].shortcut').tap();
    await control('a');
    await control('right');
    await control('a');
    await phone.locator('.front [data-guestbook]').waitFor();
    assert.match(phone.url(), /experience\/ai-specialist-p10x/);
    await control('b');
    await control('start');
    await phone.locator('.shortcut[data-launch=account]').tap();
    await phone.locator('.front [data-acct] h1').waitFor();
    if (await phone.locator('[data-open-auth]').count()) {
      await phone.locator('[data-open-auth]').tap();
      await phone.locator('.display-area .authdlg.is-open').waitFor();
      const modal = await phone.locator('.ad-card').boundingBox();
      const screen = await phone.locator('.display-area').boundingBox();
      assert.ok(modal.y + modal.height <= screen.y + screen.height, 'sign-in stays in the screen');
      await control('b');
      await phone.locator('.authdlg.is-open').waitFor({state:'hidden'});
    }
    await control('start');
    await phone.locator('.deck-sound').tap();
    await phone.reload();
    assert.equal(await phone.locator('.deck-sound').getAttribute('aria-pressed'), 'false');
    await phone.context().close();
    console.log('Handheld controls and reading passed at ' + width + '×' + height);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
