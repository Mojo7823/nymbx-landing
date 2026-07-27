import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ShieldAlert, Sparkles, XCircle } from 'lucide-react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ToolLayout } from '../../components/ToolLayout'
import { cx } from '../../lib/cx'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import {
  decodeJwt,
  verifyJwt,
  type DecodedJwt,
  type TimeClaimInfo,
  type TokenTimeStatus,
  type VerifyOutcome,
} from './jwt'

const SAMPLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.' +
  'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

const SAMPLE_SECRET = 'your-256-bit-secret'

const TIME_STATUS_LABEL: Record<TokenTimeStatus, string> = {
  ok: 'Within validity window',
  expired: 'Expired',
  'not-yet-valid': 'Not yet valid',
  'no-time-claims': 'No exp / nbf claims',
}

function timeStatusClass(status: TokenTimeStatus): string {
  if (status === 'expired') return 'border-rose bg-rose-soft text-rose'
  if (status === 'not-yet-valid') return 'border-amber-badge/40 bg-amber-soft text-amber-badge'
  if (status === 'ok') return 'border-pine/30 bg-mint/40 text-pine'
  return 'border-line bg-soft text-muted'
}

function claimFlagClass(flag: TimeClaimInfo['flag']): string {
  if (flag === 'expired') return 'text-rose'
  if (flag === 'not-yet-valid') return 'text-amber-badge'
  return 'text-ink'
}

function JsonBlock({ label, json }: { label: string; json: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-muted">{label}</h2>
        <CopyButton text={json} label="" aria-label={`Copy ${label}`} />
      </div>
      <pre className="max-h-80 overflow-auto rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-ink">
        {json}
      </pre>
    </div>
  )
}

function VerifyBanner({ outcome }: { outcome: VerifyOutcome | null }) {
  if (!outcome) return null
  const icon =
    outcome.status === 'valid' ? (
      <CheckCircle2 className="size-4 shrink-0" />
    ) : outcome.status === 'invalid' ? (
      <XCircle className="size-4 shrink-0" />
    ) : outcome.status === 'unsupported' ? (
      <AlertTriangle className="size-4 shrink-0" />
    ) : (
      <ShieldAlert className="size-4 shrink-0" />
    )
  return (
    <p
      role="status"
      className={cx(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium',
        outcome.status === 'valid' && 'border-pine/30 bg-mint/40 text-pine',
        outcome.status === 'invalid' && 'border-rose bg-rose-soft text-rose',
        (outcome.status === 'unsupported' || outcome.status === 'error') &&
          'border-amber-badge/40 bg-amber-soft text-amber-badge',
      )}
    >
      {icon}
      <span>{outcome.message}</span>
    </p>
  )
}

export default function JwtDecoder() {
  const [token, setToken] = useState('')
  const [keyMaterial, setKeyMaterial] = useState('')
  /** Outcome is only shown while it still matches the token + key that produced it. */
  const [verify, setVerify] = useState<{
    token: string
    key: string
    outcome: VerifyOutcome
  } | null>(null)
  const [verifying, setVerifying] = useState(false)

  const debouncedToken = useDebouncedValue(token, 150)

  const decoded = useMemo((): { value?: DecodedJwt; error?: string } => {
    if (debouncedToken.trim() === '') return {}
    try {
      return { value: decodeJwt(debouncedToken) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Could not decode token.' }
    }
  }, [debouncedToken])

  const verifyOutcome =
    verify && verify.token === debouncedToken && verify.key === keyMaterial.trim()
      ? verify.outcome
      : null

  async function runVerify() {
    if (!decoded.value) return
    const tokenSnapshot = debouncedToken
    const keySnapshot = keyMaterial.trim()
    setVerifying(true)
    try {
      const outcome = await verifyJwt(decoded.value, keySnapshot)
      setVerify({ token: tokenSnapshot, key: keySnapshot, outcome })
    } catch (cause) {
      setVerify({
        token: tokenSnapshot,
        key: keySnapshot,
        outcome: {
          status: 'error',
          message: cause instanceof Error ? cause.message : 'Verification failed.',
        },
      })
    } finally {
      setVerifying(false)
    }
  }

  function loadSample() {
    setToken(SAMPLE)
    setKeyMaterial(SAMPLE_SECRET)
    setVerify(null)
  }

  return (
    <ToolLayout
      title="JWT decoder"
      description="Paste a JSON Web Token to inspect its header and payload locally. Optional signature verification uses Web Crypto with your HS* secret or RS/PS/ES public key. Nothing leaves this device; tokens are never uploaded."
      badge="client-side"
    >
      <div
        role="note"
        className="mb-4 flex items-start gap-2 rounded-lg border border-pine/25 bg-mint/30 px-3 py-2.5 text-xs text-pine"
      >
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong className="font-semibold">Nothing leaves this device.</strong> Decoding and
          verification run entirely in your browser. Do not paste production secrets into shared
          machines.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="jwt-token" className="text-xs font-semibold text-muted">
            Token
          </label>
          <Button variant="ghost" size="sm" onClick={loadSample}>
            <Sparkles className="size-3.5" />
            Load sample
          </Button>
        </div>
        <textarea
          id="jwt-token"
          name="jwt-token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ…  (or paste a Bearer token)"
          spellCheck={false}
          autoComplete="off"
          className="h-28 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none"
        />
      </div>

      {decoded.error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-rose bg-rose-soft px-3 py-2 text-xs text-rose"
        >
          {decoded.error}
        </p>
      )}

      {decoded.value && (
        <div className="mt-6 flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-line bg-soft px-2.5 py-1 font-mono text-xs font-semibold text-ink">
              alg: {decoded.value.algorithm}
            </span>
            <span
              className={cx(
                'rounded-md border px-2.5 py-1 text-xs font-semibold',
                timeStatusClass(decoded.value.timeStatus),
              )}
            >
              {TIME_STATUS_LABEL[decoded.value.timeStatus]}
            </span>
          </div>

          {decoded.value.timeClaims.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[28rem] text-left text-xs">
                <thead className="border-b border-line bg-soft text-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Claim</th>
                    <th className="px-3 py-2 font-semibold">Epoch</th>
                    <th className="px-3 py-2 font-semibold">UTC</th>
                    <th className="px-3 py-2 font-semibold">Relative</th>
                  </tr>
                </thead>
                <tbody>
                  {decoded.value.timeClaims.map((claim) => (
                    <tr key={claim.claim} className="border-b border-line last:border-0">
                      <td
                        className={cx(
                          'px-3 py-2 font-mono font-semibold',
                          claimFlagClass(claim.flag),
                        )}
                      >
                        {claim.claim}
                        {claim.flag === 'expired' && ' · expired'}
                        {claim.flag === 'not-yet-valid' && ' · not yet valid'}
                      </td>
                      <td className="px-3 py-2 font-mono text-ink">{claim.raw}</td>
                      <td className="px-3 py-2 font-mono text-ink">{claim.iso}</td>
                      <td className="px-3 py-2 text-muted">{claim.relative}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <JsonBlock label="Header" json={decoded.value.headerJson} />
            <JsonBlock label="Payload" json={decoded.value.payloadJson} />
          </div>

          <section className="flex flex-col gap-3 rounded-lg border border-line bg-card p-4">
            <div>
              <h2 className="text-sm font-semibold text-ink">Signature verification (optional)</h2>
              <p className="mt-1 text-xs text-muted">
                HS256/384/512: paste the shared secret as text. RS*/PS*/ES*: paste the SPKI public
                key PEM (<span className="font-mono">BEGIN PUBLIC KEY</span>).
              </p>
            </div>
            <label htmlFor="jwt-key" className="sr-only">
              Verification key
            </label>
            <textarea
              id="jwt-key"
              name="jwt-key"
              value={keyMaterial}
              onChange={(event) => setKeyMaterial(event.target.value)}
              placeholder={
                decoded.value.algorithm.startsWith('HS')
                  ? 'HMAC secret…'
                  : '-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----'
              }
              spellCheck={false}
              autoComplete="off"
              className="h-28 w-full resize-y rounded-lg border border-line-strong bg-bg p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                onClick={() => void runVerify()}
                disabled={verifying || keyMaterial.trim() === ''}
              >
                {verifying ? 'Verifying…' : 'Verify signature'}
              </Button>
              {decoded.value.algorithm.startsWith('HS') && keyMaterial === SAMPLE_SECRET && (
                <span className="text-xs text-faint">
                  Sample secret pre-filled for the demo token.
                </span>
              )}
            </div>
            <VerifyBanner outcome={verifyOutcome} />
          </section>
        </div>
      )}

      {!decoded.value && !decoded.error && token.trim() === '' && (
        <p className="mt-4 text-xs text-faint">
          Decoded header, payload, and time claims appear here once you paste a token.
        </p>
      )}
    </ToolLayout>
  )
}
