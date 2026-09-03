import { useEffect, useRef, useState } from 'react'
import type { ComponentType, KeyboardEvent, SVGProps, TouchEvent } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  Compass,
  Mail,
  Play,
} from 'lucide-react'
import { ThemeToggle } from '../components/ThemeToggle'
import './its-me.css'

type Language = 'en' | 'id' | 'zh-TW'
type ShowcaseKey = 'auray' | 'compass' | 'insight' | 'shield'
type IconComponent = ComponentType<{ 'aria-hidden'?: boolean | 'true' }>

/**
 * Hero portrait. Save the photo as `public/itsme/portrait.jpg` (the 3:4 photo
 * taken in front of the Auray wall works as-is; the frame crops it to 4:5).
 * Until the file exists the hero falls back to a quiet placeholder frame.
 */
const PORTRAIT_SRC = '/itsme/portrait.jpg'

const AURAY_URL = 'https://www.auray.com.tw/en/about/company/'
const EMAIL = 'bagus.atmaja@auray.com.tw'
const SWIPE_THRESHOLD = 56

const LANGUAGES: { code: Language; label: string; short: string }[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'id', label: 'Bahasa Indonesia', short: 'ID' },
  { code: 'zh-TW', label: '繁體中文', short: '繁中' },
]

/** Auray's rocket mark (from the AuCRA Insight repo), set in the current colour. */
function AurayMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 5 46 37" fill="currentColor" {...props}>
      <path d="M42.9,25.2c0.4,0.2,1.4,0.5,1.3,1.2c-0.1,1-1.7,0.7-2.1,0.7c-1.1-0.1-2.4-0.1-3.6,0c-0.8,0.1-1.8,0-2.7,0.5c-2.1,1.2-0.6,3.9,0,4.8c0.4,0.8,1.3,1.8,1.6,2.7c0.4,1.1-0.8,2-1.8,1.5c0,0-10.5-8.1-8.6-12.5c0.8-1.9,3.1-1.8,4.6-1.7c2.2,0.1,4.4,0.7,6.5,1.3C39.7,23.9,41.5,24.4,42.9,25.2z" />
      <path d="M40.6,16.3c1,0.6,3.8,1.8,3.9,3.3c0.1,2.3-4.2,0.9-5.3,0.7c-3-0.6-6.4-1.3-9.4-1.6c-2.1-0.2-4.8-0.7-6.8,0.1c-5,2-0.1,9,1.7,11.4c1.4,2,4.2,4.8,5.2,7c1.4,2.8-1.3,4.5-4.2,2.7c0,0-29.9-19-25.1-29.4c1.8-4,6.7-4.5,10.6-4.2c3,0.2,6,0.7,8.9,1.5c1.5,0.4,2.9,0.8,4.3,1.3C29.9,10.9,35.6,13.2,40.6,16.3z M8.9,17.8c1.5,1.5,3.9,1.6,5.5,0.1c1.5-1.5,1.6-3.9,0.1-5.5c-1.5-1.5-3.9-1.6-5.5-0.1C7.4,13.8,7.4,16.3,8.9,17.8z" />
      <path d="M40.8,30.4c1.1-1.1,2.8-1,3.9,0.1c1.1,1.1,1,2.8-0.1,3.9c-1.1,1.1-2.8,1-3.9-0.1C39.7,33.2,39.7,31.5,40.8,30.4z" />
    </svg>
  )
}

/** AuCRA Shield's favicon (a shield with a rising line), redrawn as a line icon. */
function ShieldMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 640 640"
      fill="none"
      stroke="currentColor"
      strokeWidth={48}
      strokeLinejoin="round"
      strokeLinecap="round"
      {...props}
    >
      <path d="M296 76Q320 62 344 76L518 140Q545 150 545 180L545 318C545 442 452 536 320 588C188 536 95 442 95 318L95 180Q95 150 122 140Z" />
      <path d="M175 350h60l50-115 60 185 100-150h55" />
      <circle cx="445" cy="270" r="30" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** The company first, then the three platforms in the order a manufacturer meets them. */
const SHOWCASE: {
  key: ShowcaseKey
  href: string
  icon: IconComponent
  /** Demo length; only platforms with a recorded walkthrough have one. */
  seconds?: number
  free?: boolean
}[] = [
  { key: 'auray', href: AURAY_URL, icon: AurayMark },
  {
    key: 'compass',
    href: 'https://assessment.cra.nymbx.dev',
    icon: Compass,
    seconds: 40,
    free: true,
  },
  { key: 'insight', href: 'https://home.cra.nymbx.dev', icon: ChartNoAxesCombined, seconds: 40 },
  { key: 'shield', href: 'https://shield.aucra.nymbx.dev', icon: ShieldMark, seconds: 45 },
]

interface BrandFact {
  value: string
  label: string
}

interface ShowcaseCopy {
  /** Tab label on wide screens. */
  tab: string
  /** Tab label on phones, where four tabs share one row. */
  tabShort: string
  /** One-line qualifier shown under the tab label. */
  tag: string
  type: string
  title: string
  description: string
  detail: string
  highlights: string[]
  /** Only set for platforms anyone can use without paying. */
  note?: string
  cta: string
  /** Only the company card shows these. */
  facts?: BrandFact[]
}

interface EducationEntry {
  years: string
  degree: string
  field: string
  school: string
  place: string
}

interface ExperienceEntry {
  years: string
  title: string
  org: string
  text: string
}

interface Copy {
  role: string
  roleDetail: string
  portraitAlt: string
  hero: string
  intro: string
  seePlatforms: string
  emailMe: string
  workTitle: string
  workLead: string
  previous: string
  next: string
  watchDemo: (seconds: number) => string
  previewUnavailable: string
  showcase: Record<ShowcaseKey, ShowcaseCopy>
  aboutTitle: string
  summary: string[]
  educationLabel: string
  experienceLabel: string
  education: EducationEntry[]
  experience: ExperienceEntry[]
  contactTitle: string
  contactText: string
  footer: string
}

const COPY: Record<Language, Copy> = {
  en: {
    role: 'Cybersecurity researcher and platform builder',
    roleDetail: 'PhD student at NTUST, Taipei',
    portraitAlt: 'Portrait in front of the Auray Technology logo wall',
    hero: 'Turning cybersecurity standards into tools people can use.',
    intro:
      'I am a PhD researcher at NTUST, working across cybersecurity assessment, AI, and practical compliance systems.',
    seePlatforms: 'See the platforms',
    emailMe: 'Email me',
    workTitle: 'Selected work',
    workLead:
      'Auray Technology, where I work as a CRA consultant, and the three AuCRA platforms I build there: a readiness check, risk documentation, and vulnerability handling after release.',
    previous: 'Previous',
    next: 'Next',
    watchDemo: (seconds) => `Watch the demo (${seconds} s)`,
    previewUnavailable: 'Your browser does not support this video preview.',
    showcase: {
      auray: {
        tab: 'Auray Technology',
        tabShort: 'Auray',
        tag: 'The company',
        type: 'Where I work',
        title: 'Auray Technology',
        description:
          'Asia’s first OTIC & Security Laboratory: an accredited testing and certification lab in Taoyuan, Taiwan, covering O-RAN, 5G, and product cybersecurity.',
        detail:
          'I work at Auray as a Cyber Resilience Act consultant. The three AuCRA platforms in the next tabs are built with the Auray team for manufacturers preparing for the CRA.',
        highlights: [
          'Founded in April 2021, with a second laboratory in Kaohsiung since 2023',
          'World’s first authorised third-party O-RAN laboratory (O-RAN Alliance, 2021)',
          'TAF-accredited to ISO/IEC 17025 and 17029, with EN 303 645 and EN 18031 cybersecurity testing',
        ],
        cta: 'Visit Auray Technology',
        facts: [
          { value: '2021', label: 'Founded in Taoyuan' },
          { value: '1st', label: 'OTIC & Security lab in Asia' },
          { value: '17025', label: 'ISO/IEC, TAF-accredited' },
        ],
      },
      compass: {
        tab: 'AuCRA Compass',
        tabShort: 'Compass',
        tag: 'ENISA SME assessment',
        type: 'Readiness assessment for SMEs',
        title: 'AuCRA Compass',
        description:
          'A guided initial assessment that helps manufacturers understand CRA scope, product classification, organizational maturity, and reporting readiness.',
        detail:
          'Built around an ENISA-informed SME maturity model, with clear questions, cited guidance, and a practical improvement path.',
        highlights: [
          'Four guided forms: scope, classification, maturity, and reporting readiness',
          '25 ENISA maturity questions scored into a per-domain heatmap',
          'Summary and detailed reports with cited guidance and a prioritised improvement roadmap',
        ],
        note: 'AuCRA Compass is completely free. Open it and run an assessment on your own product.',
        cta: 'Try AuCRA Compass',
      },
      insight: {
        tab: 'AuCRA Insight',
        tabShort: 'Insight',
        tag: 'CRA-based assessment',
        type: 'Risk documentation',
        title: 'AuCRA Insight',
        description:
          'An EN 40000-oriented workspace for product context, cybersecurity risk assessment, treatment, evidence, SBOMs, and auditable report generation.',
        detail:
          'It turns a demanding documentation workflow into a structured, collaborative system without presenting itself as a substitute for conformity or legal advice.',
        highlights: [
          'Covers product context, risk criteria, assessment, treatment, cybersecurity activities, monitoring, and decommissioning',
          'STRIDE-style threat modelling with attack potential, likelihood and impact, and residual risk tracking',
          'Real-time collaborative workspaces, SBOM and evidence attachments, and DOCX and PDF report generation',
        ],
        cta: 'Open AuCRA Insight',
      },
      shield: {
        tab: 'AuCRA Shield',
        tabShort: 'Shield',
        tag: 'CRA-based PSIRT platform',
        type: 'PSIRT operations',
        title: 'AuCRA Shield',
        description:
          'A CRA-based PSIRT platform for vulnerability intake, assessment, remediation, disclosure, monitoring, and evidence-backed reporting.',
        detail:
          'Its guarded case workflow follows prEN 40000-1-3, helping teams maintain traceability from the first report through advisory publication and closure.',
        highlights: [
          'All 79 requirement items of prEN 40000-1-3 Clause 5 encoded in a catalogue, with compliance computed from linked evidence',
          'Guarded case workflow from intake and triage through remediation, disclosure, advisory publication, and closure',
          'Built for the Article 14 reporting obligations that apply from 11 September 2026, with bilingual Traditional Chinese and English documents',
        ],
        cta: 'Open AuCRA Shield',
      },
    },
    aboutTitle: 'About me',
    summary: [
      'I am a PhD student in Electrical Engineering at NTUST, researching cybersecurity assessment, AI integration, and the standards and regulations behind them.',
      'Through industry work in Indonesia and Taiwan I have tested real devices against EUCC and ENISA requirements, produced standardized compliance reports, and built a patented system that generates Security Target documentation.',
    ],
    educationLabel: 'Education',
    experienceLabel: 'Applied research',
    education: [
      {
        years: '2015–2019',
        degree: 'Associate degree',
        field: 'Electrical Engineering, Computer Control',
        school: 'Institut Teknologi Sepuluh Nopember',
        place: 'Indonesia',
      },
      {
        years: '2020–2021',
        degree: 'Bachelor of Applied Engineering',
        field: 'Automation Engineering',
        school: 'Institut Teknologi Sepuluh Nopember',
        place: 'Indonesia',
      },
      {
        years: '2022–2023',
        degree: 'Master’s degree',
        field: 'Electrical Engineering',
        school: 'National Taiwan University of Science and Technology',
        place: 'Taiwan',
      },
      {
        years: '2023–present',
        degree: 'PhD',
        field: 'Electrical Engineering',
        school: 'National Taiwan University of Science and Technology',
        place: 'Taiwan',
      },
    ],
    experience: [
      {
        years: '2022–2023',
        title: 'EUCC / ENISA cybersecurity regulation research',
        org: 'Taiwan Association of Information and Communication Standards (TAICS)',
        text: 'Analyzed EUCC and ENISA requirements using vendor devices, conducted OWASP penetration testing, designed attack scenarios, evaluated compliance, and authored Security Target, assurance-requirement, and evaluator test documentation.',
      },
      {
        years: '2023–2024',
        title: 'Common Criteria security documentation system',
        org: 'Industrial Technology Research Institute and TAICS',
        text: 'Built a desktop application combining machine learning, decision trees, and a rule-based expert system to automate Security Target document generation aligned with Common Criteria and EUCC structures.',
      },
      {
        years: '2025–2026',
        title: 'Cyber Resilience Act consultant and platform builder',
        org: 'Auray Technology',
        text: 'Built applications for EN 40000-1-2 assessment, EN 40000-1-3 PSIRT operations, and ENISA-informed SME initial assessment across the wider CRA architecture.',
      },
    ],
    contactTitle: 'Research, regulation, or a useful new problem?',
    contactText:
      'I am always interested in thoughtful collaborations across cybersecurity and applied research.',
    footer: 'Cybersecurity research in Taiwan and Indonesia',
  },
  id: {
    role: 'Peneliti keamanan siber dan pengembang platform',
    roleDetail: 'Mahasiswa PhD di NTUST, Taipei',
    portraitAlt: 'Foto di depan dinding logo Auray Technology',
    hero: 'Mengubah standar keamanan siber menjadi alat yang dapat digunakan.',
    intro:
      'Saya adalah peneliti PhD di NTUST yang berfokus pada asesmen keamanan siber, AI, dan sistem kepatuhan yang praktis.',
    seePlatforms: 'Lihat platform',
    emailMe: 'Hubungi saya',
    workTitle: 'Karya pilihan',
    workLead:
      'Auray Technology, tempat saya bekerja sebagai konsultan CRA, dan tiga platform AuCRA yang saya bangun di sana: pemeriksaan kesiapan, dokumentasi risiko, dan penanganan kerentanan setelah produk dirilis.',
    previous: 'Sebelumnya',
    next: 'Berikutnya',
    watchDemo: (seconds) => `Putar demo (${seconds} detik)`,
    previewUnavailable: 'Peramban Anda tidak mendukung pratinjau video ini.',
    showcase: {
      auray: {
        tab: 'Auray Technology',
        tabShort: 'Auray',
        tag: 'Perusahaan',
        type: 'Tempat saya bekerja',
        title: 'Auray Technology',
        description:
          'Laboratorium OTIC & Security pertama di Asia: laboratorium pengujian dan sertifikasi terakreditasi di Taoyuan, Taiwan, yang mencakup O-RAN, 5G, dan keamanan siber produk.',
        detail:
          'Saya bekerja di Auray sebagai konsultan Cyber Resilience Act. Ketiga platform AuCRA pada tab berikutnya dibangun bersama tim Auray untuk produsen yang bersiap menghadapi CRA.',
        highlights: [
          'Didirikan April 2021, dengan laboratorium kedua di Kaohsiung sejak 2023',
          'Laboratorium O-RAN pihak ketiga pertama di dunia yang diotorisasi O-RAN Alliance (2021)',
          'Terakreditasi TAF untuk ISO/IEC 17025 dan 17029, serta pengujian keamanan siber EN 303 645 dan EN 18031',
        ],
        cta: 'Kunjungi Auray Technology',
        facts: [
          { value: '2021', label: 'Didirikan di Taoyuan' },
          { value: 'ke-1', label: 'Lab OTIC & Security di Asia' },
          { value: '17025', label: 'ISO/IEC, terakreditasi TAF' },
        ],
      },
      compass: {
        tab: 'AuCRA Compass',
        tabShort: 'Compass',
        tag: 'Asesmen UKM ENISA',
        type: 'Asesmen kesiapan UKM',
        title: 'AuCRA Compass',
        description:
          'Asesmen awal terpandu untuk membantu produsen memahami cakupan CRA, klasifikasi produk, kematangan organisasi, dan kesiapan pelaporan.',
        detail:
          'Dibangun dengan model kematangan UKM yang mengacu pada ENISA, dilengkapi pertanyaan jelas, panduan bersumber, dan jalur peningkatan yang praktis.',
        highlights: [
          'Empat formulir terpandu: cakupan, klasifikasi, kematangan, dan kesiapan pelaporan',
          '25 pertanyaan kematangan ENISA yang dinilai menjadi peta panas per domain',
          'Laporan ringkas dan rinci dengan panduan bersumber serta peta jalan perbaikan berprioritas',
        ],
        note: 'AuCRA Compass sepenuhnya gratis. Buka dan coba asesmen untuk produk Anda sendiri.',
        cta: 'Coba AuCRA Compass',
      },
      insight: {
        tab: 'AuCRA Insight',
        tabShort: 'Insight',
        tag: 'Asesmen berbasis CRA',
        type: 'Dokumentasi risiko',
        title: 'AuCRA Insight',
        description:
          'Ruang kerja berbasis EN 40000 untuk konteks produk, asesmen dan penanganan risiko keamanan siber, bukti, SBOM, serta pembuatan laporan yang dapat diaudit.',
        detail:
          'Platform ini mengubah alur dokumentasi yang kompleks menjadi sistem kolaboratif dan terstruktur, tanpa menggantikan nasihat hukum atau penilaian kesesuaian.',
        highlights: [
          'Mencakup konteks produk, kriteria risiko, asesmen, penanganan, aktivitas keamanan siber, pemantauan, dan dekomisioning',
          'Pemodelan ancaman ala STRIDE dengan potensi serangan, kemungkinan dan dampak, serta pelacakan risiko residual',
          'Ruang kerja kolaboratif waktu nyata, lampiran SBOM dan bukti, serta pembuatan laporan DOCX dan PDF',
        ],
        cta: 'Buka AuCRA Insight',
      },
      shield: {
        tab: 'AuCRA Shield',
        tabShort: 'Shield',
        tag: 'Platform PSIRT berbasis CRA',
        type: 'Operasi PSIRT',
        title: 'AuCRA Shield',
        description:
          'Platform PSIRT berbasis CRA untuk penerimaan, asesmen, remediasi, pengungkapan, pemantauan kerentanan, dan pelaporan berbasis bukti.',
        detail:
          'Alur kasusnya mengikuti prEN 40000-1-3 dan menjaga keterlacakan sejak laporan pertama hingga publikasi advisori dan penutupan.',
        highlights: [
          'Seluruh 79 butir persyaratan prEN 40000-1-3 Klausul 5 dikodekan dalam katalog, dengan kepatuhan dihitung dari bukti yang tertaut',
          'Alur kasus terjaga dari penerimaan dan triase hingga remediasi, pengungkapan, publikasi advisori, dan penutupan',
          'Dibangun untuk kewajiban pelaporan Pasal 14 yang berlaku mulai 11 September 2026, dengan dokumen dwibahasa Mandarin Tradisional dan Inggris',
        ],
        cta: 'Buka AuCRA Shield',
      },
    },
    aboutTitle: 'Tentang saya',
    summary: [
      'Saya mahasiswa PhD Teknik Elektro di NTUST, meneliti asesmen keamanan siber, integrasi AI, serta standar dan regulasi di baliknya.',
      'Melalui kerja industri di Indonesia dan Taiwan, saya menguji perangkat nyata terhadap persyaratan EUCC dan ENISA, menyusun laporan kepatuhan terstandar, dan membangun sistem berpaten yang menghasilkan dokumentasi Security Target.',
    ],
    educationLabel: 'Pendidikan',
    experienceLabel: 'Riset terapan',
    education: [
      {
        years: '2015–2019',
        degree: 'Ahli Madya',
        field: 'Teknik Elektro, Teknik Komputer Kontrol',
        school: 'Institut Teknologi Sepuluh Nopember',
        place: 'Indonesia',
      },
      {
        years: '2020–2021',
        degree: 'Sarjana Terapan',
        field: 'Teknik Otomasi',
        school: 'Institut Teknologi Sepuluh Nopember',
        place: 'Indonesia',
      },
      {
        years: '2022–2023',
        degree: 'Magister',
        field: 'Teknik Elektro',
        school: 'National Taiwan University of Science and Technology',
        place: 'Taiwan',
      },
      {
        years: '2023–sekarang',
        degree: 'PhD',
        field: 'Teknik Elektro',
        school: 'National Taiwan University of Science and Technology',
        place: 'Taiwan',
      },
    ],
    experience: [
      {
        years: '2022–2023',
        title: 'Riset regulasi keamanan siber EUCC / ENISA',
        org: 'Taiwan Association of Information and Communication Standards (TAICS)',
        text: 'Menganalisis EUCC dan ENISA menggunakan perangkat vendor, melakukan penetration test OWASP, merancang skenario serangan, mengevaluasi kepatuhan, serta menyusun Security Target, persyaratan jaminan, dan laporan pengujian evaluator.',
      },
      {
        years: '2023–2024',
        title: 'Sistem dokumentasi keamanan Common Criteria',
        org: 'Industrial Technology Research Institute dan TAICS',
        text: 'Membangun aplikasi desktop yang menggabungkan machine learning, decision tree, dan rule-based expert system untuk mengotomatisasi dokumen Security Target yang selaras dengan struktur Common Criteria dan EUCC.',
      },
      {
        years: '2025–2026',
        title: 'Konsultan Cyber Resilience Act dan pengembang platform',
        org: 'Auray Technology',
        text: 'Membangun aplikasi asesmen EN 40000-1-2, operasi PSIRT EN 40000-1-3, dan asesmen awal UKM berbasis ENISA dalam arsitektur CRA yang lebih luas.',
      },
    ],
    contactTitle: 'Riset, regulasi, atau masalah baru yang bermanfaat?',
    contactText:
      'Saya terbuka untuk kolaborasi yang bermakna dalam keamanan siber dan riset terapan.',
    footer: 'Riset keamanan siber di Taiwan dan Indonesia',
  },
  'zh-TW': {
    role: '資安研究者與平台開發者',
    roleDetail: '臺科大博士生，台北',
    portraitAlt: '在耀睿科技標誌牆前的個人照片',
    hero: '將資安標準，轉化成真正好用的工具。',
    intro: '我是臺科大電機工程博士研究生，專注於資安評估、人工智慧與實務合規系統。',
    seePlatforms: '看看這些平台',
    emailMe: '與我聯絡',
    workTitle: '精選作品',
    workLead:
      '我任職於耀睿科技，擔任 CRA 顧問；以下是我在那裡打造的三個 AuCRA 平台：準備度檢視、風險文件，以及產品上市後的漏洞處理。',
    previous: '上一個',
    next: '下一個',
    watchDemo: (seconds) => `播放示範影片（${seconds} 秒）`,
    previewUnavailable: '您的瀏覽器不支援此影片預覽。',
    showcase: {
      auray: {
        tab: '耀睿科技',
        tabShort: '耀睿',
        tag: '公司',
        type: '我任職的公司',
        title: '耀睿科技 Auray Technology',
        description:
          '亞洲第一家 OTIC & Security 實驗室，位於台灣桃園，是涵蓋 O-RAN、5G 與產品資安的認證測試實驗室。',
        detail:
          '我在耀睿擔任《網路韌性法》顧問；接下來三個分頁中的 AuCRA 平台，皆與耀睿團隊共同打造，協助製造商因應 CRA。',
        highlights: [
          '2021 年 4 月成立，2023 年起於高雄設立第二座實驗室',
          '全球第一家獲 O-RAN 聯盟授權的第三方 O-RAN 實驗室（2021 年）',
          '取得 TAF ISO/IEC 17025 與 17029 認證，並提供 EN 303 645 與 EN 18031 資安測試',
        ],
        cta: '造訪耀睿科技',
        facts: [
          { value: '2021', label: '成立於桃園' },
          { value: '第一', label: '亞洲 OTIC & Security 實驗室' },
          { value: '17025', label: 'ISO/IEC，TAF 認證' },
        ],
      },
      compass: {
        tab: 'AuCRA Compass',
        tabShort: 'Compass',
        tag: 'ENISA 中小企業評估',
        type: '中小企業準備度評估',
        title: 'AuCRA Compass',
        description:
          '引導製造商了解 CRA 適用範圍、產品分類、組織成熟度與通報準備度的初步評估工具。',
        detail:
          '以 ENISA 中小企業成熟度模型為基礎，透過明確問題、來源指引與可執行的改善路徑完成評估。',
        highlights: [
          '四份引導式表單：適用範圍、產品分類、成熟度與通報準備度',
          '25 題 ENISA 成熟度問題，彙整為各領域熱度圖',
          '附來源指引的摘要與詳細報告，以及排定優先順序的改善路徑',
        ],
        note: 'AuCRA Compass 完全免費，歡迎開啟並用自己的產品試做一次評估。',
        cta: '試用 AuCRA Compass',
      },
      insight: {
        tab: 'AuCRA Insight',
        tabShort: 'Insight',
        tag: 'CRA 導向評估',
        type: '風險文件管理',
        title: 'AuCRA Insight',
        description:
          '依循 EN 40000 的工作空間，整合產品脈絡、資安風險評估與處理、佐證、SBOM 及可稽核報告。',
        detail: '將繁複的文件流程轉為結構化協作系統，同時清楚界定其不取代法律或符合性評鑑建議。',
        highlights: [
          '涵蓋產品脈絡、風險準則、風險評估與處理、資安活動、監控與退役',
          'STRIDE 式威脅建模，含攻擊潛能、可能性與衝擊評估及殘餘風險追蹤',
          '即時協作工作區、SBOM 與佐證附件，以及 DOCX／PDF 報告產生',
        ],
        cta: '開啟 AuCRA Insight',
      },
      shield: {
        tab: 'AuCRA Shield',
        tabShort: 'Shield',
        tag: 'CRA 導向 PSIRT 平台',
        type: 'PSIRT 營運',
        title: 'AuCRA Shield',
        description:
          '以 CRA 為基礎的 PSIRT 平台，涵蓋漏洞接收、評估、修補、揭露、監控與佐證式報告。',
        detail: '案件流程遵循 prEN 40000-1-3，從首次通報到安全公告發布與結案，全程維持可追溯性。',
        highlights: [
          'prEN 40000-1-3 第 5 章全部 79 項要求皆編入目錄，合規狀態由連結的佐證計算而得',
          '受控的案件流程：從接收與分級，到修補、揭露、安全公告發布與結案',
          '為 2026 年 9 月 11 日起適用的第 14 條通報義務而建，提供繁體中文與英文雙語文件',
        ],
        cta: '開啟 AuCRA Shield',
      },
    },
    aboutTitle: '關於我',
    summary: [
      '我是臺科大電機工程博士生，研究資安評估、AI 整合，以及其背後的標準與法規。',
      '在印尼與台灣的產業合作中，我依 EUCC 與 ENISA 要求測試實體設備、撰寫標準化合規報告，並開發出一套自動產生 Security Target 文件的專利系統。',
    ],
    educationLabel: '學歷',
    experienceLabel: '應用研究',
    education: [
      {
        years: '2015–2019',
        degree: '副學士',
        field: '電機工程（電腦控制組）',
        school: '泗水理工學院',
        place: '印尼',
      },
      {
        years: '2020–2021',
        degree: '應用工程學士',
        field: '自動化工程',
        school: '泗水理工學院',
        place: '印尼',
      },
      {
        years: '2022–2023',
        degree: '碩士',
        field: '電機工程',
        school: '國立臺灣科技大學',
        place: '台灣',
      },
      {
        years: '2023 至今',
        degree: '博士',
        field: '電機工程',
        school: '國立臺灣科技大學',
        place: '台灣',
      },
    ],
    experience: [
      {
        years: '2022–2023',
        title: 'EUCC／ENISA 歐洲資安法規研究',
        org: '台灣資通產業標準協會（TAICS）',
        text: '使用廠商實體設備進行 EUCC／ENISA 分析、OWASP 滲透測試、攻擊情境設計與合規評估，並撰寫 Security Target、安全保證要求及評估者測試報告。',
      },
      {
        years: '2023–2024',
        title: 'Common Criteria 資安文件系統',
        org: '工業技術研究院與 TAICS',
        text: '整合機器學習、決策樹及規則式專家系統，建立桌面應用程式，自動產生符合 Common Criteria 與 EUCC 架構的 Security Target 文件。',
      },
      {
        years: '2025–2026',
        title: '《網路韌性法》顧問與平台開發',
        org: '耀睿科技',
        text: '建置 EN 40000-1-2 評估、EN 40000-1-3 PSIRT 營運及 ENISA 中小企業初步評估應用，支援完整 CRA 架構。',
      },
    ],
    contactTitle: '研究、法規，或值得解決的新問題？',
    contactText: '歡迎交流資安與應用研究領域中具實質意義的合作。',
    footer: '資安研究，台灣與印尼',
  },
}

function useMetadata() {
  useEffect(() => {
    const oldTitle = document.title
    const existing = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const robots = existing ?? document.createElement('meta')
    document.title = 'It’s me · NYMBX'
    robots.name = 'robots'
    robots.content = 'noindex, nofollow, noarchive'
    if (!existing) document.head.append(robots)
    return () => {
      document.title = oldTitle
      if (!existing) robots.remove()
    }
  }, [])
}

function initialLanguage(): Language {
  try {
    const value = localStorage.getItem('nymbx:itsme-language')
    if (value === 'en' || value === 'id' || value === 'zh-TW') return value
  } catch {
    /* unavailable */
  }
  return 'zh-TW'
}

/** The photo, or a quiet placeholder until the file is in place. */
function Portrait({ alt }: { alt: string }) {
  const [missing, setMissing] = useState(false)
  if (!missing) {
    return (
      <img
        src={PORTRAIT_SRC}
        alt={alt}
        width={960}
        height={1280}
        fetchPriority="high"
        onError={() => setMissing(true)}
      />
    )
  }
  return (
    <svg viewBox="0 0 80 100" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <circle cx="40" cy="38" r="15" />
      <path d="M8 100c0-18 14-30 32-30s32 12 32 30z" />
    </svg>
  )
}

/**
 * A poster with a play button that swaps to the real video on demand, so the
 * page never downloads the demo files until someone asks for one.
 */
function Demo({
  src,
  poster,
  title,
  label,
  unavailable,
}: {
  src: string
  poster: string
  title: string
  label: string
  unavailable: string
}) {
  const [playing, setPlaying] = useState(false)
  return (
    <div className="itsme__demo">
      {playing ? (
        <video controls autoPlay playsInline poster={poster} aria-label={title}>
          <source src={src} type="video/mp4" />
          {unavailable}
        </video>
      ) : (
        <button type="button" className="itsme__demo-poster" onClick={() => setPlaying(true)}>
          <img src={poster} alt="" width={1280} height={720} loading="lazy" />
          <span className="itsme__demo-play">
            <span className="itsme__demo-play-icon">
              <Play aria-hidden="true" />
            </span>
            <span className="itsme__demo-play-label">{label}</span>
          </span>
        </button>
      )}
    </div>
  )
}

/** The company card that stands in for a demo on the Auray tab. */
function BrandCard({ facts }: { facts: BrandFact[] }) {
  return (
    <div className="itsme__brand">
      <img
        className="itsme__brand-logo itsme__brand-logo--light"
        src="/itsme/auray-logo.svg"
        alt="Auray Technology"
        width={162}
        height={45}
      />
      <img
        className="itsme__brand-logo itsme__brand-logo--dark"
        src="/itsme/auray-logo-dark.svg"
        alt=""
        width={162}
        height={45}
      />
      <ul>
        {facts.map((fact) => (
          <li key={fact.label}>
            <strong>{fact.value}</strong>
            <span>{fact.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Tabbed showcase: the tab strip picks a company or platform, the stage shows
 * its demo (or the company card) beside the copy. Arrow keys move between
 * tabs, and a horizontal swipe on the stage does the same on a phone.
 */
function Showcase({ copy, mediaLanguage }: { copy: Copy; mediaLanguage: 'en' | 'tw' }) {
  const [index, setIndex] = useState(0)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const count = SHOWCASE.length
  const item = SHOWCASE[index]
  const text = copy.showcase[item.key]
  const previous = SHOWCASE[(index + count - 1) % count]
  const next = SHOWCASE[(index + 1) % count]
  const Icon = item.icon

  const step = (delta: number) => setIndex((current) => (current + delta + count) % count)

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let target: number
    if (event.key === 'ArrowRight') target = (index + 1) % count
    else if (event.key === 'ArrowLeft') target = (index + count - 1) % count
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = count - 1
    else return
    event.preventDefault()
    setIndex(target)
    tabRefs.current[target]?.focus()
  }

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0]
    // Leave the video's own controls (seeking, volume) alone.
    if (!touch || (event.target as Element).closest('video')) return
    touchStart.current = { x: touch.clientX, y: touch.clientY }
  }

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current
    const touch = event.changedTouches[0]
    touchStart.current = null
    if (!start || !touch) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      step(dx < 0 ? 1 : -1)
    }
  }

  return (
    <div className="itsme__showcase">
      <div
        className="itsme__tabs"
        role="tablist"
        aria-label={copy.workTitle}
        onKeyDown={onTabKeyDown}
      >
        {SHOWCASE.map((entry, i) => {
          const entryText = copy.showcase[entry.key]
          const EntryIcon = entry.icon
          const selected = i === index
          return (
            <button
              key={entry.key}
              ref={(element) => {
                tabRefs.current[i] = element
              }}
              type="button"
              role="tab"
              id={`tab-${entry.key}`}
              className="itsme__tab"
              aria-selected={selected}
              aria-controls={`panel-${entry.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setIndex(i)}
            >
              <EntryIcon aria-hidden="true" />
              <strong>
                <span className="itsme__tab-long">{entryText.tab}</span>
                <span className="itsme__tab-short">{entryText.tabShort}</span>
              </strong>
              <span className="itsme__tab-tag">{entryText.tag}</span>
            </button>
          )
        })}
      </div>

      <div
        key={item.key}
        className="itsme__stage"
        role="tabpanel"
        id={`panel-${item.key}`}
        aria-labelledby={`tab-${item.key}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="itsme__stage-media">
          {item.seconds ? (
            <Demo
              key={`${item.key}-${mediaLanguage}`}
              src={`/itsme/aucra-${item.key}-${mediaLanguage}.mp4`}
              poster={`/itsme/poster-${item.key}-${mediaLanguage}.jpg`}
              title={text.title}
              label={copy.watchDemo(item.seconds)}
              unavailable={copy.previewUnavailable}
            />
          ) : (
            <BrandCard facts={text.facts ?? []} />
          )}
        </div>
        <div className="itsme__stage-copy">
          <p className="itsme__platform-type">
            <Icon aria-hidden="true" />
            {text.type}
          </p>
          <h3>{text.title}</h3>
          <p className="itsme__platform-description">{text.description}</p>
          <p className="itsme__platform-detail">{text.detail}</p>
          <ul className="itsme__highlights">
            {text.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
          {text.note && <p className="itsme__free">{text.note}</p>}
          <div className="itsme__platform-actions">
            <a
              className={item.free ? 'itsme__button itsme__button--primary' : 'itsme__button'}
              href={item.href}
              target="_blank"
              rel="noreferrer"
            >
              {text.cta}
              <ArrowUpRight aria-hidden="true" />
            </a>
            <span className="itsme__host">{new URL(item.href).host}</span>
          </div>
        </div>
      </div>

      <div className="itsme__stage-nav">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={`${copy.previous}: ${copy.showcase[previous.key].tab}`}
        >
          <ArrowLeft aria-hidden="true" />
          <span>{copy.showcase[previous.key].tab}</span>
        </button>
        <span className="itsme__stage-count" aria-hidden="true">
          {index + 1} / {count}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label={`${copy.next}: ${copy.showcase[next.key].tab}`}
        >
          <span>{copy.showcase[next.key].tab}</span>
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export default function ItsMe() {
  useMetadata()
  const [language, setLanguage] = useState<Language>(initialLanguage)
  const copy = COPY[language]
  const mediaLanguage = language === 'zh-TW' ? 'tw' : 'en'
  const changeLanguage = (next: Language) => {
    setLanguage(next)
    try {
      localStorage.setItem('nymbx:itsme-language', next)
    } catch {
      /* session only */
    }
  }

  return (
    <div className="itsme" lang={language}>
      <div className="itsme__controls">
        <div className="itsme__languages" role="group" aria-label="Language">
          {LANGUAGES.map((item) => (
            <button
              key={item.code}
              type="button"
              className={language === item.code ? 'is-active' : undefined}
              aria-label={item.label}
              aria-pressed={language === item.code}
              title={item.label}
              onClick={() => changeLanguage(item.code)}
            >
              <span className="itsme__language-short">{item.short}</span>
              <span className="itsme__language-long">{item.label}</span>
            </button>
          ))}
        </div>
        <ThemeToggle />
      </div>

      <main>
        <section className="itsme__hero" aria-labelledby="itsme-heading">
          <div className="itsme__hero-copy">
            <h1 id="itsme-heading">{copy.hero}</h1>
            <p className="itsme__lead">{copy.intro}</p>
            <div className="itsme__actions">
              <a className="itsme__button itsme__button--primary" href="#work">
                {copy.seePlatforms}
                <ArrowDown aria-hidden="true" />
              </a>
              <a className="itsme__button" href={`mailto:${EMAIL}`}>
                {copy.emailMe}
              </a>
            </div>
          </div>
          <figure className="itsme__portrait">
            <div className="itsme__portrait-frame">
              <Portrait alt={copy.portraitAlt} />
            </div>
            <figcaption>
              <strong>{copy.role}</strong>
              <span>{copy.roleDetail}</span>
            </figcaption>
          </figure>
        </section>

        <section id="work" className="itsme__work" aria-labelledby="work-heading">
          <header className="itsme__section-head">
            <h2 id="work-heading">{copy.workTitle}</h2>
            <p>{copy.workLead}</p>
          </header>
          <Showcase copy={copy} mediaLanguage={mediaLanguage} />
        </section>

        <section className="itsme__about" aria-labelledby="about-heading">
          <div className="itsme__about-summary">
            <h2 id="about-heading">{copy.aboutTitle}</h2>
            {copy.summary.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="itsme__history">
            <div className="itsme__history-column">
              <h3>{copy.educationLabel}</h3>
              <ol>
                {copy.education.map((entry) => (
                  <li key={entry.years}>
                    <time>{entry.years}</time>
                    <div>
                      <strong>{entry.degree}</strong>
                      <span>{entry.field}</span>
                      <span>
                        {entry.school}, {entry.place}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="itsme__history-column">
              <h3>{copy.experienceLabel}</h3>
              <ol>
                {copy.experience.map((entry) => (
                  <li key={entry.title}>
                    <time>{entry.years}</time>
                    <div>
                      <strong>{entry.title}</strong>
                      <span>{entry.org}</span>
                      <p>{entry.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="itsme__contact" aria-labelledby="contact-heading">
          <div>
            <h2 id="contact-heading">{copy.contactTitle}</h2>
            <p>{copy.contactText}</p>
          </div>
          <a className="itsme__button itsme__button--primary" href={`mailto:${EMAIL}`}>
            <Mail aria-hidden="true" />
            {copy.emailMe}
          </a>
        </section>
      </main>

      <footer className="itsme__footer">
        <span>{copy.footer}</span>
        <span>{new Date().getFullYear()}</span>
      </footer>
    </div>
  )
}
