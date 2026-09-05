import { statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LANGUAGES, LANG_VERSION } from './ocrEngine'

/**
 * Caddy serves the language packs raw, so `prefetchUrls` asserts each body is
 * exactly the catalog size. A drifted `bytes` value would fail OCR in
 * production for that language while passing every other test — pin the
 * catalog to the committed files.
 */
describe('OCR language catalog', () => {
  it.each(LANGUAGES.map((l) => [l.id, l.bytes] as const))(
    '%s.traineddata.gz on disk matches the catalog size',
    (id, bytes) => {
      const file = join(
        process.cwd(),
        'public',
        'ocr',
        'lang',
        LANG_VERSION,
        `${id}.traineddata.gz`,
      )
      expect(statSync(file).size).toBe(bytes)
    },
  )
})
