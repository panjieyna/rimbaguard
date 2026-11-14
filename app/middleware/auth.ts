export default defineNuxtRouteMiddleware(async (to) => {
  const { data, error } = await useAuth()
  if (error.value) return abortNavigation(createError({ statusCode: 503, message: 'Sesi belum dapat diperiksa.' }))
  if (!data.value?.user) return navigateTo({ path: '/login', query: { next: to.fullPath } })
  if (to.path.startsWith('/admin') && data.value.user.role !== 'admin') {
    return abortNavigation(createError({ statusCode: 403, message: 'Akses ini hanya tersedia bagi petugas.' }))
  }
})
