import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import Lenis from 'lenis'

// No-motion-first: global.css only hides [data-hero]/[data-reveal] when the
// user allows motion, and this guard mirrors that media query exactly.
// Reduced-motion users also keep native scrolling — Lenis never initializes.
if (window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
  init()
}

async function init() {
  gsap.registerPlugin(ScrollTrigger, SplitText)
  gsap.defaults({ ease: 'expo.out', duration: 0.8 })

  smoothScroll()

  // SplitText must measure real line breaks, so wait for webfonts
  await document.fonts.ready

  heroIntro()
  scrollReveals()
  cardTilt()
  glassShine()
  headlineShine()
  magneticButtons()
}

// inertia scrolling driven by GSAP's ticker so Lenis and ScrollTrigger never
// disagree about where the page is
function smoothScroll() {
  const lenis = new Lenis()
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)

  // CSS smooth scrolling would fight Lenis's per-frame scrollTop writes; it
  // stays in the markup as the fallback for reduced-motion and no-JS
  document.documentElement.classList.remove('scroll-smooth')

  // anchor links glide; the offset stands in for scroll-margin, which only
  // native jumps respect
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector<HTMLElement>(link.hash)
      if (!target) return
      e.preventDefault()
      lenis.scrollTo(target, { offset: -100 })
    })
  })
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
        duration: 1,
        stagger: 0.12,
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

// the signature interaction: buttons lean toward the cursor and ease back,
// kept to a few pixels so it reads as physical weight, not a gimmick
function magneticButtons() {
  if (!window.matchMedia('(pointer: fine)').matches) return

  document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
    const x = gsap.quickTo(el, 'x', { duration: 0.45, ease: 'power3.out' })
    const y = gsap.quickTo(el, 'y', { duration: 0.45, ease: 'power3.out' })

    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect()
      x(((e.clientX - (r.left + r.width / 2)) / r.width) * 12)
      y(((e.clientY - (r.top + r.height / 2)) / r.height) * 10)
    })
    el.addEventListener('pointerleave', () => {
      x(0)
      y(0)
    })
  })
}

// sweeps a pure-white glint across the hero headline as the section scrolls
// past; the CSS gradient does the visual work, this just drives --shine (0→1)
function headlineShine() {
  const el = document.querySelector<HTMLElement>('[data-text-shine]')
  if (!el) return
  const section = el.closest('section') ?? el
  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: 'bottom top',
    onUpdate: (self) => el.style.setProperty('--shine', String(self.progress)),
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
