import * as THREE from "three";

export function canvasTexture(width, height, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createMaterials() {
  const grain = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#777777";
    ctx.fillRect(0, 0, w, h);
    let seed = 461;
    for (let i = 0; i < 7000; i++) {
      seed = (seed * 16807) % 2147483647;
      const v = 80 + (seed % 80);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(seed % w, Math.floor(seed / w) % h, 1, 1);
    }
  });
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(5, 5);
  grain.colorSpace = THREE.NoColorSpace;
  const carbon = canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = "#151918";
    ctx.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 8)
      for (let y = 0; y < 64; y += 8) {
        ctx.fillStyle = (x + y) % 16 === 0 ? "#292d2b" : "#111513";
        ctx.fillRect(x, y, 7, 7);
        ctx.fillStyle = "#363a37";
        ctx.fillRect(x, y, 6, 1);
      }
  });
  carbon.wrapS = carbon.wrapT = THREE.RepeatWrapping;
  carbon.repeat.set(6, 2);
  const grille = canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = "#060908";
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = "#363d38";
    ctx.lineWidth = 2;
    for (let y = -10; y < 140; y += 14)
      for (let x = -10; x < 270; x += 24) {
        const ox = x + (Math.round(y / 14) % 2) * 12;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          ctx.lineTo(ox + Math.cos(a) * 8, y + Math.sin(a) * 8);
        }
        ctx.closePath();
        ctx.stroke();
      }
  });
  const tread = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#202321";
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "#080b09";
    ctx.lineWidth = 5;
    for (let x = 42; x < 250; x += 55) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    ctx.lineWidth = 2;
    for (let y = 0; y < 280; y += 16)
      for (let x = 0; x < 260; x += 55) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 42, y + 14);
        ctx.stroke();
      }
  });
  tread.wrapS = tread.wrapT = THREE.RepeatWrapping;
  tread.repeat.set(1, 5);
  const standard = (color, roughness = 0.5, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return {
    paint: new THREE.MeshPhysicalMaterial({
      color: "#e9e6da",
      metalness: 0.32,
      roughness: 0.23,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      side: THREE.DoubleSide,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: "#c4d5d0",
      metalness: 0.05,
      roughness: 0.08,
      transparent: true,
      opacity: 0.27,
      side: THREE.DoubleSide,
      depthWrite: false,
      envMapIntensity: 1.6,
    }),
    black: standard("#101715", 0.36, 0.15),
    rubber: standard("#0d110f", 0.85),
    tyre: new THREE.MeshStandardMaterial({
      color: "#686b69",
      map: tread,
      bumpMap: tread,
      bumpScale: 0.003,
      roughness: 0.92,
    }),
    alloy: standard("#333b38", 0.32, 0.85),
    chrome: standard("#bec7c1", 0.2, 0.94),
    brake: standard("#747972", 0.6, 0.8),
    caliper: standard("#c91e26", 0.37, 0.3),
    carbon: new THREE.MeshStandardMaterial({
      map: carbon,
      roughness: 0.38,
      metalness: 0.35,
    }),
    leather: new THREE.MeshStandardMaterial({
      color: "#202923",
      bumpMap: grain,
      bumpScale: 0.0015,
      roughness: 0.86,
    }),
    suede: new THREE.MeshStandardMaterial({
      color: "#be152b",
      bumpMap: grain,
      bumpScale: 0.0015,
      roughness: 0.95,
    }),
    carpet: new THREE.MeshStandardMaterial({
      color: "#831323",
      bumpMap: grain,
      bumpScale: 0.002,
      roughness: 1,
    }),
    headlight: new THREE.MeshStandardMaterial({
      color: "#e5f4ff",
      emissive: "#b7d9ff",
      emissiveIntensity: 2.3,
      roughness: 0.2,
    }),
    taillight: new THREE.MeshStandardMaterial({
      color: "#bd0610",
      emissive: "#ff1022",
      emissiveIntensity: 1.4,
      roughness: 0.24,
    }),
    grille: new THREE.MeshStandardMaterial({
      map: grille,
      roughness: 0.67,
      metalness: 0.25,
    }),
    textures: [grain, carbon, grille, tread],
  };
}
