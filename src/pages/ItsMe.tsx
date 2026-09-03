import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import {
  ArrowDown,
  ArrowUpRight,
  ChartNoAxesCombined,
  Compass,
  Mail,
  Play,
  ShieldCheck,
} from 'lucide-react'
import { ThemeToggle } from '../components/ThemeToggle'
import './its-me.css'

type Language = 'en' | 'id' | 'zh-TW'
type PlatformKey = 'compass' | 'insight' | 'shield'

/**
 * Hero portrait. Drop the photo in `public/itsme/` (a 4:5 crop, roughly
 * 800×1000px, works best) and point this at it, e.g. '/itsme/portrait.jpg'.
 * While it is null the hero shows a quiet placeholder frame instead.
 */
const PORTRAIT_SRC: string | null = null

const AURAY_URL = 'https://www.auray.com.tw/en/about/company/'
const EMAIL = 'admin@nymbx.dev'

const LANGUAGES: { code: Language; label: string; short: string }[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'id', label: 'Bahasa Indonesia', short: 'ID' },
  { code: 'zh-TW', label: '繁體中文', short: '繁中' },
]

/** The three platforms in the order a manufacturer meets them under the CRA. */
const PLATFORMS: {
  key: PlatformKey
  href: string
  icon: ComponentType<{ 'aria-hidden'?: boolean | 'true' }>
  seconds: number
  free?: boolean
}[] = [
  {
    key: 'compass',
    href: 'https://assessment.cra.nymbx.dev',
    icon: Compass,
    seconds: 40,
    free: true,
  },
  { key: 'insight', href: 'https://home.cra.nymbx.dev', icon: ChartNoAxesCombined, seconds: 40 },
  { key: 'shield', href: 'https://shield.aucra.nymbx.dev', icon: ShieldCheck, seconds: 45 },
]

interface PlatformCopy {
  type: string
  title: string
  description: string
  detail: string
  cta: string
  /** Only set for platforms anyone can use without paying. */
  note?: string
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
  aurayText: string
  aurayLink: string
  watchDemo: (seconds: number) => string
  previewUnavailable: string
  platforms: Record<PlatformKey, PlatformCopy>
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
    portraitAlt: 'Portrait',
    hero: 'Turning cybersecurity standards into tools people can use.',
    intro:
      'I am a PhD researcher at NTUST, working across cybersecurity assessment, AI, and practical compliance systems.',
    seePlatforms: 'See the platforms',
    emailMe: 'Email me',
    workTitle: 'Selected work',
    workLead:
      'Three platforms that take a manufacturer through the Cyber Resilience Act: a first readiness check, the risk documentation, and vulnerability handling after release.',
    aurayText:
      'All three are built with Auray Technology, Asia’s first OTIC & Security Laboratory, where I work as a Cyber Resilience Act consultant.',
    aurayLink: 'About Auray Technology',
    watchDemo: (seconds) => `Watch the demo (${seconds} s)`,
    previewUnavailable: 'Your browser does not support this video preview.',
    platforms: {
      compass: {
        type: 'Readiness assessment for SMEs',
        title: 'AuCRA Compass',
        description:
          'A guided initial assessment that helps manufacturers understand CRA scope, product classification, organizational maturity, and reporting readiness.',
        detail:
          'Built around an ENISA-informed SME maturity model, with clear questions, cited guidance, and a practical improvement path.',
        note: 'AuCRA Compass is completely free. Open it and run an assessment on your own product.',
        cta: 'Try AuCRA Compass',
      },
      insight: {
        type: 'Risk documentation',
        title: 'AuCRA Insight',
        description:
          'An EN 40000-oriented workspace for product context, cybersecurity risk assessment, treatment, evidence, SBOMs, and auditable report generation.',
        detail:
          'It turns a demanding documentation workflow into a structured, collaborative system without presenting itself as a substitute for conformity or legal advice.',
        cta: 'Open AuCRA Insight',
      },
      shield: {
        type: 'PSIRT operations',
        title: 'AuCRA Shield',
        description:
          'A CRA-based PSIRT platform for vulnerability intake, assessment, remediation, disclosure, monitoring, and evidence-backed reporting.',
        detail:
          'Its guarded case workflow follows prEN 40000-1-3, helping teams maintain traceability from the first report through advisory publication and closure.',
        cta: 'Open AuCRA Shield',
      },
    },
    aboutTitle: 'About me',
    summary: [
      'I am a PhD student in Electrical Engineering at the National Taiwan University of Science and Technology (NTUST). My research focuses on cybersecurity assessment, machine learning and AI integration, and the development of cybersecurity standards and regulations.',
      'Across collaborations in Indonesia and Taiwan, I have developed DCS/SCADA study modules, aligned cybersecurity work with current regulation, tested real devices, produced standardized compliance reports, and built a patented system for generating Security Target documentation based on EUCC and ENISA requirements.',
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
    portraitAlt: 'Foto profil',
    hero: 'Mengubah standar keamanan siber menjadi alat yang dapat digunakan.',
    intro:
      'Saya adalah peneliti PhD di NTUST yang berfokus pada asesmen keamanan siber, AI, dan sistem kepatuhan yang praktis.',
    seePlatforms: 'Lihat platform',
    emailMe: 'Hubungi saya',
    workTitle: 'Karya pilihan',
    workLead:
      'Tiga platform yang memandu produsen melewati Cyber Resilience Act: pemeriksaan kesiapan awal, dokumentasi risiko, dan penanganan kerentanan setelah produk dirilis.',
    aurayText:
      'Ketiganya dibangun bersama Auray Technology, laboratorium OTIC & Security pertama di Asia, tempat saya bekerja sebagai konsultan Cyber Resilience Act.',
    aurayLink: 'Tentang Auray Technology',
    watchDemo: (seconds) => `Putar demo (${seconds} detik)`,
    previewUnavailable: 'Peramban Anda tidak mendukung pratinjau video ini.',
    platforms: {
      compass: {
        type: 'Asesmen kesiapan UKM',
        title: 'AuCRA Compass',
        description:
          'Asesmen awal terpandu untuk membantu produsen memahami cakupan CRA, klasifikasi produk, kematangan organisasi, dan kesiapan pelaporan.',
        detail:
          'Dibangun dengan model kematangan UKM yang mengacu pada ENISA, dilengkapi pertanyaan jelas, panduan bersumber, dan jalur peningkatan yang praktis.',
        note: 'AuCRA Compass sepenuhnya gratis. Buka dan coba asesmen untuk produk Anda sendiri.',
        cta: 'Coba AuCRA Compass',
      },
      insight: {
        type: 'Dokumentasi risiko',
        title: 'AuCRA Insight',
        description:
          'Ruang kerja berbasis EN 40000 untuk konteks produk, asesmen dan penanganan risiko keamanan siber, bukti, SBOM, serta pembuatan laporan yang dapat diaudit.',
        detail:
          'Platform ini mengubah alur dokumentasi yang kompleks menjadi sistem kolaboratif dan terstruktur, tanpa menggantikan nasihat hukum atau penilaian kesesuaian.',
        cta: 'Buka AuCRA Insight',
      },
      shield: {
        type: 'Operasi PSIRT',
        title: 'AuCRA Shield',
        description:
          'Platform PSIRT berbasis CRA untuk penerimaan, asesmen, remediasi, pengungkapan, pemantauan kerentanan, dan pelaporan berbasis bukti.',
        detail:
          'Alur kasusnya mengikuti prEN 40000-1-3 dan menjaga keterlacakan sejak laporan pertama hingga publikasi advisori dan penutupan.',
        cta: 'Buka AuCRA Shield',
      },
    },
    aboutTitle: 'Tentang saya',
    summary: [
      'Saya adalah mahasiswa PhD Teknik Elektro di National Taiwan University of Science and Technology (NTUST). Riset saya berfokus pada asesmen keamanan siber, integrasi machine learning dan AI, serta pengembangan standar dan regulasi keamanan siber.',
      'Melalui kolaborasi industri di Indonesia dan Taiwan, saya mengembangkan modul pembelajaran DCS/SCADA, menyelaraskan keamanan siber dengan regulasi, menguji perangkat nyata, menyusun laporan kepatuhan terstandar, dan membangun sistem berpaten untuk menghasilkan dokumentasi Security Target berdasarkan EUCC dan ENISA.',
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
    portraitAlt: '個人照片',
    hero: '將資安標準，轉化成真正好用的工具。',
    intro: '我是臺科大電機工程博士研究生，專注於資安評估、人工智慧與實務合規系統。',
    seePlatforms: '看看這些平台',
    emailMe: '與我聯絡',
    workTitle: '精選作品',
    workLead:
      '三個平台陪伴製造商走完《網路韌性法》的歷程：從初步準備度檢視、風險文件，到產品上市後的漏洞處理。',
    aurayText:
      '三者皆與亞洲第一家 OTIC & Security 實驗室耀睿科技共同打造，我在那裡擔任《網路韌性法》顧問。',
    aurayLink: '認識耀睿科技',
    watchDemo: (seconds) => `播放示範影片（${seconds} 秒）`,
    previewUnavailable: '您的瀏覽器不支援此影片預覽。',
    platforms: {
      compass: {
        type: '中小企業準備度評估',
        title: 'AuCRA Compass',
        description:
          '引導製造商了解 CRA 適用範圍、產品分類、組織成熟度與通報準備度的初步評估工具。',
        detail:
          '以 ENISA 中小企業成熟度模型為基礎，透過明確問題、來源指引與可執行的改善路徑完成評估。',
        note: 'AuCRA Compass 完全免費，歡迎開啟並用自己的產品試做一次評估。',
        cta: '試用 AuCRA Compass',
      },
      insight: {
        type: '風險文件管理',
        title: 'AuCRA Insight',
        description:
          '依循 EN 40000 的工作空間，整合產品脈絡、資安風險評估與處理、佐證、SBOM 及可稽核報告。',
        detail: '將繁複的文件流程轉為結構化協作系統，同時清楚界定其不取代法律或符合性評鑑建議。',
        cta: '開啟 AuCRA Insight',
      },
      shield: {
        type: 'PSIRT 營運',
        title: 'AuCRA Shield',
        description:
          '以 CRA 為基礎的 PSIRT 平台，涵蓋漏洞接收、評估、修補、揭露、監控與佐證式報告。',
        detail: '案件流程遵循 prEN 40000-1-3，從首次通報到安全公告發布與結案，全程維持可追溯性。',
        cta: '開啟 AuCRA Shield',
      },
    },
    aboutTitle: '關於我',
    summary: [
      '我是國立臺灣科技大學電機工程博士研究生。研究聚焦於資安評估、機器學習與人工智慧整合，以及資安標準與法規的發展。',
      '在印尼與台灣的產學合作中，我曾開發 DCS／SCADA 教學模組、整合現行資安法規、測試實體設備、製作標準化合規報告，並開發且取得一套依 EUCC／ENISA 自動產生 Security Target 文件的系統專利。',
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
  return 'en'
}

function Portrait({ alt }: { alt: string }) {
  if (PORTRAIT_SRC) {
    return <img src={PORTRAIT_SRC} alt={alt} width={800} height={1000} />
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
            <Play aria-hidden="true" />
            {label}
          </span>
        </button>
      )}
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

          <div className="itsme__auray">
            <span className="itsme__auray-logo">
              <img src="/itsme/auray-logo.svg" alt="Auray Technology" width={162} height={45} />
            </span>
            <p>{copy.aurayText}</p>
            <a className="itsme__text-link" href={AURAY_URL} target="_blank" rel="noreferrer">
              {copy.aurayLink}
              <ArrowUpRight aria-hidden="true" />
            </a>
          </div>

          <div className="itsme__platforms">
            {PLATFORMS.map((platform) => {
              const text = copy.platforms[platform.key]
              const Icon = platform.icon
              const host = new URL(platform.href).host
              return (
                <article
                  key={platform.key}
                  className="itsme__platform"
                  aria-labelledby={`platform-${platform.key}`}
                >
                  <Demo
                    key={`${platform.key}-${mediaLanguage}`}
                    src={`/itsme/aucra-${platform.key}-${mediaLanguage}.mp4`}
                    poster={`/itsme/poster-${platform.key}-${mediaLanguage}.jpg`}
                    title={text.title}
                    label={copy.watchDemo(platform.seconds)}
                    unavailable={copy.previewUnavailable}
                  />
                  <div className="itsme__platform-copy">
                    <p className="itsme__platform-type">
                      <Icon aria-hidden="true" />
                      {text.type}
                    </p>
                    <h3 id={`platform-${platform.key}`}>{text.title}</h3>
                    <p>{text.description}</p>
                    <p className="itsme__platform-detail">{text.detail}</p>
                    {text.note && <p className="itsme__free">{text.note}</p>}
                    <div className="itsme__platform-actions">
                      <a
                        className={
                          platform.free ? 'itsme__button itsme__button--primary' : 'itsme__button'
                        }
                        href={platform.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {text.cta}
                        <ArrowUpRight aria-hidden="true" />
                      </a>
                      <span className="itsme__host">{host}</span>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
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
