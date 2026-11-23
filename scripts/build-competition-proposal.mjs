import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'

// The Markdown document remains the single editable source.
// Rendering is local and never starts the app or contacts external services.
const root = process.cwd()
const source = path.join(root, 'docs/COMPETITION_PROPOSAL.md')
const assetDir = path.join(root, 'docs/assets/proposal-2026')
const scratch = path.join(root, '.npm-cache/proposal-pdf')
const output = path.join(root, 'docs/ITRUSH26_semogabisamagang_RimbaGuard.pdf')
await mkdir(assetDir, { recursive: true })
await mkdir(scratch, { recursive: true })
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function svg(content, height = 560) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}" viewBox="0 0 900 ${height}"><defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M0 0 8 4 0 8" fill="none" stroke="#53655B" stroke-width="1.5"/></marker></defs><style>text{font-family:'Times New Roman',serif;font-size:21px;fill:#1E3028}.small{font-size:19px;fill:#43574A}.title{font-size:23px;font-weight:bold}.box{fill:#F2F5EF;stroke:#748779;stroke-width:1.5}.white{fill:white;stroke:#748779;stroke-width:1.5}.arrow{fill:none;stroke:#53655B;stroke-width:2;marker-end:url(#arrow)}</style><rect width="900" height="${height}" fill="white"/>${content}</svg>`
}
function box(x, y, w, h, title, lines = [], white = false) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" class="${white ? 'white' : 'box'}"/><text x="${x + w / 2}" y="${y + 32}" text-anchor="middle" class="title">${escape(title)}</text>${lines.map((line, i) => `<text x="${x + w / 2}" y="${y + 62 + i * 27}" text-anchor="middle" class="small">${escape(line)}</text>`).join('')}`
}
const arrow = (x1, y1, x2, y2) => `<path class="arrow" d="M${x1} ${y1} L${x2} ${y2}"/>`
await writeFile(path.join(assetDir, 'architecture.svg'), svg([
  box(260, 12, 380, 96, 'Browser • Nuxt / Vue', ['Publik · pelapor · petugas'], true),
  arrow(450, 108, 450, 147),
  box(140, 155, 620, 110, 'Server Nuxt • API dan service', ['Sesi / peran · origin · validasi · batas permintaan', 'Kredensial layanan disimpan pada server']),
  arrow(230, 265, 150, 331), arrow(450, 265, 450, 331), arrow(670, 265, 750, 331),
  box(10, 340, 280, 120, 'Supabase', ['Auth dan sesi', 'PostgreSQL / RLS / RPC']),
  box(310, 340, 280, 120, 'Storage privat', ['Unggah → validasi', 'Bukti tersegel / thumbnail']),
  box(610, 340, 280, 120, 'Gemini API', ['Foto + teks → JSON', 'Validasi → simpan hasil']),
  '<text x="450" y="514" text-anchor="middle" class="small">Database: draf · laporan · analisis · prioritas · riwayat tindakan</text>',
].join(''), 550))
await writeFile(path.join(assetDir, 'user-flow.svg'), svg([
  box(245, 5, 410, 82, 'Foto dan cerita pelapor', ['Pilih asisten atau formulir manual'], true),
  arrow(350, 87, 220, 130), arrow(550, 87, 690, 130),
  box(20, 140, 400, 109, 'Jalur asisten AI', ['Pengamatan terpisah + pertanyaan', 'Jawaban → draf yang diperiksa']),
  box(480, 140, 400, 109, 'Jalur manual', ['Judul, kategori, dan deskripsi', 'Tanpa ketergantungan pada AI']),
  arrow(220, 249, 365, 292), arrow(690, 249, 535, 292),
  box(170, 303, 560, 90, 'Waktu / lokasi → konfirmasi → simpan', ['Analisis awal dan prioritas untuk pemeriksaan']),
  arrow(450, 393, 450, 430),
  box(130, 440, 640, 88, 'Petugas meninjau bukti dan konteks', ['Verifikasi · minta informasi · tolak']),
  arrow(450, 528, 450, 564),
  '<text x="470" y="554" class="small">Jika terverifikasi</text>',
  box(130, 574, 640, 88, 'Tindak lanjut → selesai → riwayat', ['Ringkasan publik memerlukan persetujuan tersendiri']),
].join(''), 680))

const label = (x, y, text) => `<text x="${x}" y="${y}" class="small">${escape(text)}</text>`
const rect = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" class="box"/>`
await writeFile(path.join(assetDir, 'wireframe-public.svg'), svg([
  box(5, 5, 430, 470, 'Beranda', [], true), box(465, 5, 430, 470, 'Penyusunan laporan', [], true),
  rect(25, 55, 390, 45), label(40, 84, 'Logo · navigasi · menu akun'),
  rect(25, 115, 390, 120), label(40, 151, 'Video / poster hutan'), label(40, 182, 'Judul · cerita singkat · ajakan'), label(40, 214, 'Tombol mulai melapor'),
  rect(25, 250, 390, 55), label(40, 283, 'Aktivitas platform dari database'),
  rect(25, 320, 390, 64), label(40, 347, 'Tiga langkah penggunaan'), label(40, 372, 'Informasi privasi'),
  rect(25, 398, 390, 55), label(40, 431, 'Pengantar peta laporan'),
  rect(485, 55, 390, 45), label(500, 84, 'Judul · tiga tahap pelaporan'),
  rect(485, 115, 390, 95), label(500, 147, 'Foto pengamatan'), label(500, 179, 'Cerita singkat pengguna'),
  rect(485, 225, 390, 90), label(500, 257, 'Asisten: pertanyaan dan draf'), label(500, 288, 'Pilihan isi formulir sendiri'),
  rect(485, 330, 390, 63), label(500, 357, 'Lengkapi waktu dan lokasi'), label(500, 382, 'Periksa informasi'),
  rect(485, 408, 390, 45), label(500, 437, 'Konfirmasi → kirim laporan'),
].join(''), 490))
await writeFile(path.join(assetDir, 'wireframe-officer.svg'), svg([
  '<rect x="5" y="5" width="890" height="410" rx="8" class="white"/>',
  rect(20, 20, 190, 380), label(35, 54, 'RimbaGuard'), label(35, 106, 'Ringkasan'), label(35, 150, 'Laporan'), label(35, 194, 'Peta'), label(35, 238, 'Analitik'), label(35, 282, 'Pengaturan'), label(35, 370, 'Akun / keluar'),
  rect(230, 20, 645, 45), label(247, 50, 'Konteks halaman · menu akun'),
  rect(230, 80, 645, 56), label(247, 115, 'Judul · deskripsi · sumber data'),
  ...Array.from({ length: 5 }, (_, i) => rect(230 + i * 131, 152, 120, 67)),
  ...['Total', 'Menunggu', 'Prioritas', 'Verifikasi', 'Selesai'].map((text, i) => `<text x="${290 + i * 131}" y="192" text-anchor="middle" class="small">${text}</text>`),
  rect(230, 235, 645, 85), label(247, 267, 'Antrean: foto · judul · prioritas · status'), label(247, 301, 'Tindakan tinjau → bukti / AI / skor / audit'),
  rect(230, 335, 645, 65), label(247, 365, 'Tren, kategori, dan tahap penanganan'), label(247, 389, 'Grafik / tabel alternatif'),
].join(''), 430))
const pngUri = async name => `data:image/jpeg;base64,${(await sharp(path.join(assetDir, name)).jpeg({ quality: 93, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer()).toString('base64')}`
await writeFile(path.join(assetDir, 'mobile-pair.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="844" viewBox="0 0 840 844"><rect width="840" height="844" fill="white"/><image x="0" y="0" width="390" height="844" href="${await pngUri('home-mobile.png')}"/><image x="450" y="0" width="390" height="844" href="${await pngUri('report-mobile.png')}"/></svg>`)

const text = await readFile(source, 'utf8')
const mediaUrls = new Map()
for (const match of text.matchAll(/!\[[^\]]*\]\(([^)]+\.png)\)/g)) {
  const local = path.resolve(path.dirname(source), match[1])
  if (!local.startsWith(root + path.sep)) throw new Error('Image path must remain inside the repository')
  if (!mediaUrls.has(local)) mediaUrls.set(local, `data:image/jpeg;base64,${(await sharp(local).jpeg({ quality: 93, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer()).toString('base64')}`)
}
const groups = [...text.matchAll(/<!-- page: ([a-z-]+) -->\s*([\s\S]*?)(?=<!-- page: |$)/g)].map(match => ({ id: match[1], markdown: match[2] }))
if (groups.length < 20) throw new Error('Proposal page markers are missing')
const expected = ['1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '2.3', '2.4', '2.5', '3.1', '3.2', '3.3', '3.4', '4.1', '4.2']
for (const section of expected) if (!text.includes(`### ${section} `)) throw new Error(`Required section missing: ${section}`)
let headingId = 0
const headings = [], figures = []
function inline(raw) {
  return escape(raw)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/\[(\d+)\]/g, '<a class="citation" href="#ref-$1">[$1]</a>')
}
function render(markdown, groupId) {
  const lines = markdown.split(/\r?\n/), out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    if (line === '<!-- generated-toc -->') { out.push('<nav class="toc" data-toc aria-label="Daftar isi"></nav>'); continue }
    if (line === '<!-- generated-figures -->') { out.push('<nav class="toc figures-toc" data-figures aria-label="Daftar gambar"></nav>'); continue }
    const heading = /^(#{1,3}) (.+)$/.exec(line)
    if (heading) {
      const level = heading[1].length, id = `section-${++headingId}`
      out.push(`<h${level} id="${id}">${inline(heading[2])}</h${level}>`)
      if (level > 1) headings.push({ id, title: heading[2], level, groupId })
      continue
    }
    const img = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line)
    if (img) {
      const local = path.resolve(path.dirname(source), img[2])
      if (!local.startsWith(root + path.sep)) throw new Error('Image path must remain inside the repository')
      const isLogo = groupId === 'cover', id = isLogo ? 'cover-logo' : `figure-${figures.length + 1}`
      if (!isLogo) figures.push({ id, title: img[1], groupId })
      out.push(`<figure id="${id}" class="${isLogo ? 'cover-logo' : 'figure'}"><img src="${mediaUrls.get(local) ?? pathToFileURL(local).href}" alt="${escape(img[1])}">${isLogo ? '' : `<figcaption>${inline(img[1])}</figcaption>`}</figure>`)
      continue
    }
    if (line.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const row = lines[i].trim()
        if (!/^\|[\s:|-]+\|$/.test(row)) rows.push(row.slice(1, -1).split('|').map(cell => cell.trim()))
        i++
      }
      i--
      out.push(`<table><thead><tr>${rows[0].map(cell => `<th scope="col">${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${row.map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
      continue
    }
    if (/^\d+\. /.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\. /.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+\. /, '')); i++ }
      i--
      out.push(`<ol>${items.map(item => `<li>${inline(item)}</li>`).join('')}</ol>`)
      continue
    }
    if (line.startsWith('> ')) { out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`); continue }
    const para = [line]
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|!\[|\||<!--|\d+\. |>|\*\*)/.test(lines[i + 1].trim())) para.push(lines[++i].trim())
    const reference = /^\[(\d+)\] /.exec(line), title = /^\*\*[^*]+\*\*$/.test(line)
    out.push(`<p${reference ? ` class="reference" id="ref-${reference[1]}"` : title ? ' class="standalone-title"' : ''}>${inline(para.join(' '))}</p>`)
  }
  return out.join('\n')
}
const sections = groups.map(group => `<section class="source-group" data-group="${group.id}">${render(group.markdown, group.id)}</section>`).join('\n')
const stylesheet = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html,body { margin: 0; padding: 0; background: white; color: #151B17; font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.5; }
.sheet { width: 210mm; height: 297mm; position: relative; padding: 25.4mm; break-after: page; }
.sheet:last-child { break-after: auto; }
.sheet-body { height: 246.2mm; display: flow-root; }
h1,h2,h3 { font-size: 12pt; line-height: 1.5; font-weight: bold; color: #172E23; margin: 0 0 4mm; break-after: avoid; }
h1,h2 { text-align: center; }
h3 { margin-top: 4mm; }
p { text-align: justify; margin: 0 0 3mm; orphans: 3; widows: 3; }
strong { font-weight: bold; }
a { color: #214F3B; text-decoration: none; overflow-wrap: anywhere; }
.citation { color: inherit; }
code { font-family: "Times New Roman", Times, serif; overflow-wrap: anywhere; }
ol { margin: 0 0 3mm; padding-left: 7mm; }
li { margin: 0 0 1.5mm; padding-left: 1mm; text-align: justify; }
table { width: 100%; border-collapse: collapse; margin: 3mm 0 4mm; line-height: 1.25; font-size: 12pt; table-layout: fixed; }
th,td { text-align: left; vertical-align: top; padding: 2.2mm 2.3mm; border-bottom: .2mm solid #CBD3C9; overflow-wrap: anywhere; }
th { font-weight: bold; background: #EEF2E9; border-top: .4mm solid #657B65; }
table:has(th:nth-child(2):last-child) th:first-child { width: 31%; }
blockquote { margin: 4mm 0; padding: 3mm 4mm; border-left: .7mm solid #557255; background: #F5F7F1; text-align: left; }
.standalone-title { font-weight: bold; text-align: left; margin: 0 0 3mm; }
.figure { margin: 4mm 0; text-align: center; break-inside: avoid; }
.figure img { display: block; width: 100%; max-height: 100mm; object-fit: contain; margin: 0 auto; }
figcaption { text-align: center; font-size: 10.5pt; line-height: 1.25; margin-top: 2mm; color: #27382A; }
.sheet[data-group="architecture"] .figure img { max-height: 94mm; }
.sheet[data-group="flow"] .figure img { max-height: 105mm; }
.sheet[data-group="wireframes"] .figure img { max-height: 73mm; }
.sheet[data-group^="ui-"] .figure { margin: 2mm 0; }
.sheet[data-group^="ui-"] .figure img { max-height: 84mm; }
.sheet[data-group="ui-home"] .figure img { max-height: 76mm; }
.sheet[data-group="ui-analysis"] .figure img { max-height: 155mm; }
.sheet[data-group="ui-map"] .figure:last-of-type img { max-height: 130mm; }
.sheet[data-group="access"] table th:first-child { width: 44%; }
.sheet[data-group="references"] p { line-height: 1.35; margin-bottom: 4mm; text-align: left; }
.sheet[data-group="cover"] .sheet-body { display: flex; flex-direction: column; align-items: center; text-align: center; }
.sheet[data-group="cover"] h1 { margin-bottom: 4mm; color: #173D32; }
.sheet[data-group="cover"] h1:nth-child(2) { text-transform: uppercase; margin-top: 2mm; letter-spacing: .04em; }
.sheet[data-group="cover"] p { text-align: center; margin-bottom: 1mm; }
.sheet[data-group="cover"] table { margin: 7mm 0 12mm; }
.sheet[data-group="cover"] th:first-child { width: 55%; }
.sheet[data-group="cover"] th:nth-child(2) { width: 23%; }
.sheet[data-group="cover"] th:nth-child(3) { width: 22%; }
.sheet[data-group="cover"] td,.sheet[data-group="cover"] th { font-size: 12pt; padding: 2.1mm; }
.cover-logo { margin: 8mm 0; }
.cover-logo img { width: 29mm; height: 29mm; }
.sheet[data-group="cover"] p:last-child { margin-top: auto; color: #526052; font-size: 10.5pt; }
.sheet[data-group="preface"] p:nth-last-child(-n+2) { text-align: right; }
.page-header { position: absolute; top: 15mm; left: 25.4mm; right: 25.4mm; display: flex; justify-content: space-between; border-bottom: .2mm solid #D2D9D0; font-size: 9pt; line-height: 1.4; padding-bottom: 1mm; color: #516351; }
.page-footer { position: absolute; bottom: 13mm; left: 25.4mm; right: 25.4mm; display: flex; justify-content: space-between; font-size: 10.5pt; line-height: 1.5; color: #405340; }
.toc-row { display: flex; align-items: baseline; gap: 1.5mm; font-size: 12pt; line-height: 1.3; padding: 1mm 0; color: #151B17; }
.toc-row .dots { flex: 1; min-width: 4mm; border-bottom: .2mm dotted #718071; }
.toc-row .page-number { min-width: 7mm; text-align: right; }
.toc-row.level-3 { padding-left: 5mm; }
.toc-row.level-2 { font-weight: bold; margin-top: 1mm; }
.figures-toc .toc-row { font-weight: normal; margin: 0 0 1.6mm; }
.figures-toc .toc-row .label { max-width: 140mm; }
@media screen { body { background: #E8EBE5; } .sheet { margin: 10mm auto; background: white; box-shadow: 0 1mm 4mm #0002; } }
`
const htmlPath = path.join(scratch, 'proposal.html')
await writeFile(htmlPath, `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>RimbaGuard — Proposal Web Development IT RUSH 2026</title><meta name="author" content="Tim semogabisamagang — Institut Teknologi Del"><style>${stylesheet}</style></head><body><div id="source">${sections}</div><main id="pages"></main></body></html>`)
const candidates = [process.env.RIMBAGUARD_PDF_BROWSER_PATH, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'), process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'), process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe')].filter(Boolean)
let executablePath
for (const candidate of candidates) { try { await access(candidate); executablePath = candidate; break } catch {} }
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } })
  await page.route(/^https?:\/\//, route => route.abort())
  await page.goto(pathToFileURL(htmlPath).href)
  await page.emulateMedia({ media: 'print' })
  await page.evaluate(() => document.fonts.ready)
  const imageErrors = await page.evaluate(async () => {
    const result = []
    for (const image of document.images) { try { await image.decode() } catch { result.push(image.alt) } }
    return result
  })
  if (imageErrors.length) throw new Error(`Images failed: ${imageErrors.join(', ')}`)
  const pagination = await page.evaluate(({ headings, figures }) => {
    const pages = document.querySelector('#pages')
    const sources = [...document.querySelectorAll('.source-group')]
    const toc = list => list.map(item => `<a class="toc-row level-${item.level ?? 3}" href="#${item.id}"><span class="label">${item.title}</span><span class="dots"></span><span class="page-number" data-target="${item.id}">00</span></a>`).join('')
    document.querySelector('[data-toc]').innerHTML = toc(headings)
    document.querySelector('[data-figures]').innerHTML = toc(figures)
    const overflow = body => body.scrollHeight > body.clientHeight + 1
    function newSheet(group) {
      const sheet = document.createElement('article')
      sheet.className = 'sheet'; sheet.dataset.group = group
      sheet.innerHTML = `<div class="sheet-body"></div>${group === 'cover' ? '' : '<div class="page-header"><span>RimbaGuard</span><span>Proposal Web Development IT RUSH 2026</span></div><div class="page-footer"><span>Tim semogabisamagang · Institut Teknologi Del</span><span class="folio"></span></div>'}`
      pages.append(sheet)
      return sheet.querySelector('.sheet-body')
    }
    function place(node, body, group) {
      body.append(node)
      if (!overflow(body)) return body
      node.remove()
      if (node.tagName === 'TABLE') {
        const rows = [...node.querySelectorAll('tbody tr')]
        let table = node.cloneNode(true)
        table.querySelector('tbody').replaceChildren()
        body.append(table)
        for (const row of rows) {
          table.querySelector('tbody').append(row)
          if (overflow(body)) {
            row.remove()
            if (!table.querySelector('tbody').children.length) table.remove()
            body = newSheet(group)
            table = node.cloneNode(true)
            table.querySelector('tbody').replaceChildren(row)
            body.append(table)
            if (overflow(body)) throw new Error(`Table row exceeds page: ${group}`)
          }
        }
        return body
      }
      if (!body.children.length) throw new Error(`Block exceeds page: ${group}`)
      const previous = body.lastElementChild
      const moveHeading = previous && (/^H[123]$/.test(previous.tagName) || previous.classList.contains('standalone-title'))
      body = newSheet(group)
      if (moveHeading) body.append(previous)
      body.append(node)
      if (overflow(body)) throw new Error(`Block exceeds page: ${group}`)
      return body
    }
    for (const source of sources) {
      let body = newSheet(source.dataset.group)
      for (const node of [...source.children]) body = place(node, body, source.dataset.group)
    }
    document.querySelector('#source').remove()
    const roman = value => { const pairs = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]; let out = ''; for (const [n, symbol] of pairs) while (value >= n) { out += symbol; value -= n } return out }
    let front = 0, bodyNumber = 0
    const sheets = [...pages.children]
    for (const sheet of sheets) {
      if (sheet.dataset.group === 'cover') continue
      const number = ['preface', 'contents', 'figures'].includes(sheet.dataset.group) ? roman(++front) : String(++bodyNumber)
      sheet.dataset.folio = number
      sheet.querySelector('.folio').textContent = number
    }
    for (const number of document.querySelectorAll('[data-target]')) {
      const target = document.getElementById(number.dataset.target)
      if (!target) throw new Error('TOC target is missing')
      number.textContent = target.closest('.sheet').dataset.folio
    }
    return sheets.map((sheet, index) => ({ physicalPage: index + 1, group: sheet.dataset.group, folio: sheet.dataset.folio ?? null, usedPx: sheet.querySelector('.sheet-body').scrollHeight, heightPx: sheet.querySelector('.sheet-body').clientHeight, text: sheet.querySelector('.sheet-body').innerText.slice(0, 85) }))
  }, { headings, figures })
  const layoutErrors = await page.evaluate(() => {
    const issues = []
    for (const sheet of document.querySelectorAll('.sheet')) {
      const body = sheet.querySelector('.sheet-body'), bounds = body.getBoundingClientRect()
      for (const child of body.children) {
        const r = child.getBoundingClientRect()
        if (r.bottom > bounds.bottom + 1 || r.right > bounds.right + 1 || r.left < bounds.left - 1) issues.push({ group: sheet.dataset.group, tag: child.tagName })
      }
    }
    return issues
  })
  if (layoutErrors.length) throw new Error(`Print layout overflow: ${JSON.stringify(layoutErrors)}`)
  await writeFile(htmlPath, await page.content())
  await page.pdf({ path: output, preferCSSPageSize: true, printBackground: true, tagged: true, outline: true })
  await writeFile(path.join(scratch, 'pagination.json'), JSON.stringify(pagination, null, 2) + '\n')
  console.log(JSON.stringify({ passed: true, pdf: path.relative(root, output), pages: pagination.length, requiredSections: expected.length, figures: figures.length, networkRequestsAllowed: false, layoutOverflow: 0 }))
} finally { await browser.close() }
