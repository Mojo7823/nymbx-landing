import type { SecurityOptions } from './types'

export const MAX_PDF_BYTES = 50 * 1024 * 1024

export const SECURITY_ERROR_MESSAGES = {
  PdfSecurityEmptyFile: 'This file is empty. Choose a PDF with content.',
  PdfSecurityFileTooLarge: 'Choose a PDF no larger than 50 MiB.',
  PdfSecurityNotPdf: 'This file does not have a PDF header. Choose a valid PDF.',
  PdfSecurityPasswordNul: 'Passwords cannot contain a NUL character.',
  PdfSecurityPasswordUnicode: 'Passwords must contain valid Unicode characters.',
  PdfSecurityPasswordEmpty: 'Enter both an open password and an owner password.',
  PdfSecurityPasswordTooLong: 'Each new password must be at most 127 UTF-8 bytes.',
  PdfSecurityPasswordsEqual: 'Use different open and owner passwords.',
  PdfSecurityInvalidOptions: 'Choose valid security and permission options.',
  PdfSecurityIncorrectPassword:
    'The current PDF password is incorrect or missing. Enter a known open or owner password.',
  PdfSecurityCorruptPdf:
    'This PDF is corrupt or cannot be read. Export a fresh PDF from the original application.',
  PdfSecurityUnsupportedEncryption:
    'This PDF uses an unsupported encryption or security handler. Export a compatible copy from the original application.',
  PdfSecurityUnavailable:
    'The local PDF engine could not start. Use a current browser with cross-origin isolation, and load the tool online before using it offline.',
  PdfSecurityEngineFailure:
    'The local PDF engine could not complete this operation. Try a smaller PDF or export a fresh copy.',
} as const

export class SecurityError extends Error {
  constructor(name: keyof typeof SECURITY_ERROR_MESSAGES) {
    super(SECURITY_ERROR_MESSAGES[name])
    this.name = name
  }
}

function validatePassword(password: string, isNew: boolean): void {
  if (typeof password !== 'string') throw new SecurityError('PdfSecurityInvalidOptions')
  if (password.includes('\0')) throw new SecurityError('PdfSecurityPasswordNul')
  // TextEncoder replaces unpaired surrogates, which would silently change a password.
  for (const character of password) {
    const point = character.codePointAt(0)!
    if (point >= 0xd800 && point <= 0xdfff) {
      throw new SecurityError('PdfSecurityPasswordUnicode')
    }
  }
  if (!isNew) return
  if (!password.length) throw new SecurityError('PdfSecurityPasswordEmpty')
  if (new TextEncoder().encode(password).byteLength > 127) {
    throw new SecurityError('PdfSecurityPasswordTooLong')
  }
}

export function validateSecurityOptions(options: SecurityOptions): void {
  if (!options || (options.mode !== 'unlock' && options.mode !== 'protect')) {
    throw new SecurityError('PdfSecurityInvalidOptions')
  }
  validatePassword(options.inputPassword, false)
  if (options.mode === 'unlock') return
  validatePassword(options.userPassword, true)
  validatePassword(options.ownerPassword, true)
  if (options.userPassword === options.ownerPassword) {
    throw new SecurityError('PdfSecurityPasswordsEqual')
  }
  const permissions = options.permissions
  if (
    !permissions ||
    !['full', 'low', 'none'].includes(permissions.print) ||
    !['all', 'annotate', 'form', 'assembly', 'none'].includes(permissions.modify) ||
    typeof permissions.extract !== 'boolean'
  ) {
    throw new SecurityError('PdfSecurityInvalidOptions')
  }
}

export async function validatePdfInput(file: Blob): Promise<void> {
  if (!file.size) throw new SecurityError('PdfSecurityEmptyFile')
  if (file.size > MAX_PDF_BYTES) throw new SecurityError('PdfSecurityFileTooLarge')
  // QPDF accepts a PDF header within the first 1024 bytes. Do not trust MIME/name.
  const prefix = await file
    .slice(0, 1024)
    .arrayBuffer()
    .catch(() => {
      throw new SecurityError('PdfSecurityCorruptPdf')
    })
  const header = new TextDecoder('latin1').decode(prefix)
  if (!/%PDF-\d\.\d/.test(header)) throw new SecurityError('PdfSecurityNotPdf')
}

export const REPAIR_WARNING =
  'QPDF reported warnings while rewriting this PDF. Some damaged structure may have been repaired; review the downloaded copy carefully.'

/** Diagnostics stay inside the disposable worker; only fixed messages cross RPC. */
export function securityWarnings(exitCode: number, diagnostics: string): string[] {
  if (exitCode === 0) return []
  if (exitCode === 3) return [REPAIR_WARNING]
  if (exitCode === 2) {
    if (/invalid password|incorrect password/i.test(diagnostics)) {
      throw new SecurityError('PdfSecurityIncorrectPassword')
    }
    if (
      /unsupported.*(?:encrypt|security)|(?:encrypt|security).*not supported/i.test(diagnostics)
    ) {
      throw new SecurityError('PdfSecurityUnsupportedEncryption')
    }
    throw new SecurityError('PdfSecurityCorruptPdf')
  }
  throw new SecurityError('PdfSecurityEngineFailure')
}
