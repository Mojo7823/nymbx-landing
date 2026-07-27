import type { ComponentType } from 'react'
import { DocPlatformArt } from './art/DocPlatformArt'
import { AssessmentArt } from './art/AssessmentArt'
import { ToolboxArt } from './art/ToolboxArt'
import { PlannerArt } from './art/PlannerArt'

export type ProjectStatus = 'live' | 'soon'

export const AURAY_URL = 'https://www.auray.com.tw/en/'

/** Long-form panel shown when a card without its own URL is clicked. */
export interface ProjectDetails {
  title: string
  paragraphs: string[]
  /** Optional dated milestones rendered as a small list. */
  keyDates?: { date: string; what: string }[]
  cta?: { label: string; href: string }
}

export interface Project {
  id: string
  name: string
  tagline: string
  description: string
  status: ProjectStatus
  /** `null` until the project has a public URL. The card opens `details`, or is inert. */
  href: string | null
  /** True when `href` points outside this site. */
  external?: boolean
  details?: ProjectDetails
  tags: string[]
  art: ComponentType
}

export const statusLabel: Record<ProjectStatus, string> = {
  live: 'Live',
  soon: 'Coming soon',
}

export const projects: Project[] = [
  {
    id: 'aucra',
    name: 'AuCRA 2.0',
    tagline: 'EU CRA Documentation Platform based on EN-40000',
    description:
      'Turns the Cyber Resilience Act paperwork into a guided workflow: technical documentation, evidence and conformity artefacts kept in one structured place.',
    status: 'live',
    href: null, // No public URL yet; the card opens the summary below instead.
    details: {
      title: 'What the EU Cyber Resilience Act asks for',
      paragraphs: [
        'The Cyber Resilience Act (Regulation (EU) 2024/2847) is the first EU-wide law setting cybersecurity requirements for products with digital elements, meaning any hardware or software placed on the EU market that connects to a device or network. It shifts responsibility onto the manufacturer: security by design, no known exploitable vulnerabilities at release, secure default configuration, and free security updates for the whole support period.',
        'Compliance is proven on paper as much as in code. Manufacturers carry out a conformity assessment, keep technical documentation and a software bill of materials, affix the CE marking, and run a coordinated vulnerability handling process, including reporting actively exploited vulnerabilities and severe incidents to ENISA and the national CSIRT within tight deadlines. AuCRA 2.0 turns that paperwork into a guided workflow so evidence, documentation and conformity artefacts live in one structured place instead of scattered spreadsheets.',
        'This platform is built and managed by Auray Technology. Please get in touch with them for inquiries.',
      ],
      keyDates: [
        { date: '10 Dec 2024', what: 'Regulation entered into force' },
        { date: '11 Sep 2026', what: 'Reporting obligations start applying' },
        { date: '11 Dec 2027', what: 'Full obligations apply to all products' },
      ],
      cta: { label: 'Visit Auray Technology', href: AURAY_URL },
    },
    tags: ['EU CRA', 'EN-40000', 'Compliance'],
    art: DocPlatformArt,
  },
  {
    id: 'cra-assessment',
    name: 'CRA Assessment',
    tagline: 'EU CRA initial assessment based on ENISA guidelines',
    description:
      'A first-pass self-assessment that tells a manufacturer where a product sits under the CRA and which obligations follow, scored against the ENISA guidance.',
    status: 'live',
    href: 'https://assessment.cra.nymbx.dev',
    external: true,
    tags: ['ENISA', 'Self-assessment', 'Risk'],
    art: AssessmentArt,
  },
  {
    id: 'toolbox',
    name: 'NYMBX Toolbox',
    tagline: 'Useful toolbox for everyday use',
    description:
      'PDF, image, text and data tools that run entirely in the browser. Files are processed on your device and never uploaded.',
    status: 'live',
    href: '/tools',
    tags: ['Client-side', 'Zero uploads', 'React + WASM'],
    art: ToolboxArt,
  },
  {
    id: 'planner',
    name: 'NYMBX Planner',
    tagline: 'Make appointments clear and easy',
    description:
      'Scheduling without the back-and-forth: shared availability, one link, and a booking everyone can read at a glance.',
    status: 'soon',
    href: null,
    tags: ['Scheduling', 'In design'],
    art: PlannerArt,
  },
]
