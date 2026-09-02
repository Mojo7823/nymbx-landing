import { useEffect } from 'react'
import { ArrowDownRight, ArrowUpRight, Mail } from 'lucide-react'
import { ThemeToggle } from '../components/ThemeToggle'
import './its-me.css'

/**
 * Keep personal details in one place. Replace these values as the page grows;
 * the layout below should not need to change when the final copy arrives.
 */
const PROFILE = {
  name: 'The person behind NYMBX',
  email: 'admin@nymbx.dev',
  introduction:
    'I turn complicated workflows into clear, useful software — from privacy-first browser tools to products that make technical compliance easier to navigate.',
  focus: 'Product thinking, interface design, and dependable software for the web.',
  now: 'Building NYMBX and shaping practical tools around real-world problems.',
} as const

function usePersonalPageMetadata() {
  useEffect(() => {
    const previousTitle = document.title
    const previousDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const previousDescriptionContent = previousDescription?.content
    const existingRobots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const robots = existingRobots ?? document.createElement('meta')

    document.title = 'It’s me · NYMBX'
    if (previousDescription) {
      previousDescription.content = 'A personal introduction to the person behind NYMBX.'
    }
    robots.name = 'robots'
    robots.content = 'noindex, nofollow, noarchive'
    if (!existingRobots) document.head.append(robots)

    return () => {
      document.title = previousTitle
      if (previousDescription && previousDescriptionContent !== undefined) {
        previousDescription.content = previousDescriptionContent
      }
      if (!existingRobots) robots.remove()
    }
  }, [])
}

export default function ItsMe() {
  usePersonalPageMetadata()

  return (
    <div className="itsme min-h-dvh">
      <header className="itsme__header">
        <a className="itsme__mark" href="#top" aria-label="Back to top">
          <span aria-hidden="true">N</span>
          <span>Personal page</span>
        </a>

        <div className="itsme__header-note" aria-label="Page privacy">
          Unlisted <span aria-hidden="true">·</span> noindex
        </div>

        <ThemeToggle />
      </header>

      <main id="top">
        <section className="itsme__hero" aria-labelledby="itsme-heading">
          <div className="itsme__hero-copy">
            <p className="itsme__eyebrow">Hello from behind the work.</p>
            <h1 id="itsme-heading">
              I make useful things
              <span>for the web.</span>
            </h1>
            <p className="itsme__intro">{PROFILE.introduction}</p>

            <a className="itsme__down" href="#about">
              A little more about me <ArrowDownRight aria-hidden="true" />
            </a>
          </div>

          <div className="itsme__signature" aria-hidden="true">
            <span>ME</span>
            <div className="itsme__signature-caption">Person, not a brand.</div>
          </div>
        </section>

        <section id="about" className="itsme__about" aria-labelledby="about-heading">
          <div className="itsme__section-label">
            <span>About</span>
            <span aria-hidden="true">01</span>
          </div>

          <div className="itsme__about-body">
            <p className="itsme__kicker">{PROFILE.name}</p>
            <h2 id="about-heading">Thoughtful products, carefully made.</h2>
            <p>
              This is the beginning of my personal corner of the internet. The finished page will
              hold the story, experience, ideas, and details that do not belong on the NYMBX project
              page.
            </p>

            <dl className="itsme__facts">
              <div>
                <dt>Focus</dt>
                <dd>{PROFILE.focus}</dd>
              </div>
              <div>
                <dt>Right now</dt>
                <dd>{PROFILE.now}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="itsme__contact" aria-labelledby="contact-heading">
          <div>
            <p className="itsme__eyebrow">A direct line</p>
            <h2 id="contact-heading">Let’s talk.</h2>
          </div>
          <a href={`mailto:${PROFILE.email}`}>
            <Mail aria-hidden="true" />
            <span>{PROFILE.email}</span>
            <ArrowUpRight className="itsme__contact-arrow" aria-hidden="true" />
          </a>
        </section>
      </main>

      <footer className="itsme__footer">
        <p>A personal page by the person behind NYMBX.</p>
        <p>{new Date().getFullYear()}</p>
      </footer>
    </div>
  )
}
