/**
 * The single list of encodings this tool offers, plus the mapping from
 * chardet's charset names to WHATWG labels.
 *
 * Every label here must be accepted by `new TextDecoder(label)` and report
 * itself back as `decoder.encoding` (asserted in encodings.test.ts). Labels
 * the WHATWG Encoding Standard maps to the "replacement" decoder
 * (hz-gb-2312, iso-2022-cn, iso-2022-kr, …), `utf-32`, `x-user-defined` and
 * pure aliases (`gbk`, `utf-16`, `iso-8859-1`) are deliberately absent.
 */

export type EncodingKind = 'unicode' | 'multibyte' | 'single' | 'stateful'

export interface EncodingInfo {
  /** Canonical WHATWG label — what `new TextDecoder(label).encoding` returns. */
  label: string
  /** Human-readable name shown in the UI. */
  name: string
  /** Group heading for the `<optgroup>` in the manual-override select. */
  group: string
  kind: EncodingKind
}

export const SUPPORTED_ENCODINGS: readonly EncodingInfo[] = [
  { label: 'utf-8', name: 'UTF-8', group: 'Unicode', kind: 'unicode' },
  { label: 'utf-16le', name: 'UTF-16 LE', group: 'Unicode', kind: 'unicode' },
  { label: 'utf-16be', name: 'UTF-16 BE', group: 'Unicode', kind: 'unicode' },

  { label: 'big5', name: 'Big5 (CP950, HKSCS)', group: 'Chinese', kind: 'multibyte' },
  { label: 'gb18030', name: 'GB18030 (GBK, GB2312, CP936)', group: 'Chinese', kind: 'multibyte' },

  { label: 'shift_jis', name: 'Shift_JIS (CP932)', group: 'Japanese', kind: 'multibyte' },
  { label: 'euc-jp', name: 'EUC-JP', group: 'Japanese', kind: 'multibyte' },
  { label: 'iso-2022-jp', name: 'ISO-2022-JP', group: 'Japanese', kind: 'stateful' },

  { label: 'euc-kr', name: 'EUC-KR (CP949)', group: 'Korean', kind: 'multibyte' },

  {
    label: 'windows-1252',
    name: 'Windows-1252 (Latin-1, ISO-8859-1)',
    group: 'Western',
    kind: 'single',
  },
  { label: 'iso-8859-15', name: 'ISO-8859-15', group: 'Western', kind: 'single' },
  { label: 'macintosh', name: 'Mac OS Roman', group: 'Western', kind: 'single' },

  { label: 'windows-1250', name: 'Windows-1250', group: 'Central European', kind: 'single' },
  { label: 'iso-8859-2', name: 'ISO-8859-2', group: 'Central European', kind: 'single' },

  { label: 'windows-1251', name: 'Windows-1251', group: 'Cyrillic', kind: 'single' },
  { label: 'koi8-r', name: 'KOI8-R', group: 'Cyrillic', kind: 'single' },
  { label: 'koi8-u', name: 'KOI8-U', group: 'Cyrillic', kind: 'single' },
  { label: 'iso-8859-5', name: 'ISO-8859-5', group: 'Cyrillic', kind: 'single' },
  { label: 'ibm866', name: 'IBM866', group: 'Cyrillic', kind: 'single' },
  { label: 'x-mac-cyrillic', name: 'Mac Cyrillic', group: 'Cyrillic', kind: 'single' },

  { label: 'windows-1253', name: 'Windows-1253', group: 'Greek', kind: 'single' },
  { label: 'iso-8859-7', name: 'ISO-8859-7', group: 'Greek', kind: 'single' },

  { label: 'windows-1254', name: 'Windows-1254 (ISO-8859-9)', group: 'Turkish', kind: 'single' },

  { label: 'windows-1255', name: 'Windows-1255', group: 'Hebrew', kind: 'single' },
  { label: 'iso-8859-8', name: 'ISO-8859-8', group: 'Hebrew', kind: 'single' },

  { label: 'windows-1256', name: 'Windows-1256', group: 'Arabic', kind: 'single' },
  { label: 'iso-8859-6', name: 'ISO-8859-6', group: 'Arabic', kind: 'single' },

  { label: 'windows-1257', name: 'Windows-1257', group: 'Baltic', kind: 'single' },
  { label: 'iso-8859-13', name: 'ISO-8859-13', group: 'Baltic', kind: 'single' },

  { label: 'windows-1258', name: 'Windows-1258', group: 'Vietnamese', kind: 'single' },

  { label: 'windows-874', name: 'Windows-874 (TIS-620)', group: 'Thai', kind: 'single' },

  { label: 'iso-8859-3', name: 'ISO-8859-3', group: 'Other', kind: 'single' },
  { label: 'iso-8859-4', name: 'ISO-8859-4', group: 'Other', kind: 'single' },
  { label: 'iso-8859-10', name: 'ISO-8859-10', group: 'Other', kind: 'single' },
  { label: 'iso-8859-14', name: 'ISO-8859-14', group: 'Other', kind: 'single' },
  { label: 'iso-8859-16', name: 'ISO-8859-16', group: 'Other', kind: 'single' },
] as const

const BY_LABEL = new Map(SUPPORTED_ENCODINGS.map((e) => [e.label, e]))

export function encodingInfo(label: string): EncodingInfo | undefined {
  return BY_LABEL.get(label)
}

/** Display name for a label; falls back to the label itself. */
export function encodingName(label: string): string {
  return BY_LABEL.get(label)?.name ?? label
}

/** Position of a label in the §3 table — the final tiebreaker when sorting candidates. */
export function encodingOrder(label: string): number {
  const index = SUPPORTED_ENCODINGS.findIndex((e) => e.label === label)
  return index === -1 ? SUPPORTED_ENCODINGS.length : index
}

/** ISO-2022-JP is stateful and decode-only here; everything else can be re-encoded. */
export function hasEncoder(label: string): boolean {
  return BY_LABEL.get(label)?.kind !== 'stateful' && BY_LABEL.has(label)
}

/** `SUPPORTED_ENCODINGS` bucketed by `group`, keeping table order. */
export function encodingGroups(): { group: string; encodings: EncodingInfo[] }[] {
  const groups: { group: string; encodings: EncodingInfo[] }[] = []
  for (const encoding of SUPPORTED_ENCODINGS) {
    const last = groups.at(-1)
    if (last && last.group === encoding.group) last.encodings.push(encoding)
    else groups.push({ group: encoding.group, encodings: [encoding] })
  }
  return groups
}

/**
 * chardet charset name → WHATWG label. Names chardet can emit that are not
 * listed (ASCII, UTF-32LE/BE, ISO-2022-KR, ISO-2022-CN) are dropped: they are
 * either handled by our own layers or unsupported by `TextDecoder`.
 */
export const CHARDET_LABELS: Readonly<Record<string, string>> = {
  'UTF-8': 'utf-8',
  'UTF-16LE': 'utf-16le',
  'UTF-16BE': 'utf-16be',
  Big5: 'big5',
  GB18030: 'gb18030',
  Shift_JIS: 'shift_jis',
  'EUC-JP': 'euc-jp',
  'EUC-KR': 'euc-kr',
  'ISO-2022-JP': 'iso-2022-jp',
  'ISO-8859-1': 'windows-1252',
  'ISO-8859-2': 'iso-8859-2',
  'ISO-8859-5': 'iso-8859-5',
  'ISO-8859-6': 'iso-8859-6',
  'ISO-8859-7': 'iso-8859-7',
  'ISO-8859-8': 'iso-8859-8',
  'ISO-8859-9': 'windows-1254',
  'windows-1250': 'windows-1250',
  'windows-1251': 'windows-1251',
  'windows-1252': 'windows-1252',
  'windows-1253': 'windows-1253',
  'windows-1254': 'windows-1254',
  'windows-1255': 'windows-1255',
  'windows-1256': 'windows-1256',
  'windows-1257': 'windows-1257',
  'windows-1258': 'windows-1258',
  'windows-874': 'windows-874',
  'KOI8-R': 'koi8-r',
}

/** Map a chardet charset name to a supported label, or `null` to drop it. */
export function chardetLabel(name: string): string | null {
  const label = CHARDET_LABELS[name]
  return label && BY_LABEL.has(label) ? label : null
}
