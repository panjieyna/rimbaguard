import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-11-14',
  logLevel: 'info',
  telemetry: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  typescript: { strict: true },
  // Prefetch a route's code when a link is touched, hovered or focused, not
  // merely visible: every page links to /map, whose map libraries would
  // otherwise download on phones that never open the map.
  experimental: { defaults: { nuxtLink: { prefetchOn: { visibility: false, interaction: true } } } },
  runtimeConfig: {
    supabaseUrl: '',
    supabaseAnonKey: '',
    supabaseServiceRoleKey: '',
    geminiApiKey: '',
    geminiModel: '',
    public: { appUrl: 'http://localhost:3000' },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'id' },
      title: 'RimbaGuard — Perlindungan Hutan Berbasis Komunitas',
      meta: [
        { name: 'description', content: 'Laporan masyarakat, analisis awal AI, dan verifikasi petugas untuk membantu perlindungan hutan tropis.' },
        { name: 'theme-color', content: '#173D32' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  routeRules: {
    '/api/**': { headers: { 'cache-control': 'no-store' } },
    '/admin/**': { headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' } },
    '/reports/**': { headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' } },
    '/report': { headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' } },
  },
})
