import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { canvasTexture } from "./materials.js";

export function createWorld(scene) {
  const studio = new THREE.Group(),
    road = new THREE.Group();
  scene.add(studio, road);
  const mat = (color, roughness = 1) =>
    new THREE.MeshStandardMaterial({ color, roughness });
  const mesh = (geo, material, pos, parent = road) => {
    const object = new THREE.Mesh(geo, material);
    object.position.set(...pos);
    parent.add(object);
    return object;
  };
  const studioMat = mat("#858e89", 0.64);
  const ground = mesh(
    new THREE.PlaneGeometry(200, 200),
    studioMat,
    [0, -0.012, 0],
    studio,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  const ring = mesh(
    new THREE.RingGeometry(3.32, 3.33, 160),
    mat("#b5beb1"),
    [0, -0.006, 0],
    studio,
  );
  ring.rotation.x = -Math.PI / 2;
  const outerRing = mesh(
    new THREE.RingGeometry(3.52, 3.524, 160),
    mat("#bec6b9"),
    [0, -0.005, 0],
    studio,
  );
  outerRing.rotation.x = -Math.PI / 2;
  // A modest planar reflection on desktop. Mobile keeps the cheaper PBR floor.
  let reflection = null;
  if (innerWidth >= 800) {
    const shader = {
      ...Reflector.ReflectorShader,
      uniforms: THREE.UniformsUtils.clone(Reflector.ReflectorShader.uniforms),
    };
    shader.vertexShader =
      "varying vec2 floorUv;\n" +
      shader.vertexShader.replace(
        "void main() {",
        "void main() { floorUv = uv;",
      );
    shader.fragmentShader =
      "varying vec2 floorUv;\n" +
      shader.fragmentShader.replace(
        "gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );",
        "float fade = 1.0 - smoothstep(0.28, 0.5, length(floorUv - 0.5)); gl_FragColor = vec4(base.rgb, 0.17 * fade);",
      );
    reflection = new Reflector(new THREE.CircleGeometry(3.3, 80), {
      textureWidth: 1024,
      textureHeight: 1024,
      multisample: 0,
      shader,
    });
    reflection.rotation.x = -Math.PI / 2;
    reflection.position.y = -0.008;
    reflection.material.transparent = true;
    reflection.material.depthWrite = false;
    studio.add(reflection);
  }

  const asphalt = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#535958";
    ctx.fillRect(0, 0, w, h);
    let seed = 87;
    for (let i = 0; i < 22000; i++) {
      seed = (seed * 16807) % 2147483647;
      const v = 60 + (seed % 40);
      ctx.fillStyle = `rgb(${v},${v + 3},${v + 2})`;
      ctx.fillRect(seed % w, Math.floor(seed / w) % h, 1, 1);
    }
  });
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
  asphalt.repeat.set(5, 100);
  const roadMat = new THREE.MeshStandardMaterial({
    map: asphalt,
    roughness: 0.95,
    metalness: 0.04,
  });
  const pavement = mesh(
    new THREE.PlaneGeometry(7.4, 400),
    roadMat,
    [1.65, -0.009, 65],
  );
  pavement.rotation.x = -Math.PI / 2;
  pavement.receiveShadow = true;
  const grassMat = mat("#62715b");
  const grass = mesh(
    new THREE.PlaneGeometry(700, 700),
    grassMat,
    [0, -0.045, 50],
  );
  grass.rotation.x = -Math.PI / 2;
  const white = mat("#d5d2b9");
  const yellow = mat("#cab482");
  for (const x of [-1.9, 5.2]) {
    const line = mesh(new THREE.PlaneGeometry(0.09, 400), white, [
      x,
      -0.004,
      65,
    ]);
    line.rotation.x = -Math.PI / 2;
  }
  const markingGeo = new THREE.PlaneGeometry(0.105, 3.2);
  markingGeo.rotateX(-Math.PI / 2);
  const markings = new THREE.InstancedMesh(markingGeo, yellow, 45);
  road.add(markings);
  const matrix = new THREE.Matrix4();

  const trunkMat = mat("#4b4b3d"),
    leafMat = mat("#657d58");
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.1, 0.19, 1, 7),
    trunkMat,
    76,
  );
  const crowns = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 10, 8),
    leafMat,
    228,
  );
  road.add(trunks, crowns);
  trunks.frustumCulled = false;
  crowns.frustumCulled = false;
  const dummy = new THREE.Object3D(),
    trees = [];
  const lampMat = new THREE.MeshStandardMaterial({
    color: "#b7c9c3",
    emissive: "#d0efed",
    emissiveIntensity: 0.1,
  });
  const roadside = [];
  let seed = 513;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 76; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side < 0 ? -4 - rand() * 15 : 7.5 + rand() * 15;
    const z = -65 + i * 3.1;
    const h = 2.5 + rand() * 4;
    const tree = { x, z, h, crowns: [] };
    trees.push(tree);
    for (let k = 0; k < 3; k++) {
      tree.crowns.push({
        x: (rand() - 0.5) * 0.9,
        y: h - 0.1 + k * 0.5,
        z: (rand() - 0.5) * 0.5,
        scale: [1 + rand(), 1.3 + rand(), 1 + rand()],
      });
      crowns.setColorAt(
        i * 3 + k,
        new THREE.Color(k % 2 ? "#869e78" : "#647959"),
      );
    }
  }
  for (let i = 0; i < 20; i++) {
    const group = new THREE.Group();
    const z = -50 + i * 12;
    group.position.set(i % 2 ? -2.5 : 5.7, 0, z);
    road.add(group);
    roadside.push({ group, z });
    mesh(
      new THREE.CylinderGeometry(0.037, 0.066, 5.0, 8),
      mat("#4c5652"),
      [0, 2.5, 0],
      group,
    );
    const arm = mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.9),
      mat("#4c5652"),
      [0, 5, 0.4],
      group,
    );
    arm.rotation.x = 0.07;
    mesh(
      new THREE.BoxGeometry(0.25, 0.045, 0.5),
      lampMat,
      [0, 4.98, 0.7],
      group,
    );
    // Ground pools are cheap and don't add dozens of dynamic lights.
    const glowTex = canvasTexture(64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, "rgba(182,218,211,.35)");
      g.addColorStop(1, "rgba(182,218,211,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    const glow = mesh(
      new THREE.PlaneGeometry(5, 8),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      }),
      [0, 0.002, 0.8],
      group,
    );
    glow.rotation.x = -Math.PI / 2;
    group.userData.glow = glow;
  }
  // Layered hills dissolve into the horizon through the scene fog.
  const hills = mat("#8c9a87");
  for (let i = 0; i < 16; i++) {
    const h = mesh(new THREE.SphereGeometry(1, 20, 12), hills, [
      -120 + i * 18,
      -5,
      145 + rand() * 65,
    ]);
    h.scale.set(18 + rand() * 25, 12 + rand() * 22, 20 + rand() * 15);
  }

  const count = 1100,
    positions = new Float32Array(count * 6),
    rainSeeds = [];
  for (let i = 0; i < count; i++)
    rainSeeds.push({
      x: (rand() - 0.5) * 28,
      y: rand() * 15,
      z: (rand() - 0.5) * 34,
      speed: 10 + rand() * 8,
    });
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const rainMat = new THREE.LineBasicMaterial({
    color: "#bcced0",
    transparent: true,
    opacity: 0.43,
    depthWrite: false,
  });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  scene.add(rain);
  let travel = 0;
  function update(dt, time, state) {
    const moving = state.driving ? state.speed / 3.6 : 0;
    travel += moving * dt;
    road.visible = state.environment === "road";
    studio.visible = !road.visible;
    if (reflection) reflection.visible = state.view === "exterior";
    asphalt.offset.y = -(travel % 4) / 4;
    for (let i = 0; i < 45; i++) {
      const z = ((i * 6.5 - travel + 1000) % 292.5) - 65;
      matrix.makeTranslation(1.65, -0.003, z);
      markings.setMatrixAt(i, matrix);
    }
    markings.instanceMatrix.needsUpdate = true;
    for (const item of roadside)
      item.group.position.z = ((item.z - travel + 10000) % 240) - 65;
    for (let i = 0; i < trees.length; i++) {
      const tree = trees[i],
        z = ((tree.z - travel + 10000) % 240) - 65;
      dummy.position.set(tree.x, tree.h * 0.5, z);
      dummy.scale.set(1, tree.h, 1);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      tree.crowns.forEach((c, k) => {
        dummy.position.set(tree.x + c.x, c.y, z + c.z);
        dummy.scale.set(...c.scale);
        dummy.updateMatrix();
        crowns.setMatrixAt(i * 3 + k, dummy.matrix);
      });
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    const rainy = state.weather.startsWith("rain"),
      night = state.weather.includes("night");
    rain.visible = rainy;
    if (rainy) {
      for (let i = 0; i < count; i++) {
        const p = rainSeeds[i];
        let x = p.x + Math.sin(time * 0.4) * 0.1;
        let y = (((p.y - time * p.speed) % 15) + 15) % 15;
        const z = ((((p.z - time * moving * 0.65) % 34) + 51) % 34) - 17;
        // Rain never appears underneath the roof or inside the cabin.
        if (Math.abs(x) < 1.12 && Math.abs(z) < 2.5 && y < 1.6) y += 1.6;
        const j = i * 6;
        positions[j] = x;
        positions[j + 1] = y;
        positions[j + 2] = z;
        positions[j + 3] = x + 0.035;
        positions[j + 4] = y - 0.24;
        positions[j + 5] = z - 0.07 - moving * 0.004;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
    lampMat.emissiveIntensity = night ? 4 : 0.05;
    for (const item of roadside)
      if (item.group.userData.glow)
        item.group.userData.glow.material.opacity = night ? 1 : 0;
    roadMat.roughness = rainy ? 0.23 : 0.93;
    roadMat.metalness = rainy ? 0.3 : 0.04;
    studioMat.roughness = rainy ? 0.34 : 0.64;
    grassMat.color.set(night ? "#26382f" : rainy ? "#56695b" : "#718266");
    hills.color.set(night ? "#172c2c" : rainy ? "#637d78" : "#9aa88f");
  }
  return {
    update,
    studio,
    road,
    dispose: () => reflection?.dispose(),
    get travel() {
      return travel;
    },
  };
}
