import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { createCar } from "./car-asset.js";
import { createWorld } from "./world.js";
import { createWindscreenRain } from "./rain.js";
import { wiperAngle, CAR } from "./config.js";

export async function createShowcaseScene(
  container,
  state,
  onFailure,
  onReady = () => {},
) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    alpha: false,
  });
  renderer.setPixelRatio(
    Math.min(devicePixelRatio, innerWidth < 800 ? 1.35 : 1.75),
  );
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#d3d9d0");
  scene.fog = new THREE.Fog("#d3d9d0", 26, 115);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.025, 400);
  const controls = new OrbitControls(camera, container);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.minDistance = 3.35;
  controls.maxDistance = 20;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.minPolarAngle = 0.16;
  controls.autoRotateSpeed = 0.55;
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(room, 0.035);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.85;
  room.dispose();
  pmrem.dispose();
  const hemi = new THREE.HemisphereLight("#eef5ee", "#737c68", 2.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff2dd", 3.7);
  sun.position.set(-3.7, 7, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(
    innerWidth < 800 ? 1024 : 2048,
    innerWidth < 800 ? 1024 : 2048,
  );
  Object.assign(sun.shadow.camera, {
    left: -4,
    right: 4,
    top: 4,
    bottom: -4,
    near: 0.2,
    far: 20,
  });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.012;
  sun.shadow.radius = 3;
  scene.add(sun);
  const rim = new THREE.DirectionalLight("#d5e6ef", 1.6);
  rim.position.set(4, 3, -4);
  scene.add(rim);
  const cabinLight = new THREE.PointLight("#e2ebef", 0.2, 2.7, 2);
  cabinLight.position.set(0, 1.2, -0.3);
  scene.add(cabinLight);
  let car;
  try {
    car = await createCar();
  } catch (error) {
    controls.dispose();
    envTarget.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    error.showcaseMessage =
      "The car model could not load. Check your connection and reload the garage.";
    throw error;
  }
  scene.add(car.root);
  const world = createWorld(scene);
  const water = createWindscreenRain(car);
  const abort = new AbortController();
  const signal = abort.signal;
  let time = 0,
    last = performance.now(),
    frame = 0,
    disposed = false,
    failed = false,
    currentView = "",
    lastWeather = "",
    lastPaint = "",
    lastFinish = "",
    lastVlt = -1;
  let dirty = true,
    lastState = "",
    visible = true,
    lighting = null;
  let photographicEnvironment = null;
  new RGBELoader().load(
    "/environments/studio-small-03.hdr",
    (hdr) => {
      if (disposed) {
        hdr.dispose();
        return;
      }
      const generator = new THREE.PMREMGenerator(renderer);
      photographicEnvironment = generator.fromEquirectangular(hdr);
      scene.environment = photographicEnvironment.texture;
      scene.environmentRotation.y = 0.7;
      hdr.dispose();
      generator.dispose();
      dirty = true;
    },
    undefined,
    () => {
      /* The initial studio lighting remains usable offline. */
    },
  );
  controls.addEventListener("change", () => {
    dirty = true;
  });
  let yaw = 0,
    pitch = -0.055,
    drag = null,
    transition = null;
  const exteriorPosition = new THREE.Vector3(5.05, 2.65, 6.15);
  const exteriorTarget = new THREE.Vector3(0, 0.65, 0);
  let savedPosition = exteriorPosition.clone(),
    savedTarget = exteriorTarget.clone();
  let fitScale = 1;
  const look = new THREE.Vector3();
  const spherical = new THREE.Spherical();
  const interior = () => state.view !== "exterior";

  function resetCamera() {
    transition = null;
    dirty = true;
    if (interior()) {
      yaw = 0;
      pitch = -0.055;
    } else {
      camera.position.copy(exteriorPosition);
      controls.target.copy(exteriorTarget);
      controls.update();
      savedPosition.copy(camera.position);
      savedTarget.copy(controls.target);
    }
  }
  function setView() {
    if (state.view === currentView) return;
    if (currentView === "exterior") {
      savedPosition.copy(camera.position);
      savedTarget.copy(controls.target);
    }
    const fromPosition = camera.position.clone(),
      fromQuaternion = camera.quaternion.clone(),
      fromFov = camera.fov;
    const wasInitialized = !!currentView;
    currentView = state.view;
    yaw = 0;
    pitch = -0.055;
    drag = null;
    transition = null;
    controls.enabled = !interior();
    if (!interior()) {
      camera.fov = 36;
      camera.position.copy(savedPosition);
      controls.target.copy(savedTarget);
      controls.update();
    } else {
      camera.fov = 76;
      camera.position.set(state.view === "driver" ? -0.43 : 0.43, 1.145, -0.13);
      camera.lookAt(
        camera.position
          .clone()
          .add(new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch))),
      );
    }
    if (
      wasInitialized &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      transition = {
        fromPosition,
        fromQuaternion,
        fromFov,
        toPosition: camera.position.clone(),
        toQuaternion: camera.quaternion.clone(),
        toFov: camera.fov,
        elapsed: 0,
      };
    camera.updateProjectionMatrix();
  }
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const nextScale = Math.max(1, 1.0 / camera.aspect);
    const ratio = nextScale / fitScale;
    fitScale = nextScale;
    exteriorPosition
      .set(5.05, 2.65, 6.15)
      .sub(exteriorTarget)
      .multiplyScalar(fitScale)
      .add(exteriorTarget);
    savedPosition.sub(savedTarget).multiplyScalar(ratio).add(savedTarget);
    if (!interior()) {
      camera.position
        .sub(controls.target)
        .multiplyScalar(ratio)
        .add(controls.target);
      controls.update();
    }
    camera.updateProjectionMatrix();
    dirty = true;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  resetCamera();
  container.addEventListener(
    "pointerdown",
    (e) => {
      if (!interior() || e.button > 0) return;
      container.focus({ preventScroll: true });
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      container.setPointerCapture(e.pointerId);
    },
    { signal },
  );
  container.addEventListener(
    "pointermove",
    (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      dirty = true;
      yaw = THREE.MathUtils.clamp(
        yaw - (e.clientX - drag.x) * 0.004,
        -2.8,
        2.8,
      );
      pitch = THREE.MathUtils.clamp(
        pitch + (e.clientY - drag.y) * 0.003,
        -0.7,
        0.66,
      );
      drag.x = e.clientX;
      drag.y = e.clientY;
    },
    { signal },
  );
  const release = () => {
    drag = null;
  };
  container.addEventListener("pointerup", release, { signal });
  container.addEventListener("pointercancel", release, { signal });
  container.addEventListener("lostpointercapture", release, { signal });
  container.addEventListener(
    "keydown",
    (e) => {
      if (
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "+",
          "-",
          "=",
          "Home",
        ].includes(e.key)
      )
        return;
      e.preventDefault();
      dirty = true;
      if (e.key === "Home") {
        resetCamera();
        return;
      }
      if (interior()) {
        yaw = THREE.MathUtils.clamp(
          yaw +
            (e.key === "ArrowLeft" ? 0.1 : e.key === "ArrowRight" ? -0.1 : 0),
          -2.8,
          2.8,
        );
        pitch = THREE.MathUtils.clamp(
          pitch +
            (e.key === "ArrowUp" ? 0.07 : e.key === "ArrowDown" ? -0.07 : 0),
          -0.7,
          0.66,
        );
      } else {
        spherical.setFromVector3(camera.position.clone().sub(controls.target));
        spherical.theta +=
          e.key === "ArrowLeft" ? 0.1 : e.key === "ArrowRight" ? -0.1 : 0;
        spherical.phi = THREE.MathUtils.clamp(
          spherical.phi +
            (e.key === "ArrowUp" ? -0.07 : e.key === "ArrowDown" ? 0.07 : 0),
          controls.minPolarAngle,
          controls.maxPolarAngle,
        );
        spherical.radius = THREE.MathUtils.clamp(
          spherical.radius *
            (e.key === "-" ? 1.1 : ["+", "="].includes(e.key) ? 0.9 : 1),
          controls.minDistance,
          controls.maxDistance,
        );
        camera.position.setFromSpherical(spherical).add(controls.target);
        controls.update();
      }
    },
    { signal },
  );
  function applyAppearance() {
    if (lastPaint !== state.paint) {
      car.materials.paint.color.set(state.paint);
      lastPaint = state.paint;
    }
    if (lastFinish !== state.finish) {
      car.materials.paint.roughness = state.finish === "satin" ? 0.56 : 0.23;
      car.materials.paint.clearcoat = state.finish === "satin" ? 0.25 : 1;
      lastFinish = state.finish;
    }
    if (lastVlt !== state.vlt) {
      car.materials.glass.opacity = 1 - state.vlt / 100;
      car.materials.glass.color.set("#233432");
      lastVlt = state.vlt;
    }
    const key = state.weather + state.environment;
    if (lastWeather !== key) {
      const previous = {
        background: scene.background.clone(),
        hemi: hemi.intensity,
        sun: sun.intensity,
        rim: rim.intensity,
        env: scene.environmentIntensity,
        exposure: renderer.toneMappingExposure,
        sunColor: sun.color.clone(),
      };
      const wasInitialized = !!lastWeather;
      lastWeather = key;
      const night = state.weather.includes("night"),
        rain = state.weather.startsWith("rain");
      const background = night
        ? "#101f28"
        : rain
          ? "#829b9e"
          : state.environment === "studio"
            ? "#d3d9d0"
            : "#b8cbd0";
      scene.background.set(background);
      scene.fog.color.set(background);
      scene.fog.near = night ? 17 : rain ? 17 : 35;
      scene.fog.far = night ? 90 : rain ? 85 : 170;
      hemi.intensity = night ? 0.25 : rain ? 0.65 : 0.8;
      sun.intensity = night ? 0.32 : rain ? 1.0 : 2.2;
      rim.intensity = night ? 0.95 : 1.6;
      sun.color.set(night ? "#8db8d9" : rain ? "#d7e7ec" : "#fff2dd");
      scene.environmentIntensity = night ? 0.28 : rain ? 0.8 : 1.2;
      renderer.toneMappingExposure = night ? 0.82 : 1.05;
      car.materials.headlight.emissiveIntensity = night ? 5 : 2.3;
      car.headlights.forEach(
        (light) => (light.intensity = night ? 35 : rain ? 9 : 0),
      );
      cabinLight.intensity = night ? 0.055 : 0.17;
      if (
        wasInitialized &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        lighting = {
          from: previous,
          to: {
            background: scene.background.clone(),
            hemi: hemi.intensity,
            sun: sun.intensity,
            rim: rim.intensity,
            env: scene.environmentIntensity,
            exposure: renderer.toneMappingExposure,
            sunColor: sun.color.clone(),
          },
          elapsed: 0,
        };
    }
  }
  const failure = (message) => {
    if (failed) return;
    failed = true;
    cancelAnimationFrame(frame);
    onFailure(message);
  };
  renderer.domElement.addEventListener(
    "webglcontextlost",
    (e) => {
      e.preventDefault();
      failure(
        "The graphics session was interrupted. Reload the garage to reconnect.",
      );
    },
    { signal },
  );
  function tick(now) {
    if (disposed || failed) return;
    const dt = Math.min((now - last) / 1000, 0.045);
    last = now;
    const motionDt = state.paused ? 0 : dt;
    time += motionDt;
    try {
      const snapshot = JSON.stringify(state);
      if (snapshot !== lastState) {
        dirty = true;
        lastState = snapshot;
      }
      const animate =
        !state.paused &&
        (state.driving ||
          state.autoRotate ||
          state.weather.startsWith("rain") ||
          ["slow", "fast"].includes(state.wipers));
      setView();
      applyAppearance();
      controls.autoRotate = state.autoRotate && !state.paused && !interior();
      if (lighting) {
        lighting.elapsed += dt;
        const t = Math.min(lighting.elapsed / 0.7, 1),
          e = t * t * (3 - 2 * t),
          { from, to } = lighting;
        scene.background.copy(from.background).lerp(to.background, e);
        scene.fog.color.copy(scene.background);
        sun.color.copy(from.sunColor).lerp(to.sunColor, e);
        hemi.intensity = THREE.MathUtils.lerp(from.hemi, to.hemi, e);
        sun.intensity = THREE.MathUtils.lerp(from.sun, to.sun, e);
        rim.intensity = THREE.MathUtils.lerp(from.rim, to.rim, e);
        scene.environmentIntensity = THREE.MathUtils.lerp(from.env, to.env, e);
        renderer.toneMappingExposure = THREE.MathUtils.lerp(
          from.exposure,
          to.exposure,
          e,
        );
        dirty = true;
        if (t === 1) lighting = null;
      }
      if (transition) dirty = true;
      if (transition) {
        transition.elapsed += dt;
        const t = Math.min(transition.elapsed / 0.85, 1);
        const eased = t * t * (3 - 2 * t);
        camera.position.lerpVectors(
          transition.fromPosition,
          transition.toPosition,
          eased,
        );
        camera.quaternion.slerpQuaternions(
          transition.fromQuaternion,
          transition.toQuaternion,
          eased,
        );
        camera.fov = THREE.MathUtils.lerp(
          transition.fromFov,
          transition.toFov,
          eased,
        );
        camera.updateProjectionMatrix();
        if (t === 1) transition = null;
      } else if (interior()) {
        const sway =
          state.driving && !state.paused ? Math.sin(time * 5) * 0.0025 : 0;
        camera.position.set(
          state.view === "driver" ? -0.43 : 0.43,
          1.145 + sway,
          -0.13,
        );
        look.set(
          Math.sin(yaw) * Math.cos(pitch),
          Math.sin(pitch),
          Math.cos(yaw) * Math.cos(pitch),
        );
        camera.lookAt(look.add(camera.position));
      } else controls.update(dt);
      const velocity = state.driving ? state.speed / 3.6 : 0;
      car.wheels.forEach(
        (wheel) =>
          (wheel.rotation.x += (motionDt * velocity) / CAR.wheelRadius),
      );
      car.steering.rotation.z = state.driving
        ? Math.sin(time * 0.52) * 0.015
        : 0;
      const angle = wiperAngle(
        time,
        state.wipers,
        state.weather.startsWith("rain"),
      );
      car.wipers.forEach((wiper) => (wiper.rotation.z = angle));
      car.updateDashboard(state.driving ? state.speed : 0);
      world.update(motionDt, time, state);
      water.update(motionDt, state, angle);
      if (dirty || animate) {
        renderer.render(scene, camera);
        dirty = false;
      }
      if (container.dataset.ready !== "true") {
        performance.mark("showcase-ready");
        onReady();
      }
      container.dataset.ready = "true";
      frame = requestAnimationFrame(tick);
    } catch (error) {
      console.error("[showcase]", error);
      failure(
        "The 3D scene could not finish rendering. Reload the garage to try again.",
      );
    }
  }
  function resume() {
    cancelAnimationFrame(frame);
    if (!document.hidden && visible && !failed && !disposed) {
      last = performance.now();
      dirty = true;
      frame = requestAnimationFrame(tick);
    }
  }
  document.addEventListener("visibilitychange", resume, { signal });
  const visibility = new IntersectionObserver(
    (entries) => {
      visible = entries[0].isIntersecting;
      resume();
    },
    { threshold: 0 },
  );
  visibility.observe(container);
  frame = requestAnimationFrame(tick);
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    abort.abort();
    observer.disconnect();
    visibility.disconnect();
    controls.dispose();
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set(car.materials.textures);
    scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material)
        for (const mat of [].concat(object.material)) {
          materials.add(mat);
          for (const value of Object.values(mat))
            if (value?.isTexture) textures.add(value);
        }
    });
    geometries.forEach((g) => g.dispose());
    textures.forEach((t) => t.dispose());
    materials.forEach((m) => m.dispose());
    world.dispose();
    envTarget.dispose();
    photographicEnvironment?.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }
  return {
    resetCamera,
    dispose,
    inspect: () => ({
      view: currentView,
      paint: car.materials.paint.color.getHexString(),
      opacity: car.materials.glass.opacity,
      camera: camera.position.toArray(),
      direction: camera.getWorldDirection(new THREE.Vector3()).toArray(),
      wiper: car.wipers[0].rotation.z,
      wheel: car.wheels[0].rotation.x,
      travel: world.travel,
      rainVisible: water.layer.visible,
      roadVisible: world.road.visible,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      paused: state.paused,
    }),
  };
}
