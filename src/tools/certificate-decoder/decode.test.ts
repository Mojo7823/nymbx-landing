import 'reflect-metadata'
import {
  KeyUsageFlags,
  KeyUsagesExtension,
  Pkcs10CertificateRequestGenerator,
  SubjectAlternativeNameExtension,
  X509CertificateGenerator,
} from '@peculiar/x509'
import { beforeAll, describe, expect, it } from 'vitest'
import { decodeCertificateInput, getValidityInfo, splitPemBlocks } from './decode'

const NOT_BEFORE = new Date('2025-01-01T00:00:00Z')
const NOT_AFTER = new Date('2027-01-01T00:00:00Z')
const NOW = new Date('2026-01-01T00:00:00Z')

let certificatePem = ''
let certificateDer: ArrayBuffer
let csrPem = ''

beforeAll(async () => {
  const keys = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 1024,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  const extensions = [
    new SubjectAlternativeNameExtension([
      { type: 'dns', value: 'unit.nymbx.test' },
      { type: 'dns', value: 'api.nymbx.test' },
      { type: 'ip', value: '127.0.0.1' },
    ]),
    new KeyUsagesExtension(KeyUsageFlags.digitalSignature | KeyUsageFlags.keyEncipherment, true),
  ]

  const certificate = await X509CertificateGenerator.createSelfSigned({
    serialNumber: '01AB',
    name: 'CN=unit.nymbx.test,O=NYMBX',
    notBefore: NOT_BEFORE,
    notAfter: NOT_AFTER,
    signingAlgorithm: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    keys,
    extensions,
  })
  certificatePem = certificate.toString('pem')
  certificateDer = certificate.rawData

  const csr = await Pkcs10CertificateRequestGenerator.create({
    name: 'CN=request.nymbx.test,O=NYMBX',
    signingAlgorithm: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    keys,
    extensions,
  })
  csrPem = csr.toString('pem')
})

describe('certificate decoder', () => {
  it('extracts multiple PEM blocks in order', () => {
    const blocks = splitPemBlocks(`${certificatePem}\n${csrPem}`)
    expect(blocks.map((block) => block.label)).toEqual(['CERTIFICATE', 'CERTIFICATE REQUEST'])
  })

  it('decodes a certificate chain with SANs, usage and fingerprints', async () => {
    const documents = await decodeCertificateInput(`${certificatePem}\n${certificatePem}`, NOW)
    expect(documents).toHaveLength(2)
    const certificate = documents[0]!
    expect(certificate.kind).toBe('certificate')
    if (certificate.kind !== 'certificate') return
    expect(certificate.commonName).toBe('unit.nymbx.test')
    expect(certificate.serialNumber).toBe('01AB')
    expect(certificate.validity.state).toBe('valid')
    expect(certificate.alternativeNames.map((name) => name.value)).toEqual([
      'unit.nymbx.test',
      'api.nymbx.test',
      '127.0.0.1',
    ])
    expect(certificate.keyUsages).toEqual(['Digital signature', 'Key encipherment'])
    expect(certificate.fingerprints[0]?.value).toMatch(/^([0-9A-F]{2}:){19}[0-9A-F]{2}$/)
    expect(certificate.fingerprints[1]?.value).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/)
  })

  it('decodes DER certificate input', async () => {
    const [certificate] = await decodeCertificateInput(certificateDer, NOW)
    expect(certificate?.kind).toBe('certificate')
    expect(certificate?.subject).toContain('CN=unit.nymbx.test')
  })

  it('detects a PEM file supplied as bytes', async () => {
    const pemBytes = new TextEncoder().encode(certificatePem)
    const [certificate] = await decodeCertificateInput(pemBytes.buffer as ArrayBuffer, NOW)
    expect(certificate?.kind).toBe('certificate')
    expect(certificate?.commonName).toBe('unit.nymbx.test')
  })

  it('decodes and validates a CSR', async () => {
    const [request] = await decodeCertificateInput(csrPem, NOW)
    expect(request?.kind).toBe('csr')
    if (request?.kind !== 'csr') return
    expect(request.commonName).toBe('request.nymbx.test')
    expect(request.signatureValid).toBe(true)
    expect(request.alternativeNames).toHaveLength(3)
  })

  it('classifies validity boundaries and clamps the rail', () => {
    expect(getValidityInfo(NOT_BEFORE, NOT_AFTER, new Date('2024-01-01')).state).toBe(
      'not-yet-valid',
    )
    expect(getValidityInfo(NOT_BEFORE, NOT_AFTER, new Date('2028-01-01'))).toMatchObject({
      state: 'expired',
      elapsedPercent: 100,
    })
    expect(getValidityInfo(NOT_BEFORE, NOT_AFTER, NOT_BEFORE).elapsedPercent).toBe(0)
  })

  it('reports malformed and empty input clearly', async () => {
    await expect(decodeCertificateInput('')).rejects.toThrow('Paste a PEM')
    await expect(decodeCertificateInput('not a certificate')).rejects.toThrow('No PEM')
    await expect(decodeCertificateInput(new ArrayBuffer(0))).rejects.toThrow('empty')
  })
})
