export type Lang = 'en' | 'id' | 'zh'

const STORAGE_KEY = 'nymbx:lang'

export const LANG_OPTIONS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'zh', label: '繁體中文' },
]

/** Value for <html lang>, so screen readers pick the right voice. */
export const htmlLang: Record<Lang, string> = {
  en: 'en',
  id: 'id',
  zh: 'zh-Hant',
}

const ID_TIMEZONES = new Set(['Asia/Jakarta', 'Asia/Pontianak', 'Asia/Makassar', 'Asia/Jayapura'])

function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'id' || value === 'zh'
}

/**
 * Saved choice first; otherwise region, inferred offline from the device
 * timezone (Indonesia → id, Taiwan → zh); otherwise the browser language;
 * English as the fallback. No geolocation service is ever called.
 */
export function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLang(stored)) return stored
  } catch {
    /* private mode — fall through to detection */
  }

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz && ID_TIMEZONES.has(tz)) return 'id'
    if (tz === 'Asia/Taipei') return 'zh'
  } catch {
    /* Intl unavailable — fall through to browser language */
  }

  for (const raw of navigator.languages ?? [navigator.language]) {
    const tag = raw.toLowerCase()
    if (tag.startsWith('id')) return 'id'
    if (tag.startsWith('zh') && /hant|tw|hk|mo/.test(tag)) return 'zh'
  }
  return 'en'
}

export function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* private mode — choice just won't persist */
  }
}

export interface LandingStrings {
  docTitle: string
  nav: { projects: string; contact: string }
  hero: {
    kicker: string
    /** Last entry of the collaborator reel: the open invitation. */
    you: string
    hint: string
    paragraph: string
    viewProjects: string
    openToolbox: string
  }
  projects: { kicker: string; heading: string; counterLabel: string }
  status: { live: string; soon: string }
  contact: {
    kicker: string
    heading: string
    body: string
    tryToolbox: string
  }
  dialog: { close: string }
}

export const STRINGS: Record<Lang, LandingStrings> = {
  en: {
    docTitle: 'NYMBX · projects, tools and compliance software',
    nav: { projects: 'Projects', contact: 'Contact' },
    hero: {
      kicker: 'Product studio · Compliance & privacy software',
      you: 'You?',
      hint: 'hover me',
      paragraph:
        'I help teams ship secure, compliant products. That means EU Cyber Resilience Act documentation, security assessments, and small tools that put privacy first. Currently working with Auray Technology.',
      viewProjects: 'View projects',
      openToolbox: 'Open the toolbox',
    },
    projects: {
      kicker: 'Current projects',
      heading: "What I'm building",
      counterLabel: 'projects',
    },
    status: { live: 'Live', soon: 'Coming soon' },
    contact: {
      kicker: 'Contact',
      heading: 'Contact me?',
      body: "Compliance tooling, a CRA question, or something that should exist and doesn't yet. Send a note and I'll reply.",
      tryToolbox: 'Try the toolbox',
    },
    dialog: { close: 'Close' },
  },
  id: {
    docTitle: 'NYMBX · proyek, perkakas, dan perangkat lunak kepatuhan',
    nav: { projects: 'Proyek', contact: 'Kontak' },
    hero: {
      kicker: 'Studio produk · Perangkat lunak kepatuhan & privasi',
      you: 'Anda?',
      hint: 'arahkan kursor',
      paragraph:
        'Saya membantu tim merilis produk yang aman dan patuh regulasi. Mulai dari dokumentasi EU Cyber Resilience Act, asesmen keamanan, sampai perkakas kecil yang mengutamakan privasi. Saat ini bekerja sama dengan Auray Technology.',
      viewProjects: 'Lihat proyek',
      openToolbox: 'Buka toolbox',
    },
    projects: {
      kicker: 'Proyek saat ini',
      heading: 'Yang sedang saya bangun',
      counterLabel: 'proyek',
    },
    status: { live: 'Live', soon: 'Segera hadir' },
    contact: {
      kicker: 'Kontak',
      heading: 'Hubungi saya?',
      body: 'Perkakas kepatuhan, pertanyaan seputar CRA, atau ide yang seharusnya ada tapi belum dibuat. Kirim pesan, pasti saya balas.',
      tryToolbox: 'Coba toolbox',
    },
    dialog: { close: 'Tutup' },
  },
  zh: {
    docTitle: 'NYMBX · 專案、工具與法遵軟體',
    nav: { projects: '專案', contact: '聯絡' },
    hero: {
      kicker: '產品工作室 · 法遵與隱私軟體',
      you: '你？',
      hint: '移過來看看',
      paragraph:
        '我協助團隊打造安全、合規的產品：歐盟《網路韌性法案》文件、資安評估，以及以隱私為先的小工具。目前與 Auray Technology 合作。',
      viewProjects: '瀏覽專案',
      openToolbox: '開啟工具箱',
    },
    projects: {
      kicker: '進行中的專案',
      heading: '我正在打造的東西',
      counterLabel: '個專案',
    },
    status: { live: '已上線', soon: '即將推出' },
    contact: {
      kicker: '聯絡',
      heading: '聯絡我？',
      body: '法遵工具、CRA 相關問題，或你覺得應該存在卻還沒有人做的東西，寫封信給我，我會回覆。',
      tryToolbox: '試用工具箱',
    },
    dialog: { close: '關閉' },
  },
}
