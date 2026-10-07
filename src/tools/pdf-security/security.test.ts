// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  MAX_PDF_BYTES,
  securityWarnings,
  validatePdfInput,
  validateSecurityOptions,
} from './security'
import type { SecurityOptions } from './types'

function protect(userPassword = 'open-secret', ownerPassword = 'owner-secret'): SecurityOptions {
  return {
    mode: 'protect',
    inputPassword: '',
    userPassword,
    ownerPassword,
    permissions: { print: 'full', modify: 'all', extract: true },
  }
}

function expectOptionError(options: SecurityOptions, name: string) {
  expect(() => validateSecurityOptions(options)).toThrow(expect.objectContaining({ name }))
}

describe('PDF security password boundaries', () => {
  it('requires distinct nonempty new passwords', () => {
    expectOptionError(protect(''), 'PdfSecurityPasswordEmpty')
    expectOptionError(protect('open', ''), 'PdfSecurityPasswordEmpty')
    expectOptionError(protect('same', 'same'), 'PdfSecurityPasswordsEqual')
  })

  it('enforces 127 UTF-8 bytes, rather than characters, without truncation', () => {
    expectOptionError(protect('x'.repeat(128)), 'PdfSecurityPasswordTooLong')
    expectOptionError(protect('密'.repeat(42) + 'ab'), 'PdfSecurityPasswordTooLong')
    expectOptionError(protect('\u{20000}'.repeat(32)), 'PdfSecurityPasswordTooLong')
    expectOptionError(protect('open', 'x'.repeat(128)), 'PdfSecurityPasswordTooLong')
  })

  it('rejects NUL and unpaired surrogates rather than silently changing passwords', () => {
    expectOptionError({ mode: 'unlock', inputPassword: 'a\0b' }, 'PdfSecurityPasswordNul')
    expectOptionError(protect('a\0b'), 'PdfSecurityPasswordNul')
    expectOptionError(protect('open', '\0'), 'PdfSecurityPasswordNul')
    expectOptionError(protect('\ud800'), 'PdfSecurityPasswordUnicode')
    expectOptionError({ mode: 'unlock', inputPassword: '\udfff' }, 'PdfSecurityPasswordUnicode')
  })

  it('rejects invalid modes and permissions before reaching the engine', () => {
    expectOptionError(
      { mode: 'other', inputPassword: '' } as unknown as SecurityOptions,
      'PdfSecurityInvalidOptions',
    )
    expectOptionError(
      {
        ...protect(),
        permissions: { print: 'all', modify: 'none', extract: true },
      } as unknown as SecurityOptions,
      'PdfSecurityInvalidOptions',
    )
  })
})

describe('PDF security input envelope', () => {
  it('rejects empty and non-PDF files regardless of the claimed MIME type', async () => {
    await expect(validatePdfInput(new Blob())).rejects.toHaveProperty(
      'name',
      'PdfSecurityEmptyFile',
    )
    await expect(
      validatePdfInput(new Blob(['not a PDF'], { type: 'application/pdf' })),
    ).rejects.toHaveProperty('name', 'PdfSecurityNotPdf')
  })

  it('accepts a PDF header in the first 1024 bytes without trusting its filename or MIME', async () => {
    await expect(validatePdfInput(new Blob(['prefix\n%PDF-1.7\n']))).resolves.toBeUndefined()
    await expect(
      validatePdfInput(new Blob([' '.repeat(1024), '%PDF-1.7\n'])),
    ).rejects.toHaveProperty('name', 'PdfSecurityNotPdf')
  })

  it('allows exactly 50 MiB and rejects even one byte more', async () => {
    const padding = new Uint8Array(MAX_PDF_BYTES - 9)
    const limit = new Blob(['%PDF-1.7\n', padding])
    await expect(validatePdfInput(limit)).resolves.toBeUndefined()
    await expect(validatePdfInput(new Blob([limit, 'x']))).rejects.toHaveProperty(
      'name',
      'PdfSecurityFileTooLarge',
    )
  })
})

describe('PDF security error classification and privacy', () => {
  it('distinguishes a missing/wrong password from unreadable or unsupported PDFs without leaking diagnostics', () => {
    for (const [diagnostics, name] of [
      ['invalid password: private-password', 'PdfSecurityIncorrectPassword'],
      ['unable to find trailer: private-content', 'PdfSecurityCorruptPdf'],
      ['unsupported encryption filter: private-filter', 'PdfSecurityUnsupportedEncryption'],
    ] as const) {
      try {
        securityWarnings(2, diagnostics)
        expect.unreachable('An error status must not return warnings')
      } catch (error) {
        expect(error).toHaveProperty('name', name)
        expect(error).not.toHaveProperty('cause')
        expect(String(error)).not.toContain('private-')
      }
    }
  })
})
