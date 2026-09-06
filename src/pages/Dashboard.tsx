import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router'
import { Search, SearchX } from 'lucide-react'
import { categories, tools, type ToolMeta } from '../tools/registry'
import { ToolCard } from '../components/ToolCard'
import { OfflinePanel } from '../pwa/OfflinePanel'

function matches(tool: ToolMeta, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    tool.name.toLowerCase().includes(q) ||
    tool.description.toLowerCase().includes(q) ||
    tool.slug.includes(q)
  )
}

export function Dashboard() {
  const [query, setQuery] = useState('')
  const location = useLocation()

  // Sidebar links point at /#<category-id>; scroll when the hash changes.
  useEffect(() => {
    if (!location.hash) return
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }, [location.hash])

  useEffect(() => {
    document.title = 'NYMBX Toolbox · private, in-browser tools'
  }, [])

  const sections = useMemo(
    () =>
      categories
        .map((cat) => ({
          cat,
          tools: tools.filter((t) => t.category === cat.id && matches(t, query)),
        }))
        .filter((s) => s.tools.length > 0),
    [query],
  )

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
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
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools… (e.g. pdf, hash, resize)"
            aria-label="Search tools"
            className="h-11 w-full rounded-lg border border-line bg-card pr-4 pl-9 text-sm text-ink placeholder:text-faint focus:border-pine focus:outline-none"
          />
        </div>
      </section>

      {sections.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong py-16 text-center">
          <SearchX className="size-8 text-faint" />
          <p className="text-sm font-medium text-ink">No tools match “{query.trim()}”</p>
          <p className="text-xs text-muted">Try a different keyword, like “pdf” or “image”.</p>
        </div>
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
      {query.trim() === '' && <OfflinePanel />}
    </div>
  )
}
