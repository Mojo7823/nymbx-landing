import { useEffect } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Mail, Wrench } from 'lucide-react'
import { ThemeToggle } from '../components/ThemeToggle'
import { SlotWord } from '../components/landing/SlotWord'
import { ProjectCard } from '../components/landing/ProjectCard'
import { projects } from '../components/landing/projects'
import './landing.css'

const CONTACT_EMAIL = 'admin@nymbx.dev'

/** Reel order: the current collaboration first, the open invitation last. */
const COLLABORATORS = ['Auray Technology', 'NTUST', 'TAICS', 'You?']

export function Landing() {
  useEffect(() => {
    document.title = 'NYMBX · projects, tools and compliance software'
  }, [])

  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <header className="sticky top-0 z-40 bg-page/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-5 sm:px-8">
          <a href="#top" className="flex items-center gap-3">
            <img src="/nymbx-icon-blue.svg" alt="" className="h-10 w-auto" />
            <span className="font-display text-xl font-semibold tracking-tight text-ink">
              NYMBX
            </span>
          </a>
          <nav className="ml-auto flex items-center gap-1 sm:gap-2">
            <a
              href="#projects"
              className="rounded-md px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-brand sm:px-3"
            >
              Projects
            </a>
            <a
              href="#contact"
              className="rounded-md px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-brand sm:px-3"
            >
              Contact
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* ---------------------------------------------------------- Hero */}
        <section className="relative overflow-hidden">
          {/* Soft blue wash behind the hero. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_20%_0%,var(--c-brand-soft)_0%,transparent_70%)]"
          />
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-brand uppercase">
              Product studio · Compliance &amp; privacy software
            </p>

            <h1 className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 font-display text-4xl leading-[1.35] font-semibold tracking-tight text-brand-ink sm:text-5xl lg:text-6xl dark:text-ink">
              <span className="leading-[1.35]">NYMBX ✕</span>
              <SlotWord words={COLLABORATORS} hint="hover me" />
            </h1>

            <p className="mt-8 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
              I build software for the unglamorous parts of shipping a product: EU Cyber Resilience
              Act documentation, security assessments, and small tools that respect the people using
              them. Currently working with Auray Technology.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <a
                href="#projects"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-brand-deep dark:text-brand-ink"
              >
                View projects <ArrowRight className="size-4" />
              </a>
              <Link
                to="/tools"
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-line-strong px-5 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
              >
                <Wrench className="size-4" /> Open the toolbox
              </Link>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ Projects */}
        <section id="projects" className="scroll-mt-20 border-t border-line bg-soft/50">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-brand uppercase">
                  Current projects
                </p>
                <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                  What I&rsquo;m building
                </h2>
              </div>
              <p className="text-xs text-faint tabular-nums">
                {String(projects.length).padStart(2, '0')} projects
              </p>
            </header>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- Contact */}
        <section id="contact" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <div className="rounded-2xl border border-line bg-[linear-gradient(140deg,var(--c-art-panel)_0%,var(--c-art-panel-2)_140%)] px-6 py-12 sm:px-12 sm:py-16">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-[var(--c-art-accent)] uppercase">
                Contact
              </p>
              <h2 className="mt-4 max-w-xl font-display text-2xl font-semibold tracking-tight text-[var(--c-art-ink)] sm:text-3xl">
                Contact me?
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--c-art-dim)] sm:text-base">
                Compliance tooling, a CRA question, or something that should exist and doesn&rsquo;t
                yet. Send a note and I&rsquo;ll reply.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--c-art-accent)] px-5 text-sm font-medium text-[var(--c-art-panel)] transition-opacity hover:opacity-90"
                >
                  <Mail className="size-4" /> {CONTACT_EMAIL}
                </a>
                <Link
                  to="/tools"
                  className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--c-art-dim)] px-5 text-sm font-medium text-[var(--c-art-ink)] transition-colors hover:border-[var(--c-art-accent)] hover:text-[var(--c-art-accent)]"
                >
                  <Wrench className="size-4" /> Try the toolbox
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="text-xs text-faint">
            {CONTACT_EMAIL} · NYMBX · {new Date().getFullYear()}
          </p>
          <Link to="/tools" className="text-xs text-faint hover:text-brand">
            NYMBX Toolbox →
          </Link>
        </div>
      </footer>
    </div>
  )
}
