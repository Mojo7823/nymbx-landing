import he from 'he'

export type EscapeMode = 'json' | 'html' | 'url' | 'shell-single' | 'shell-double' | 'regex'

export const MODE_LABELS: Record<EscapeMode, string> = {
  json: 'JSON string',
  html: 'HTML entities',
  url: 'URL',
  'shell-single': "Shell '…'",
  'shell-double': 'Shell "…"',
  regex: 'Regex literal',
}

/** Characters that are special somewhere in a regex, plus / for /…/ literals. */
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\/]/g
/** Inside POSIX double quotes only \ ` $ " keep special meaning. */
const SHELL_DOUBLE_SPECIALS = /[\\`$"]/g

export function escapeText(text: string, mode: EscapeMode): string {
  switch (mode) {
    case 'json':
      return JSON.stringify(text).slice(1, -1)
    case 'html':
      return he.encode(text, { useNamedReferences: true })
    case 'url':
      return encodeURIComponent(text)
    case 'shell-single':
      return `'${text.replaceAll("'", `'\\''`)}'`
    case 'shell-double':
      return `"${text.replace(SHELL_DOUBLE_SPECIALS, (char) => `\\${char}`)}"`
    case 'regex':
      return text.replace(REGEX_SPECIALS, (char) => `\\${char}`)
  }
}

export function unescapeText(text: string, mode: EscapeMode): string {
  switch (mode) {
    case 'json':
      try {
        return JSON.parse(`"${text}"`) as string
      } catch {
        throw new Error(
          'Not a valid JSON string body. Check for unescaped quotes or invalid \\ sequences.',
        )
      }
    case 'html':
      return he.decode(text)
    case 'url': {
      const broken = /%(?![0-9A-Fa-f]{2})/.exec(text)
      if (broken) {
        throw new Error(`Invalid percent-encoding at character ${broken.index + 1}.`)
      }
      try {
        return decodeURIComponent(text)
      } catch {
        throw new Error('Invalid percent-encoding: the bytes are not valid UTF-8.')
      }
    }
    case 'shell-single': {
      if (text.length < 2 || !text.startsWith("'") || !text.endsWith("'")) {
        throw new Error("Expected text wrapped in single quotes, e.g. 'like this'.")
      }
      const body = text.slice(1, -1)
      // The canonical '\'' sequence closes, escapes and reopens the quotes;
      // any single quote outside such a sequence makes the input invalid.
      const parts = body.split(`'\\''`)
      if (parts.some((part) => part.includes("'"))) {
        throw new Error("Single quotes inside must be written as '\\''. Found a bare one.")
      }
      return parts.join("'")
    }
    case 'shell-double': {
      if (text.length < 2 || !text.startsWith('"') || !text.endsWith('"')) {
        throw new Error('Expected text wrapped in double quotes, e.g. "like this".')
      }
      return text.slice(1, -1).replace(/\\([\\`$"])/g, '$1')
    }
    case 'regex':
      return text.replace(/\\(.)/g, '$1')
  }
}
