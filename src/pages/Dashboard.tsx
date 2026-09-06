import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { Search, SearchX, X } from 'lucide-react'
import { categories, tools, type CategoryId } from '../tools/registry'
import { ToolCard } from '../components/ToolCard'
import { OfflinePanel } from '../pwa/OfflinePanel'
import { searchTools } from '../lib/toolSearch'
import { isApplePlatform } from '../lib/shortcuts'
import { cx } from '../lib/cx'

const categoryIds = new Set<string>(categories.map((c) => c.id))

/** Focus the next/previous card, wrapping back to the input above the first. */
function moveCardFocus(from: HTMLElement, delta: 1 | -1, input: HTMLInputElement | null): void {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-tool-card]'))
  const index = cards.indexOf(from)
  if (index === -1) return
  const next = cards[index + delta]
  if (next) next.focus()
  else if (delta === -1) input?.focus()
}

export function Dashboard() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  // Query and category live in the URL so a search is linkable and survives a
  // reload; `replace` keeps every keystroke out of the history stack.
  const urlQuery = params.get('q') ?? ''
  const rawCategory = params.get('category') ?? ''
  const category: CategoryId | '' = categoryIds.has(rawCategory) ? (rawCategory as CategoryId) : ''

  // The field owns its value; the URL is an echo. Driving a controlled input
  // straight off `useSearchParams` drops characters when typing fast, because
  // the router re-renders with the previous value between keystrokes.
  const [query, setQuery] = useState(urlQuery)
  const pushed = useRef(urlQuery)
  useEffect(() => {
    // Adopt the URL only when it changed from the outside (deep link, history).
    if (urlQuery !== pushed.current) {
      pushed.current = urlQuery
      setQuery(urlQuery)
    }
  }, [urlQuery])

  const trimmed = query.trim()

  const setParam = useCallback(
    (key: 'q' | 'category', value: string) => {
      if (key === 'q') pushed.current = value
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value) next.set(key, value)
          else next.delete(key)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  // Sidebar links point at /tools#<category-id>; scroll when the hash changes.
  useEffect(() => {
    if (!location.hash) return
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }, [location.hash])

  useEffect(() => {
    document.title = 'NYMBX Toolbox · private, in-browser tools'
  }, [])

  // Arriving from the global Ctrl+K on a tool page.
  const focusSearch = (location.state as { focusSearch?: boolean } | null)?.focusSearch
  useEffect(() => {
    if (focusSearch) inputRef.current?.select()
  }, [focusSearch])

  const inCategory = useMemo(
    () => (category ? tools.filter((t) => t.category === category) : tools),
    [category],
  )

  const results = useMemo(
    () => (trimmed ? searchTools(inCategory, trimmed, categories) : []),
    [inCategory, trimmed],
  )

  const sections = useMemo(
    () =>
      categories
        .map((cat) => ({ cat, tools: inCategory.filter((t) => t.category === cat.id) }))
        .filter((s) => s.tools.length > 0),
    [inCategory],
  )

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (query) {
        setQuery('')
        setParam('q', '')
      } else inputRef.current?.blur()
    } else if (event.key === 'Enter') {
      const top = results[0]
      if (trimmed && top) {
        event.preventDefault()
        void navigate(`/tools/${top.slug}`)
      }
    } else if (event.key === 'ArrowDown') {
      const first = document.querySelector<HTMLElement>('[data-tool-card]')
      if (first) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  function onGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-tool-card]')
    if (!target) return
    event.preventDefault()
    moveCardFocus(target, event.key === 'ArrowDown' ? 1 : -1, inputRef.current)
  }

  const hint = isApplePlatform() ? '⌘ K' : 'Ctrl K'

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12" onKeyDown={onGridKeyDown}>
      <section className="mb-10 max-w-2xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Every tool. One tab.
          <br />
          Nothing leaves your device.
        </h1>

        <div className="relative mt-6">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input
            id="tool-search"
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setParam('q', e.target.value)
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search tools… (e.g. pdf, hash, resize)"
            aria-label="Search tools"
            autoComplete="off"
            className="h-11 w-full rounded-lg border border-line bg-card pr-24 pl-9 text-sm text-ink placeholder:text-faint focus:border-pine focus:outline-none"
          />
          <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setParam('q', '')
                  inputRef.current?.focus()
                }}
                aria-label="Clear search"
                className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-mint hover:text-ink"
              >
                <X className="size-4" />
              </button>
            )}
            <kbd className="hidden rounded border border-line-strong bg-soft px-1.5 py-0.5 font-mono text-[10px] text-muted sm:inline-block">
              {hint}
            </kbd>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          <FilterChip
            label="All"
            active={category === ''}
            onClick={() => setParam('category', '')}
          />
          {categories.map((cat) => (
            <FilterChip
              key={cat.id}
              label={cat.name}
              active={category === cat.id}
              onClick={() => setParam('category', category === cat.id ? '' : cat.id)}
            />
          ))}
        </div>
      </section>

      {trimmed ? (
        <>
          <p aria-live="polite" className="mb-4 text-sm text-muted">
            {results.length === 0
              ? `No tools match “${trimmed}”`
              : `${results.length} ${results.length === 1 ? 'tool matches' : 'tools match'} “${trimmed}”`}
          </p>
          {results.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong py-16 text-center">
              <SearchX className="size-8 text-faint" />
              <p className="text-sm font-medium text-ink">No tools match “{trimmed}”</p>
              <p className="text-xs text-muted">Try a different keyword, like “pdf” or “image”.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((tool) => (
                <ToolCard key={tool.slug} tool={tool} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-12">
          {sections.map(({ cat, tools: catTools }) => {
            const Icon = cat.icon
            return (
              <section key={cat.id} id={cat.id} aria-label={cat.name} className="scroll-mt-20">
                <header className="mb-4 flex items-baseline gap-3 border-b border-line pb-3">
                  <Icon aria-hidden className="size-4 self-center text-pine" />
                  <h2 className="font-display text-lg font-semibold text-ink">{cat.name}</h2>
                  <span className="text-[11px] text-faint tabular-nums">
                    {String(catTools.length).padStart(2, '0')}
                  </span>
                </header>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {catTools.map((tool) => (
                    <ToolCard key={tool.slug} tool={tool} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Phase 61: offline status + opt-in bulk download. Irrelevant while the
          user is filtering, so it stays out of the way during a search. */}
      {trimmed === '' && <OfflinePanel />}
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-pine/40 bg-mint text-pine'
          : 'border-line bg-card text-muted hover:border-line-strong hover:text-ink',
      )}
    >
      {label}
    </button>
  )
}
