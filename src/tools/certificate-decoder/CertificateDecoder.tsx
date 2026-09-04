import { useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileBadge2,
  Fingerprint,
  KeyRound,
  Network,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { FileDropzone } from '../../components/FileDropzone'
import { ToolLayout } from '../../components/ToolLayout'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { decodeCertificateInput, type DecodedDocument, type ValidityInfo } from './decode'

const MAX_FILE_SIZE = 5 * 1024 * 1024

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'long',
  }).format(date)
}

function validityLabel(validity: ValidityInfo): string {
  if (validity.state === 'expired') {
    const days = Math.abs(validity.daysRemaining)
    return `Expired ${days} day${days === 1 ? '' : 's'} ago`
  }
  if (validity.state === 'not-yet-valid') return 'Not yet valid'
  if (validity.daysRemaining === 0) return 'Expires today'
  return `${validity.daysRemaining} day${validity.daysRemaining === 1 ? '' : 's'} remaining`
}

function ValidityRail({ validity }: { validity: ValidityInfo }) {
  return (
    <section className="rounded-lg border border-line bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <CalendarClock className="size-4 text-pine" /> Validity
        </h2>
        <span
          className={cx(
            'rounded-full border px-2.5 py-1 text-xs font-semibold',
            validity.state === 'valid' && 'border-pine/30 bg-mint/40 text-pine',
            validity.state === 'expired' && 'border-rose bg-rose-soft text-rose',
            validity.state === 'not-yet-valid' &&
              'border-amber-badge/40 bg-amber-soft text-amber-badge',
          )}
        >
          {validityLabel(validity)}
        </span>
      </div>
      <div className="mt-5 px-1">
        <div className="relative h-2 rounded-full bg-line">
          <div
            className={cx(
              'absolute inset-y-0 left-0 rounded-full',
              validity.state === 'expired' ? 'bg-rose' : 'bg-pine',
            )}
            style={{ width: `${validity.elapsedPercent}%` }}
          />
          <span
            className={cx(
              'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card shadow-sm',
              validity.state === 'expired' ? 'bg-rose' : 'bg-pine',
            )}
            style={{ left: `${validity.elapsedPercent}%` }}
            aria-hidden="true"
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="block text-faint">Not before</span>
            <time
              className="mt-1 block font-mono text-ink"
              dateTime={validity.notBefore.toISOString()}
            >
              {formatDate(validity.notBefore)}
            </time>
          </div>
          <div className="text-right">
            <span className="block text-faint">Not after</span>
            <time
              className="mt-1 block font-mono text-ink"
              dateTime={validity.notAfter.toISOString()}
            >
              {formatDate(validity.notAfter)}
            </time>
          </div>
        </div>
      </div>
    </section>
  )
}

function DetailCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof KeyRound
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <Icon className="size-4 text-pine" /> {label}
      </div>
      <p className="mt-2 overflow-wrap-anywhere font-mono text-xs leading-relaxed text-ink">
        {value}
      </p>
    </div>
  )
}

function ListSection({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {values.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((value) => (
            <span
              key={value}
              className="rounded-md border border-line bg-soft px-2.5 py-1 font-mono text-xs text-ink"
            >
              {value}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-faint">Not specified</p>
      )}
    </div>
  )
}

function DocumentDetails({ document }: { document: DecodedDocument }) {
  const certificate = document.kind === 'certificate' ? document : null
  return (
    <div className="flex flex-col gap-4">
      <div
        role="status"
        className={cx(
          'flex items-start gap-3 rounded-lg border px-4 py-3',
          certificate?.validity.state === 'expired'
            ? 'border-rose bg-rose-soft text-rose'
            : certificate?.validity.state === 'not-yet-valid'
              ? 'border-amber-badge/40 bg-amber-soft text-amber-badge'
              : 'border-pine/25 bg-mint/30 text-pine',
        )}
      >
        {certificate?.validity.state === 'expired' ? (
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
        )}
        <div>
          <p className="text-sm font-semibold">
            {document.kind === 'csr'
              ? document.signatureValid
                ? 'Certificate request signature is valid'
                : 'Certificate request signature is invalid'
              : validityLabel(document.validity)}
          </p>
          <p className="mt-0.5 text-xs opacity-80">
            {document.kind === 'csr'
              ? 'This confirms that the request was signed by its included private key counterpart.'
              : document.isCertificateAuthority
                ? 'This certificate is marked as a certificate authority.'
                : 'This is an end-entity certificate.'}
          </p>
        </div>
      </div>

      {certificate && <ValidityRail validity={certificate.validity} />}

      <section className="grid gap-3 sm:grid-cols-2">
        <DetailCard icon={FileBadge2} label="Subject" value={document.subject} />
        <DetailCard
          icon={Network}
          label={certificate ? 'Issuer' : 'Document type'}
          value={certificate ? certificate.issuer : 'PKCS #10 certificate signing request'}
        />
        <DetailCard icon={KeyRound} label="Public key" value={document.publicKey} />
        <DetailCard icon={ShieldCheck} label="Signature" value={document.signatureAlgorithm} />
        {certificate && (
          <DetailCard icon={Fingerprint} label="Serial number" value={certificate.serialNumber} />
        )}
        <DetailCard
          icon={FileBadge2}
          label="Encoded size"
          value={`${formatBytes(document.byteLength)} · ${document.extensionCount} extension${document.extensionCount === 1 ? '' : 's'}`}
        />
      </section>

      <section className="rounded-lg border border-line bg-card p-4 sm:p-5">
        <div className="space-y-5">
          <div>
            <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
              Subject alternative names
            </h3>
            {document.alternativeNames.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {document.alternativeNames.map((name, index) => (
                  <span
                    key={`${name.type}-${name.value}-${index}`}
                    className="inline-flex max-w-full items-center overflow-hidden rounded-md border border-pine/20 bg-mint/30 text-xs"
                  >
                    <span className="self-stretch bg-pine/10 px-2 py-1 font-mono text-pine">
                      {name.type}
                    </span>
                    <span className="truncate px-2 py-1 font-mono text-ink" title={name.value}>
                      {name.value}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-faint">No subject alternative names</p>
            )}
          </div>
          <ListSection title="Key usage" values={document.keyUsages} />
          <ListSection title="Extended key usage" values={document.extendedKeyUsages} />
          <ListSection title="Critical extensions" values={document.criticalExtensions} />
        </div>
      </section>

      <section className="rounded-lg border border-line bg-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Fingerprint className="size-4 text-pine" /> Fingerprints
        </h2>
        <div className="mt-3 space-y-3">
          {document.fingerprints.map((fingerprint) => (
            <div key={fingerprint.algorithm} className="rounded-md border border-line bg-soft p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold text-muted">
                  {fingerprint.algorithm}
                </span>
                <CopyButton
                  text={fingerprint.value}
                  label={`Copy ${fingerprint.algorithm}`}
                  aria-label={`Copy ${fingerprint.algorithm} fingerprint`}
                />
              </div>
              <p className="mt-2 font-mono text-xs leading-relaxed break-all text-ink">
                {fingerprint.value}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default function CertificateDecoder() {
  const [pem, setPem] = useState('')
  const [sourceName, setSourceName] = useState<string | null>(null)
  const [documents, setDocuments] = useState<DecodedDocument[]>([])
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  async function decode(input: string | ArrayBuffer, name?: string) {
    setWorking(true)
    setError(null)
    try {
      const result = await decodeCertificateInput(input)
      setDocuments(result)
      setSelected(0)
      setSourceName(name ?? null)
    } catch (cause) {
      setDocuments([])
      setSourceName(null)
      setError(cause instanceof Error ? cause.message : 'Could not decode this certificate.')
    } finally {
      setWorking(false)
    }
  }

  function clear() {
    setPem('')
    setSourceName(null)
    setDocuments([])
    setSelected(0)
    setError(null)
  }

  return (
    <ToolLayout
      title="Certificate decoder"
      description="Inspect X.509 certificates, certificate chains, and PKCS #10 signing requests. Paste PEM or drop a PEM/DER file; decoding and fingerprinting happen entirely in your browser."
      badge="client-side"
    >
      <div
        role="note"
        className="mb-5 flex items-start gap-2 rounded-lg border border-pine/25 bg-mint/30 px-3 py-2.5 text-xs text-pine"
      >
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong className="font-semibold">Nothing is uploaded.</strong> Certificate contents and
          fingerprints stay in this browser tab.
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div className="flex min-w-0 flex-col">
          <label htmlFor="certificate-pem" className="mb-2 text-xs font-semibold text-muted">
            Paste PEM
          </label>
          <textarea
            id="certificate-pem"
            value={pem}
            onChange={(event) => setPem(event.target.value)}
            placeholder={'-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----'}
            spellCheck={false}
            className="min-h-64 w-full flex-1 resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void decode(pem)} disabled={working || pem.trim() === ''}>
              <FileBadge2 className="size-4" /> {working ? 'Decoding…' : 'Decode PEM'}
            </Button>
            {(pem || documents.length > 0 || error) && (
              <Button variant="secondary" onClick={clear}>
                <Trash2 className="size-4" /> Clear
              </Button>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <span className="mb-2 text-xs font-semibold text-muted">Or choose a file</span>
          <FileDropzone
            className="flex-1"
            accept=".pem,.crt,.cer,.der,.csr,application/pkcs10,application/x-x509-ca-cert"
            maxSize={MAX_FILE_SIZE}
            hint="PEM, CRT, CER, DER or CSR · up to 5 MB"
            onFiles={(files) => {
              const file = files[0]
              if (!file) return
              void file.arrayBuffer().then((buffer) => decode(buffer, file.name))
            }}
          />
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-rose bg-rose-soft px-3 py-2 text-xs text-rose"
        >
          {error}
        </p>
      )}

      {documents.length > 0 && (
        <section className="mt-8 border-t border-line pt-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] tracking-widest text-pine uppercase">
                Decode complete
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold text-ink">
                {documents.length === 1
                  ? documents[0]!.kind === 'certificate'
                    ? 'X.509 certificate'
                    : 'PKCS #10 request'
                  : `${documents.length} documents in this chain`}
              </h2>
            </div>
            {sourceName && <span className="font-mono text-xs text-muted">{sourceName}</span>}
          </div>

          {documents.length > 1 && (
            <nav aria-label="Decoded documents" className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {documents.map((document, index) => (
                <button
                  key={`${document.kind}-${document.commonName}-${index}`}
                  type="button"
                  onClick={() => setSelected(index)}
                  aria-current={selected === index ? 'true' : undefined}
                  className={cx(
                    'min-w-44 cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors',
                    selected === index
                      ? 'border-pine bg-mint/40'
                      : 'border-line bg-card hover:border-pine/50',
                  )}
                >
                  <span className="block font-mono text-[10px] text-muted uppercase">
                    {document.kind === 'certificate' ? `Certificate ${index + 1}` : 'CSR'}
                  </span>
                  <span className="mt-0.5 block truncate text-xs font-semibold text-ink">
                    {document.commonName}
                  </span>
                </button>
              ))}
            </nav>
          )}

          <DocumentDetails document={documents[selected]!} />
        </section>
      )}

      {documents.length === 0 && !error && (
        <p className="mt-5 text-xs text-faint">
          Subject, issuer, validity, alternative names, key details, usages, and fingerprints will
          appear here.
        </p>
      )}
    </ToolLayout>
  )
}
