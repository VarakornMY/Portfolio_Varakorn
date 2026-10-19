import * as THREE from "three";

// A persistent water layer on the windscreen, cleared by the actual blade arcs.
// This is attached to the glass in world space, so looking away never moves it.
export function createWindscreenRain(car) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 384;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    opacity: 0.78,
  });
  const layer = car.quad(
    [-0.811, 0.965, 1.06],
    [0.811, 0.965, 1.06],
    [0.646, 1.348, 0.178],
    [-0.646, 1.348, 0.178],
    material,
  );
  layer.renderOrder = 7;
  layer.castShadow = false;
  let previous = -0.98,
    accum = 0,
    wasRaining = false,
    seed = 234;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const width = 768,
    height = 384;
  function sweep(angle, oldAngle) {
    if (Math.abs(angle - oldAngle) < 0.0001) return;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,1)";
    for (const pivot of [-0.39, 0.34]) {
      const px = (pivot / 1.622 + 0.5) * width,
        py = height * 0.984,
        rx = (0.57 / 1.622) * width,
        ry = (0.57 / 0.962) * height;
      ctx.beginPath();
      ctx.moveTo(px, py);
      const steps = Math.max(2, Math.ceil(Math.abs(angle - oldAngle) * 20));
      for (let i = 0; i <= steps; i++) {
        const a = oldAngle + ((angle - oldAngle) * i) / steps;
        ctx.lineTo(px - Math.sin(a) * rx, py - Math.cos(a) * ry);
      }
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - Math.sin(angle) * rx, py - Math.cos(angle) * ry);
      ctx.strokeStyle = "#000";
      ctx.stroke();
    }
    ctx.restore();
  }
  function update(dt, state, angle) {
    const raining = state.weather.startsWith("rain");
    layer.visible = raining;
    if (!raining) {
      if (wasRaining) {
        ctx.clearRect(0, 0, width, height);
        texture.needsUpdate = true;
      }
      wasRaining = false;
      previous = angle;
      return;
    }
    wasRaining = true;
    accum += dt;
    if (accum < 1 / 30) return;
    const ticks = accum;
    accum = 0;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.08, ticks * 0.22)})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    // Slow runoff, new beads and highlights. Water persists until wiped or drained.
    for (let i = 0; i < Math.ceil(ticks * 140); i++) {
      const x = rand() * width,
        y = rand() * height,
        r = 1.0 + rand() * 3;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.64, r, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(146,177,187,.35)";
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x - 0.45, y - 0.6, r * 0.34, r * 0.48, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(239,251,255,.60)";
      ctx.fill();
      if (rand() > 0.9) {
        ctx.strokeStyle = "rgba(181,211,218,.25)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 0.3, y + 8 + rand() * 13);
        ctx.stroke();
      }
    }
    sweep(angle, previous);
    previous = angle;
    texture.needsUpdate = true;
  }
  return { update, texture, layer };
}
