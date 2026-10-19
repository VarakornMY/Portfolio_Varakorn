import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { canvasTexture } from "./materials.js";

// Authored Blender geometry. Stable material and rig names live in build-civic.py.
export async function createCar(onProgress = () => {}) {
  const draco = new DRACOLoader().setDecoderPath("/draco/");
  draco.setDecoderConfig({ type: "wasm" });
  draco.setWorkerLimit(2);
  let gltf;
  try {
    gltf = await new GLTFLoader()
      .setDRACOLoader(draco)
      .loadAsync("/models/civic-type-r/civic-type-r-fl5.glb", onProgress);
  } finally {
    draco.dispose();
  }
  const root = gltf.scene,
    named = new Map(),
    textures = [];
  const grain = canvasTexture(128, 128, (ctx, w, h) => {
    let seed = 197;
    const pixels = ctx.createImageData(w, h);
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const n = 100 + (seed % 55);
      pixels.data.set([n, n, n, 255], i);
    }
    ctx.putImageData(pixels, 0, 0);
  });
  grain.colorSpace = THREE.NoColorSpace;
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(12, 12);
  textures.push(grain);
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (const material of [].concat(mesh.material)) {
      named.set(material.name, material);
      if (["Glass", "Lens"].includes(material.name)) {
        Object.assign(material, {
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          forceSinglePass: true,
          envMapIntensity: 1.6,
        });
        mesh.castShadow = false;
        mesh.renderOrder = material.name === "Glass" ? 3 : 2;
      }
      if (["Leather", "Suede", "Tyre", "Carpet"].includes(material.name)) {
        material.bumpMap = grain;
        material.bumpScale = material.name === "Suede" ? 0.0006 : 0.00035;
        const p = mesh.geometry.attributes.position,
          n = mesh.geometry.attributes.normal;
        const uv = new Float32Array(p.count * 2);
        for (let i = 0; i < p.count; i++) {
          const axis =
            Math.abs(n.getY(i)) > 0.6
              ? "y"
              : Math.abs(n.getX(i)) > 0.6
                ? "x"
                : "z";
          uv[i * 2] = axis === "x" ? p.getZ(i) : p.getX(i);
          uv[i * 2 + 1] = axis === "y" ? p.getZ(i) : p.getY(i);
        }
        mesh.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      }
    }
  });
  const paint = named.get("Paint");
  Object.assign(paint, {
    side: THREE.DoubleSide,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
    metalness: 0.16,
  });
  const wheels = ["Wheel_FR", "Wheel_FL", "Wheel_RR", "Wheel_RL"].map((n) =>
    root.getObjectByName(n),
  );
  const wipers = ["Wiper_R", "Wiper_L"].map((n) => root.getObjectByName(n));
  wipers.forEach((w) => {
    w.rotation.x = -Math.atan2(0.882, 0.383);
  });
  const steering = root.getObjectByName("Steering"),
    headlights = [];
  for (const x of [-0.63, 0.63]) {
    const light = new THREE.SpotLight("#e1edff", 0, 55, 0.38, 0.65, 1.5);
    light.position.set(x, 0.76, 2.16);
    light.target.position.set(x * 1.5, 0.02, 23);
    root.add(light, light.target);
    headlights.push(light);
  }
  function screen(name, texture) {
    const o = root.getObjectByName(name),
      p = o.geometry.attributes.position;
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = 1 - (p.getX(i) - b.min.x) / (b.max.x - b.min.x);
      uv[i * 2 + 1] = (p.getY(i) - b.min.y) / (b.max.y - b.min.y);
    }
    o.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    o.material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    o.castShadow = false;
    textures.push(texture);
  }
  const cluster = canvasTexture(1024, 384, () => {});
  screen("Instrument_screen", cluster);
  screen(
    "Infotainment_screen",
    canvasTexture(640, 400, (ctx, w, h) => {
      ctx.fillStyle = "#090c10";
      ctx.fillRect(0, 0, w, h);
      ctx.font = "19px Arial";
      ctx.fillStyle = "#e1e7ec";
      ctx.fillText("HOME", 24, 35);
      ctx.fillText("10:24", 550, 35);
      [
        "Audio",
        "Phone",
        "Navigation",
        "Honda LogR",
        "Settings",
        "Connections",
      ].forEach((label, i) => {
        const x = 28 + (i % 3) * 200,
          y = 72 + Math.floor(i / 3) * 150;
        ctx.fillStyle = "#171d24";
        ctx.fillRect(x, y, 183, 129);
        ctx.strokeStyle = i === 3 ? "#d52e36" : "#abb8c5";
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 74, y + 22, 34, 34);
        ctx.textAlign = "center";
        ctx.font = "18px Arial";
        ctx.fillStyle = "#d9e0e7";
        ctx.fillText(label, x + 91, y + 97);
      });
    }),
  );
  let lastSpeed = -1;
  function updateDashboard(speed) {
    speed = Math.round(speed);
    if (speed === lastSpeed) return;
    lastSpeed = speed;
    const ctx = cluster.image.getContext("2d");
    ctx.fillStyle = "#050709";
    ctx.fillRect(0, 0, 1024, 384);
    ctx.fillStyle = "#b82932";
    ctx.fillRect(20, 22, 984, 5);
    ctx.textAlign = "center";
    ctx.fillStyle = "#e8edf1";
    ctx.font = "26px Arial";
    for (let i = 0; i <= 8; i++) {
      ctx.fillText(String(i), 70 + i * 111, 77);
      ctx.fillStyle = i > 6 ? "#b91d2b" : "#74818f";
      ctx.fillRect(40 + i * 111, 91, 94, 13);
      ctx.fillStyle = "#e8edf1";
    }
    ctx.font = "116px Arial";
    ctx.fillText(String(speed), 512, 241);
    ctx.font = "25px Arial";
    ctx.fillText("km/h", 512, 282);
    ctx.font = "48px Arial";
    ctx.fillText(
      speed ? String(Math.min(6, Math.ceil(speed / 22))) : "N",
      819,
      230,
    );
    ctx.font = "28px Arial";
    ctx.fillStyle = "#ed3446";
    ctx.fillText("+R", 167, 207);
    ctx.fillStyle = "#adb8c4";
    ctx.font = "20px Arial";
    ctx.fillText("26°C", 149, 337);
    ctx.fillText("TYPE R", 512, 337);
    ctx.fillText("10:24", 859, 337);
    cluster.needsUpdate = true;
  }
  updateDashboard(0);
  function quad(a, b, c, d, material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3),
    );
    g.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
    );
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, material);
    root.add(mesh);
    return mesh;
  }
  return {
    root,
    materials: {
      paint,
      glass: named.get("Glass"),
      headlight: named.get("Headlight"),
      textures,
    },
    wheels,
    wipers,
    steering,
    headlights,
    updateDashboard,
    quad,
  };
}
