// Background solar system, adapted from
// https://github.com/N3rson/Solar-System-3D (MIT, Karol Fryc)
// Textures: NASA / Solar System Scope / Planet Pixel Emporium, vendored from that repo.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const LAYER = 1;
const SCALE = 0.154;
const T = "./solar";
const _sun = new THREE.Vector3();
// Same number as the demo slider (1–10, default 1.9). Only the sun reads this.
const SUN_INTENSITY = 2.2;

function stamp(obj) {
  obj.layers.set(LAYER);
  obj.traverse((c) => c.layers.set(LAYER));
}

function tex(loader, path, srgb = true) {
  const t = loader.load(path);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

function sunGlowMap() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  // Full disc: the sun mesh sits on top and hides the core. Plateau past
  // the limb (≈0.31) so the halo meets the silhouette with no dark gap.
  g.addColorStop(0, "rgba(255,248,180,1)");
  g.addColorStop(0.33, "rgba(255,236,140,0.95)");
  g.addColorStop(0.5, "rgba(255,190,70,0.32)");
  g.addColorStop(0.72, "rgba(255,140,30,0.08)");
  g.addColorStop(1, "rgba(255,120,20,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createSolarSystem(scene, camera) {
  camera.layers.enable(LAYER);
  const loader = new THREE.TextureLoader();
  const root = new THREE.Group();
  root.scale.setScalar(SCALE);

  const ambient = new THREE.AmbientLight(0x222222, 6);
  ambient.layers.set(LAYER);
  root.add(ambient);

  const sunSize = 697 / 40;
  const sunMat = new THREE.MeshStandardMaterial({
    emissive: 0xfff88f,
    emissiveMap: tex(loader, `${T}/sun.jpg`),
    emissiveIntensity: SUN_INTENSITY,
    // After deepVeil so the haze does not multiply the disc. Fog would eat
    // another ~20 % at this distance — the demo sun has neither.
    transparent: true,
    opacity: 1,
    depthWrite: true,
    fog: false,
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(sunSize, 32, 20), sunMat);
  sun.renderOrder = -3;
  root.add(sun);

  // Demo bloom is threshold 1: only the sun. Keep that isolation here.
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: sunGlowMap(),
      color: 0xffe58a,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false,
      opacity: 0.82,
    }),
  );
  glow.scale.setScalar(sunSize * 6.4);
  glow.renderOrder = -3.2;
  root.add(glow);

  const pointLight = new THREE.PointLight(0xfdffd3, 1200, 400, 1.4);
  pointLight.layers.set(LAYER);
  root.add(pointLight);

  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: {
      dayTexture: { value: tex(loader, `${T}/earth_daymap.jpg`) },
      nightTexture: { value: tex(loader, `${T}/earth_nightmap.jpg`) },
      sunPosition: { value: new THREE.Vector3() },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec2 vUv;
      varying vec3 vSunDirection;
      uniform vec3 sunPosition;
      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(modelMatrix * vec4(normal, 0.0)).xyz;
        vSunDirection = normalize(sunPosition - worldPosition.xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D dayTexture;
      uniform sampler2D nightTexture;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying vec3 vSunDirection;
      void main() {
        float intensity = max(dot(vNormal, vSunDirection), 0.0);
        vec4 dayColor = texture2D(dayTexture, vUv);
        vec4 nightColor = texture2D(nightTexture, vUv) * 0.2;
        gl_FragColor = mix(nightColor, dayColor, intensity);
      }
    `,
  });

  function createPlanet(
    size,
    position,
    tilt,
    texture,
    bump,
    ring,
    atmosphere,
    moons,
  ) {
    let material;
    if (texture instanceof THREE.Material) material = texture;
    else if (bump) {
      material = new THREE.MeshPhongMaterial({
        map: tex(loader, texture),
        bumpMap: tex(loader, bump, false),
        bumpScale: 0.7,
      });
    } else {
      material = new THREE.MeshPhongMaterial({ map: tex(loader, texture) });
    }
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(size, 32, 20),
      material,
    );
    const planet3d = new THREE.Object3D();
    const planetSystem = new THREE.Group();
    planetSystem.add(planet);
    planet.position.x = position;
    planet.rotation.z = (tilt * Math.PI) / 180;

    const orbitPath = new THREE.EllipseCurve(
      0,
      0,
      position,
      position,
      0,
      Math.PI * 2,
      false,
      0,
    );
    const orbit = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(orbitPath.getPoints(128)),
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      }),
    );
    orbit.rotation.x = Math.PI / 2;
    planetSystem.add(orbit);

    let Ring = null;
    if (ring) {
      Ring = new THREE.Mesh(
        new THREE.RingGeometry(ring.innerRadius, ring.outerRadius, 48),
        new THREE.MeshStandardMaterial({
          map: tex(loader, ring.texture),
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: false,
        }),
      );
      planetSystem.add(Ring);
      Ring.position.x = position;
      Ring.rotation.x = -0.5 * Math.PI;
      Ring.rotation.y = (-tilt * Math.PI) / 180;
    }

    let Atmosphere = null;
    if (atmosphere) {
      Atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(size + 0.1, 32, 20),
        new THREE.MeshPhongMaterial({
          map: tex(loader, atmosphere),
          transparent: true,
          opacity: 0.4,
          depthTest: true,
          depthWrite: false,
        }),
      );
      Atmosphere.rotation.z = 0.41;
      planet.add(Atmosphere);
    }

    if (moons) {
      for (const moon of moons) {
        if (moon.modelPath) continue;
        const moonMaterial = moon.bump
          ? new THREE.MeshStandardMaterial({
              map: tex(loader, moon.texture),
              bumpMap: tex(loader, moon.bump, false),
              bumpScale: 0.5,
            })
          : new THREE.MeshStandardMaterial({ map: tex(loader, moon.texture) });
        const moonMesh = new THREE.Mesh(
          new THREE.SphereGeometry(moon.size, 32, 20),
          moonMaterial,
        );
        moonMesh.position.set(size * 1.5, 0, 0);
        planetSystem.add(moonMesh);
        moon.mesh = moonMesh;
      }
    }

    planet3d.add(planetSystem);
    root.add(planet3d);
    return { planet, planet3d, Atmosphere, moons, planetSystem, Ring };
  }

  const earthMoon = [
    {
      size: 1.6,
      texture: `${T}/moonmap.jpg`,
      bump: `${T}/moonbump.jpg`,
      orbitSpeed: 0.001,
      orbitRadius: 10,
    },
  ];
  const marsMoons = [
    {
      modelPath: `${T}/mars/phobos.glb`,
      scale: 0.1,
      orbitRadius: 5,
      orbitSpeed: 0.002,
      mesh: null,
    },
    {
      modelPath: `${T}/mars/deimos.glb`,
      scale: 0.1,
      orbitRadius: 9,
      orbitSpeed: 0.0005,
      mesh: null,
    },
  ];
  const jupiterMoons = [
    {
      size: 1.6,
      texture: `${T}/jupiterIo.jpg`,
      orbitRadius: 20,
      orbitSpeed: 0.0005,
      phase: 0.4,
    },
    {
      size: 1.4,
      texture: `${T}/jupiterEuropa.jpg`,
      orbitRadius: 24,
      orbitSpeed: 0.00025,
      phase: 2.1,
    },
    {
      size: 2,
      texture: `${T}/jupiterGanymede.jpg`,
      orbitRadius: 28,
      orbitSpeed: 0.000125,
      phase: 3.8,
    },
    {
      size: 1.7,
      texture: `${T}/jupiterCallisto.jpg`,
      orbitRadius: 32,
      orbitSpeed: 0.00006,
      phase: 5.5,
    },
  ];

  const mercury = createPlanet(
    2.4,
    40,
    0,
    `${T}/mercurymap.jpg`,
    `${T}/mercurybump.jpg`,
  );
  const venus = createPlanet(
    6.1,
    65,
    3,
    `${T}/venusmap.jpg`,
    `${T}/venusbump.jpg`,
    null,
    `${T}/venus_atmosphere.jpg`,
  );
  const earth = createPlanet(
    6.4,
    90,
    23,
    earthMaterial,
    null,
    null,
    `${T}/earth_atmosphere.jpg`,
    earthMoon,
  );
  const mars = createPlanet(
    3.4,
    115,
    25,
    `${T}/marsmap.jpg`,
    `${T}/marsbump.jpg`,
  );
  const jupiter = createPlanet(
    69 / 4,
    200,
    3,
    `${T}/jupiter.jpg`,
    null,
    null,
    null,
    jupiterMoons,
  );
  const saturn = createPlanet(58 / 4, 270, 26, `${T}/saturnmap.jpg`, null, {
    innerRadius: 18,
    outerRadius: 29,
    texture: `${T}/saturn_ring.png`,
  });
  const uranus = createPlanet(25 / 4, 320, 82, `${T}/uranus.jpg`, null, {
    innerRadius: 6,
    outerRadius: 8,
    texture: `${T}/uranus_ring.png`,
  });
  const neptune = createPlanet(24 / 4, 340, 28, `${T}/neptune.jpg`);
  const pluto = createPlanet(1, 350, 57, `${T}/plutomap.jpg`);

  const start = -0.52;
  mercury.planet3d.rotation.y = Math.PI + 0.45 + start;
  venus.planet3d.rotation.y = (3 * Math.PI) / 2 - 0.5 + start;
  earth.planet3d.rotation.y = (3 * Math.PI) / 2 + 0.12 + start;
  mars.planet3d.rotation.y = Math.PI - 0.35 + start;
  jupiter.planet3d.rotation.y = -0.34;
  saturn.planet3d.rotation.y = -0.62;
  uranus.planet3d.rotation.y = -0.74;
  neptune.planet3d.rotation.y = -0.38;
  pluto.planet3d.rotation.y = Math.PI + 0.2 + start;

  const gltf = new GLTFLoader();
  function loadMoonModel(moon, system) {
    gltf.load(moon.modelPath, (file) => {
      const obj = file.scene;
      obj.scale.setScalar(moon.scale);
      system.add(obj);
      stamp(obj);
      moon.mesh = obj;
    });
  }
  loadMoonModel(marsMoons[0], mars.planetSystem);
  loadMoonModel(marsMoons[1], mars.planetSystem);
  mars.moons = marsMoons;

  stamp(root);
  scene.add(root);

  function tickMoons(list, host, time) {
    if (!list) return;
    for (const moon of list) {
      if (!moon.mesh) continue;
      const a = time * moon.orbitSpeed + (moon.phase ?? 0);
      const x = host.planet.position.x + moon.orbitRadius * Math.cos(a);
      const z = host.planet.position.z + moon.orbitRadius * Math.sin(a);
      moon.mesh.position.set(x, moon.orbitRadius * Math.sin(a) * 0.12, z);
      moon.mesh.rotateY(0.01);
    }
  }

  return {
    root,
    sun,
    tick(dt) {
      const f = dt * 60;
      sun.rotateY(0.001 * f);
      mercury.planet.rotateY(0.001 * f);
      mercury.planet3d.rotateY(0.004 * f);
      venus.planet.rotateY(0.0005 * f);
      if (venus.Atmosphere) venus.Atmosphere.rotateY(0.0005 * f);
      venus.planet3d.rotateY(0.0006 * f);
      earth.planet.rotateY(0.005 * f);
      if (earth.Atmosphere) earth.Atmosphere.rotateY(0.001 * f);
      earth.planet3d.rotateY(0.001 * f);
      mars.planet.rotateY(0.01 * f);
      mars.planet3d.rotateY(0.0007 * f);
      jupiter.planet.rotateY(0.005 * f);
      jupiter.planet3d.rotateY(0.0003 * f);
      saturn.planet.rotateY(0.01 * f);
      saturn.planet3d.rotateY(0.0002 * f);
      uranus.planet.rotateY(0.005 * f);
      uranus.planet3d.rotateY(0.0001 * f);
      neptune.planet.rotateY(0.005 * f);
      neptune.planet3d.rotateY(0.00008 * f);
      pluto.planet.rotateY(0.001 * f);
      pluto.planet3d.rotateY(0.00006 * f);

      const time = performance.now();
      tickMoons(earth.moons, earth, time);
      tickMoons(mars.moons, mars, time);
      tickMoons(jupiter.moons, jupiter, time);

      sun.getWorldPosition(_sun);
      earthMaterial.uniforms.sunPosition.value.copy(_sun);
    },
  };
}
