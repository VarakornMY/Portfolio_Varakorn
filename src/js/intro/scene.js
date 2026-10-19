import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { openingConfig as config } from './config.js';
import { clamp, smoothstep } from './ScrollExpand.js';
import { standingPose, STAND_COMPLETE } from './stance.js';

const AXIS = new THREE.Vector3(1, 0, 0);
const mix = THREE.MathUtils.lerp;
export const PULLS = [0.27, 0.39, 0.51, 0.63];

export function pullAt(progress) {
  let left = 0;
  let right = 0;
  PULLS.forEach((start, index) => {
    const t = clamp((progress - start) / 0.085);
    const pull = Math.pow(Math.sin(t * Math.PI), 2);
    if (index % 2 === 0) left = Math.max(left, pull);
    else right = Math.max(right, pull);
  });
  const final = Math.sin(smoothstep(0.725, 0.78, progress) * Math.PI);
  return { left: Math.max(left, final), right: Math.max(right, final), final };
}

function seededRandom(seed = 12) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function disposeTree(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      for (const uniform of Object.values(material.uniforms || {})) {
        if (uniform.value?.isTexture) textures.add(uniform.value);
      }
    }
  });
  textures.forEach((texture) => {
    texture.image?.close?.();
    texture.dispose();
  });
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

async function loadCharacter(signal, onProgress) {
  const response = await fetch(config.modelUrl, { signal });
  if (!response.ok) throw new Error(`Character could not load (${response.status})`);
  const total = Number(response.headers.get('content-length'));
  let buffer;
  if (response.body && total > 0) {
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress(Math.min(0.85, received / total * 0.85));
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.length; });
    buffer = bytes.buffer;
  } else {
    buffer = await response.arrayBuffer();
    onProgress(0.85);
  }
  signal.throwIfAborted();
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const asset = await loader.parseAsync(buffer, new URL('.', new URL(config.modelUrl, location.href)).href);
  if (signal.aborted) {
    disposeTree(asset.scene);
    signal.throwIfAborted();
  }
  const vrm = asset.userData.vrm;
  if (!vrm) { disposeTree(asset.scene); throw new Error('A humanoid VRM character is required'); }
  VRMUtils.rotateVRM0(vrm);
  return vrm;
}

function makeEnvironment(scene) {
  const group = new THREE.Group();
  const pillars = [];
  scene.add(group);
  const stone = new THREE.MeshStandardMaterial({ color: 0x242d2c, roughness: 0.82, metalness: 0.25 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x586661, roughness: 0.28, metalness: 0.85 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x9bad93, transparent: true, opacity: 0.58 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 72), stone);
  ground.receiveShadow = true;
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  group.add(ground);
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.28, 1.38, 0.14, 64), stone);
  platform.receiveShadow = true;
  platform.position.y = -0.10;
  group.add(platform);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.005, 6, 120), glow);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.02;
  group.add(ring);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.009, 8, 120), glow);
  halo.position.set(0, 1.11, -0.70);
  group.add(halo);
  const haloOuter = new THREE.Mesh(new THREE.TorusGeometry(1.23, 0.003, 5, 120), glow);
  haloOuter.position.copy(halo.position);
  group.add(haloOuter);
  [-1, 1].forEach((side) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 4.6, 0.55), stone);
    pillar.position.set(side * 2.12, 1.72, -0.50);
    pillars.push(pillar);
    group.add(pillar);
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.012, 3.3, 0.014), glow);
    inlay.position.set(side * 2.12, 1.85, -0.217);
    pillars.push(inlay);
    group.add(inlay);
    for (let y = 0.3; y < 4; y += 0.7) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.03, 0.59), metal);
      band.position.set(side * 2.12, y, -0.5);
      pillars.push(band);
      group.add(band);
    }
    const mount = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.027, 10, 28), metal);
    mount.rotation.y = Math.PI / 2;
    mount.position.set(side * 1.98, 1.48, -0.27);
    mount.userData.anchor = true;
    pillars.push(mount);
    group.add(mount);
  });
  const random = seededRandom();
  const positions = new Float32Array(170 * 3);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (random() - 0.5) * 8;
    positions[i + 1] = random() * 4;
    positions[i + 2] = (random() - 0.5) * 5;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xc5d7b4, size: 0.009, transparent: true, opacity: 0.36, depthWrite: false }));
  group.add(dust);
  return {
    group, dust, halo, glow,
    resize(compact) {
      pillars.forEach((part) => {
        const side = Math.sign(part.position.x);
        part.position.x = side * mix(part.userData.anchor ? 1.98 : 2.12, part.userData.anchor ? 1.08 : 1.22, compact);
        if (part.userData.anchor) part.position.y = mix(1.48, 1.65, compact);
      });
      halo.scale.x = haloOuter.scale.x = mix(1, .78, compact);
    },
  };
}

function makeChains(scene) {
  // Interlocking, alternating oval links. Endpoints follow the wrist bones,
  // tension removes the catenary sag, then each link follows its own trajectory.
  const geometry = new THREE.TorusGeometry(0.044, 0.013, 8, 18);
  geometry.scale(1.45, 1, 1);
  const steel = new THREE.MeshStandardMaterial({ color: 0x8b9792, metalness: 0.88, roughness: 0.23 });
  const hot = new THREE.MeshStandardMaterial({ color: 0xd4dbc6, emissive: 0xabc88e, emissiveIntensity: 0, metalness: 0.72, roughness: 0.3 });
  const cuffGeometry = new THREE.CylinderGeometry(0.042, 0.042, 0.07, 20, 1, true);
  const cuffMaterial = new THREE.MeshStandardMaterial({ color: 0x77847e, metalness: 0.85, roughness: 0.26, side: THREE.DoubleSide });
  const chains = [-1, 1].map((side) => {
    const cuff = new THREE.Mesh(cuffGeometry, cuffMaterial);
    scene.add(cuff);
    const links = Array.from({ length: 24 }, (_, i) => {
      const mesh = new THREE.Mesh(geometry, i === 11 || i === 12 ? hot : steel);
      scene.add(mesh);
      return mesh;
    });
    return { side, links, cuff, anchor: new THREE.Vector3(side * 1.98, 1.48, -0.27) };
  });
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const next = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  const cuffTurn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const boneQuat = new THREE.Quaternion();

  function update(wrists, pulls, broken, time, compact) {
    hot.emissiveIntensity = Math.max(pulls.left, pulls.right) * 2.2 + broken;
    chains.forEach((chain, index) => {
      const bone = wrists[index];
      bone.getWorldPosition(start);
      bone.getWorldQuaternion(boneQuat);
      chain.cuff.position.copy(start);
      chain.cuff.quaternion.copy(boneQuat).multiply(cuffTurn);
      const force = index === 0 ? pulls.right : pulls.left;
      const sag = mix(0.27, 0.018, force);
      chain.anchor.set(chain.side * mix(1.98, 1.08, compact), mix(1.48, 1.65, compact), -.27);
      end.copy(chain.anchor);
      const count = Math.round(mix(20, 10, compact));
      const linkScale = (start.distanceTo(end) + sag * .6) / ((count - 1) * .082);
      const pointAt = (t, point) => {
        point.lerpVectors(start, end, t);
        point.y -= Math.sin(Math.PI * t) * sag;
        point.z += Math.sin(t * Math.PI * 4 + time * 21) * force * 0.012;
      };
      chain.links.forEach((link, i) => {
        link.visible = i < count;
        if (!link.visible) return;
        link.material = i === Math.floor(count / 2) || i === Math.floor(count / 2) - 1 ? hot : steel;
        link.scale.setScalar(linkScale);
        const t = i / (count - 1);
        pointAt(t, link.position);
        pointAt(Math.min(1, t + 0.015), next);
        if (i === count - 1) { pointAt(t - 0.015, next); direction.subVectors(link.position, next); }
        else direction.subVectors(next, link.position);
        orientation.setFromUnitVectors(AXIS, direction.normalize());
        link.quaternion.copy(orientation);
        link.rotateX(i % 2 ? Math.PI / 2 : 0.12);
        if (broken > 0) {
          const spread = broken * (0.5 + Math.sin(i * 18.17) * 0.24);
          link.position.x += chain.side * spread * (0.35 + t);
          link.position.y += spread * (i % 3 - 0.2) - broken * broken * (1.5 + t);
          link.position.z += spread * Math.cos(i * 4.6) * 1.8;
          link.rotateZ(broken * (i % 2 ? 5 : -4));
          link.rotateY(broken * (i % 3 - 1) * 3);
        }
      });
    });
  }
  return { update };
}

function makeSparks(scene) {
  const random = seededRandom(90);
  const count = 120;
  const positions = new Float32Array(count * 3);
  const velocities = Array.from({ length: count }, () => new THREE.Vector3((random() - .5) * 3, random() * 2.2, (random() - .5) * 2));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xe6f5b7, size: 0.021, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  const sparks = new THREE.Points(geometry, material);
  scene.add(sparks);
  return (progress, pulls) => {
    const breakAge = clamp((progress - STAND_COMPLETE) * 17, 0, 2);
    let amount = Math.max(pulls.left, pulls.right);
    let age = amount * 0.22;
    if (progress > STAND_COMPLETE) { age = breakAge; amount = 1 - smoothstep(0.6, 1.8, age); }
    material.opacity = amount * 0.9;
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1;
      const v = velocities[i];
      positions[i * 3] = side * 1.35 + v.x * age;
      positions[i * 3 + 1] = 1.32 + v.y * age - age * age * 2;
      positions[i * 3 + 2] = -0.02 + v.z * age;
    }
    geometry.attributes.position.needsUpdate = true;
  };
}

function makeGlass(renderer) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50);
  camera.position.z = 3;
  const target = new THREE.WebGLRenderTarget(1, 1);
  const material = new THREE.MeshBasicMaterial({ map: target.texture, side: THREE.DoubleSide, toneMapped: false });
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xe0eed7, transparent: true, opacity: 0 });
  const random = seededRandom(404);
  const pieces = [];
  const columns = 12;
  const rows = 8;
  const grid = [];
  for (let y = 0; y <= rows; y++) {
    grid[y] = [];
    for (let x = 0; x <= columns; x++) {
      grid[y][x] = [(x + (x === 0 || x === columns ? 0 : (random() - .5) * .8)) / columns, (y + (y === 0 || y === rows ? 0 : (random() - .5) * .8)) / rows];
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const a = grid[y][x], b = grid[y][x + 1], c = grid[y + 1][x], d = grid[y + 1][x + 1];
      for (const triangle of [[a, b, c], [b, d, c]]) {
        const cx = triangle.reduce((sum, p) => sum + p[0], 0) / 3;
        const cy = triangle.reduce((sum, p) => sum + p[1], 0) / 3;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangle.flatMap(([u, v]) => [u - cx, v - cy, 0]), 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(triangle.flat(), 2));
        const mesh = new THREE.Mesh(geometry, material);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lineMaterial);
        mesh.add(edges);
        scene.add(mesh);
        pieces.push({ mesh, cx, cy, spin: [(random() - .5) * 7, (random() - .5) * 7, (random() - .5) * 4], speed: 0.4 + random() * 1.4 });
      }
    }
  }
  let width = 1, height = 1;
  return {
    scene,
    target,
    resize(w, h) {
      target.setSize(Math.round(w * renderer.getPixelRatio()), Math.round(h * renderer.getPixelRatio()));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      height = 2 * 3 * Math.tan(THREE.MathUtils.degToRad(22.5));
      width = height * camera.aspect;
    },
    render(progress) {
      const explode = smoothstep(0.12, 1, progress);
      lineMaterial.opacity = (1 - explode) * smoothstep(0, 0.1, progress) * 0.65;
      pieces.forEach(({ mesh, cx, cy, spin, speed }) => {
        mesh.scale.set(width, height, 1);
        mesh.position.set((cx - .5) * width * (1 + explode * 2 * speed), (cy - .5) * height * (1 + explode * speed) - explode * explode * 3 * speed, explode * speed * 2.8);
        mesh.rotation.set(spin[0] * explode, spin[1] * explode, spin[2] * explode);
      });
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    dispose() { disposeTree(scene); target.dispose(); },
  };
}

export async function createOpeningScene(canvas, { signal, onProgress }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, config.maxPixelRatio));
  renderer.setClearColor(0x080b0c);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080b0c);
  scene.fog = new THREE.FogExp2(0x080b0c, 0.11);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 40);
  const ambient = new THREE.HemisphereLight(0xc6dbcf, 0x3c4143, 2.0);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xf2e8d4, 2.4);
  key.position.set(-1.5, 2.8, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: .1, far: 10 });
  key.shadow.bias = -.001;
  key.shadow.normalBias = .025;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x91b6ab, 3);
  rim.position.set(1.8, 2.0, -2.5);
  scene.add(rim);
  const footLight = new THREE.PointLight(0xb7d89d, 2, 5);
  footLight.position.set(0, 0.4, 0.9);
  scene.add(footLight);
  let vrm, glass, observer;
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    glass?.dispose();
    key.shadow.dispose();
    disposeTree(scene);
    renderer.dispose();
  }
  try {
    vrm = await loadCharacter(signal, onProgress);
    scene.add(vrm.scene);
    vrm.scene.rotation.y += config.facingRotation;
    vrm.scene.scale.setScalar(1);
    vrm.scene.traverse((object) => {
      if (object.isMesh) { object.frustumCulled = false; object.castShadow = true; }
    });
    const bone = (name) => vrm.humanoid.getNormalizedBoneNode(name);
    for (const name of ['head', 'hips', 'leftHand', 'rightHand', 'leftUpperArm', 'rightUpperArm', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot']) {
      if (!bone(name)) throw new Error(`Character needs a ${name} humanoid bone`);
    }
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    // Derive framing from the replacement model, not the sample's dimensions.
    const box = new THREE.Box3().setFromObject(vrm.scene);
    const height = box.max.y - box.min.y;
    const scale = 1.7 * config.modelScale / Math.max(0.1, height);
    vrm.scene.scale.multiplyScalar(scale);
    vrm.scene.position.y = -box.min.y * scale;
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    const eyes = new THREE.Vector3();
    const leftEye = vrm.humanoid.getRawBoneNode('leftEye');
    const rightEye = vrm.humanoid.getRawBoneNode('rightEye');
    const eyeScratch = new THREE.Vector3();
    const eyeOffset = new THREE.Vector3(...config.eyeTargetOffset);
    const readEyes = () => {
      if (leftEye && rightEye) {
        leftEye.getWorldPosition(eyes);
        eyes.add(rightEye.getWorldPosition(eyeScratch)).multiplyScalar(.5);
      } else {
        vrm.humanoid.getRawBoneNode('head').getWorldPosition(eyes);
        eyes.y += .085;
        eyes.z += .065;
      }
      eyes.add(eyeOffset);
    };
    readEyes();
    const pointer = new THREE.Vector2();
    const pointerTarget = new THREE.Vector2();
    const setPointer = (x, y) => pointerTarget.set(clamp(x, -1, 1), clamp(y, -1, 1));
    if (vrm.lookAt) vrm.lookAt.autoUpdate = false;
    const environment = makeEnvironment(scene);
    const chains = makeChains(scene);
    const sparks = makeSparks(scene);
    glass = makeGlass(renderer);
    const wrists = [bone('rightHand'), bone('leftHand')];
    const restY = vrm.scene.position.y;
    const target = new THREE.Vector3();
    const cameraPosition = new THREE.Vector3();
    const groundScratch = new THREE.Vector3();
    const groundContacts = ['left', 'right'].flatMap((side) => [
      { node: bone(`${side}LowerLeg`), clearance: .055 * config.modelScale },
      { node: bone(`${side}Foot`), clearance: .055 * config.modelScale },
      { node: bone(`${side}Toes`), clearance: .025 * config.modelScale },
    ]).filter(({ node }) => node);
    let width = 1, viewportHeight = 1, compact = 0;
    const resize = () => {
      width = canvas.clientWidth;
      viewportHeight = canvas.clientHeight;
      renderer.setSize(width, viewportHeight, false);
      camera.aspect = width / Math.max(1, viewportHeight);
      camera.updateProjectionMatrix();
      compact = 1 - smoothstep(.65, 1.1, camera.aspect);
      environment.resize(compact);
      glass.resize(width, viewportHeight);
    };
    observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const rotate = (name, x = 0, y = 0, z = 0) => bone(name)?.rotation.set(x, y, z);
    let captured = false;
    let previousProgress = 0;
    let shakeEnergy = 0;

    function render(progress, time, dt, shatter = 0) {
      if (disposed) return { shake: 0, tension: 0 };
      const pulls = pullAt(progress);
      shakeEnergy = Math.max(shakeEnergy * Math.exp(-dt * 5), clamp(Math.abs(progress - previousProgress) * 220));
      previousProgress = progress;
      const force = Math.max(pulls.left, pulls.right);
      const stance = standingPose(progress, force);
      const broken = stance.standing ? smoothstep(STAND_COMPLETE, .84, progress) : 0;
      const free = smoothstep(STAND_COMPLETE, .84, progress);
      const breathe = Math.sin(time * 1.5) * 0.004;
      const left = pulls.left;
      const right = pulls.right;
      pointer.lerp(pointerTarget, 1 - Math.exp(-dt / .12));
      const gaze = config.eyeTrackingStrength * (1 - free * .5);
      if (vrm.lookAt) {
        vrm.lookAt.yaw = pointer.x * 75 * gaze;
        vrm.lookAt.pitch = -pointer.y * 50 * gaze;
      } else {
        // Custom VRMs with eye bones but no LookAt extension still follow.
        rotate('leftEye', -pointer.y * .10 * gaze, pointer.x * .18 * gaze);
        rotate('rightEye', -pointer.y * .10 * gaze, pointer.x * .18 * gaze);
      }
      for (const side of ['left', 'right']) {
        const angles = stance[side];
        rotate(`${side}UpperLeg`, angles[0], 0, (side === 'left' ? .05 : -.05) * (1 - stance.rise));
        rotate(`${side}LowerLeg`, angles[1]);
        rotate(`${side}Foot`, angles[2]);
        rotate(`${side}Toes`);
      }
      // Normalized humanoid rig: upper arms pull inward, forearms bend toward
      // the lens, wrists turn and fingers close on every failed escape attempt.
      rotate('leftUpperArm', 0, -left * .45, mix(-.17 - left * .40, -1.17, free));
      rotate('rightUpperArm', 0, right * .45, mix(.17 + right * .40, 1.17, free));
      rotate('leftLowerArm', 0, -.13 - left * .95, -.10 * left);
      rotate('rightLowerArm', 0, .13 + right * .95, .10 * right);
      rotate('leftHand', left * .1, -.1 - left * .18, -.1);
      rotate('rightHand', right * .1, .1 + right * .18, .1);
      rotate('spine', stance.lean + force * .055 - free * .025, (left - right) * .08, (right - left) * .055);
      rotate('chest', force * .07, (right - left) * .07, 0);
      rotate('head', -stance.lean - force * .07 + free * .03 - pointer.y * .015 * gaze, (right - left) * .11 + pointer.x * .025 * gaze, (right - left) * .035);
      for (const side of ['left', 'right']) {
        const flex = (side === 'left' ? left : right);
        const sign = side === 'left' ? -1 : 1;
        for (const finger of ['Index', 'Middle', 'Ring', 'Little']) {
          for (const segment of ['Proximal', 'Intermediate', 'Distal']) {
            rotate(`${side}${finger}${segment}`, 0, 0, sign * (.3 + flex * .85) * (1 - free * .75));
          }
        }
        rotate(`${side}ThumbProximal`, 0, sign * .3, sign * .15);
      }
      vrm.scene.position.y = restY;
      vrm.scene.position.z = free * .19;
      // Ground from the posed skeleton, so the model rises by extending its
      // legs instead of levitating or pushing its knees through the platform.
      vrm.humanoid.update();
      vrm.scene.updateMatrixWorld(true);
      let lowest = Infinity;
      groundContacts.forEach(({ node, clearance }) => {
        lowest = Math.min(lowest, node.getWorldPosition(groundScratch).y - clearance);
      });
      vrm.scene.position.y -= lowest;
      // Breathing belongs in the torso, not in feet hovering off the floor.
      rotate('chest', force * .07 + breathe, (right - left) * .07, 0);
      vrm.expressionManager?.setValue('angry', force * .65 * (1 - free));
      vrm.expressionManager?.setValue('aa', force * .12);
      const blink = Math.pow(Math.max(0, Math.cos(time * 1.2)), 75) * (1 - force) * .85;
      vrm.expressionManager?.setValue('blink', time > 2 ? blink : 0);
      vrm.update(Math.min(dt, 1 / 30));
      vrm.scene.updateMatrixWorld(true);
      readEyes();
      chains.update(wrists, pulls, broken * 1.6, time, compact);
      sparks(progress, pulls);
      environment.dust.rotation.y = time * .018;
      environment.halo.rotation.z = time * .035;
      environment.glow.opacity = .38 + force * .35 + free * .25;
      footLight.intensity = 1.5 + force * 3 + free * 2;

      const expand = smoothstep(0, .25, progress);
      const wide = Math.max(1, .94 / camera.aspect);
      const distance = (3.7 + smoothstep(.25, .73, progress) * .35) * wide;
      scene.fog.density = .11 / wide;
      // Opening is a close lens on the actual eye meshes; expansion physically
      // dollies out to reveal both wrists, chains, pillars and the entire body.
      const stageTargetY = mix(.65, .96, stance.rise);
      target.set(eyes.x * (1 - expand), mix(eyes.y, stageTargetY, expand), mix(eyes.z, 0, expand));
      const closeDistance = .36 * Math.max(1, 1.2 / camera.aspect);
      cameraPosition.set(0, mix(eyes.y, mix(1.03, 1.24, stance.rise), expand), mix(eyes.z + closeDistance, distance, expand));
      const orbit = Math.sin(progress * Math.PI * 4) * .14 * expand * (1 - free);
      cameraPosition.x += orbit;
      target.x += (right - left) * .07;
      cameraPosition.z -= free * .30;
      const shake = (force * force * (.007 + progress * .009) + Math.sin(broken * Math.PI) * .024) * shakeEnergy;
      cameraPosition.x += Math.sin(time * 73) * shake;
      cameraPosition.y += Math.cos(time * 89) * shake * .7;
      camera.position.copy(cameraPosition);
      camera.lookAt(target);
      camera.rotateZ(Math.sin(time * 62) * shake * .15);
      if (shatter > 0) {
        if (!captured) {
          renderer.setRenderTarget(glass.target);
          renderer.render(scene, camera);
          renderer.setRenderTarget(null);
          captured = true;
        }
        glass.render(shatter);
      } else {
        captured = false;
        renderer.render(scene, camera);
      }
      return { shake: shake * 150, tension: force, broken, free };
    }
    render(0, 0, 0);
    // The spring rig was loaded standing. Rebase it in the first kneeling pose
    // so the initial drop does not throw the hair upward with fake momentum.
    vrm.springBoneManager?.reset();
    await renderer.compileAsync(scene, camera);
    signal.throwIfAborted();
    onProgress(1);
    return { render, dispose, setPointer };
  } catch (error) {
    dispose();
    throw error;
  }
}
