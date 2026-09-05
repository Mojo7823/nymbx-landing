import { describe, expect, it } from 'vitest'
import {
  corePath,
  DEFAULT_LANGS,
  LANG_VERSION,
  LANGUAGES,
  langPath,
  langPrefetchItems,
  langsParam,
  normalizeLangs,
  publicUrl,
  workerPath,
} from './ocrEngine'

const ORIGIN = 'http://localhost:3000'

describe('language catalog', () => {
  it('covers the four shipped languages with unique ids', () => {
    expect(LANGUAGES.map((l) => l.id)).toEqual(['eng', 'chi_tra', 'chi_sim', 'ind'])
    expect(new Set(LANGUAGES.map((l) => l.id)).size).toBe(LANGUAGES.length)
  })

  it('carries a label, a native label and an exact byte size for each', () => {
    for (const lang of LANGUAGES) {
      expect(lang.label.length).toBeGreaterThan(0)
      expect(lang.nativeLabel.length).toBeGreaterThan(0)
      expect(lang.bytes).toBeGreaterThan(0)
      expect(Number.isInteger(lang.bytes)).toBe(true)
    }
  })

  it('defaults to English, which is in the catalog', () => {
    expect(DEFAULT_LANGS).toEqual(['eng'])
    expect(LANGUAGES.some((l) => l.id === DEFAULT_LANGS[0])).toBe(true)
  })
})

describe('normalizeLangs', () => {
  it('keeps known ids in catalog order', () => {
    expect(normalizeLangs(['ind', 'eng'])).toEqual(['eng', 'ind'])
  })

  it('drops unknown ids', () => {
    expect(normalizeLangs(['eng', 'klingon'])).toEqual(['eng'])
  })

  it('falls back to the default for anything unusable', () => {
    expect(normalizeLangs(undefined)).toEqual(DEFAULT_LANGS)
    expect(normalizeLangs([])).toEqual(DEFAULT_LANGS)
    expect(normalizeLangs('eng')).toEqual(DEFAULT_LANGS)
    expect(normalizeLangs(['nope'])).toEqual(DEFAULT_LANGS)
  })
})

describe('langsParam', () => {
  it('joins with + the way tesseract.js expects', () => {
    expect(langsParam(['eng'])).toBe('eng')
    expect(langsParam(['chi_tra', 'eng'])).toBe('chi_tra+eng')
  })
})

describe('URL building', () => {
  it('resolves against the site root by default', () => {
    expect(publicUrl('ocr/engine/manifest.json', '/')).toBe(`${ORIGIN}/ocr/engine/manifest.json`)
  })

  it('honours a non-root deploy base', () => {
    expect(publicUrl('ocr/engine/manifest.json', '/toolbox/')).toBe(
      `${ORIGIN}/toolbox/ocr/engine/manifest.json`,
    )
  })

  it('tolerates a base without a trailing slash and a leading slash on the path', () => {
    expect(publicUrl('/ocr/x', '/toolbox')).toBe(`${ORIGIN}/toolbox/ocr/x`)
  })

  it('never gives langPath a trailing slash (tesseract.js appends its own)', () => {
    expect(langPath('/')).toBe(`${ORIGIN}/ocr/lang/${LANG_VERSION}`)
    expect(langPath('/toolbox/')).toBe(`${ORIGIN}/toolbox/ocr/lang/${LANG_VERSION}`)
    expect(langPath('/').endsWith('/')).toBe(false)
  })

  it('points corePath at the directory, not a single core file', () => {
    expect(corePath('7.0.0', '/')).toBe(`${ORIGIN}/ocr/engine/7.0.0/core`)
    expect(corePath('7.0.0', '/').endsWith('.js')).toBe(false)
  })

  it('points workerPath at worker.min.js', () => {
    expect(workerPath('7.0.0', '/')).toBe(`${ORIGIN}/ocr/engine/7.0.0/worker.min.js`)
  })

  it('keeps every URL on our own origin, never a CDN', () => {
    const urls = [
      publicUrl('ocr/engine/manifest.json'),
      langPath(),
      corePath('7.0.0'),
      workerPath('7.0.0'),
      ...langPrefetchItems(['eng', 'ind']).map((i) => i.url),
    ]
    for (const url of urls) {
      expect(new URL(url).origin).toBe(ORIGIN)
    }
  })
})

describe('langPrefetchItems', () => {
  it('maps the selection to gzipped pack URLs with their exact sizes', () => {
    const items = langPrefetchItems(['ind'])
    expect(items).toEqual([
      {
        url: `${ORIGIN}/ocr/lang/${LANG_VERSION}/ind.traineddata.gz`,
        size: LANGUAGES.find((l) => l.id === 'ind')!.bytes,
      },
    ])
  })

  it('returns them in catalog order and skips unselected languages', () => {
    expect(langPrefetchItems(['ind', 'eng']).map((i) => i.url.split('/').pop())).toEqual([
      'eng.traineddata.gz',
      'ind.traineddata.gz',
    ])
    expect(langPrefetchItems([])).toEqual([])
  })
})
