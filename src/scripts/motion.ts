import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'

// No-motion-first: global.css only hides [data-hero]/[data-reveal] when the
// user allows motion, and this guard mirrors that media query exactly.
if (window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
  init()
}

async function init() {
  gsap.registerPlugin(ScrollTrigger, SplitText)
  gsap.defaults({ ease: 'expo.out', duration: 0.8 })

  // SplitText must measure real line breaks, so wait for webfonts
  await document.fonts.ready

  heroIntro()
  scrollReveals()
  cardTilt()
  glassShine()
}

function heroIntro() {
  const tl = gsap.timeline()

  tl.fromTo(
    '[data-hero="frame"]',
    { autoAlpha: 0, y: -16 },
    { autoAlpha: 1, y: 0, duration: 0.6 },
    0,
  )
  tl.fromTo(
    '[data-hero="kicker"]',
    { autoAlpha: 0, y: 12 },
    { autoAlpha: 1, y: 0, duration: 0.6 },
    0.1,
  )

  const headline = document.querySelector('[data-hero="headline"]')
  if (headline) {
    let firstRun = true
    SplitText.create(headline, {
      type: 'lines',
      mask: 'lines',
      autoSplit: true,
      onSplit(self) {
        gsap.set(headline, { autoAlpha: 1 })
        const lines = gsap.from(self.lines, {
          yPercent: 110,
          duration: 0.9,
          stagger: 0.08,
          delay: firstRun ? 0.25 : 0,
        })
        // re-splits (resize, late font swaps) must not replay the entrance
        if (!firstRun) lines.progress(1)
        firstRun = false
        return lines
      },
    })
  }

  tl.fromTo(
    ['[data-hero="intro"]', '[data-hero="links"]'],
    { autoAlpha: 0, y: 20 },
    { autoAlpha: 1, y: 0, stagger: 0.12 },
    0.55,
  )
}

function scrollReveals() {
  document.querySelectorAll<HTMLElement>('[data-reveal-group]').forEach((group) => {
    const items = group.querySelectorAll<HTMLElement>('[data-reveal]')
    if (!items.length) return
    gsap.fromTo(
      items,
      { autoAlpha: 0, y: 28, scale: 0.98 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        stagger: 0.1,
        scrollTrigger: { trigger: group, start: 'top 85%', once: true },
      },
    )
  })
}

// light reflects off the glass as it scrolls: each surface's --shine tracks
// its travel through the viewport (CSS slides the streak); the fixed nav
// never moves, so its glint follows overall page progress instead
function glassShine() {
  document.querySelectorAll<HTMLElement>('.glass, .glass-bright').forEach((el) => {
    const setShine = (progress: number) => el.style.setProperty('--shine', String(progress))
    ScrollTrigger.create(
      el.closest('header')
        ? { start: 0, end: 'max', onUpdate: (self) => setShine(self.progress) }
        : {
            trigger: el,
            start: 'top bottom',
            end: 'bottom top',
            onUpdate: (self) => setShine(self.progress),
          },
    )
  })
}

// glass cards lean toward the pointer and swell while held; CSS keeps hover
// glow, GSAP owns transforms so the two never fight over the same property
function cardTilt() {
  if (!window.matchMedia('(pointer: fine)').matches) return

  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((card) => {
    gsap.set(card, { transformPerspective: 700 })
    const rotX = gsap.quickTo(card, 'rotationX', { duration: 0.5, ease: 'power3.out' })
    const rotY = gsap.quickTo(card, 'rotationY', { duration: 0.5, ease: 'power3.out' })
    const scale = gsap.quickTo(card, 'scale', { duration: 0.45, ease: 'power3.out' })

    card.addEventListener('pointerenter', () => scale(1.03))
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect()
      rotY(((e.clientX - r.left) / r.width - 0.5) * 10)
      rotX(((e.clientY - r.top) / r.height - 0.5) * -10)
    })
    card.addEventListener('pointerleave', () => {
      rotX(0)
      rotY(0)
      scale(1)
    })
  })
}
