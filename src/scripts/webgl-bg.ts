import * as THREE from 'three'

// Live background: a fullscreen aurora shader, slow bands of ember glow bent
// by simplex noise, plus a drifting ember-dust particle field. The whole sky
// is kept dim by design (deep ember tones, vignetted edges) so the glass UI
// above stays readable everywhere. Sits behind the UI at z-0.
//
// No-motion-first: with prefers-reduced-motion we render a single static
// frame, re-rendered on scroll so the band drift still tracks the page; if
// WebGL is unavailable we bail and the CSS aurora wash stands in.

// rendering guardrails
const PIXEL_RATIO_CAP = 2 // retina is plenty; 3x+ pixel ratios just heat phones
const MAX_FRAME_DELTA = 0.05 // clamp long gaps (hidden tab, debugger) to one tick
const STILL_FRAME_TIME = 40.0 // noise phase chosen for the reduced-motion still

const NOISE_GLSL = /* glsl */ `
  // Ashima Arts simplex noise (webgl-noise), MIT
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`

// fullscreen quad: vertices arrive in clip space already, no camera involved
const AURORA_VERTEX = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

const AURORA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uScroll;
  uniform float uAspect;
  uniform vec2 uPointer;
  varying vec2 vUv;

  ${NOISE_GLSL}

  float fbm(vec3 p) {
    float v = 0.5 * snoise(p);
    v += 0.25 * snoise(p * 2.1);
    v += 0.125 * snoise(p * 4.3);
    return v;
  }

  // the ember ramp, every stop kept dim so white text passes contrast on top
  const vec3 VOID_FLOOR = vec3(0.031, 0.012, 0.008);
  const vec3 DEEP_EMBER = vec3(0.14, 0.045, 0.025);
  const vec3 MUTED_RED = vec3(0.36, 0.11, 0.06);
  const vec3 SOFT_ORANGE = vec3(0.52, 0.26, 0.09);
  const vec3 FAINT_GOLD = vec3(0.60, 0.44, 0.17);

  void main() {
    vec2 p = vec2(vUv.x * uAspect, vUv.y);
    float t = uTime * 0.045;

    // slow domain-warped noise; the pointer drifts the field, scroll slides
    // the bands, and neither ever raises the overall brightness
    vec2 drift = uPointer * 0.10;
    float warp = fbm(vec3(p * 1.3 + drift, t));
    float detail = fbm(vec3(p * 3.1 - drift, t * 1.4 + 7.0));

    // aurora bands: soft horizontal waves bent by the noise field
    float y = vUv.y + warp * 0.28 + detail * 0.07 + uScroll;
    float bandA = 0.5 + 0.5 * sin(y * 7.0 + t * 1.6);
    float bandB = 0.5 + 0.5 * sin(y * 3.2 - t * 1.1 + 2.1);
    float glow = smoothstep(0.55, 1.0, bandA) * 0.7 + smoothstep(0.6, 1.0, bandB) * 0.5;
    glow *= 0.55 + 0.45 * warp;

    vec3 col = mix(VOID_FLOOR, DEEP_EMBER, smoothstep(-0.4, 0.6, warp));
    col = mix(col, MUTED_RED, glow);
    col = mix(col, SOFT_ORANGE, glow * glow * 0.8);
    col += FAINT_GOLD * pow(max(glow, 0.0), 3.0) * 0.25; // rare gold crests

    // vignette keeps the edges near-black so the frame feels contained
    vec2 c = vUv - 0.5;
    col *= 1.0 - dot(c, c) * 1.1;

    gl_FragColor = vec4(col, 1.0);
  }
`

function createParticles(count: number): THREE.Points {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const palette = [
    new THREE.Color('#e25c4a'),
    new THREE.Color('#f59141'),
    new THREE.Color('#eec45c'),
  ]

  for (let i = 0; i < count; i++) {
    // shell between r=3 and r=9 so the dust reads as depth, not clutter
    const r = 3 + Math.random() * 6
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi) - 2
    const c = palette[Math.floor(Math.random() * palette.length)]
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.PointsMaterial({
    size: 0.035,
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  return new THREE.Points(geometry, material)
}

export function initWebGLBackground(canvas: HTMLCanvasElement): void {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  } catch {
    return // no WebGL — the CSS aurora background carries the page
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const isMobile = window.matchMedia('(max-width: 768px)').matches

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 50)
  camera.position.z = 5.5

  const uniforms = {
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uAspect: { value: window.innerWidth / window.innerHeight },
    uPointer: { value: new THREE.Vector2(0, 0) },
  }

  const aurora = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: AURORA_VERTEX,
      fragmentShader: AURORA_FRAGMENT,
      depthWrite: false,
      depthTest: false,
    }),
  )
  aurora.renderOrder = -1 // always the backdrop, dust draws over it
  aurora.frustumCulled = false // clip-space quad, culling math doesn't apply
  scene.add(aurora)

  const particles = createParticles(isMobile ? 220 : 350)
  scene.add(particles)

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    uniforms.uAspect.value = window.innerWidth / window.innerHeight
    renderer.setSize(window.innerWidth, window.innerHeight, false)
  }
  window.addEventListener('resize', onResize)

  const pointer = { x: 0, y: 0 }
  const pointerEased = { x: 0, y: 0 }
  let time = 0
  let lastFrame = performance.now()

  const renderFrame = () => {
    // capped delta: a hidden tab resumes where it left off, no snap-morph
    const now = performance.now()
    time += Math.min((now - lastFrame) / 1000, MAX_FRAME_DELTA)
    lastFrame = now
    uniforms.uTime.value = time
    uniforms.uScroll.value = window.scrollY * 0.0002

    // eased pointer drift for the aurora domain and a gentle camera parallax
    pointerEased.x += (pointer.x - pointerEased.x) * 0.03
    pointerEased.y += (pointer.y - pointerEased.y) * 0.03
    uniforms.uPointer.value.set(pointerEased.x, pointerEased.y)
    camera.position.x += (pointerEased.x * 0.3 - camera.position.x) * 0.04
    camera.position.y += (pointerEased.y * 0.2 - camera.position.y) * 0.04
    camera.lookAt(0, 0, 0)

    particles.rotation.y = time * 0.012

    renderer.render(scene, camera)
  }

  if (reducedMotion) {
    // a single composed frame — the sky is present, just still; re-render on
    // scroll (with time pinned) so the band drift still tracks the page
    const renderStill = () => {
      time = STILL_FRAME_TIME
      lastFrame = performance.now()
      renderFrame()
    }
    renderStill()
    window.addEventListener('scroll', renderStill, { passive: true })
    return
  }

  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1
    pointer.y = -((e.clientY / window.innerHeight) * 2 - 1)
  })

  let rafId = 0
  let running = false
  const loop = () => {
    renderFrame()
    rafId = requestAnimationFrame(loop)
  }
  const start = () => {
    if (running) return
    running = true
    lastFrame = performance.now() // discard the gap accumulated while paused
    loop()
  }
  const stop = () => {
    running = false
    cancelAnimationFrame(rafId)
  }
  start()

  // don't burn GPU in background tabs
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop()
    } else {
      start()
    }
  })
}
