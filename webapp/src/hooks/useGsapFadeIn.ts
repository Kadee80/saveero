/**
 * GSAP fade-in helpers for the landing page.
 *
 * Three small hooks, each wired to one common entrance animation:
 *
 *  - useFadeInOnMount(ref)           — for above-the-fold content (hero).
 *                                      Plays once when the component mounts.
 *  - useFadeInOnScroll(ref)          — for sections lower on the page.
 *                                      Plays when the element enters viewport.
 *  - useStaggerInOnScroll(ref, sel)  — for grids of cards. Staggers the
 *                                      direct children matching `sel` as the
 *                                      container enters viewport.
 *
 * Behavior notes:
 *
 *  - All hooks set the initial state immediately via gsap.set so there's no
 *    flash-of-unstyled-content between hydration and the first frame.
 *  - All hooks bail out cleanly on prefers-reduced-motion (via gsap.matchMedia)
 *    so the page is fully visible and static for users who've opted out.
 *  - ScrollTrigger is registered exactly once at module load.
 *  - All triggers are cleaned up on unmount.
 *
 * @module hooks/useGsapFadeIn
 */
import { useEffect, type RefObject } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Register once. Safe to call repeatedly but cheaper to do at module load.
gsap.registerPlugin(ScrollTrigger)

/** Default vertical offset for the fade-up — small, editorial, not flashy. */
const Y_OFFSET = 24
/** Default duration. Long enough to feel intentional, short enough not to drag. */
const DURATION = 0.7

interface FadeOpts {
  /** Vertical offset in px. Default 24. */
  y?: number
  /** Animation duration in seconds. Default 0.7. */
  duration?: number
  /** Delay in seconds before the animation starts. Default 0. */
  delay?: number
}

/**
 * Fade + slight slide-up on mount. Use for hero / above-the-fold content
 * that's already in view when the page loads.
 */
export function useFadeInOnMount(
  ref: RefObject<HTMLElement>,
  opts: FadeOpts = {},
) {
  const { y = Y_OFFSET, duration = DURATION, delay = 0 } = opts

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.set(el, { opacity: 0, y })
        gsap.to(el, {
          opacity: 1,
          y: 0,
          duration,
          delay,
          ease: 'power2.out',
        })
      })
    }, el)

    return () => ctx.revert()
  }, [ref, y, duration, delay])
}

/**
 * Fade + slight slide-up triggered when the element scrolls into view.
 * Use for individual sections below the fold.
 */
export function useFadeInOnScroll(
  ref: RefObject<HTMLElement>,
  opts: FadeOpts = {},
) {
  const { y = Y_OFFSET, duration = DURATION, delay = 0 } = opts

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.set(el, { opacity: 0, y })
        gsap.to(el, {
          opacity: 1,
          y: 0,
          duration,
          delay,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            // Fire when the top of the element is 85% down the viewport —
            // i.e. just as the user starts to see it.
            start: 'top 85%',
            // Play once and forget. We don't want re-triggering on scroll-up.
            toggleActions: 'play none none none',
          },
        })
      })
    }, el)

    return () => ctx.revert()
  }, [ref, y, duration, delay])
}

interface StaggerOpts extends FadeOpts {
  /** Time between each child's start, in seconds. Default 0.08. */
  stagger?: number
}

/**
 * Stagger fade-in for direct (or descendant) children matching a CSS
 * selector inside the container. Use for card grids — each card pops in
 * shortly after the previous one as the grid enters viewport.
 */
export function useStaggerInOnScroll(
  containerRef: RefObject<HTMLElement>,
  childSelector: string,
  opts: StaggerOpts = {},
) {
  const {
    y = Y_OFFSET,
    duration = DURATION,
    delay = 0,
    stagger = 0.08,
  } = opts

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const children = container.querySelectorAll<HTMLElement>(childSelector)
        if (children.length === 0) return
        gsap.set(children, { opacity: 0, y })
        gsap.to(children, {
          opacity: 1,
          y: 0,
          duration,
          delay,
          stagger,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: container,
            start: 'top 85%',
            toggleActions: 'play none none none',
          },
        })
      })
    }, container)

    return () => ctx.revert()
  }, [containerRef, childSelector, y, duration, delay, stagger])
}
