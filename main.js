import * as THREE from "three";
import { SERIES } from "./articles.js";
import { createSolarSystem } from "./solar.js";

window.__THREE_READY__ = false;
let loadsDone = false;
let painted = 0;
THREE.DefaultLoadingManager.onLoad = () => {
  loadsDone = true;
  if (painted >= 2) window.__THREE_READY__ = true;
};

const canvas = document.getElementById("c");
const seriesEl = document.getElementById("series-label");
const articleEl = document.getElementById("article-label");
const dockTagsEl = document.getElementById("dock-tags");
const SERIES_TAG = {
  gitlab: "GITLAB",
  k8s: "K8S",
  peopleware: "PPWARE",
  ego: "EGO",
  misc: "MISC",
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x05060a, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05060a, 0.004);

const CAM_REST = { x: 0, y: 0.2, z: 11 };
// Face-on was 1.52 (~87°). Tilt back ~60° so the system is not a screen-flat disk.
const SOLAR_TILT = THREE.MathUtils.degToRad(60);
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
camera.position.set(CAM_REST.x, CAM_REST.y, CAM_REST.z);
camera.lookAt(0, 0, 0);
const parallax = new THREE.Vector2();
const spaceLayers = [];

const mouse = new THREE.Vector2(0, 0);
const ndc = new THREE.Vector2();
const clock = new THREE.Clock();
const _v = new THREE.Vector3();
const _dock = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _screen = new THREE.Vector3();
const dockRay = new THREE.Raycaster();
const pickRay = new THREE.Raycaster();
const dockNdc = new THREE.Vector2();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _toSun = new THREE.Vector3();
const _sunInPlane = new THREE.Vector3();
const _sunPlane = new THREE.Plane();

scene.add(new THREE.AmbientLight(0x6b7280, 0.42));
const key = new THREE.DirectionalLight(0xfff1d6, 1.7);
scene.add(key);
const rim = new THREE.DirectionalLight(0x6a7caa, 0.28);
rim.position.set(12, 1, -10);
scene.add(rim);

function randn() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const STAR_Z_MAX = -50;

function fillStarField(pos, { count, spanX, spanY, z0, zSpan, cluster }) {
  const nClusters = cluster ? Math.max(2, Math.round(count / 70)) : 0;
  const clusters = [];
  const zMin = z0 - zSpan * 0.5;
  const zMax = Math.min(z0 + zSpan * 0.5, STAR_Z_MAX);
  const xMax = spanX * 0.5;
  const yMax = spanY * 0.5;
  for (let c = 0; c < nClusters; c++) {
    clusters.push({
      x: (Math.random() - 0.5) * spanX * 0.8,
      y: (Math.random() - 0.5) * spanY * 0.8,
      z: z0 + (Math.random() - 0.5) * zSpan,
      sx: (0.035 + Math.random() * 0.09) * spanX,
      sy: (0.035 + Math.random() * 0.09) * spanY,
      sz: (0.18 + Math.random() * 0.28) * zSpan,
    });
  }
  for (let i = 0; i < count; i++) {
    let x;
    let y;
    let z;
    if (nClusters && Math.random() > 0.65) {
      const cl = clusters[(Math.random() * nClusters) | 0];
      x = cl.x + randn() * cl.sx;
      y = cl.y + randn() * cl.sy;
      z = cl.z + randn() * cl.sz;
    } else {
      x = (Math.random() - 0.5) * spanX;
      y = (Math.random() - 0.5) * spanY;
      z = z0 + (Math.random() - 0.5) * zSpan;
    }
    pos[i * 3] = THREE.MathUtils.clamp(x, -xMax, xMax);
    pos[i * 3 + 1] = THREE.MathUtils.clamp(y, -yMax, yMax);
    pos[i * 3 + 2] = THREE.MathUtils.clamp(z, zMin, zMax);
  }
}

function starSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.22, "rgba(255,255,255,0.85)");
  g.addColorStop(0.55, "rgba(255,255,255,0.15)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const STAR_SPRITE = starSprite();

function addStarLayer({
  count,
  size,
  opacity,
  pax,
  spanX,
  spanY,
  z0,
  zSpan,
  tint = [0.8, 0.84, 0.96],
  cluster = true,
  drift = 0,
  attenuate = true,
}) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  fillStarField(pos, { count, spanX, spanY, z0, zSpan, cluster });
  for (let i = 0; i < count; i++) {
    const b = 0.5 + Math.random() * 0.5;
    col[i * 3] = tint[0] * b;
    col[i * 3 + 1] = tint[1] * b;
    col[i * 3 + 2] = tint[2] * b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xffffff,
      size,
      sizeAttenuation: attenuate,
      vertexColors: true,
      transparent: true,
      opacity,
      map: STAR_SPRITE,
      depthWrite: false,
      depthTest: true,
      fog: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  pts.renderOrder = -10;
  const g = new THREE.Group();
  g.add(pts);
  g.userData = { pax, drift };
  scene.add(g);
  spaceLayers.push(g);
}

addStarLayer({
  count: 4000,
  size: 2.2,
  opacity: 0.7,
  pax: 0.05,
  spanX: 220,
  spanY: 125,
  z0: -80,
  zSpan: 18,
  tint: [0.72, 0.78, 0.96],
  attenuate: false,
});
addStarLayer({
  count: 2800,
  size: 1.2,
  opacity: 0.78,
  pax: 0.15,
  spanX: 200,
  spanY: 115,
  z0: -70,
  zSpan: 16,
  tint: [0.78, 0.84, 0.97],
});
addStarLayer({
  count: 600,
  size: 1.5,
  opacity: 0.8,
  pax: 1.4,
  spanX: 185,
  spanY: 105,
  z0: -62,
  zSpan: 14,
  tint: [0.9, 0.91, 0.97],
});
addStarLayer({
  count: 140,
  size: 2.0,
  opacity: 0.84,
  pax: 2.4,
  spanX: 175,
  spanY: 100,
  z0: -55,
  zSpan: 8,
  tint: [1, 0.92, 0.82],
  drift: 0.08,
});

const solar = createSolarSystem(scene, camera);
const deepVeil = new THREE.Mesh(
  new THREE.PlaneGeometry(90, 55),
  new THREE.MeshBasicMaterial({
    color: 0x05060a,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    depthTest: true,
    fog: false,
  }),
);
deepVeil.position.set(0, 0, -1.6);
deepVeil.renderOrder = -4;
scene.add(deepVeil);

const HEAT_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const HEAT_FRAG = `
uniform float uHeat;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float r = length(vUv - vec2(0.5)) * 2.0;
  float wash = 1.0 - 0.22 * r;
  float cover = 1.0 - smoothstep(0.58, 0.97, r);
  float a = max(wash, 0.0) * cover * uHeat * 0.62;
  if (a < 0.02) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;

function makeHeat() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uHeat: { value: 0 },
      uColor: { value: new THREE.Color(1.0, 0.72, 0.38) },
    },
    vertexShader: HEAT_VERT,
    fragmentShader: HEAT_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(PLANET_R, 64), mat);
  mesh.visible = false;
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return mesh;
}

const LIMB_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const LIMB_FRAG = `
uniform vec2 uSun;
uniform vec3 uWarm;
varying vec2 vUv;
void main() {
  vec2 c = vUv * 2.0 - 1.0;
  float r = length(c);
  if (r > 0.995) discard;
  vec2 dir = c / max(r, 1e-4);
  float sun = dot(dir, normalize(uSun));
  float rim = smoothstep(0.52, 0.97, r);
  float warm = rim * max(sun, 0.0);
  float cool = rim * max(-sun, 0.0);
  vec3 col = uWarm * warm + vec3(0.06, 0.09, 0.16) * cool;
  float a = warm * 0.4 + cool * 0.24;
  if (a < 0.012) discard;
  gl_FragColor = vec4(col, a);
}`;

function makeLimb() {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(PLANET_R, 64),
    new THREE.ShaderMaterial({
      uniforms: {
        uSun: { value: new THREE.Vector2(0.72, 0.38) },
        uWarm: { value: new THREE.Color(1.0, 0.78, 0.52) },
      },
      vertexShader: LIMB_VERT,
      fragmentShader: LIMB_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      toneMapped: false,
      fog: false,
      side: THREE.FrontSide,
    }),
  );
  mesh.frustumCulled = false;
  return mesh;
}

const loader = new THREE.TextureLoader();
loader.crossOrigin = "anonymous";
const texCache = new Map();

function badgeTexture(url, onLoad) {
  const hit = texCache.get(url);
  if (hit) {
    onLoad(hit);
    return;
  }
  loader.load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    texCache.set(url, tex);
    onLoad(tex);
  });
}

function applyArticle(badge, article) {
  if (badge.userData.article === article) return;
  badge.userData.article = article;
  if (!article) return;
  badgeTexture(article.badge, (tex) => {
    if (badge.userData.article !== article) return;
    badge.material.map = tex;
    badge.material.color.set(0xffffff);
    badge.material.needsUpdate = true;
  });
}

const SEAT_DISTS = [5.6, 6.8, 8.0, 9.2];
const SEAT_HOME = [
  { x: -0.7, y: 0.62 },
  { x: 0.72, y: 0.48 },
  { x: -0.64, y: -0.65 },
  { x: 0.68, y: -0.54 },
];
const SEAT_Y_CLEAR = 0.5;
const SEAT_X_CLEAR = 0.42;
const FOCUS_DELAY = 0.25;
const DOCK_LERP = 2.6;
const DOCK_SETTLE = 0.22;
const DOCK_SCALE_SETTLE = 0.05;
const PLANET_R = 1.62;
const TRACK_L = 1.82;
const TRACK_R = 0.78;
const PLATE_H_MUL = 1.72;
const CAP_FADE0 = 0.86;
const CAP_FADE1 = 1.0;
const SATURN_IN = PLANET_R * 1.02;
const SATURN_OUT = PLANET_R * 1.88;
const SATURN_OPEN_TOP = 1.6; // increase for more tilt backward
const SATURN_OPEN_BOT = -1.6; // decrease for more tilt forward
const SATURN_EQ_TOP = 0.2;
const SATURN_EQ_BOT = 0.2;
const PLATE_Z = 0.07;
const PLATE_VEIL_Z = TRACK_R + 0.14;
const PLATE_VEIL_OPACITY = 0.16;
const GAS_PUFFS = 720;
const GAS_COLOR = {
  gitlab: 0xd97706,
  misc: 0xeab308,
};
const BADGE_ASPECT = 2.05;
const ACTIVE_SCALE = 2.35;
const DOCK_SCALE = 0.28;
const GAP_PX = 20;
const REF_COUNT = Math.max(...SERIES.map((s) => s.articles.length));
const PER_ROW = Math.ceil(REF_COUNT / 2);
const BELT_TURNS = 1.2;
const PATH_LEN = 4 * TRACK_L + 2 * Math.PI * TRACK_R;
let gapLocal = 0.06;
let badgeH = PATH_LEN / PER_ROW / BADGE_ASPECT;

function syncGap() {
  const dist = Math.max(4, camera.position.z - TRACK_R * ACTIVE_SCALE);
  const worldH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  gapLocal = ((GAP_PX / Math.max(innerHeight, 1)) * worldH) / ACTIVE_SCALE;
  badgeH = Math.max(0.08, (PATH_LEN / PER_ROW - gapLocal) / BADGE_ASPECT);
}

function stadiumAt(t) {
  const straight = 2 * TRACK_L;
  const cap = Math.PI * TRACK_R;
  let s = ((((t + 0.5) % 1) + 1) % 1) * PATH_LEN;
  if (s <= straight) {
    const u = s / straight;
    return { x: -TRACK_L + u * 2 * TRACK_L, z: TRACK_R, nx: 0, nz: 1 };
  }
  s -= straight;
  if (s <= cap) {
    const theta = (s / cap) * Math.PI;
    return {
      x: TRACK_L + TRACK_R * Math.sin(theta),
      z: TRACK_R * Math.cos(theta),
      nx: Math.sin(theta),
      nz: Math.cos(theta),
    };
  }
  s -= cap;
  if (s <= straight) {
    const u = s / straight;
    return { x: TRACK_L - u * 2 * TRACK_L, z: -TRACK_R, nx: 0, nz: -1 };
  }
  s -= straight;
  const theta = Math.PI + (s / cap) * Math.PI;
  return {
    x: -TRACK_L + TRACK_R * Math.sin(theta),
    z: TRACK_R * Math.cos(theta),
    nx: Math.sin(theta),
    nz: Math.cos(theta),
  };
}

const GAS_NOISE = `
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fogN(vec2 p) {
  return vnoise(p) * 0.55 + vnoise(p * 2.17) * 0.3 + vnoise(p * 4.31) * 0.15;
}
`;

const GAS_PLATE_VERT = `
uniform float uDisperse;
uniform float uTime;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  float rim = smoothstep(0.22, 0.48, abs(uv.y - 0.5));
  float along = uv.x * 6.2831853;
  float wave = 0.022 * sin(along * 5.0 + uTime * 1.35) + 0.012 * sin(along * 8.0 - uTime * 1.8);
  p.y *= 1.0 + rim * wave + uDisperse * 0.08;
  p.x *= 1.0 + uDisperse * 0.04;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const GAS_PLATE_FRAG = `
${GAS_NOISE}
uniform float uDisperse;
uniform float uTime;
uniform float uAspect;
uniform float uOpacity;
uniform float uHover;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float pad = 0.10;
  float halfH = 0.5 - pad;
  float halfW = uAspect * 0.5 - pad;
  float rad = halfH * 0.96;
  vec2 q = abs(p) - vec2(halfW - rad, halfH - rad);
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
  float along = vUv.x * 6.2831853;
  float crest = 0.02 * sin(along * 5.0 + uTime * 1.4) + 0.012 * sin(along * 8.0 - uTime * 1.7);
  float fringe = crest + 0.02 * (fogN(vUv * 3.4 + uTime * 0.04) - 0.5);
  float edge = 1.0 - smoothstep(-0.11 + fringe, pad + uHover * 0.015 + fringe, sd);
  vec2 uvw = vUv;
  vec2 warp = vec2(
    fogN(uvw * 2.15 + vec2(uTime * 0.05, -uTime * 0.03)),
    fogN(uvw.yx * 2.4 + vec2(-uTime * 0.035, uTime * 0.04))
  );
  uvw += 0.12 * (warp - 0.5);
  float volute = fogN(uvw * 3.4 + vec2(uTime * 0.04, -uTime * 0.025));
  float fill = 0.78 + 0.22 * smoothstep(0.32, 0.7, volute);
  float a = edge * fill * uOpacity * (1.0 - uDisperse * 0.22) * (1.0 + uHover * 0.16);
  if (a < 0.008) discard;
  vec3 col = mix(uColor, vec3(1.0), 0.07 * volute);
  gl_FragColor = vec4(col, a);
}`;
const GAS_PUFF_VERT = `
${GAS_NOISE}
attribute float aSeed;
attribute float aSize;
uniform float uTime;
uniform float uDisperse;
varying float vAlpha;
void main() {
  float t = uTime * 0.14 + aSeed * 6.2831853;
  vec3 p = position;
  p.x = fract(p.x + 0.5 + 0.04 * sin(t + p.y * 9.0)) - 0.5;
  p.y += 0.03 * sin(t * 1.35 + p.x * 7.0);
  p.z += 0.012 * sin(t * 0.9 + aSeed * 5.0);
  p *= 1.0 + uDisperse * 0.12;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * 9.0 * (1.0 / max(-mv.z, 0.6));
  float boil = 0.55 + 0.45 * fogN(vec2(aSeed * 8.0, uTime * 0.08));
  vAlpha = 0.42 * boil * (1.0 - uDisperse * 0.3);
}`;
const GAS_PUFF_FRAG = `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.48, 0.08, d) * vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(uColor, a);
}`;

let gasPlateGeo;
let gasSaturnGeo;
let gasPuffGeo;
let saturnRingMap;

function gasPuffGeometry() {
  const pos = new Float32Array(GAS_PUFFS * 3);
  const seed = new Float32Array(GAS_PUFFS);
  const size = new Float32Array(GAS_PUFFS);
  for (let i = 0; i < GAS_PUFFS; i++) {
    pos[i * 3] = Math.random() - 0.5;
    pos[i * 3 + 1] =
      (Math.random() < 0.5 ? -1 : 1) * (0.28 + Math.random() * 0.18);
    pos[i * 3 + 2] = (Math.random() - 0.5) * 0.03;
    seed[i] = Math.random();
    size[i] = 0.45 + Math.random() * 1.35;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  return geo;
}

function makeGas(gasTint, ringTint) {
  const color = gasTint.clone();
  const shared = {
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
    fog: false,
  };
  if (!gasPlateGeo) gasPlateGeo = new THREE.PlaneGeometry(1, 1, 64, 20);
  const plateMat = () =>
    new THREE.ShaderMaterial({
      uniforms: {
        uDisperse: { value: 0 },
        uScroll: { value: 0 },
        uTrail: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: 4 },
        uOpacity: { value: 0.9 },
        uHover: { value: 0 },
        uColor: { value: color.clone() },
      },
      vertexShader: GAS_PLATE_VERT,
      fragmentShader: GAS_PLATE_FRAG,
      side: THREE.DoubleSide,
      ...shared,
    });
  const plate = new THREE.Mesh(gasPlateGeo, plateMat());
  plate.frustumCulled = false;
  const veil = new THREE.Mesh(gasPlateGeo, plateMat());
  veil.material.uniforms.uOpacity.value = PLATE_VEIL_OPACITY;
  veil.frustumCulled = false;
  if (!gasPuffGeo) gasPuffGeo = gasPuffGeometry();
  const puffs = new THREE.Points(
    gasPuffGeo,
    new THREE.ShaderMaterial({
      uniforms: {
        uDisperse: { value: 0 },
        uScroll: { value: 0 },
        uTrail: { value: 0 },
        uTime: { value: 0 },
        uColor: { value: color.clone() },
      },
      vertexShader: GAS_PUFF_VERT,
      fragmentShader: GAS_PUFF_FRAG,
      ...shared,
    }),
  );
  puffs.frustumCulled = false;
  plate.add(puffs);
  if (!gasSaturnGeo) {
    gasSaturnGeo = new THREE.RingGeometry(SATURN_IN, SATURN_OUT, 96);
  }
  if (!saturnRingMap) {
    saturnRingMap = loader.load("./solar/saturn_ring.png");
    saturnRingMap.colorSpace = THREE.SRGBColorSpace;
  }
  const ringCol = ringTint.clone().lerp(new THREE.Color(0xffffff), 0.16);
  const saturn = new THREE.Mesh(
    gasSaturnGeo,
    new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: saturnRingMap },
        uColor: { value: ringCol },
      },
      vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
      fragmentShader: `
uniform sampler2D uMap;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float lum = dot(t.rgb, vec3(0.3, 0.59, 0.11));
  float a = t.a * smoothstep(0.02, 0.1, lum);
  if (a < 0.03) discard;
  gl_FragColor = vec4(uColor * (0.52 + 0.32 * lum), a);
}`,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    }),
  );
  saturn.frustumCulled = false;
  return { plate, veil, puffs, saturn };
}

function backSlot(n) {
  let best = 0;
  let bestZ = Infinity;
  for (let i = 0; i < n; i++) {
    const z = stadiumAt((i + 0.5) / n).z;
    if (z < bestZ) {
      bestZ = z;
      best = i;
    }
  }
  return best;
}

function articlesAround(band, n) {
  const out = Array(n).fill(null);
  if (!band.length) return out;
  if (band.length === 1) return Array.from({ length: n }, () => band[0]);

  const skip = band.length === 2 && n % 2 === 1 ? backSlot(n) : -1;
  const order = [];
  for (let i = 0; i < n; i++) {
    if (i !== skip) order.push(i);
  }
  for (let j = 0; j < order.length; j++) {
    out[order[j]] = band[j % band.length];
  }
  const first = out[order[0]];
  const lastI = order[order.length - 1];
  if (order.length >= 2 && first === out[lastI]) {
    const prev = out[order[order.length - 2]];
    const alt = band.find((a) => a !== first && a !== prev);
    if (alt) out[lastI] = alt;
  }
  return out;
}

function wrapSlot(s) {
  return ((s % PER_ROW) + PER_ROW) % PER_ROW;
}

const SEAM = backSlot(PER_ROW);

function layoutBadge(badge, scroll, articles, sliding) {
  if (!sliding) {
    writeBadgeGeometry(badge.geometry, badge.userData.slot + scroll);
    const mid = stadiumAt((badge.userData.slot + scroll + 0.5) / PER_ROW);
    badge.userData.midX = mid.x;
    badge.userData.midZ = mid.z;
    badge.userData.midNz = mid.nz;
    return;
  }
  const i = badge.userData.slot;
  const base = Math.floor(scroll);
  const frac = scroll - base;
  const vis = wrapSlot(i + frac + SEAM);
  writeBadgeGeometry(badge.geometry, vis);
  const mid = stadiumAt((vis + 0.5) / PER_ROW);
  badge.userData.midX = mid.x;
  badge.userData.midZ = mid.z;
  badge.userData.midNz = mid.nz;
  const k = articles.length;
  applyArticle(badge, articles[(((i - base) % k) + k) % k]);
}

const SAMPLES = 18;

function writeBadgeGeometry(geo, slot) {
  const inset = gapLocal / PATH_LEN;
  const t0 = slot / PER_ROW + inset / 2;
  const t1 = (slot + 1) / PER_ROW - inset / 2;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const halfH = badgeH / 2;
  for (let i = 0; i <= SAMPLES; i++) {
    const p = stadiumAt(t0 + (t1 - t0) * (i / SAMPLES));
    const i0 = i * 2;
    pos.setXYZ(i0, p.x, -halfH, p.z);
    pos.setXYZ(i0 + 1, p.x, halfH, p.z);
    nor.setXYZ(i0, p.nx, 0, p.nz);
    nor.setXYZ(i0 + 1, p.nx, 0, p.nz);
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  geo.computeBoundingSphere();
}

function badgeGeometry(slot) {
  const n = (SAMPLES + 1) * 2;
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const u = i / SAMPLES;
    uvs.push(u, 0, u, 1);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(n * 3), 3),
  );
  geo.setAttribute(
    "normal",
    new THREE.BufferAttribute(new Float32Array(n * 3), 3),
  );
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  writeBadgeGeometry(geo, slot);
  return geo;
}

function refreshBelts() {
  syncGap();
  for (const p of planets) p.lastScroll = undefined;
}

syncGap();

const planets = [];

SERIES.forEach((serie, index) => {
  const root = new THREE.Group();
  scene.add(root);

  const color = new THREE.Color(serie.color);
  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(PLANET_R, 64),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.52,
      metalness: 0.12,
      emissive: color,
      emissiveIntensity: 0.1,
      side: THREE.DoubleSide,
    }),
  );
  root.add(disk);
  loader.load(`./textures/planet-${serie.id}.png`, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    disk.material.map = tex;
    disk.material.color.set(0xffffff);
    disk.material.needsUpdate = true;
  });

  const rings = new THREE.Group();
  rings.rotation.x = 0;
  root.add(rings);
  const gas = makeGas(
    GAS_COLOR[serie.id] != null ? new THREE.Color(GAS_COLOR[serie.id]) : color,
    color,
  );
  root.add(gas.plate);
  root.add(gas.veil);
  scene.add(gas.saturn);

  const badges = [];
  const sliding = serie.articles.length > PER_ROW;
  const around = sliding
    ? serie.articles
    : articlesAround(serie.articles, PER_ROW);
  if (sliding) {
    for (const a of serie.articles) badgeTexture(a.badge, () => {});
  }
  for (let i = 0; i < PER_ROW; i++) {
    const article = around[i];
    if (!article) continue;
    const mid = stadiumAt((i + 0.5) / PER_ROW);
    const card = new THREE.Mesh(
      badgeGeometry(i),
      new THREE.MeshBasicMaterial({
        color: 0x222222,
        side: THREE.FrontSide,
        transparent: true,
        depthWrite: true,
      }),
    );
    card.userData = {
      article,
      slot: i,
      midX: mid.x,
      midZ: mid.z,
      midNz: mid.nz,
    };
    card.visible = mid.z > 0;
    rings.add(card);
    badges.push(card);
    badgeTexture(article.badge, (tex) => {
      if (card.userData.article !== article) return;
      card.material.map = tex;
      card.material.color.set(0xffffff);
      card.material.needsUpdate = true;
    });
  }

  const glow = makeHeat();
  root.add(glow);
  const limb = makeLimb();
  root.add(limb);
  planets.push({
    serie,
    root,
    rings,
    disk,
    glow,
    limb,
    gas,
    badges,
    articles: serie.articles,
    sliding,
    texSpin: index * 0.7,
    index,
    spin: 0,
    lastScroll: undefined,
    prevPos: new THREE.Vector3(),
    heat: 0,
    gasTrail: 0,
    gasPuff: 0,
  });
  if (sliding) {
    for (const card of badges) layoutBadge(card, 0, serie.articles, true);
  }
});

for (const p of planets) {
  const el = document.createElement("span");
  el.className = "dock-tag";
  el.textContent = SERIES_TAG[p.serie.id] ?? p.serie.id.toUpperCase();
  dockTagsEl.appendChild(el);
  p.tagEl = el;
}

let active = planets[2];
let selected = null;
let pickLock = null;
let hoverAim = null;
let hoverAge = 0;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  if (mouse.x === 0 && mouse.y === 0) {
    mouse.x = innerWidth / 2;
    mouse.y = innerHeight / 2;
    ndc.set(0, 0);
  }
  if (planets.length) refreshBelts();
}
function placeNow() {
  for (const p of planets) {
    if (p === active) {
      p.root.position.set(0, 0, 0);
      p.root.scale.setScalar(ACTIVE_SCALE);
      p.root.quaternion.identity();
    } else {
      dockPosition(p, p.root.position);
      p.root.scale.setScalar(DOCK_SCALE);
      dockTilt(p, p.root.quaternion);
    }
    p.prevPos.copy(p.root.position);
    p.heat = 0;
  }
}

resize();
addEventListener("resize", resize);

const params = new URLSearchParams(location.search);
const preset = params.get("at");
const presets = {
  c: [0.5, 0.5],
  tl: [0.08, 0.1],
  tr: [0.92, 0.1],
  bl: [0.08, 0.9],
  br: [0.92, 0.9],
};
if (preset && presets[preset]) {
  const [px, py] = presets[preset];
  mouse.x = innerWidth * px;
  mouse.y = innerHeight * py;
  ndc.x = px * 2 - 1;
  ndc.y = -(py * 2 - 1);
}
const start = params.get("p");
if (start !== null && planets[start]) active = planets[Number(start)];
else {
  const aimed = aimedDock();
  if (aimed) active = aimed;
}
placeNow();

addEventListener("pointermove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  ndc.x = (e.clientX / innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / innerHeight) * 2 + 1;
});

addEventListener("click", (e) => {
  if (e.target.closest("#series-label")) return;
  if (selected?.userData.article) {
    window.open(selected.userData.article.url, "_blank", "noopener");
  }
});

function seatFor(focus, planet) {
  let i = 0;
  for (const p of planets) {
    if (p === focus) continue;
    if (p === planet) break;
    i++;
  }
  const home = SEAT_HOME[(i + focus.index) % SEAT_HOME.length];
  const rot = (focus.index - 2) * 0.2;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  let x = home.x * c - home.y * s;
  let y = home.x * s + home.y * c;
  const xSign = x !== 0 ? Math.sign(x) : Math.sign(home.x) || 1;
  const ySign = y !== 0 ? Math.sign(y) : Math.sign(home.y) || 1;
  if (Math.abs(x) < SEAT_X_CLEAR) x = xSign * SEAT_X_CLEAR;
  if (Math.abs(y) < SEAT_Y_CLEAR) y = ySign * SEAT_Y_CLEAR;
  x = THREE.MathUtils.clamp(x, -0.8, 0.8);
  y = THREE.MathUtils.clamp(y, -0.8, 0.8);
  return {
    x,
    y,
    dist: SEAT_DISTS[(i + focus.index * 2) % SEAT_DISTS.length],
    tiltX: y * 0.42,
    tiltY: -x * 0.5,
  };
}

function dockPosition(planet, out) {
  const seat = seatFor(active, planet);
  dockNdc.set(seat.x, seat.y);
  dockRay.setFromCamera(dockNdc, camera);
  dockRay.ray.at(seat.dist, out);
  return out;
}

function dockTilt(planet, out) {
  const seat = seatFor(active, planet);
  _euler.set(seat.tiltX, seat.tiltY, 0, "YXZ");
  return out.setFromEuler(_euler);
}

function seatScreen(planet) {
  dockPosition(planet, _v);
  _screen.copy(_v).project(camera);
  return {
    x: ((_screen.x + 1) / 2) * innerWidth,
    y: ((-_screen.y + 1) / 2) * innerHeight,
  };
}

function dockInFlight(planet) {
  dockPosition(planet, _dock);
  return (
    planet.root.position.distanceTo(_dock) > DOCK_SETTLE ||
    Math.abs(planet.root.scale.x - DOCK_SCALE) > DOCK_SCALE_SETTLE
  );
}

function aimedDock() {
  if (pickLock && Math.hypot(mouse.x - pickLock.x, mouse.y - pickLock.y) < 40) {
    return null;
  }
  pickLock = null;
  const hitR = Math.min(innerWidth, innerHeight) * 0.16;
  let nearest = null;
  let best = hitR;
  for (const p of planets) {
    if (p === active) continue;
    if (dockInFlight(p)) continue;
    const s = seatScreen(p);
    const d = Math.hypot(mouse.x - s.x, mouse.y - s.y);
    if (d < best) {
      best = d;
      nearest = p;
    }
  }
  return nearest;
}

function settleFocus(dt) {
  const aimed = aimedDock();
  if (aimed && aimed !== active) {
    if (hoverAim !== aimed) {
      hoverAim = aimed;
      hoverAge = 0;
    } else {
      hoverAge += dt;
      if (hoverAge >= FOCUS_DELAY) {
        active = aimed;
        pickLock = { x: mouse.x, y: mouse.y };
        hoverAim = null;
        hoverAge = 0;
      }
    }
  } else {
    hoverAim = null;
    hoverAge = 0;
  }
}

function tickLimb(p) {
  p.limb.position.set(0, 0, 0);
  p.limb.lookAt(camera.position);
  p.limb.translateZ(0.012);
  solar.sun.getWorldPosition(_toSun).project(camera);
  _v.copy(p.root.position).project(camera);
  p.limb.material.uniforms.uSun.value.set(_toSun.x - _v.x, _toSun.y - _v.y);
  p.limb.renderOrder = p === active ? 2 : 1;
}

function tickHeat(p, dt) {
  const speed = p.root.position.distanceTo(p.prevPos) / Math.max(dt, 1e-4);
  const want = THREE.MathUtils.clamp((speed - 0.35) / 7, 0, 1);
  p.heat += (want - p.heat) * (1 - Math.exp(-10 * dt));
  p.prevPos.copy(p.root.position);
  p.glow.visible = p.heat > 0.03;
  p.glow.material.uniforms.uHeat.value = p.heat;
}

function tickGas(p, dt, on, scroll) {
  const flow = on ? scroll / PER_ROW : 0;
  const delta = Math.abs(scroll - (p.lastScroll ?? scroll));
  const wantTrail = on ? THREE.MathUtils.clamp(delta * 3.2, 0, 0.22) : 0;
  p.gasTrail += (wantTrail - p.gasTrail) * (1 - Math.exp(-9 * dt));
  for (const mesh of [p.gas.plate, p.gas.veil, p.gas.puffs]) {
    const u = mesh.material.uniforms;
    u.uDisperse.value = p.heat;
    u.uScroll.value = flow;
    u.uTrail.value = p.gasTrail;
    u.uTime.value = clock.elapsedTime;
    if (u.uHover) u.uHover.value = p.gasPuff;
    mesh.visible = on;
  }
  p.gas.plate.renderOrder = on ? 8 : 0;
  p.gas.puffs.renderOrder = on ? 9 : 0;
  p.gas.veil.renderOrder = on ? 12 : 0;
  const saturn = p.gas.saturn;
  saturn.visible = !on;
  saturn.renderOrder = 1;
}

function sizePlate(mesh, z, s) {
  const plateDepth = Math.max(0.5, camera.position.z - z * s);
  const badgeDepth = Math.max(0.5, camera.position.z - TRACK_R * s);
  const persp = plateDepth / badgeDepth;
  const plateH = badgeH * PLATE_H_MUL * persp;
  const overflow = (PATH_LEN / PER_ROW) * 0.78;
  const plateW = TRACK_L * 2 * persp + overflow * 2;
  mesh.scale.set(plateW, plateH, 1);
  mesh.material.uniforms.uAspect.value = plateW / plateH;
}

function fitPlateToBadges(p) {
  if (!p.gas.plate.visible) return;
  const s = p.root.scale.x;
  sizePlate(p.gas.plate, PLATE_Z, s);
  sizePlate(p.gas.veil, PLATE_VEIL_Z, s);
}

function saturnOpen(planet) {
  return seatFor(active, planet).y >= 0 ? SATURN_OPEN_TOP : SATURN_OPEN_BOT;
}

function orientSaturn(p) {
  const saturn = p.gas.saturn;
  if (!saturn.visible) return;
  const open = saturnOpen(p);
  saturn.position.copy(p.root.position);
  saturn.scale.copy(p.root.scale);
  saturn.quaternion.copy(camera.quaternion);
  _v.copy(p.root.position).sub(camera.position);
  _v.applyQuaternion(_quat.copy(camera.quaternion).invert());
  saturn.rotateX(-Math.atan2(_v.y, -_v.z) + open);
  _v.set(0, 1, 0).applyQuaternion(camera.quaternion);
  saturn.position.addScaledVector(
    _v,
    -Math.sign(open) *
      (open > 0 ? SATURN_EQ_TOP : SATURN_EQ_BOT) *
      p.root.scale.x,
  );
}

function badgeFade(badge) {
  const edge = Math.abs(badge.userData.midX) / TRACK_L;
  return THREE.MathUtils.smoothstep(CAP_FADE0, CAP_FADE1, edge);
}

function pickBadge() {
  pickRay.setFromCamera(ndc, camera);
  const hits = pickRay.intersectObjects(active.badges, false);
  for (const { object: badge } of hits) {
    if (!badge.visible || !badge.userData.article) continue;
    if (badge.userData.midZ <= 0.04 || badge.userData.midNz <= 0) continue;
    if (badgeFade(badge) > 0.55) continue;
    return badge;
  }
  return null;
}

function tickSpace(dt, t) {
  parallax.x += (ndc.x - parallax.x) * (1 - Math.exp(-4 * dt));
  parallax.y += (ndc.y - parallax.y) * (1 - Math.exp(-4 * dt));
  camera.position.set(
    CAM_REST.x,
    CAM_REST.y + Math.sin((t * Math.PI * 2) / 15) * 0.032,
    CAM_REST.z + Math.sin((t * Math.PI * 2) / 17 + 1.2) * 0.05,
  );
  camera.lookAt(0, 0, 0);

  for (const layer of spaceLayers) {
    const amount = layer.userData.pax;
    const drift = layer.userData.drift ?? 0;
    const dx = drift * Math.sin((t * Math.PI * 2) / 40);
    const dy = drift * Math.cos((t * Math.PI * 2) / 47) * 0.4;
    layer.position.set(
      -parallax.x * amount + dx,
      -parallax.y * amount * 0.65 + dy,
      0,
    );
  }

  dockNdc.set(-0.48, -0.28);
  dockRay.setFromCamera(dockNdc, camera);
  dockRay.ray.at(52, _v);
  solar.root.position.copy(_v);
  solar.root.quaternion.copy(camera.quaternion);
  solar.root.rotateX(1.52 - SOLAR_TILT);
  solar.tick(dt);
  _toSun.copy(camera.position).normalize();
  _sunPlane.setFromNormalAndCoplanarPoint(_toSun, _v.set(0, 0, 0));
  dockRay.ray.intersectPlane(_sunPlane, _sunInPlane);
  key.position
    .copy(_sunInPlane)
    .addScaledVector(camera.position, 14 / camera.position.length());
  deepVeil.quaternion.copy(camera.quaternion);
}

function tickDockTags() {
  const span = ACTIVE_SCALE - DOCK_SCALE;
  for (const p of planets) {
    const grow = (p.root.scale.x - DOCK_SCALE) / span;
    const a =
      p === active ? 0 : 1 - THREE.MathUtils.smoothstep(grow, 0.04, 0.2);
    if (a < 0.02) {
      p.tagEl.style.opacity = "0";
      p.tagEl.style.visibility = "hidden";
      continue;
    }
    _screen.copy(p.root.position).project(camera);
    const x = ((_screen.x + 1) / 2) * innerWidth;
    const y = ((-_screen.y + 1) / 2) * innerHeight;
    p.tagEl.style.visibility = "visible";
    p.tagEl.style.opacity = String(a);
    p.tagEl.style.left = `${x}px`;
    p.tagEl.style.top = `${y}px`;
  }
}

function beltFrontPx() {
  const worldH =
    2 * CAM_REST.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const beltW = 2 * TRACK_L * ACTIVE_SCALE;
  return Math.max((beltW / (worldH * camera.aspect)) * innerWidth, 1);
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  tickSpace(dt, clock.elapsedTime);
  settleFocus(dt);
  if (active.sliding) {
    active.spin =
      -((mouse.x - innerWidth / 2) / beltFrontPx()) *
      active.serie.articles.length *
      BELT_TURNS *
      (PER_ROW / REF_COUNT);
  } else {
    active.spin =
      -(mouse.x / innerWidth - 0.5) *
      Math.max(PER_ROW, active.serie.articles.length);
  }

  for (const p of planets) {
    const on = p === active;
    p.rings.rotation.set(p.rings.rotation.x, 0, 0);
    const scroll = on ? p.spin : 0;
    tickGas(p, dt, on, scroll);
    if (scroll !== p.lastScroll) {
      p.lastScroll = scroll;
      for (const badge of p.badges)
        layoutBadge(badge, scroll, p.articles, p.sliding);
    }

    if (on) {
      _dock.set(0, 0, 0);
      _scale.setScalar(ACTIVE_SCALE);
      _quat.identity();
    } else {
      dockPosition(p, _dock);
      _scale.setScalar(DOCK_SCALE);
      dockTilt(p, _quat);
    }
    const k = 1 - Math.exp(-DOCK_LERP * dt);
    p.root.position.lerp(_dock, k);
    p.root.scale.lerp(_scale, k);
    p.root.quaternion.slerp(_quat, k);
    tickHeat(p, dt);
    p.texSpin += dt * (on ? 0.06 : 0.025);
    p.disk.lookAt(camera.position);
    p.disk.rotateZ(p.texSpin);
    p.glow.lookAt(camera.position);
    tickLimb(p);
    p.gas.plate.position.set(0, 0, 0);
    p.gas.plate.lookAt(camera.position);
    p.gas.plate.translateZ(PLATE_Z);
    p.gas.veil.position.set(0, 0, 0);
    p.gas.veil.lookAt(camera.position);
    p.gas.veil.translateZ(PLATE_VEIL_Z);
    orientSaturn(p);
    p.disk.material.depthWrite = true;
    p.disk.material.depthTest = true;
    p.disk.renderOrder = on ? 1 : 0;
    p.glow.renderOrder = on ? 2 : 1;
  }

  for (const p of planets) {
    const on = p === active;
    for (const badge of p.badges) {
      const fade = badgeFade(badge);
      const front = badge.userData.midZ > 0.04 && badge.userData.midNz > 0;
      badge.visible = on && front && fade < 0.97;
      badge.material.opacity = 1 - fade;
      badge.renderOrder = fade > 0.35 ? 7 : 10;
      badge.material.depthWrite = fade < 0.5;
      badge.material.depthTest = true;
    }
  }
  fitPlateToBadges(active);
  const next = pickBadge();
  if (next !== selected && next) active.gasPuff = 1;
  selected = next;
  active.gasPuff *= Math.exp(-7 * dt);
  for (const p of planets) {
    for (const badge of p.badges) {
      badge.scale.setScalar(badge === selected ? 1.02 : 1);
    }
  }

  seriesEl.textContent = active.serie.title;
  seriesEl.href = active.serie.url;
  _v.set(0, badgeH / 2 + 0.12, TRACK_R + 0.06);
  active.root.localToWorld(_v);
  _screen.copy(_v).project(camera);
  seriesEl.style.left = `${((_screen.x + 1) / 2) * innerWidth}px`;
  seriesEl.style.top = `${((-_screen.y + 1) / 2) * innerHeight}px`;
  tickDockTags();
  articleEl.textContent = selected?.userData.article.title ?? "—";
  document.body.style.cursor = selected ? "pointer" : "default";

  renderer.render(scene, camera);
  painted++;
  if (loadsDone && painted >= 2) window.__THREE_READY__ = true;
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
