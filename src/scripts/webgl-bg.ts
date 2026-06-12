import * as THREE from 'three'

// Live background: an organic blob displaced by simplex noise in the vertex
// shader, colored ember-red → orange → neon-yellow by noise + fresnel,
// plus a drifting particle field. Sits behind the glass UI at z-0.
//
// No-motion-first: with prefers-reduced-motion we render a single static
// frame; if WebGL is unavailable we bail and the CSS aurora wash stands in.

// rendering guardrails
const PIXEL_RATIO_CAP = 2 // retina is plenty; 3x+ pixel ratios just heat phones
const MAX_FRAME_DELTA = 0.05 // clamp long gaps (hidden tab, debugger) to one tick
const STILL_FRAME_TIME = 2.5 // noise phase chosen for the reduced-motion still
const SCROLL_FADE = 0.75 // the blob is a hero ornament: by one viewport of
// scroll it dims to 25% so the content sections stay readable on top of it

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

const VERTEX = /* glsl */ `
  uniform float uTime;
  varying float vNoise;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  ${NOISE_GLSL}

  void main() {
    // two octaves: slow broad swell + faster surface ripple
    float n = snoise(position * 0.9 + uTime * 0.10);
    n += 0.35 * snoise(position * 2.3 - uTime * 0.15);
    vNoise = n;

    vec3 displaced = position + normal * n * 0.42;
    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);

    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying float vNoise;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  const vec3 DEEP_EMBER = vec3(0.30, 0.04, 0.02);   // valleys
  const vec3 NEON_ORANGE = vec3(1.0, 0.55, 0.10);   // crests
  const vec3 NEON_RED = vec3(1.0, 0.23, 0.23);      // midtones
  const vec3 NEON_YELLOW = vec3(1.0, 0.84, 0.04);   // rim light

  void main() {
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 2.0);

    vec3 col = mix(DEEP_EMBER, NEON_RED, smoothstep(-0.8, 0.2, vNoise));
    col = mix(col, NEON_ORANGE, smoothstep(0.2, 1.0, vNoise));
    col = mix(col, NEON_YELLOW, fresnel * 0.85);
    col += NEON_YELLOW * pow(fresnel, 3.0) * 0.6; // hot rim glow

    gl_FragColor = vec4(col, uOpacity);
  }
`

function createParticles(): THREE.Points {
  const count = 350
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const palette = [
    new THREE.Color('#ff3b3b'),
    new THREE.Color('#ff8c1a'),
    new THREE.Color('#ffd60a'),
  ]

  for (let i = 0; i < count; i++) {
    // shell between r=3 and r=9 so dust never crosses the blob itself
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
    opacity: 0.7,
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
    uOpacity: { value: 1.0 },
  }

  const blob = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.5, isMobile ? 48 : 96),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true, // uOpacity drives the scroll fade
    }),
  )
  // off-center so the hero copy and the shape share the viewport
  blob.position.set(1.6, 0.2, 0)
  scene.add(blob)

  // ghost shell: same shader, wireframe, additive — a faint techno halo
  const shellUniforms = {
    uTime: uniforms.uTime,
    uOpacity: { value: 0.07 },
  }
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.0, 24),
    new THREE.ShaderMaterial({
      uniforms: shellUniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      wireframe: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  shell.position.copy(blob.position)
  scene.add(shell)

  const particles = createParticles()
  const particlesMat = particles.material as THREE.PointsMaterial
  scene.add(particles)

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight, false)
  }
  window.addEventListener('resize', onResize)

  const pointer = { x: 0, y: 0 }
  let time = 0
  let lastFrame = performance.now()

  const renderFrame = () => {
    // capped delta: a hidden tab resumes where it left off, no snap-morph
    const now = performance.now()
    time += Math.min((now - lastFrame) / 1000, MAX_FRAME_DELTA)
    lastFrame = now
    uniforms.uTime.value = time

    // ambient spin, counter-rotated shell, scroll nudges the blob along
    blob.rotation.y = time * 0.06 + window.scrollY * 0.0004
    blob.rotation.x = time * 0.03
    shell.rotation.y = -time * 0.04
    shell.rotation.x = time * 0.02
    particles.rotation.y = time * 0.015

    // recede behind the content once the hero scrolls away
    const fade = 1 - SCROLL_FADE * Math.min(window.scrollY / window.innerHeight, 1)
    uniforms.uOpacity.value = fade
    shellUniforms.uOpacity.value = 0.07 * fade
    particlesMat.opacity = 0.7 * fade

    // pointer parallax, eased so the camera glides rather than tracks
    camera.position.x += (pointer.x * 0.35 - camera.position.x) * 0.04
    camera.position.y += (pointer.y * 0.25 - camera.position.y) * 0.04
    camera.lookAt(blob.position.x * 0.4, 0, 0)

    renderer.render(scene, camera)
  }

  if (reducedMotion) {
    // a single composed frame — the shape is present, just still; re-render
    // on scroll (with time pinned) so the readability fade still applies
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
