import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cx } from '../../lib/cx'

/** Time a word rests in the window before the reel moves on. */
const DWELL_MS = 620
/** Must match the .slot__strip transition in landing.css. */
const SPIN_MS = 640
const STEP_MS = DWELL_MS + SPIN_MS

export interface SlotWordProps {
  /** First entry is the resting word; the reel stops on the last one. */
  words: string[]
  className?: string
  hint?: string
}

/**
 * Slot-machine reel for the hero. Hover (or focus, or tap on touch devices)
 * spins through the collaborator names one bounce at a time and parks on the
 * final word until the pointer leaves.
 */
export function SlotWord({ words, className, hint }: SlotWordProps) {
  const [index, setIndex] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [widths, setWidths] = useState<number[]>([])
  const itemRefs = useRef<(HTMLSpanElement | null)[]>([])

  // The window width tracks the current word, so the hero line grows and
  // shrinks with it instead of reserving room for the longest entry.
  useLayoutEffect(() => {
    function measure() {
      setWidths(itemRefs.current.map((el) => el?.getBoundingClientRect().width ?? 0))
    }
    measure()
    window.addEventListener('resize', measure)
    // Manrope loads async; the first measurement is against the fallback face.
    document.fonts?.ready.then(measure).catch(() => {})
    return () => window.removeEventListener('resize', measure)
  }, [words])

  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  function clearTimer() {
    if (timer.current !== null) {
      clearInterval(timer.current)
      timer.current = null
    }
  }

  function start() {
    if (words.length < 2) return
    clearTimer()
    setSpinning(true)
    setIndex(1)
    timer.current = setInterval(() => {
      setIndex((i) => {
        if (i >= words.length - 1) {
          clearTimer()
          return i
        }
        return i + 1
      })
    }, STEP_MS)
  }

  function stop() {
    clearTimer()
    setSpinning(false)
    setIndex(0)
  }

  useEffect(() => clearTimer, [])

  const atEnd = index >= words.length - 1
  const width = widths[index]
  // The button keeps the widest word's footprint. If the hit area shrank with
  // the reel, a cursor parked near the right edge would fall outside it and
  // bounce between enter and leave.
  const hitWidth = widths.length ? Math.max(...widths) : 0

  return (
    <button
      type="button"
      style={hitWidth ? { width: `${Math.ceil(hitWidth)}px` } : undefined}
      className={cx(
        'slot',
        spinning && 'is-active',
        spinning && !atEnd && 'is-spinning',
        className,
      )}
      onMouseEnter={start}
      onMouseLeave={stop}
      onFocus={start}
      onBlur={stop}
      // Touch devices get no hover; a tap spins (or replays) the reel.
      onClick={start}
      aria-label={`Working with ${words.join(', then ')}`}
    >
      <span
        className="slot__reel"
        style={width ? { width: `${Math.ceil(width)}px` } : undefined}
        aria-hidden
      >
        <span className="slot__viewport">
          <span
            className="slot__strip"
            style={{ transform: `translateY(-${(index * 100) / words.length}%)` }}
          >
            {words.map((word, i) => (
              <span
                key={word}
                className="slot__item"
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
              >
                {word}
              </span>
            ))}
          </span>
        </span>
        <span className="slot__rail" />
      </span>
      {hint && (
        <span className="slot__hint text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
          {hint}
        </span>
      )}
    </button>
  )
}
