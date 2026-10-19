import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const OUT = ".shots/showcase";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const errors = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
const inspect = () => page.evaluate(() => window.__showcase.inspect());
const range = async (id, value) => {
  await page.locator(id).evaluate((el, v) => {
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, String(value));
  await page.waitForTimeout(150);
};
const shot = async (name) =>
  page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
try {
  await page.goto(`${BASE}/3d-showcase`);
  await page.waitForSelector('#scene[data-ready="true"]', { timeout: 30000 });
  assert.equal(await page.locator("#loading").isVisible(), false);
  await shot("01-studio");
  const start = await inspect();
  assert.equal(start.view, "exterior");
  assert.ok(start.calls < 100, `Showroom draw calls: ${start.calls}`);
  await page.getByRole("button", { name: "Boost Blue", exact: true }).click();
  await page.waitForTimeout(350);
  assert.equal((await inspect()).paint, "147bd1");
  await range("#hue", 300);
  assert.equal(
    await page.locator("#paint-name").textContent(),
    "Custom colour",
  );
  assert.notEqual((await inspect()).paint, "147bd1");
  await page
    .getByRole("button", { name: "Championship White", exact: true })
    .click();
  await page.locator('[data-view="driver"]').click();
  await page.waitForTimeout(1200);
  assert.equal((await inspect()).view, "driver");
  await shot("02-driver");
  const beforeLook = (await inspect()).direction;
  await page.locator("#scene").focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(100);
  assert.notDeepEqual((await inspect()).direction, beforeLook);
  await range("#vlt", 10);
  assert.ok((await inspect()).opacity > 0.89);
  await shot("03-dark-tint");
  await range("#vlt", 70);
  await page.locator('[data-view="passenger"]').click();
  await page.waitForTimeout(1200);
  assert.ok((await inspect()).camera[0] > 0);
  await shot("04-passenger");
  await page.getByRole("tab", { name: "02 Environment" }).click();
  await page.locator('[data-weather="rain-day"]').click();
  await page.waitForTimeout(1400);
  assert.equal((await inspect()).rainVisible, true);
  await shot("05-rain");
  const w1 = (await inspect()).wiper;
  await page.waitForTimeout(300);
  assert.notEqual((await inspect()).wiper, w1);
  await page.locator('[data-wipers="off"]').click();
  await page.waitForTimeout(150);
  assert.equal((await inspect()).wiper, -0.98);
  await page.locator('[data-wipers="fast"]').click();
  await page.locator("#drive").click();
  await page.waitForTimeout(650);
  assert.equal((await inspect()).roadVisible, true);
  const motion = await inspect();
  await page.waitForTimeout(300);
  assert.ok((await inspect()).travel > motion.travel);
  assert.notEqual((await inspect()).wheel, motion.wheel);
  await page.locator('[data-weather="rain-night"]').click();
  await page.waitForTimeout(1400);
  await shot("06-night-drive");
  await page.locator("#pause").click();
  await page.waitForTimeout(100);
  const paused = await inspect();
  await page.waitForTimeout(350);
  assert.equal((await inspect()).travel, paused.travel);
  assert.equal((await inspect()).wiper, paused.wiper);
  await page.locator("#reset-all").click();
  await page.waitForTimeout(1300);
  const reset = await inspect();
  assert.equal(reset.view, "exterior");
  assert.equal(reset.paint, "e9e6da");
  assert.equal(reset.roadVisible, false);
  assert.equal(reset.rainVisible, false);
  await page.locator("#scene").focus();
  for (let i = 0; i < 31; i++) await page.keyboard.press("ArrowLeft");
  await shot("07-rear");
  await page.locator("#reset-camera").click();
  // Touch viewport and touch drag, including no horizontal overflow.
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const phone = await mobile.newPage();
  phone.on("pageerror", (error) => errors.push(error.message));
  await phone.goto(`${BASE}/3d-showcase`);
  await phone.waitForSelector('#scene[data-ready="true"]');
  assert.equal(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await phone.screenshot({ path: `${OUT}/08-mobile.png`, fullPage: true });
  await phone.locator('[data-view="driver"]').tap();
  await phone.waitForTimeout(1200);
  await phone.screenshot({ path: `${OUT}/09-mobile-driver.png` });
  await phone.getByRole("tab", { name: "02 Environment" }).tap();
  assert.equal(await phone.locator("#panel-world").isVisible(), true);
  await phone.locator('[data-weather="rain-night"]').tap();
  await phone.locator("#drive").tap();
  assert.equal(
    await phone.locator("#drive").getAttribute("aria-pressed"),
    "true",
  );
  await mobile.close();
  // Reduced motion starts stationary, with an explicit resume option.
  const reduced = await browser.newContext({ reducedMotion: "reduce" });
  const rp = await reduced.newPage();
  await rp.goto(`${BASE}/3d-showcase`);
  await rp.waitForSelector('#scene[data-ready="true"]');
  assert.equal(await rp.locator("#pause").textContent(), "Resume motion");
  await reduced.close();
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      { passed: true, errors, showroom: start, screenshots: OUT },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
