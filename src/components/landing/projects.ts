import type { ComponentType } from 'react'
import { DocPlatformArt } from './art/DocPlatformArt'
import { AssessmentArt } from './art/AssessmentArt'
import { ToolboxArt } from './art/ToolboxArt'
import { PlannerArt } from './art/PlannerArt'
import { WeddingArt } from './art/WeddingArt'
import type { Lang } from './i18n'

export type ProjectStatus = 'live' | 'soon'

/** Copy that differs per landing-page language. */
export type Localized<T> = Record<Lang, T>

export const AURAY_URL = 'https://www.auray.com.tw/en/'
export const AUCRA_URL = 'https://home.cra.nymbx.dev'

/** Long-form panel shown when a card without its own URL is clicked. */
export interface ProjectDetails {
  title: string
  paragraphs: string[]
  /** Optional dated milestones rendered as a small list. */
  keyDates?: { date: string; what: string }[]
  /** Rendered as buttons; the first one is the primary action. */
  ctas?: { label: string; href: string }[]
}

export interface Project {
  id: string
  name: string
  tagline: Localized<string>
  description: Localized<string>
  status: ProjectStatus
  /** `null` until the project has a public URL. The card opens `details`, or is inert. */
  href: string | null
  /** True when `href` points outside this site. */
  external?: boolean
  details?: Localized<ProjectDetails>
  tags: Localized<string[]>
  art: ComponentType
}

export const projects: Project[] = [
  {
    id: 'aucra',
    name: 'AuCRA 2.0',
    tagline: {
      en: 'EU CRA Documentation Platform based on EN-40000',
      id: 'Platform dokumentasi EU CRA berbasis EN-40000',
      zh: '基於 EN-40000 的歐盟 CRA 文件平台',
    },
    description: {
      en: 'Turns the Cyber Resilience Act paperwork into a guided workflow: technical documentation, evidence and conformity artefacts kept in one structured place.',
      id: 'Mengubah administrasi Cyber Resilience Act menjadi alur kerja terpandu: dokumentasi teknis, bukti, dan artefak kesesuaian tersimpan rapi di satu tempat.',
      zh: '把《網路韌性法案》的文書工作變成引導式流程：技術文件、佐證資料與符合性文件都集中在同一個結構化空間。',
    },
    status: 'live',
    href: null, // The card opens the summary below instead.
    details: {
      en: {
        title: 'What the EU Cyber Resilience Act asks for',
        paragraphs: [
          'The Cyber Resilience Act (Regulation (EU) 2024/2847) is the first EU-wide law setting cybersecurity requirements for products with digital elements, meaning any hardware or software placed on the EU market that connects to a device or network. It shifts responsibility onto the manufacturer: security by design, no known exploitable vulnerabilities at release, secure default configuration, and free security updates for the whole support period.',
          'Compliance is proven on paper as much as in code. Manufacturers carry out a conformity assessment, keep technical documentation and a software bill of materials, affix the CE marking, and run a coordinated vulnerability handling process, including reporting actively exploited vulnerabilities and severe incidents to ENISA and the national CSIRT within tight deadlines. AuCRA 2.0 turns that paperwork into a guided workflow so evidence, documentation and conformity artefacts live in one structured place instead of scattered spreadsheets.',
          'This platform is built and managed by Auray Technology. Please get in touch with them for inquiries.',
        ],
        keyDates: [
          { date: '10 Dec 2024', what: 'Regulation entered into force' },
          { date: '11 Sep 2026', what: 'Reporting obligations start applying' },
          { date: '11 Dec 2027', what: 'Full obligations apply to all products' },
        ],
        ctas: [
          { label: 'Visit AuCRA', href: AUCRA_URL },
          { label: 'Visit Auray Technology', href: AURAY_URL },
        ],
      },
      id: {
        title: 'Apa yang diminta EU Cyber Resilience Act',
        paragraphs: [
          'Cyber Resilience Act (Regulasi (EU) 2024/2847) adalah undang-undang pertama di tingkat Uni Eropa yang menetapkan persyaratan keamanan siber untuk produk dengan elemen digital, yaitu perangkat keras atau perangkat lunak apa pun yang dipasarkan di UE dan terhubung ke perangkat atau jaringan. Tanggung jawab beralih ke produsen: keamanan sejak perancangan, tanpa kerentanan tereksploitasi yang diketahui saat rilis, konfigurasi bawaan yang aman, dan pembaruan keamanan gratis selama masa dukungan.',
          'Kepatuhan dibuktikan lewat dokumen, sama pentingnya dengan lewat kode. Produsen melakukan asesmen kesesuaian, menyimpan dokumentasi teknis dan software bill of materials, membubuhkan penandaan CE, serta menjalankan proses penanganan kerentanan terkoordinasi, termasuk melaporkan kerentanan yang aktif dieksploitasi dan insiden berat ke ENISA serta CSIRT nasional dalam tenggat ketat. AuCRA 2.0 mengubah administrasi itu menjadi alur kerja terpandu sehingga bukti, dokumentasi, dan artefak kesesuaian tersimpan di satu tempat terstruktur, bukan tercecer di banyak spreadsheet.',
          'Platform ini dibangun dan dikelola oleh Auray Technology. Silakan hubungi mereka untuk informasi lebih lanjut.',
        ],
        keyDates: [
          { date: '10 Des 2024', what: 'Regulasi mulai berlaku' },
          { date: '11 Sep 2026', what: 'Kewajiban pelaporan mulai berlaku' },
          { date: '11 Des 2027', what: 'Seluruh kewajiban berlaku untuk semua produk' },
        ],
        ctas: [
          { label: 'Kunjungi AuCRA', href: AUCRA_URL },
          { label: 'Kunjungi Auray Technology', href: AURAY_URL },
        ],
      },
      zh: {
        title: '歐盟《網路韌性法案》要求什麼',
        paragraphs: [
          '《網路韌性法案》（歐盟法規 (EU) 2024/2847）是歐盟第一部針對「具數位元素產品」訂定資安要求的法律，涵蓋所有在歐盟市場銷售、會連接裝置或網路的硬體與軟體。法案把責任放在製造商身上：安全始於設計、出貨時不得存在已知可被利用的漏洞、預設組態必須安全，並在整個支援期間免費提供安全更新。',
          '合規不只靠程式碼，也要靠文件來證明。製造商必須進行符合性評鑑、維護技術文件與軟體物料清單（SBOM）、加貼 CE 標章，並執行協調式漏洞處理流程，包括在嚴格期限內向 ENISA 與各國 CSIRT 通報遭利用的漏洞與重大事故。AuCRA 2.0 把這些文書工作變成引導式流程，讓佐證、文件與符合性文件集中在一個結構化空間，而不是散落在各個試算表裡。',
          '本平台由 Auray Technology 建置與營運，如有需求請與他們聯繫。',
        ],
        keyDates: [
          { date: '2024/12/10', what: '法規正式生效' },
          { date: '2026/09/11', what: '通報義務開始適用' },
          { date: '2027/12/11', what: '全部義務適用於所有產品' },
        ],
        ctas: [
          { label: '前往 AuCRA', href: AUCRA_URL },
          { label: '前往 Auray Technology', href: AURAY_URL },
        ],
      },
    },
    tags: {
      en: ['EU CRA', 'EN-40000', 'Compliance'],
      id: ['EU CRA', 'EN-40000', 'Kepatuhan'],
      zh: ['歐盟 CRA', 'EN-40000', '法遵'],
    },
    art: DocPlatformArt,
  },
  {
    id: 'cra-assessment',
    name: 'CRA Assessment',
    tagline: {
      en: 'EU CRA initial assessment based on ENISA guidelines',
      id: 'Asesmen awal EU CRA berdasarkan panduan ENISA',
      zh: '依 ENISA 指引的歐盟 CRA 初步評估',
    },
    description: {
      en: 'A first-pass self-assessment that tells a manufacturer where a product sits under the CRA and which obligations follow, scored against the ENISA guidance.',
      id: 'Asesmen mandiri tahap awal yang menunjukkan posisi produk di bawah CRA dan kewajiban apa saja yang mengikutinya, dinilai berdasarkan panduan ENISA.',
      zh: '第一輪自我評估，告訴製造商產品在 CRA 下的定位與隨之而來的義務，依 ENISA 指引評分。',
    },
    status: 'live',
    href: 'https://assessment.cra.nymbx.dev',
    external: true,
    tags: {
      en: ['ENISA', 'Self-assessment', 'Risk'],
      id: ['ENISA', 'Asesmen mandiri', 'Risiko'],
      zh: ['ENISA', '自我評估', '風險'],
    },
    art: AssessmentArt,
  },
  {
    id: 'toolbox',
    name: 'NYMBX Toolbox',
    tagline: {
      en: 'Useful toolbox for everyday use',
      id: 'Toolbox serbaguna untuk kebutuhan harian',
      zh: '日常好用的工具箱',
    },
    description: {
      en: 'PDF, image, text and data tools that run entirely in the browser. Files are processed on your device and never uploaded.',
      id: 'Perkakas PDF, gambar, teks, dan data yang berjalan sepenuhnya di browser. File diproses di perangkat Anda dan tidak pernah diunggah.',
      zh: 'PDF、圖片、文字與資料工具全部在瀏覽器裡執行，檔案只在你的裝置上處理，絕不上傳。',
    },
    status: 'live',
    href: '/tools',
    tags: {
      en: ['Client-side', 'Zero uploads', 'React + WASM'],
      id: ['Di sisi klien', 'Tanpa unggahan', 'React + WASM'],
      zh: ['純前端', '零上傳', 'React + WASM'],
    },
    art: ToolboxArt,
  },
  {
    id: 'reneo-planner',
    name: 'Reneo Planner',
    tagline: {
      en: 'Wedding planner based in Surabaya, Indonesia',
      id: 'Wedding planner yang berbasis di Surabaya, Indonesia',
      zh: '位於印尼泗水的婚禮顧問',
    },
    description: {
      en: 'The online home of a Surabaya wedding organizer, built for a NYMBX client: planning packages, vendor coordination and day-of crews for celebrations from 100 to 1,200 guests.',
      id: 'Rumah digital sebuah wedding organizer Surabaya, dibangun untuk klien NYMBX: paket perencanaan, koordinasi vendor, dan tim hari-H untuk perayaan 100 sampai 1.200 tamu.',
      zh: '為 NYMBX 客戶打造的泗水婚顧官網：策劃方案、廠商協調與婚禮當天的執行團隊，服務 100 到 1,200 位賓客的婚宴。',
    },
    status: 'live',
    href: 'https://reneoplanner.id',
    external: true,
    tags: {
      en: ['Client work', 'Weddings', 'Surabaya'],
      id: ['Proyek klien', 'Pernikahan', 'Surabaya'],
      zh: ['客戶專案', '婚禮', '泗水'],
    },
    art: WeddingArt,
  },
  {
    id: 'planner',
    name: 'NYMBX Planner',
    tagline: {
      en: 'Find the date and time that works for everyone',
      id: 'Temukan tanggal dan jam yang cocok untuk semua',
      zh: '找出每個人都有空的日期與時段',
    },
    description: {
      en: 'Send one link, everyone marks the dates and times they are free, and the overlapping slot picks itself. No more scheduling by email thread.',
      id: 'Kirim satu tautan, semua orang menandai tanggal dan jam luangnya, dan slot yang beririsan terpilih dengan sendirinya. Tidak perlu lagi menjadwalkan lewat balasan email.',
      zh: '送出一條連結，大家標記自己有空的日期與時段，重疊的時段自然浮現，再也不用在信件往返中喬時間。',
    },
    status: 'soon',
    href: null,
    tags: {
      en: ['Scheduling', 'Availability', 'In design'],
      id: ['Penjadwalan', 'Ketersediaan', 'Tahap desain'],
      zh: ['排程', '空檔調查', '設計中'],
    },
    art: PlannerArt,
  },
]
