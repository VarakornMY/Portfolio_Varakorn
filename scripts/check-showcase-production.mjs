import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5174";
mkdirSync(".shots/showcase", { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const errors = [];
const results = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 960 },
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: mobile ? 2 : 1,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    if (mobile) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 80,
        downloadThroughput: 200000,
        uploadThroughput: 100000,
        connectionType: "cellular4g",
      });
    }
    await page.goto(`${BASE}/3d-showcase`);
    await page.waitForSelector('#scene[data-ready="true"]', { timeout: 45000 });
    assert.equal(await page.locator("#loading").isVisible(), false);
    assert.equal(
      await page.evaluate(() => typeof window.__showcase),
      "undefined",
    );
    const metrics = await page.evaluate(() => ({
      readyMs: Math.round(
        performance.getEntriesByName("showcase-ready")[0].startTime,
      ),
      transferBytes: performance
        .getEntriesByType("resource")
        .reduce((sum, item) => sum + item.transferSize, 0),
      externalRequests: performance
        .getEntriesByType("resource")
        .filter((x) => new URL(x.name).origin !== location.origin)
        .map((x) => x.name),
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    assert.equal(metrics.overflow, false);
    assert.deepEqual(metrics.externalRequests, []);
    results.push({ mobile, throttled: mobile, ...metrics });
    if (mobile) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
    }
    await page.getByRole("button", { name: "Boost Blue", exact: true }).click();
    assert.equal(await page.locator("#paint-name").textContent(), "Boost Blue");
    if (mobile) {
      await page.evaluate(() => scrollTo(0, 500));
      const rect = await page.locator(".showroom").boundingBox();
      assert.ok(
        rect.y >= -1 && rect.y < 10,
        `Mobile viewer stays visible while customising (y=${rect.y})`,
      );
      await page.screenshot({ path: ".shots/showcase/10-mobile-sticky.png" });
    }
    await page.getByRole("tab", { name: "02 Environment" }).click();
    await page.locator('[data-weather="rain-night"]').click();
    await page.locator("#drive").click();
    await page.locator('[data-view="driver"]').click();
    await page.waitForTimeout(1000);
    assert.equal(await page.locator("#drive-hud").isVisible(), true);
    // The camera surface supports real touch drag, not only mouse emulation.
    if (mobile) {
      const rect = await page.locator("#scene").boundingBox();
      const x = rect.x + rect.width / 2,
        y = rect.y + rect.height / 2;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let i = 1; i <= 8; i++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + i * 9, y }],
        });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    }
    await page.locator("#reset-all").click();
    await page.waitForTimeout(1000);
    assert.equal(
      await page.locator("#paint-name").textContent(),
      "Championship White",
    );
    // A lost graphics context has an actionable fallback, with no blank screen.
    await page
      .locator("#scene canvas")
      .evaluate((canvas) =>
        canvas
          .getContext("webgl2")
          .getExtension("WEBGL_lose_context")
          .loseContext(),
      );
    await page.waitForSelector("#scene-error:not([hidden])");
    assert.equal(await page.locator("#retry").isVisible(), true);
    await context.close();
  }
  const unsupported = await browser.newContext();
  await unsupported.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/.test(type) ? null : original.call(this, type, ...args);
    };
  });
  const fallback = await unsupported.newPage();
  await fallback.goto(`${BASE}/3d-showcase`);
  await fallback.waitForSelector("#scene-error:not([hidden])");
  assert.equal(await fallback.locator("#loading").isVisible(), false);
  await unsupported.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, results, errors }, null, 2));
} finally {
  await browser.close();
}
