import { getServerEnvironment } from '../utils/config'

export default defineNitroPlugin(() => {
  const environment = getServerEnvironment()
  if (environment.mode === 'setup') {
    console.info('[RimbaGuard] Mode penyiapan lokal. Database dan autentikasi belum tersedia.')
  }
})
