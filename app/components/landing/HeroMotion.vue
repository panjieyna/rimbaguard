<script setup lang="ts">
const video = ref<HTMLVideoElement>()
const canvas = ref<HTMLElement>()
const source = ref<string>()
const hasPlayed = ref(false)
let wantsPlayback = false
let inView = true
let disposed = false
let preference: MediaQueryList | undefined
let observer: IntersectionObserver | undefined

type ConnectionNavigator = Navigator & { connection?: { saveData?: boolean } }

async function syncPlayback() {
  if (disposed) return
  if (!wantsPlayback || !inView || document.hidden) {
    video.value?.pause()
    return
  }
  if (!source.value) {
    source.value = window.matchMedia('(max-width: 1023px)').matches
      ? '/videos/rainforest-canopy-720.mp4'
      : '/videos/rainforest-canopy-1080.mp4'
    await nextTick()
  }
  if (!video.value || disposed) return
  video.value.muted = true
  try { await video.value.play() }
  catch { hasPlayed.value = false } // Keep the poster if the browser blocks autoplay.
}

function applyPreference() {
  wantsPlayback = !preference?.matches && !(navigator as ConnectionNavigator).connection?.saveData
  void syncPlayback()
}

function onError() {
  hasPlayed.value = false
  wantsPlayback = false
}

onMounted(() => {
  preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  wantsPlayback = !preference.matches && !(navigator as ConnectionNavigator).connection?.saveData
  preference.addEventListener('change', applyPreference)
  document.addEventListener('visibilitychange', syncPlayback)
  if (canvas.value && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      inView = entries.some(entry => entry.isIntersecting)
      void syncPlayback()
    }, { threshold: 0.05 })
    observer.observe(canvas.value)
  } else void syncPlayback()
})

onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  preference?.removeEventListener('change', applyPreference)
  document.removeEventListener('visibilitychange', syncPlayback)
  video.value?.pause()
})
</script>

<template>
  <div ref="canvas" class="hero-media" aria-hidden="true">
    <img src="/images/rainforest-motion-poster.jpg"
      srcset="/images/rainforest-motion-poster-768.jpg 768w, /images/rainforest-motion-poster.jpg 1920w"
      sizes="100vw" width="1920" height="1080" alt="" fetchpriority="high" decoding="async"
      class="hero-media-poster">
    <video ref="video" :src="source" class="hero-media-video" :class="{ 'has-played': hasPlayed }"
      muted loop playsinline preload="none" disablepictureinpicture tabindex="-1"
      @playing="hasPlayed = true" @error="onError" />
  </div>
</template>

<style scoped>
.hero-media { position: absolute; inset: 0; overflow: hidden; }
.hero-media-poster, .hero-media-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 58% center; }
.hero-media-video { opacity: 0; }
.hero-media-video.has-played { opacity: 1; }
</style>
