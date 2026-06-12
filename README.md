# nicksnexus

Personal site for Nick Leigh — [nicksnexus](https://nickleigh05.github.io/nicksnexus/).

A single page rendered over a live WebGL background: a simplex-noise blob with custom GLSL shaders drifts behind a glassmorphic UI, so the animation visibly warps through the frosted cards above it.

## Stack

- [Astro](https://astro.build) 6, static output, TypeScript strict
- Tailwind CSS v4 — design tokens and custom utilities live in [`src/styles/global.css`](src/styles/global.css)
- Three.js — hand-written vertex/fragment shaders, no materials borrowed
- GSAP (ScrollTrigger + SplitText) for entrance and scroll motion
- Type is Space Grotesk, Inter, and JetBrains Mono via Fontsource

## Architecture

The page is three stacked layers:

1. **Canvas** (`z-0`, fixed): [`src/scripts/webgl-bg.ts`](src/scripts/webgl-bg.ts) renders an icosahedron displaced by two octaves of simplex noise in the vertex shader, colored by noise height + fresnel rim in the fragment shader, plus a wireframe ghost shell and a drifting particle field.
2. **UI overlay** (`z-10`, `pointer-events: none`): all page content. Interactive elements opt back in with `pointer-events: auto`, so the canvas shows through everywhere else.
3. **Glass surfaces**: translucent fills with `backdrop-filter: blur` (the `glass` / `glass-bright` utilities), which is what makes the moving background smear under the cards.

Motion is **no-motion-first**: CSS only hides elements when `prefers-reduced-motion: no-preference` holds, and [`src/scripts/motion.ts`](src/scripts/motion.ts) mirrors the same query before animating — reduced-motion visitors get a fully visible page and a single still frame of the background. If WebGL is unavailable, a CSS aurora gradient on `body` stands in.

Performance guardrails: device pixel ratio capped at 2, lower geometry detail on small screens, and the render loop pauses while the tab is hidden.

## Develop

```sh
npm install
npm run dev      # localhost:4321/nicksnexus
npm run build    # static build to ./dist
npm run check    # astro check (types + a11y hints)
npm run format   # prettier, incl. astro + tailwind plugins
```

Deploys to GitHub Pages via `.github/workflows/deploy.yml` on push to `main`.
