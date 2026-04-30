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
import { SplitText } from 'gsap/SplitText'

// Register once. Safe to call repeatedly but cheaper to do at module load.
gsap.registerPlugin(ScrollTrigger, SplitText)

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

interface SplitWordsOpts extends FadeOpts {
  /** Time between each word's start, in seconds. Default 0.04. */
  stagger?: number
  /** When to fire: 'mount' (immediately) or 'scroll' (when in viewport). */
  trigger?: 'mount' | 'scroll'
}

/**
 * Split a heading into words and fade/slide them in with a tight stagger.
 * Reads as "the headline crisps into place" rather than "the headline
 * fades up as a block" — gives marquee headings real presence without
 * tipping into showreel territory.
 *
 * Bails out cleanly under prefers-reduced-motion: the heading is left
 * untouched (not even split), so screen readers and reduced-motion
 * users get the original DOM.
 */
export function useSplitWordsIn(
  ref: RefObject<HTMLElement>,
  opts: SplitWordsOpts = {},
) {
  const {
    y = 16,
    duration = 0.8,
    delay = 0,
    stagger = 0.04,
    trigger = 'scroll',
  } = opts

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // SplitText rewrites the heading's DOM into per-word spans. Hold
        // a reference so we can revert on cleanup — important for both
        // a clean React unmount and for screen-reader correctness if
        // the user toggles reduced-motion mid-session.
        const split = new SplitText(el, { type: 'words' })
        gsap.set(split.words, { opacity: 0, y })
        const animConfig: gsap.TweenVars = {
          opacity: 1,
          y: 0,
          duration,
          delay,
          stagger,
          ease: 'power2.out',
        }
        if (trigger === 'scroll') {
          animConfig.scrollTrigger = {
            trigger: el,
            start: 'top 85%',
            toggleActions: 'play none none none',
          }
        }
        gsap.to(split.words, animConfig)

        // matchMedia cleanup — runs when the context reverts OR when the
        // media query stops matching (user enables reduced-motion mid-
        // session). Restores the original heading DOM.
        return () => split.revert()
      })
    }, el)

    return () => ctx.revert()
  }, [ref, y, duration, delay, stagger, trigger])
}
