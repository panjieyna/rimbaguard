import { onBeforeUnmount, onMounted, type Ref } from 'vue'

/** Enhance below-the-fold information once, keeping SSR and fallback content visible. */
export function useScrollReveal(root: Ref<HTMLElement | undefined>) {
  const targets = new Set<HTMLElement>()
  let observer: IntersectionObserver | undefined
  let preference: MediaQueryList | undefined
  let container: HTMLElement | undefined
  let settleTimer: number | undefined
  let deadlineTimer: number | undefined
  let started = false

  function stopWaiting() {
    window.clearTimeout(settleTimer)
    window.clearTimeout(deadlineTimer)
    window.removeEventListener('scroll', waitForScroll)
  }

  function waitForScroll() {
    window.clearTimeout(settleTimer)
    settleTimer = window.setTimeout(start, 120)
  }

  function show(element: HTMLElement, immediate = false) {
    observer?.unobserve(element)
    element.classList.remove('scroll-reveal-pending')
    if (immediate) {
      element.classList.remove('scroll-reveal-ready')
      element.style.removeProperty('--scroll-reveal-delay')
    }
  }

  function showAll() {
    observer?.disconnect()
    for (const element of targets) show(element, true)
    targets.clear()
  }

  function onPreferenceChange() {
    if (preference?.matches) showAll()
  }

  function onFocus(event: FocusEvent) {
    if (!(event.target instanceof Node)) return
    // Keyboard focus must never wait for a fade or stagger.
    for (const element of targets) {
      if (element.contains(event.target)) show(element, true)
    }
  }

  function start() {
    if (started) return
    started = true
    stopWaiting()
    if (!container?.isConnected || preference?.matches || !('IntersectionObserver' in window)) return

    try {
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target instanceof HTMLElement) show(entry.target)
        }
      }, { threshold: 0, rootMargin: '0px 0px -32px 0px' })

      for (const element of container.querySelectorAll<HTMLElement>('[data-scroll-reveal]')) {
        // Leave the first paint and restored scroll positions immediately readable.
        if (element.getBoundingClientRect().top < window.innerHeight) continue
        const delay = Math.min(120, Math.max(0, Number(element.dataset.scrollDelay) || 0))
        element.style.setProperty('--scroll-reveal-delay', `${delay}ms`)
        targets.add(element)
        element.classList.add('scroll-reveal-ready', 'scroll-reveal-pending')
        observer.observe(element)
      }

      preference?.addEventListener('change', onPreferenceChange)
      container.addEventListener('focusin', onFocus)
    }
    catch {
      // An unavailable observer must never leave information hidden.
      showAll()
    }
  }

  onMounted(() => {
    container = root.value
    preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!container || preference.matches || !('IntersectionObserver' in window)) return
    // Nuxt restores scroll after mounting a new page. Arm only after that brief
    // movement settles, so an old route's position cannot skip every reveal.
    window.addEventListener('scroll', waitForScroll, { passive: true })
    waitForScroll()
    deadlineTimer = window.setTimeout(start, 1_200)
  })

  onBeforeUnmount(() => {
    started = true
    stopWaiting()
    showAll()
    preference?.removeEventListener('change', onPreferenceChange)
    container?.removeEventListener('focusin', onFocus)
  })
}
