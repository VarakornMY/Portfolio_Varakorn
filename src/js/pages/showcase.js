import "../../styles/showcase.css";
import { DEFAULTS, PAINTS } from "../showcase/config.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = {
  ...DEFAULTS,
  paused: matchMedia("(prefers-reduced-motion: reduce)").matches,
};
let scene = null;
let pageClosed = false;
const announce = (text) => {
  $("#announcement").textContent = text;
};
const swatches = $("#swatches");
for (const paint of PAINTS) {
  const button = document.createElement("button");
  button.className = "swatch";
  button.style.setProperty("--swatch", paint.hex);
  button.style.setProperty(
    "--check",
    paint.hex === "#e9e6da" ? "#506043" : "#ffffff",
  );
  button.dataset.paint = paint.hex;
  button.setAttribute("aria-label", paint.name);
  button.title = paint.name;
  button.setAttribute("aria-pressed", String(paint.hex === state.paint));
  button.addEventListener("click", () => {
    setPaint(paint.hex, paint.name);
    announce(`${paint.name} paint selected.`);
  });
  swatches.appendChild(button);
}
function hexToHsl(hex) {
  let [r, g, b] = hex.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min,
    l = (max + min) / 2;
  let h = 0,
    s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h =
      max === r
        ? ((g - b) / d) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return {
    hue: Math.round(h),
    saturation: Math.round(s * 100),
    lightness: Math.round(l * 100),
  };
}
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
function syncSliders() {
  for (const key of ["hue", "saturation", "lightness"]) {
    $(`#${key}`).value = state[key];
    $(`#${key}-value`).value = `${state[key]}${key === "hue" ? "°" : "%"}`;
  }
}
function setPaint(hex, name = "Custom colour", sync = true) {
  state.paint = hex;
  state.paintName = name;
  if (sync) {
    Object.assign(state, hexToHsl(hex));
    syncSliders();
  }
  $("#paint-name").textContent = name;
  $("#paint-hex").textContent = hex.toUpperCase();
  $("#custom-colour").value = hex;
  $$("[data-paint]").forEach((button) =>
    button.setAttribute("aria-pressed", String(button.dataset.paint === hex)),
  );
}
$("#custom-colour").addEventListener("input", (e) => setPaint(e.target.value));
for (const key of ["hue", "saturation", "lightness"])
  $(`#${key}`).addEventListener("input", (e) => {
    state[key] = Number(e.target.value);
    syncSliders();
    setPaint(
      hslToHex(state.hue, state.saturation, state.lightness),
      "Custom colour",
      false,
    );
  });
// The full 0–100 lightness interval keeps the colour picker and sliders in sync.
$("#lightness").min = "0";
$("#lightness").max = "100";

function pressed(name, value) {
  $$(`[data-${name}]`).forEach((button) =>
    button.setAttribute("aria-pressed", String(button.dataset[name] === value)),
  );
}
function setTint(value) {
  state.vlt = Number(value);
  $("#vlt").value = state.vlt;
  $("#vlt-value").innerHTML = `${state.vlt}<span>%</span>`;
  $("#glass-sample").style.opacity = 1 - state.vlt / 100;
  $("#tint-description").textContent =
    state.vlt >= 65
      ? "Light tint · open visibility"
      : state.vlt >= 35
        ? "Medium tint · softer light"
        : "Deep tint · reduced visibility";
}
$("#vlt").addEventListener("input", (e) => setTint(e.target.value));
$$("[data-finish]").forEach((button) =>
  button.addEventListener("click", () => {
    state.finish = button.dataset.finish;
    pressed("finish", state.finish);
  }),
);

function selectTab(name, focus = false) {
  $$("[data-tab]").forEach((button) => {
    const on = button.dataset.tab === name;
    button.setAttribute("aria-selected", String(on));
    button.tabIndex = on ? 0 : -1;
    if (on && focus) button.focus();
  });
  $("#panel-style").hidden = name !== "style";
  $("#panel-world").hidden = name !== "world";
}
$$("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => selectTab(button.dataset.tab));
  button.addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      selectTab(
        e.key === "Home"
          ? "style"
          : e.key === "End"
            ? "world"
            : button.dataset.tab === "style"
              ? "world"
              : "style",
        true,
      );
    }
  });
});
$("#explore-weather").addEventListener("click", () => selectTab("world", true));

function syncWorld() {
  pressed("environment", state.environment);
  pressed("weather", state.weather);
  pressed("wipers", state.wipers);
  $("#garage").dataset.dark = String(state.weather.includes("night"));
  const weatherName = {
    day: "DAYLIGHT",
    night: "AFTER DARK",
    "rain-day": "RAINY DAY",
    "rain-night": "RAINY NIGHT",
  };
  $("#scene-label").textContent =
    `${state.environment === "studio" ? "STUDIO" : state.driving ? "DRIVING" : "OPEN ROAD"} / ${weatherName[state.weather]}`;
  $("#weather-note").textContent =
    state.environment === "studio"
      ? "Studio lighting brings out every curve."
      : state.weather.startsWith("rain")
        ? "Rain beads on the glass. Wipers clear each swept arc."
        : state.weather === "night"
          ? "Headlights on. A different side of the city."
          : "Open skies. Take your time with the horizon.";
  $("#drive").setAttribute("aria-pressed", String(state.driving));
  $("#drive-label").textContent = state.driving
    ? "Stop the drive"
    : "Start a virtual drive";
  $("#drive-hud").hidden = !state.driving;
  $("#speed").value = state.speed;
  $("#speed-value").value = `${state.speed} km/h`;
  $("#hud-speed").textContent = state.speed;
  $("#hud-gear").textContent = Math.min(
    6,
    Math.max(1, Math.ceil(state.speed / 22)),
  );
  $("#pause").setAttribute("aria-pressed", String(state.paused));
  $("#pause").textContent = state.paused ? "Resume motion" : "Pause motion";
  $("#rotate").setAttribute("aria-pressed", String(state.autoRotate));
}
$$("[data-environment]").forEach((button) =>
  button.addEventListener("click", () => {
    state.environment = button.dataset.environment;
    if (state.environment === "studio") state.driving = false;
    syncWorld();
  }),
);
$$("[data-weather]").forEach((button) =>
  button.addEventListener("click", () => {
    state.weather = button.dataset.weather;
    state.environment = "road";
    syncWorld();
    announce(`${button.querySelector("strong").textContent} on the open road.`);
  }),
);
$$("[data-wipers]").forEach((button) =>
  button.addEventListener("click", () => {
    state.wipers = button.dataset.wipers;
    pressed("wipers", state.wipers);
  }),
);
$("#speed").addEventListener("input", (e) => {
  state.speed = Number(e.target.value);
  syncWorld();
});
$("#drive").addEventListener("click", () => {
  state.driving = !state.driving;
  if (state.driving) {
    state.environment = "road";
    state.paused = false;
  }
  syncWorld();
  announce(
    state.driving
      ? "Virtual drive started. Choose driver or passenger to ride inside."
      : "Drive stopped.",
  );
});
$("#pause").addEventListener("click", () => {
  state.paused = !state.paused;
  syncWorld();
  announce(
    state.paused
      ? "Animation paused. You can still move the camera."
      : "Animation resumed.",
  );
});
$("#rotate").addEventListener("click", () => {
  state.autoRotate = !state.autoRotate;
  if (state.autoRotate) state.paused = false;
  syncWorld();
});

function selectView(view) {
  state.view = view;
  pressed("view", view);
  $("#garage").dataset.interior = String(view !== "exterior");
  $("#rotate").disabled = view !== "exterior";
  $("#camera-help").innerHTML =
    view === "exterior"
      ? '<span aria-hidden="true">⤧</span> Drag to orbit <span class="help-separator">·</span> Scroll to explore'
      : '<span aria-hidden="true">⤧</span> Drag to look around <span class="help-separator">·</span> Your seat. Your view.';
  announce(
    view === "exterior"
      ? "Exterior view. Drag to orbit the car."
      : `${view === "driver" ? "Right hand driver" : "Front passenger"} view. Drag to turn your head. Arrow keys also work.`,
  );
}
$$("[data-view]").forEach((button) =>
  button.addEventListener("click", () => selectView(button.dataset.view)),
);
$("#reset-camera").addEventListener("click", () => scene?.resetCamera());
$("#reset-all").addEventListener("click", () => {
  Object.assign(state, DEFAULTS, {
    paused: matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
  setPaint(state.paint, state.paintName);
  setTint(state.vlt);
  pressed("finish", state.finish);
  selectView("exterior");
  syncWorld();
  selectTab("style");
  scene?.resetCamera();
  announce("Garage reset to Championship White in the daylight studio.");
});
$("#fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $("#garage").requestFullscreen();
  } catch {
    announce("Fullscreen is unavailable in this browser.");
  }
});
document.addEventListener("fullscreenchange", () => {
  $("#fullscreen").setAttribute(
    "aria-label",
    document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen",
  );
});
if (!document.documentElement.requestFullscreen) $("#fullscreen").hidden = true;
$("#retry").addEventListener("click", () => location.reload());

function failure(message) {
  $("#loading").hidden = true;
  $("#scene-error").hidden = false;
  $("#error-message").textContent = message;
  $("#scene").dataset.ready = "false";
}
setPaint(state.paint, state.paintName);
setTint(state.vlt);
syncWorld();
async function start() {
  try {
    const { createShowcaseScene } = await import("../showcase/scene.js");
    scene = await createShowcaseScene($("#scene"), state, failure, () => {
      $("#loading").hidden = true;
    });
    if (pageClosed) {
      scene.dispose();
      return;
    }
    // Development-only probes let the browser checks verify actual 3D state.
    if (import.meta.env.DEV)
      window.__showcase = {
        inspect: () => scene.inspect(),
        state: () => ({ ...state }),
      };
  } catch (error) {
    console.error("[showcase]", error);
    failure(
      error.showcaseMessage ||
        "Your browser could not start the 3D scene. Enable hardware acceleration and reload the garage.",
    );
  }
}
start();
addEventListener("pagehide", (e) => {
  if (!e.persisted) {
    pageClosed = true;
    scene?.dispose();
  }
});
