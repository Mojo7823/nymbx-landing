import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  ChartNoAxesCombined,
  Compass,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import { ThemeToggle } from '../components/ThemeToggle'
import './its-me.css'

type Language = 'en' | 'id' | 'zh-TW'
type ProjectKey = 'auray' | 'compass' | 'insight' | 'shield'

const LANGUAGES: { code: Language; label: string; short: string }[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'id', label: 'Bahasa Indonesia', short: 'ID' },
  { code: 'zh-TW', label: '繁體中文', short: '繁中' },
]

const COPY = {
  en: {
    role: 'Cybersecurity researcher & platform builder',
    hero: 'Turning cybersecurity standards into tools people can use.',
    intro:
      'I am a PhD researcher at NTUST, working across cybersecurity assessment, AI, and practical compliance systems.',
    explore: 'Explore selected work',
    workLabel: 'Selected work',
    workTitle: 'Research translated into working platforms.',
    workIntro:
      'Choose a project to see how each platform supports a different part of cyber resilience.',
    previous: 'Previous project',
    next: 'Next project',
    visit: 'Visit Auray Technology',
    previewUnavailable: 'Your browser does not support this video preview.',
    projectOf: (n: number) => `Project ${n} of 4`,
    auray: {
      nav: 'Auray Company',
      type: 'Company',
      title: 'Auray Technology',
      description:
        'Asia’s first OTIC & Security Laboratory, providing independent testing, verification, and cybersecurity consulting across O-RAN, connected products, and international standards.',
      detail:
        'My current industry collaboration: building practical Cyber Resilience Act assessment and vulnerability-handling platforms with Auray’s cybersecurity team.',
    },
    compass: {
      nav: 'AuCRA Compass',
      type: 'SME readiness assessment',
      title: 'AuCRA Compass',
      description:
        'A guided initial assessment that helps manufacturers understand CRA scope, product classification, organizational maturity, and reporting readiness.',
      detail:
        'Built around an ENISA-informed SME maturity model, with clear questions, cited guidance, and a practical improvement path.',
    },
    insight: {
      nav: 'AuCRA Insight',
      type: 'Risk documentation',
      title: 'AuCRA Insight',
      description:
        'An EN 40000-oriented workspace for product context, cybersecurity risk assessment, treatment, evidence, SBOMs, and auditable report generation.',
      detail:
        'It turns a demanding documentation workflow into a structured, collaborative system without presenting itself as a substitute for conformity or legal advice.',
    },
    shield: {
      nav: 'AuCRA Shield',
      type: 'PSIRT operations',
      title: 'AuCRA Shield',
      description:
        'A CRA-based PSIRT platform for vulnerability intake, assessment, remediation, disclosure, monitoring, and evidence-backed reporting.',
      detail:
        'Its guarded case workflow follows prEN 40000-1-3, helping teams maintain traceability from the first report through advisory publication and closure.',
    },
    aboutLabel: 'Profile',
    aboutTitle: 'About me',
    summary: [
      'I am a PhD student in Electrical Engineering at the National Taiwan University of Science and Technology (NTUST). My research focuses on cybersecurity assessment, machine learning and AI integration, and the development of cybersecurity standards and regulations.',
      'Across collaborations in Indonesia and Taiwan, I have developed DCS/SCADA study modules, aligned cybersecurity work with current regulation, tested real devices, produced standardized compliance reports, and built a patented system for generating Security Target documentation based on EUCC and ENISA requirements.',
    ],
    educationLabel: 'Education',
    experienceLabel: 'Applied research',
    present: 'Present',
    degreeAssociate: 'Associate degree · Electrical Engineering, Computer Control',
    degreeBachelor: 'Bachelor of Applied Engineering · Automation Engineering',
    degreeMaster: 'Master’s degree · Electrical Engineering',
    degreePhd: 'PhD · Electrical Engineering',
    its: 'Institut Teknologi Sepuluh Nopember · Indonesia',
    ntust: 'National Taiwan University of Science and Technology · Taiwan',
    experience: [
      {
        years: '2022–2023 · Taiwan',
        title: 'EUCC / ENISA cybersecurity regulation research',
        org: 'Taiwan Association of Information and Communication Standards (TAICS)',
        text: 'Analyzed EUCC and ENISA requirements using vendor devices, conducted OWASP penetration testing, designed attack scenarios, evaluated compliance, and authored Security Target, assurance-requirement, and evaluator test documentation.',
      },
      {
        years: '2023–2024',
        title: 'Common Criteria security documentation system',
        org: 'Industrial Technology Research Institute & TAICS',
        text: 'Built a desktop application combining machine learning, decision trees, and a rule-based expert system to automate Security Target document generation aligned with Common Criteria and EUCC structures.',
      },
      {
        years: '2025–2026',
        title: 'Cyber Resilience Act consultant & platform builder',
        org: 'Auray Technology',
        text: 'Built applications for EN 40000-1-2 assessment, EN 40000-1-3 PSIRT operations, and ENISA-informed SME initial assessment across the wider CRA architecture.',
      },
    ],
    contactLabel: 'Contact',
    contactTitle: 'Research, regulation, or a useful new problem?',
    contactText:
      'I am always interested in thoughtful collaborations across cybersecurity and applied research.',
    emailMe: 'Email me',
    footer: 'Cybersecurity research · Taiwan & Indonesia',
  },
  id: {
    role: 'Peneliti keamanan siber & pengembang platform',
    hero: 'Mengubah standar keamanan siber menjadi alat yang dapat digunakan.',
    intro:
      'Saya adalah peneliti PhD di NTUST yang berfokus pada asesmen keamanan siber, AI, dan sistem kepatuhan yang praktis.',
    explore: 'Lihat karya pilihan',
    workLabel: 'Karya pilihan',
    workTitle: 'Riset yang diwujudkan menjadi platform.',
    workIntro:
      'Pilih proyek untuk melihat bagaimana setiap platform mendukung bagian berbeda dari ketahanan siber.',
    previous: 'Proyek sebelumnya',
    next: 'Proyek berikutnya',
    visit: 'Kunjungi Auray Technology',
    previewUnavailable: 'Peramban Anda tidak mendukung pratinjau video ini.',
    projectOf: (n: number) => `Proyek ${n} dari 4`,
    auray: {
      nav: 'Auray Company',
      type: 'Perusahaan',
      title: 'Auray Technology',
      description:
        'Laboratorium OTIC & Security pertama di Asia yang menyediakan pengujian independen, verifikasi, dan konsultasi keamanan siber untuk O-RAN, produk terkoneksi, dan standar internasional.',
      detail:
        'Kolaborasi industri saya saat ini adalah membangun platform asesmen Cyber Resilience Act dan penanganan kerentanan bersama tim keamanan siber Auray.',
    },
    compass: {
      nav: 'AuCRA Compass',
      type: 'Asesmen kesiapan UKM',
      title: 'AuCRA Compass',
      description:
        'Asesmen awal terpandu untuk membantu produsen memahami cakupan CRA, klasifikasi produk, kematangan organisasi, dan kesiapan pelaporan.',
      detail:
        'Dibangun dengan model kematangan UKM yang mengacu pada ENISA, dilengkapi pertanyaan jelas, panduan bersumber, dan jalur peningkatan yang praktis.',
    },
    insight: {
      nav: 'AuCRA Insight',
      type: 'Dokumentasi risiko',
      title: 'AuCRA Insight',
      description:
        'Ruang kerja berbasis EN 40000 untuk konteks produk, asesmen dan penanganan risiko keamanan siber, bukti, SBOM, serta pembuatan laporan yang dapat diaudit.',
      detail:
        'Platform ini mengubah alur dokumentasi yang kompleks menjadi sistem kolaboratif dan terstruktur, tanpa menggantikan nasihat hukum atau penilaian kesesuaian.',
    },
    shield: {
      nav: 'AuCRA Shield',
      type: 'Operasi PSIRT',
      title: 'AuCRA Shield',
      description:
        'Platform PSIRT berbasis CRA untuk penerimaan, asesmen, remediasi, pengungkapan, pemantauan kerentanan, dan pelaporan berbasis bukti.',
      detail:
        'Alur kasusnya mengikuti prEN 40000-1-3 dan menjaga keterlacakan sejak laporan pertama hingga publikasi advisori dan penutupan.',
    },
    aboutLabel: 'Profil',
    aboutTitle: 'Tentang saya',
    summary: [
      'Saya adalah mahasiswa PhD Teknik Elektro di National Taiwan University of Science and Technology (NTUST). Riset saya berfokus pada asesmen keamanan siber, integrasi machine learning dan AI, serta pengembangan standar dan regulasi keamanan siber.',
      'Melalui kolaborasi industri di Indonesia dan Taiwan, saya mengembangkan modul pembelajaran DCS/SCADA, menyelaraskan keamanan siber dengan regulasi, menguji perangkat nyata, menyusun laporan kepatuhan terstandar, dan membangun sistem berpaten untuk menghasilkan dokumentasi Security Target berdasarkan EUCC dan ENISA.',
    ],
    educationLabel: 'Pendidikan',
    experienceLabel: 'Riset terapan',
    present: 'Sekarang',
    degreeAssociate: 'Ahli Madya · Teknik Elektro, Teknik Komputer Kontrol',
    degreeBachelor: 'Sarjana Terapan · Teknik Otomasi',
    degreeMaster: 'Magister · Teknik Elektro',
    degreePhd: 'PhD · Teknik Elektro',
    its: 'Institut Teknologi Sepuluh Nopember · Indonesia',
    ntust: 'National Taiwan University of Science and Technology · Taiwan',
    experience: [
      {
        years: '2022–2023 · Taiwan',
        title: 'Riset regulasi keamanan siber EUCC / ENISA',
        org: 'Taiwan Association of Information and Communication Standards (TAICS)',
        text: 'Menganalisis EUCC dan ENISA menggunakan perangkat vendor, melakukan penetration test OWASP, merancang skenario serangan, mengevaluasi kepatuhan, serta menyusun Security Target, persyaratan jaminan, dan laporan pengujian evaluator.',
      },
      {
        years: '2023–2024',
        title: 'Sistem dokumentasi keamanan Common Criteria',
        org: 'Industrial Technology Research Institute & TAICS',
        text: 'Membangun aplikasi desktop yang menggabungkan machine learning, decision tree, dan rule-based expert system untuk mengotomatisasi dokumen Security Target yang selaras dengan struktur Common Criteria dan EUCC.',
      },
      {
        years: '2025–2026',
        title: 'Konsultan Cyber Resilience Act & pengembang platform',
        org: 'Auray Technology',
        text: 'Membangun aplikasi asesmen EN 40000-1-2, operasi PSIRT EN 40000-1-3, dan asesmen awal UKM berbasis ENISA dalam arsitektur CRA yang lebih luas.',
      },
    ],
    contactLabel: 'Kontak',
    contactTitle: 'Riset, regulasi, atau masalah baru yang bermanfaat?',
    contactText:
      'Saya terbuka untuk kolaborasi yang bermakna dalam keamanan siber dan riset terapan.',
    emailMe: 'Hubungi saya',
    footer: 'Riset keamanan siber · Taiwan & Indonesia',
  },
  'zh-TW': {
    role: '資安研究者與平台開發者',
    hero: '將資安標準，轉化成真正好用的工具。',
    intro: '我是臺科大電機工程博士研究生，專注於資安評估、人工智慧與實務合規系統。',
    explore: '瀏覽精選作品',
    workLabel: '精選作品',
    workTitle: '讓研究成為可實際運作的平台。',
    workIntro: '選擇一項專案，了解每個平台如何支援不同階段的網路韌性工作。',
    previous: '上一個專案',
    next: '下一個專案',
    visit: '前往耀睿科技',
    previewUnavailable: '您的瀏覽器不支援此影片預覽。',
    projectOf: (n: number) => `第 ${n} 個專案，共 4 個`,
    auray: {
      nav: '耀睿科技',
      type: '公司',
      title: '耀睿科技',
      description:
        '亞洲第一家 OTIC & Security 實驗室，提供 O-RAN、連網產品及國際標準的獨立測試、驗證與資安顧問服務。',
      detail: '我目前與耀睿資安團隊合作，打造實務導向的《網路韌性法》評估及漏洞處理平台。',
    },
    compass: {
      nav: 'AuCRA Compass',
      type: '中小企業準備度評估',
      title: 'AuCRA Compass',
      description: '引導製造商了解 CRA 適用範圍、產品分類、組織成熟度與通報準備度的初步評估工具。',
      detail:
        '以 ENISA 中小企業成熟度模型為基礎，透過明確問題、來源指引與可執行的改善路徑完成評估。',
    },
    insight: {
      nav: 'AuCRA Insight',
      type: '風險文件管理',
      title: 'AuCRA Insight',
      description:
        '依循 EN 40000 的工作空間，整合產品脈絡、資安風險評估與處理、佐證、SBOM 及可稽核報告。',
      detail: '將繁複的文件流程轉為結構化協作系統，同時清楚界定其不取代法律或符合性評鑑建議。',
    },
    shield: {
      nav: 'AuCRA Shield',
      type: 'PSIRT 營運',
      title: 'AuCRA Shield',
      description: '以 CRA 為基礎的 PSIRT 平台，涵蓋漏洞接收、評估、修補、揭露、監控與佐證式報告。',
      detail: '案件流程遵循 prEN 40000-1-3，從首次通報到安全公告發布與結案，全程維持可追溯性。',
    },
    aboutLabel: '個人簡介',
    aboutTitle: '關於我',
    summary: [
      '我是國立臺灣科技大學電機工程博士研究生。研究聚焦於資安評估、機器學習與人工智慧整合，以及資安標準與法規的發展。',
      '在印尼與台灣的產學合作中，我曾開發 DCS／SCADA 教學模組、整合現行資安法規、測試實體設備、製作標準化合規報告，並開發且取得一套依 EUCC／ENISA 自動產生 Security Target 文件的系統專利。',
    ],
    educationLabel: '學歷',
    experienceLabel: '應用研究',
    present: '至今',
    degreeAssociate: '副學士 · 電機工程（電腦控制組）',
    degreeBachelor: '應用工程學士 · 自動化工程',
    degreeMaster: '碩士 · 電機工程',
    degreePhd: '博士 · 電機工程',
    its: '泗水理工學院 · 印尼',
    ntust: '國立臺灣科技大學 · 台灣',
    experience: [
      {
        years: '2022–2023 · 台灣',
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
    contactLabel: '聯絡',
    contactTitle: '研究、法規，或值得解決的新問題？',
    contactText: '歡迎交流資安與應用研究領域中具實質意義的合作。',
    emailMe: '與我聯絡',
    footer: '資安研究 · 台灣與印尼',
  },
} as const

const KEYS: ProjectKey[] = ['auray', 'compass', 'insight', 'shield']
const ICONS = {
  auray: Building2,
  compass: Compass,
  insight: ChartNoAxesCombined,
  shield: ShieldCheck,
} as const
const VIDEOS = {
  compass: { en: '/itsme/aucra-compass-en.mp4', 'zh-TW': '/itsme/aucra-compass-tw.mp4' },
  insight: { en: '/itsme/aucra-insight-en.mp4', 'zh-TW': '/itsme/aucra-insight-tw.mp4' },
  shield: { en: '/itsme/aucra-shield-en.mp4', 'zh-TW': '/itsme/aucra-shield-tw.mp4' },
} as const

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

export default function ItsMe() {
  useMetadata()
  const [language, setLanguage] = useState<Language>(initialLanguage)
  const [active, setActive] = useState(0)
  const copy = COPY[language]
  const key = KEYS[active]
  const project = copy[key]
  const Icon = ICONS[key]
  const videoLanguage = language === 'zh-TW' ? 'zh-TW' : 'en'
  const changeLanguage = (next: Language) => {
    setLanguage(next)
    try {
      localStorage.setItem('nymbx:itsme-language', next)
    } catch {
      /* session only */
    }
  }
  const move = (direction: -1 | 1) =>
    setActive((current) => (current + direction + KEYS.length) % KEYS.length)

  return (
    <div className="itsme min-h-dvh" lang={language}>
      <div className="itsme__controls" aria-label="Page controls">
        <div className="itsme__languages" aria-label="Language">
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

      <main id="top">
        <section className="itsme__hero" aria-labelledby="itsme-heading">
          <p className="itsme__eyebrow">{copy.role}</p>
          <h1 id="itsme-heading">{copy.hero}</h1>
          <p className="itsme__intro">{copy.intro}</p>
          <a className="itsme__text-link" href="#work">
            {copy.explore} <ArrowRight aria-hidden="true" />
          </a>
        </section>

        <section id="work" className="itsme__work" aria-labelledby="work-heading">
          <div className="itsme__section-heading">
            <div>
              <p className="itsme__eyebrow">{copy.workLabel}</p>
              <h2 id="work-heading">{copy.workTitle}</h2>
            </div>
            <p>{copy.workIntro}</p>
          </div>
          <div className="itsme__project-tabs" role="tablist" aria-label={copy.workLabel}>
            {KEYS.map((item, index) => {
              const TabIcon = ICONS[item]
              return (
                <button
                  key={item}
                  type="button"
                  id={`project-tab-${item}`}
                  role="tab"
                  aria-selected={active === index}
                  aria-controls="project-panel"
                  tabIndex={active === index ? 0 : -1}
                  className={active === index ? 'is-active' : undefined}
                  onClick={() => setActive(index)}
                >
                  <span className="itsme__project-icon">
                    <TabIcon aria-hidden="true" />
                  </span>
                  <span>{copy[item].nav}</span>
                </button>
              )
            })}
          </div>
          <div
            className="itsme__project-panel"
            id="project-panel"
            role="tabpanel"
            aria-labelledby={`project-tab-${key}`}
          >
            <div className={`itsme__media itsme__media--${key}`}>
              {key === 'auray' ? (
                <div className="itsme__company-card">
                  <img src="/itsme/auray-logo.svg" alt="Auray Technology" />
                  <span>OTIC &amp; Security Laboratory</span>
                </div>
              ) : (
                <video
                  key={`${key}-${videoLanguage}`}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={`${project.title} video preview`}
                >
                  <source src={VIDEOS[key][videoLanguage]} type="video/mp4" />
                  {copy.previewUnavailable}
                </video>
              )}
            </div>
            <article className="itsme__project-copy">
              <div className="itsme__project-count">
                <Icon aria-hidden="true" />
                <span>{copy.projectOf(active + 1)}</span>
              </div>
              <p className="itsme__project-type">{project.type}</p>
              <h3>{project.title}</h3>
              <p>{project.description}</p>
              <p className="itsme__project-detail">{project.detail}</p>
              {key === 'auray' && (
                <a
                  href="https://www.auray.com.tw/en/about/company/"
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy.visit} <ArrowUpRight aria-hidden="true" />
                </a>
              )}
              <div className="itsme__carousel-controls">
                <button type="button" onClick={() => move(-1)} aria-label={copy.previous}>
                  <ArrowLeft aria-hidden="true" />
                </button>
                <span aria-hidden="true">{String(active + 1).padStart(2, '0')} / 04</span>
                <button type="button" onClick={() => move(1)} aria-label={copy.next}>
                  <ArrowRight aria-hidden="true" />
                </button>
              </div>
            </article>
          </div>
        </section>

        <section className="itsme__profile" aria-labelledby="about-heading">
          <div className="itsme__profile-summary">
            <p className="itsme__eyebrow">{copy.aboutLabel}</p>
            <h2 id="about-heading">{copy.aboutTitle}</h2>
            {copy.summary.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="itsme__history">
            <div className="itsme__history-column">
              <h3>{copy.educationLabel}</h3>
              <ol>
                <li>
                  <time>2015–2019</time>
                  <strong>{copy.degreeAssociate}</strong>
                  <span>{copy.its}</span>
                </li>
                <li>
                  <time>2020–2021</time>
                  <strong>{copy.degreeBachelor}</strong>
                  <span>{copy.its}</span>
                </li>
                <li>
                  <time>2022–2023</time>
                  <strong>{copy.degreeMaster}</strong>
                  <span>{copy.ntust}</span>
                </li>
                <li>
                  <time>2023–{copy.present}</time>
                  <strong>{copy.degreePhd}</strong>
                  <span>{copy.ntust}</span>
                </li>
              </ol>
            </div>
            <div className="itsme__history-column">
              <h3>{copy.experienceLabel}</h3>
              <ol>
                {copy.experience.map((item) => (
                  <li key={item.title}>
                    <time>{item.years}</time>
                    <strong>{item.title}</strong>
                    <span>{item.org}</span>
                    <p>{item.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="itsme__contact" aria-labelledby="contact-heading">
          <div>
            <p className="itsme__eyebrow">{copy.contactLabel}</p>
            <h2 id="contact-heading">{copy.contactTitle}</h2>
            <p>{copy.contactText}</p>
          </div>
          <a href="mailto:admin@nymbx.dev">
            <Mail aria-hidden="true" />
            <span>{copy.emailMe}</span>
            <ArrowUpRight aria-hidden="true" />
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
