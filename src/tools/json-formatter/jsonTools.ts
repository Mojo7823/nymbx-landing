/**
 * Hand-written JSON reprinter. Works on the raw text instead of JSON.parse so
 * number tokens are re-emitted byte-exact — big integers survive format/minify
 * untouched (JSON.parse would round them to doubles). Also yields precise
 * line/column error positions.
 */

export interface JsonError {
  message: string
  offset: number
  line: number
  col: number
}

export interface ProcessResult {
  ok: boolean
  output?: string
  error?: JsonError
  /** Integer literals that exceed double precision (JS consumers would round them). */
  riskyNumbers: number
}

const WS = new Set([0x20, 0x09, 0x0a, 0x0d])
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

function positionOf(text: string, offset: number): { line: number; col: number } {
  let line = 1
  let last = -1
  for (let i = 0; i < offset; i++) {
    if (text.charCodeAt(i) === 0x0a) {
      line++
      last = i
    }
  }
  return { line, col: offset - last }
}

class JsonSyntaxError extends Error {
  constructor(
    message: string,
    public offset: number,
  ) {
    super(message)
  }
}

/** True when an integer literal cannot be represented exactly as a double. */
export function isRiskyInteger(raw: string): boolean {
  if (/[.eE]/.test(raw)) return false
  const digits = raw.startsWith('-') ? raw.slice(1) : raw
  if (digits.length < 16) return false
  const abs = BigInt(digits)
  return abs > MAX_SAFE
}

/**
 * Validate `text` and reprint it. `indent` is the per-level indent string, or
 * null to minify. `check` mode validates without building output.
 */
function reprint(text: string, indent: string | null, check: boolean): ProcessResult {
  const n = text.length
  let i = 0
  let risky = 0
  const out: string[] = []
  const emit = check ? () => {} : (s: string) => out.push(s)

  const skipWs = () => {
    while (i < n && WS.has(text.charCodeAt(i))) i++
  }
  const fail = (message: string, at = i): never => {
    throw new JsonSyntaxError(message, at)
  }

  const newline = (depth: number) => {
    if (indent !== null) emit('\n' + indent.repeat(depth))
  }

  function parseString(): void {
    const start = i
    i++ // opening quote
    while (i < n) {
      const c = text.charCodeAt(i)
      if (c === 0x22) {
        i++
        emit(text.slice(start, i))
        return
      }
      if (c === 0x5c) {
        i++
        const e = text[i]
        if (e === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5)))
            fail('Invalid \\u escape sequence', i - 1)
          i += 5
        } else if (e !== undefined && '"\\/bfnrt'.includes(e)) {
          i++
        } else {
          fail(`Invalid escape sequence \\${e ?? ''}`, i - 1)
        }
      } else if (c < 0x20) {
        fail('Unescaped control character in string', i)
      } else {
        i++
      }
    }
    fail('Unterminated string', start)
  }

  function parseNumber(): void {
    const start = i
    if (text[i] === '-') i++
    if (text[i] === '0') i++
    else if (text[i] >= '1' && text[i] <= '9') {
      while (text[i] >= '0' && text[i] <= '9') i++
    } else fail('Invalid number', start)
    if (text[i] === '.') {
      i++
      if (!(text[i] >= '0' && text[i] <= '9')) fail('Invalid number: expected digit after "."', i)
      while (text[i] >= '0' && text[i] <= '9') i++
    }
    if (text[i] === 'e' || text[i] === 'E') {
      i++
      if (text[i] === '+' || text[i] === '-') i++
      if (!(text[i] >= '0' && text[i] <= '9')) fail('Invalid number: expected digit in exponent', i)
      while (text[i] >= '0' && text[i] <= '9') i++
    }
    const raw = text.slice(start, i)
    if (isRiskyInteger(raw)) risky++
    emit(raw)
  }

  function parseLiteral(word: 'true' | 'false' | 'null'): void {
    if (text.startsWith(word, i)) {
      emit(word)
      i += word.length
    } else {
      fail(`Unexpected token`, i)
    }
  }

  function parseValue(depth: number): void {
    skipWs()
    if (i >= n) fail('Unexpected end of input')
    const c = text[i]
    if (c === '{') {
      i++
      skipWs()
      if (text[i] === '}') {
        i++
        emit('{}')
        return
      }
      emit('{')
      for (;;) {
        skipWs()
        if (text[i] !== '"')
          fail(i >= n ? 'Unexpected end of input' : 'Expected a double-quoted object key')
        newline(depth + 1)
        parseString()
        skipWs()
        if (text[i] !== ':')
          fail(i >= n ? 'Unexpected end of input' : 'Expected ":" after object key')
        i++
        emit(indent !== null ? ': ' : ':')
        parseValue(depth + 1)
        skipWs()
        if (text[i] === ',') {
          i++
          emit(',')
          continue
        }
        if (text[i] === '}') {
          i++
          newline(depth)
          emit('}')
          return
        }
        fail(i >= n ? 'Unexpected end of input' : 'Expected "," or "}" in object')
      }
    } else if (c === '[') {
      i++
      skipWs()
      if (text[i] === ']') {
        i++
        emit('[]')
        return
      }
      emit('[')
      for (;;) {
        newline(depth + 1)
        parseValue(depth + 1)
        skipWs()
        if (text[i] === ',') {
          i++
          emit(',')
          continue
        }
        if (text[i] === ']') {
          i++
          newline(depth)
          emit(']')
          return
        }
        fail(i >= n ? 'Unexpected end of input' : 'Expected "," or "]" in array')
      }
    } else if (c === '"') {
      parseString()
    } else if (c === '-' || (c >= '0' && c <= '9')) {
      parseNumber()
    } else if (c === 't') {
      parseLiteral('true')
    } else if (c === 'f') {
      parseLiteral('false')
    } else if (c === 'n') {
      parseLiteral('null')
    } else {
      fail(`Unexpected character ${JSON.stringify(c)}`)
    }
  }

  try {
    parseValue(0)
    skipWs()
    if (i < n) throw new JsonSyntaxError('Unexpected trailing characters after JSON value', i)
    return { ok: true, output: check ? undefined : out.join(''), riskyNumbers: risky }
  } catch (err) {
    if (err instanceof JsonSyntaxError) {
      const { line, col } = positionOf(text, err.offset)
      return {
        ok: false,
        error: { message: err.message, offset: err.offset, line, col },
        riskyNumbers: risky,
      }
    }
    throw err
  }
}

export function formatJson(text: string, indent: string): ProcessResult {
  return reprint(text, indent, false)
}

export function minifyJson(text: string): ProcessResult {
  return reprint(text, null, false)
}

export function validateJson(text: string): ProcessResult {
  return reprint(text, null, true)
}

/** The error line's text with a caret marker, for the error display. */
export function errorExcerpt(text: string, error: JsonError): { line: string; caret: string } {
  const lineStart = text.lastIndexOf('\n', error.offset - 1) + 1
  let lineEnd = text.indexOf('\n', error.offset)
  if (lineEnd === -1) lineEnd = text.length
  let line = text.slice(lineStart, lineEnd)
  let caretPos = error.col - 1
  const MAX = 80
  if (caretPos > MAX - 20) {
    const cut = caretPos - (MAX - 20)
    line = '…' + line.slice(cut + 1)
    caretPos = MAX - 20
  }
  if (line.length > MAX) line = line.slice(0, MAX - 1) + '…'
  return { line, caret: ' '.repeat(caretPos) + '^' }
}
