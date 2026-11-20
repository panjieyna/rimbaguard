import { expect,test } from '@playwright/test'
import sharp from 'sharp'
import { loginQaCitizen } from './helpers/qa-session'
import type { AssistantDraftResponse } from '../../shared/types/report-assistant'
import { assistantOutputSchema } from '../../shared/schemas/report-assistant'

const configured=Boolean(process.env.E2E_GEMINI_LIVE==='true' && process.env.E2E_EMAIL && process.env.E2E_PASSWORD && process.env.RIMBAGUARD_TEST_USER_ID)
test.use({trace:'off',screenshot:'off'})

test('live assistant saves a private draft, restores it, asks bounded questions and submits only after confirmation',async({page,context})=>{
  test.skip(!configured,'Requires explicit live Gemini and a server-designated simulation account.')
  test.setTimeout(240_000)
  const errors:string[]=[]
  page.on('pageerror',error=>errors.push(error.name))
  await page.route('https://tile.openstreetmap.org/**',route=>route.abort())
  await loginQaCitizen(page)
  const session=await page.evaluate(async()=>{const value=await(await fetch('/api/auth/session')).json();return {simulation:value.simulationMode===true,id:value.user?.id}})
  expect(session.simulation && session.id===process.env.RIMBAGUARD_TEST_USER_ID,'Refuse any report write outside designated simulation mode').toBe(true)
  const bytes=await sharp('public/images/about-rainforest.webp').resize(384,384).jpeg({quality:70}).toBuffer()
  const story='SIMULASI PENGUJIAN: Dalam skenario uji ini saya menemukan batang pohon di dekat jalur hutan, tetapi tidak melihat bagaimana pohon itu tumbang. Foto ini gambar dekoratif untuk pengujian, bukan bukti kejadian lapangan.'
  await page.goto('/report')
  await expect(page.getByRole('button',{name:'Baca foto dan bantu laporan',exact:false})).toBeEnabled()
  await page.getByLabel('Foto pengamatan',{exact:true}).setInputFiles({name:'simulasi-asisten.jpg',mimeType:'image/jpeg',buffer:bytes})
  await expect(page.getByRole('img',{name:'Pratinjau foto untuk asisten pelaporan',exact:true})).toBeVisible()
  await page.getByLabel('Ceritakan apa yang Anda lihat',{exact:true}).fill(story)
  const read=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/report-assistant' && response.request().method()==='POST',{timeout:120_000})
  await page.getByRole('button',{name:'Baca foto dan bantu laporan',exact:false}).click()
  const response=await read
  expect(response.status()).toBe(200)
  const saved=await response.json() as AssistantDraftResponse
  expect(saved.draft.status, `Live provider state: ${saved.draft.errorCode ?? saved.draft.status}; a saved failure is not a successful AI result`).toBe('ready')
  expect(assistantOutputSchema.safeParse(saved.draft.result).success,'Only genuine validated provider output is accepted').toBe(true)
  expect(saved.draft.story===story).toBe(true)
  expect(saved.draft.result!.questions.length).toBeLessThanOrEqual(3)
  const draftId=saved.draft.id
  await page.reload()
  await page.getByRole('button',{name:'Lanjutkan draf',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Pembacaan foto oleh AI',exact:true})).toBeVisible()
  for(const question of saved.draft.result!.questions) await page.locator(`#assistant-answer-${question.id}`).fill('Saya tidak tahu. Ini jawaban simulasi pengujian, bukan keterangan kejadian nyata.')
  await page.getByRole('button',{name:'Periksa draf laporan',exact:false}).click()
  await expect(page.getByRole('heading',{name:'Draf siap Anda periksa.',exact:true})).toBeVisible()
  expect((await page.getByLabel('Deskripsi kejadian',{exact:true}).inputValue()).startsWith(story)).toBe(true)
  await page.getByLabel('Judul laporan',{exact:true}).fill(`[SIMULASI] Asisten lengkap ${Date.now().toString(36)}`)
  await page.getByLabel('Kategori ancaman',{exact:true}).selectOption('other_environmental_threat')
  await page.getByLabel('Waktu kejadian',{exact:true}).fill('2020-01-01T07:00')
  await page.getByLabel('Lintang',{exact:true}).fill('-3.8')
  await page.getByLabel('Bujur',{exact:true}).fill('102.2')
  await page.getByRole('button',{name:'Kirim laporan',exact:true}).click()
  await expect(page.getByRole('alert').or(page.locator('.report-submit .form-error'))).toContainText('konfirmasikan draf')
  const answers=await page.evaluate(async(id)=>{const r=await fetch(`/api/report-assistant/${id}`);const j=await r.json();return {status:r.status,version:j.draft.version,answerCount:j.draft.answers.length}},draftId)
  expect(answers.status).toBe(200)
  expect(answers.answerCount).toBe(saved.draft.result!.questions.length)
  await page.getByRole('checkbox',{name:/Saya telah memeriksa draf/}).check()
  const submitted=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/reports' && r.request().method()==='POST',{timeout:90_000})
  await page.getByRole('button',{name:'Kirim laporan',exact:true}).click()
  const result=await submitted
  expect(result.status()).toBe(201)
  const report=await result.json()
  expect(report.report.isSimulation).toBe(true)
  await expect(page).toHaveURL(/\/reports\/[0-9a-f-]+\?submitted=1/)
  // Wait for the existing post-submission triage to finish before closing its page.
  await expect(page.getByRole('heading',{name:'Pengamatan visual',exact:true}).or(page.getByRole('button',{name:'Coba analisis lagi',exact:true})).first()).toBeVisible({timeout:100_000})
  const persisted=await page.evaluate(async(id)=>{const r=await fetch(`/api/report-assistant/${id}`);const j=await r.json();return {status:r.status,state:j.draft.status,reportId:j.draft.reportId}},draftId)
  expect(persisted.state).toBe('submitted')
  expect(persisted.reportId===report.report.id).toBe(true)
  // A retry of the same submitted payload cannot create a second report.
  const replay=await page.evaluate(async({body,key})=>{const r=await fetch('/api/reports',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});const j=await r.json();return {status:r.status,id:j.report?.id,reused:j.idempotentReplay}},{body:result.request().postDataJSON(),key:result.request().headers()['idempotency-key']!})
  expect(replay.status).toBe(200)
  expect(replay.id===report.report.id && replay.reused===true).toBe(true)
  await page.evaluate(async()=>{await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})})
  await context.clearCookies()
  expect((await page.request.get(`/api/report-assistant/${draftId}`)).status()).toBe(401)
  expect(errors).toEqual([])
})
