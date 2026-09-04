import 'reflect-metadata'
import {
  BasicConstraintsExtension,
  ExtendedKeyUsageExtension,
  KeyUsageFlags,
  KeyUsagesExtension,
  Pkcs10CertificateRequest,
  SubjectAlternativeNameExtension,
  X509Certificate,
  type Extension,
} from '@peculiar/x509'

export type DocumentKind = 'certificate' | 'csr'
export type ValidityState = 'valid' | 'expired' | 'not-yet-valid'

export interface AlternativeName {
  type: string
  value: string
}

export interface Fingerprint {
  algorithm: 'SHA-1' | 'SHA-256'
  value: string
}

export interface ValidityInfo {
  notBefore: Date
  notAfter: Date
  state: ValidityState
  daysRemaining: number
  elapsedPercent: number
}

interface DecodedBase {
  kind: DocumentKind
  subject: string
  commonName: string
  alternativeNames: AlternativeName[]
  publicKey: string
  signatureAlgorithm: string
  keyUsages: string[]
  extendedKeyUsages: string[]
  fingerprints: Fingerprint[]
  extensionCount: number
  criticalExtensions: string[]
  byteLength: number
}

export interface DecodedCertificate extends DecodedBase {
  kind: 'certificate'
  issuer: string
  serialNumber: string
  validity: ValidityInfo
  isCertificateAuthority: boolean
}

export interface DecodedCsr extends DecodedBase {
  kind: 'csr'
  signatureValid: boolean
}

export type DecodedDocument = DecodedCertificate | DecodedCsr

const KEY_USAGE_NAMES: Array<[KeyUsageFlags, string]> = [
  [KeyUsageFlags.digitalSignature, 'Digital signature'],
  [KeyUsageFlags.nonRepudiation, 'Content commitment'],
  [KeyUsageFlags.keyEncipherment, 'Key encipherment'],
  [KeyUsageFlags.dataEncipherment, 'Data encipherment'],
  [KeyUsageFlags.keyAgreement, 'Key agreement'],
  [KeyUsageFlags.keyCertSign, 'Certificate signing'],
  [KeyUsageFlags.cRLSign, 'CRL signing'],
  [KeyUsageFlags.encipherOnly, 'Encipher only'],
  [KeyUsageFlags.decipherOnly, 'Decipher only'],
]

const EXTENDED_KEY_USAGE_NAMES: Record<string, string> = {
  '1.3.6.1.5.5.7.3.1': 'TLS web server authentication',
  '1.3.6.1.5.5.7.3.2': 'TLS web client authentication',
  '1.3.6.1.5.5.7.3.3': 'Code signing',
  '1.3.6.1.5.5.7.3.4': 'Email protection',
  '1.3.6.1.5.5.7.3.8': 'Time stamping',
  '1.3.6.1.5.5.7.3.9': 'OCSP signing',
  '2.5.29.37.0': 'Any extended key usage',
}

const EXTENSION_NAMES: Record<string, string> = {
  '2.5.29.15': 'Key usage',
  '2.5.29.17': 'Subject alternative name',
  '2.5.29.19': 'Basic constraints',
  '2.5.29.30': 'Name constraints',
  '2.5.29.32': 'Certificate policies',
  '2.5.29.37': 'Extended key usage',
}

interface PemBlock {
  label: string
  pem: string
}

export function splitPemBlocks(input: string): PemBlock[] {
  const blocks: PemBlock[] = []
  const pattern = /-----BEGIN ([A-Z0-9 ]+)-----[\s\S]*?-----END \1-----/g
  for (const match of input.matchAll(pattern)) {
    blocks.push({ label: match[1]!, pem: match[0] })
  }
  return blocks
}

export function getValidityInfo(notBefore: Date, notAfter: Date, now = new Date()): ValidityInfo {
  const start = notBefore.getTime()
  const end = notAfter.getTime()
  const current = now.getTime()
  const state: ValidityState =
    current < start ? 'not-yet-valid' : current > end ? 'expired' : 'valid'
  const duration = Math.max(1, end - start)
  const elapsedPercent = Math.min(100, Math.max(0, ((current - start) / duration) * 100))
  return {
    notBefore,
    notAfter,
    state,
    daysRemaining: Math.ceil((end - current) / 86_400_000),
    elapsedPercent,
  }
}

function getCommonName(subject: string): string {
  const match = subject.match(/(?:^|,\s*)CN=([^,]+)/i)
  return match?.[1]?.trim() || subject || 'Unnamed subject'
}

function algorithmName(algorithm: Algorithm): string {
  const value = algorithm as Algorithm & {
    hash?: Algorithm | string
    modulusLength?: number
    namedCurve?: string
  }
  const parts = [value.name]
  if (value.hash) parts.push(typeof value.hash === 'string' ? value.hash : value.hash.name)
  if (value.modulusLength) parts.push(`${value.modulusLength}-bit`)
  if (value.namedCurve) parts.push(value.namedCurve)
  return parts.filter(Boolean).join(' · ')
}

function publicKeyName(algorithm: Algorithm): string {
  const value = algorithm as Algorithm & { modulusLength?: number; namedCurve?: string }
  const family = value.name.includes('RSA')
    ? 'RSA'
    : value.name.includes('EC')
      ? 'Elliptic curve'
      : value.name
  if (value.modulusLength) return `${family} · ${value.modulusLength}-bit`
  if (value.namedCurve) return `${family} · ${value.namedCurve}`
  return family
}

function getExtension<T extends Extension>(
  extensions: Extension[],
  type: new (raw: BufferSource) => T,
) {
  return extensions.find((extension): extension is T => extension instanceof type) ?? null
}

function extensionDetails(extensions: Extension[]) {
  const san = getExtension(extensions, SubjectAlternativeNameExtension)
  const keyUsage = getExtension(extensions, KeyUsagesExtension)
  const extendedKeyUsage = getExtension(extensions, ExtendedKeyUsageExtension)
  const basicConstraints = getExtension(extensions, BasicConstraintsExtension)

  return {
    alternativeNames:
      san?.names.items.map((name) => ({ type: name.type.toUpperCase(), value: name.value })) ?? [],
    keyUsages:
      keyUsage === null
        ? []
        : KEY_USAGE_NAMES.filter(([flag]) => (keyUsage.usages & flag) !== 0).map(
            ([, label]) => label,
          ),
    extendedKeyUsages:
      extendedKeyUsage?.usages.map((usage) => {
        const oid = String(usage)
        return EXTENDED_KEY_USAGE_NAMES[oid] ?? oid
      }) ?? [],
    isCertificateAuthority: basicConstraints?.ca ?? false,
    criticalExtensions: extensions
      .filter((extension) => extension.critical)
      .map((extension) => EXTENSION_NAMES[extension.type] ?? extension.type),
  }
}

async function fingerprints(rawData: ArrayBuffer): Promise<Fingerprint[]> {
  const make = async (algorithm: Fingerprint['algorithm']): Promise<Fingerprint> => {
    const digest = await crypto.subtle.digest(algorithm, rawData)
    const value = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
      .join(':')
      .toUpperCase()
    return { algorithm, value }
  }
  return Promise.all([make('SHA-1'), make('SHA-256')])
}

async function decodeCertificate(
  raw: string | ArrayBuffer,
  now: Date,
): Promise<DecodedCertificate> {
  const certificate = new X509Certificate(raw)
  const details = extensionDetails(certificate.extensions)
  return {
    kind: 'certificate',
    subject: certificate.subject,
    commonName: getCommonName(certificate.subject),
    issuer: certificate.issuer,
    serialNumber: certificate.serialNumber.toUpperCase(),
    validity: getValidityInfo(certificate.notBefore, certificate.notAfter, now),
    alternativeNames: details.alternativeNames,
    publicKey: publicKeyName(certificate.publicKey.algorithm),
    signatureAlgorithm: algorithmName(certificate.signatureAlgorithm),
    keyUsages: details.keyUsages,
    extendedKeyUsages: details.extendedKeyUsages,
    fingerprints: await fingerprints(certificate.rawData),
    extensionCount: certificate.extensions.length,
    criticalExtensions: details.criticalExtensions,
    isCertificateAuthority: details.isCertificateAuthority,
    byteLength: certificate.rawData.byteLength,
  }
}

async function decodeCsr(raw: string | ArrayBuffer): Promise<DecodedCsr> {
  const csr = new Pkcs10CertificateRequest(raw)
  const details = extensionDetails(csr.extensions)
  return {
    kind: 'csr',
    subject: csr.subject,
    commonName: getCommonName(csr.subject),
    alternativeNames: details.alternativeNames,
    publicKey: publicKeyName(csr.publicKey.algorithm),
    signatureAlgorithm: algorithmName(csr.signatureAlgorithm),
    keyUsages: details.keyUsages,
    extendedKeyUsages: details.extendedKeyUsages,
    fingerprints: await fingerprints(csr.rawData),
    extensionCount: csr.extensions.length,
    criticalExtensions: details.criticalExtensions,
    signatureValid: await csr.verify(),
    byteLength: csr.rawData.byteLength,
  }
}

async function decodeDer(input: ArrayBuffer, now: Date): Promise<DecodedDocument> {
  try {
    return await decodeCertificate(input, now)
  } catch (certificateError) {
    try {
      return await decodeCsr(input)
    } catch {
      throw certificateError
    }
  }
}

export async function decodeCertificateInput(
  input: string | ArrayBuffer,
  now = new Date(),
): Promise<DecodedDocument[]> {
  if (typeof input !== 'string') {
    if (input.byteLength === 0) throw new Error('The selected file is empty.')
    const text = new TextDecoder().decode(input)
    if (text.trimStart().startsWith('-----BEGIN ')) {
      return decodeCertificateInput(text, now)
    }
    try {
      return [await decodeDer(input, now)]
    } catch {
      throw new Error('This file is not a valid DER certificate or certificate request.')
    }
  }

  if (input.trim() === '') throw new Error('Paste a PEM certificate or certificate request first.')
  const blocks = splitPemBlocks(input)
  if (blocks.length === 0) {
    throw new Error('No PEM certificate or certificate request was found.')
  }

  const decoded: DecodedDocument[] = []
  for (const block of blocks) {
    try {
      if (block.label === 'CERTIFICATE' || block.label === 'X509 CERTIFICATE') {
        decoded.push(await decodeCertificate(block.pem, now))
      } else if (
        block.label === 'CERTIFICATE REQUEST' ||
        block.label === 'NEW CERTIFICATE REQUEST'
      ) {
        decoded.push(await decodeCsr(block.pem))
      }
    } catch {
      throw new Error(`The ${block.label.toLowerCase()} block is malformed or unsupported.`)
    }
  }

  if (decoded.length === 0) {
    throw new Error('No supported certificate or certificate request PEM block was found.')
  }
  return decoded
}
