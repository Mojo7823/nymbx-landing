/**
 * Normalized SBOM model shared by the CycloneDX JSON, CycloneDX XML and
 * SPDX JSON paths, plus the pure helpers the UI derives from it.
 *
 * Everything here is side-effect free and runs both in the worker (JSON) and
 * on the main thread (XML — workers have no DOMParser).
 */

export interface SbomHash {
  alg: string
  value: string
}

export interface SbomComponent {
  /** `bom-ref` (CycloneDX) or `SPDXID` (SPDX); `null` when the document has none. */
  ref: string | null
  name: string
  /** CycloneDX `group` (npm scope, maven groupId); empty when absent. */
  group?: string
  version: string
  type: string
  supplier: string
  licenses: string[]
  purl: string
  cpe: string
  hashes: SbomHash[]
  description?: string
}

export interface SbomVulnerability {
  id: string
  source: string
  /** Source advisory URL, when the document carries one. */
  url: string
  severity: string
  score: number | null
  affects: string[]
  description: string
}

export interface SbomSubject {
  ref: string | null
  name: string
  version: string
}

export interface SbomDocument {
  format: 'CycloneDX' | 'SPDX'
  specVersion: string
  serialNumber: string | null
  created: string | null
  tools: string[]
  /** `metadata.component` (CycloneDX) / `documentDescribes` (SPDX). */
  subject: SbomSubject | null
  components: SbomComponent[]
  /** ref → dependsOn refs. */
  dependencies: Map<string, string[]>
  vulnerabilities: SbomVulnerability[]
  /** Non-fatal observations, e.g. "3 dependency refs point to unknown components". */
  warnings: string[]
}

/* -------------------------------------------------------------------------- */
/* Safe accessors — documents are untrusted `unknown`, never `any`.            */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rec(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null
  const child = value[key]
  return isRecord(child) ? child : null
}

/** Scalar → display string; anything else → ''. Lenient on purpose: invalid
 * documents must still render, the Validation tab is what reports their faults. */
function str(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function field(value: unknown, key: string): string {
  return isRecord(value) ? str(value[key]) : ''
}

function arr(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) return []
  const child = value[key]
  return Array.isArray(child) ? child : []
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* CycloneDX JSON                                                              */
/* -------------------------------------------------------------------------- */

function cdxLicenses(entries: unknown[]): string[] {
  const out: string[] = []
  for (const entry of entries) {
    if (!isRecord(entry)) continue
    const expression = str(entry.expression)
    if (expression) {
      out.push(expression)
      continue
    }
    const license = rec(entry, 'license')
    if (!license) continue
    const value = str(license.id) || str(license.name)
    if (value) out.push(value)
  }
  return out
}

function cdxHashes(entries: unknown[]): SbomHash[] {
  const out: SbomHash[] = []
  for (const entry of entries) {
    if (!isRecord(entry)) continue
    const alg = str(entry.alg)
    const value = str(entry.content)
    if (alg || value) out.push({ alg, value })
  }
  return out
}

/** `externalReferences` are not part of the table but carry the CPE in some tools. */
function cdxComponent(raw: unknown): SbomComponent {
  const cpe = field(raw, 'cpe')
  return {
    ref: isRecord(raw) && typeof raw['bom-ref'] === 'string' ? raw['bom-ref'] : null,
    name: field(raw, 'name'),
    group: field(raw, 'group'),
    version: field(raw, 'version'),
    type: field(raw, 'type'),
    // `supplier.name` is the spec field; `publisher`/`author` are what most
    // real-world generators actually fill in.
    supplier:
      field(rec(raw, 'supplier'), 'name') || field(raw, 'publisher') || field(raw, 'author'),
    licenses: cdxLicenses(arr(raw, 'licenses')),
    purl: field(raw, 'purl'),
    cpe,
    hashes: cdxHashes(arr(raw, 'hashes')),
    description: field(raw, 'description'),
  }
}

function collectCdxComponents(entries: unknown[], out: SbomComponent[]): void {
  for (const entry of entries) {
    out.push(cdxComponent(entry))
    const nested = arr(entry, 'components')
    if (nested.length > 0) collectCdxComponents(nested, out)
  }
}

/** `metadata.tools` is an array in 1.2–1.4 and `{ components, services }` in 1.5+. */
function cdxTools(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return []
  const tools = metadata.tools
  const entries: unknown[] = Array.isArray(tools)
    ? tools
    : [...arr(tools, 'components'), ...arr(tools, 'services')]
  const out: string[] = []
  for (const entry of entries) {
    const name = field(entry, 'name')
    if (!name) continue
    const vendor = field(entry, 'vendor') || field(entry, 'publisher')
    const version = field(entry, 'version')
    out.push([vendor && `${vendor} `, name, version && ` ${version}`].filter(Boolean).join(''))
  }
  return out
}

function cdxVulnerabilities(entries: unknown[]): SbomVulnerability[] {
  const out: SbomVulnerability[] = []
  for (const entry of entries) {
    if (!isRecord(entry)) continue
    const ratings = arr(entry, 'ratings')
    const rating = ratings.find((r) => field(r, 'severity') || num(isRecord(r) ? r.score : null))
    out.push({
      id: str(entry.id),
      source: field(rec(entry, 'source'), 'name'),
      url: field(rec(entry, 'source'), 'url'),
      severity: field(rating, 'severity') || 'unknown',
      score: num(isRecord(rating) ? rating.score : null),
      affects: arr(entry, 'affects')
        .map((a) => field(a, 'ref'))
        .filter(Boolean),
      description: str(entry.description),
    })
  }
  return out
}

export function normalizeCycloneDx(json: unknown): SbomDocument {
  const metadata = rec(json, 'metadata')
  const subjectRaw = metadata?.component
  const components: SbomComponent[] = []
  collectCdxComponents(arr(json, 'components'), components)

  const dependencies = new Map<string, string[]>()
  for (const entry of arr(json, 'dependencies')) {
    const ref = field(entry, 'ref')
    if (!ref) continue
    const dependsOn = arr(entry, 'dependsOn')
      .map((d) => str(d))
      .filter(Boolean)
    dependencies.set(ref, [...(dependencies.get(ref) ?? []), ...dependsOn])
  }

  const doc: SbomDocument = {
    format: 'CycloneDX',
    specVersion: field(json, 'specVersion'),
    serialNumber: field(json, 'serialNumber') || null,
    created: field(metadata, 'timestamp') || null,
    tools: cdxTools(metadata),
    subject: subjectRaw
      ? {
          ref:
            isRecord(subjectRaw) && typeof subjectRaw['bom-ref'] === 'string'
              ? subjectRaw['bom-ref']
              : null,
          name: field(subjectRaw, 'name'),
          version: field(subjectRaw, 'version'),
        }
      : null,
    components,
    dependencies,
    vulnerabilities: cdxVulnerabilities(arr(json, 'vulnerabilities')),
    warnings: [],
  }
  doc.warnings = documentWarnings(doc)
  return doc
}

/* -------------------------------------------------------------------------- */
/* CycloneDX XML (main thread only — workers have no DOMParser)                */
/* -------------------------------------------------------------------------- */

function kids(parent: Element, name: string): Element[] {
  const out: Element[] = []
  for (const child of Array.from(parent.children)) {
    if (child.localName === name) out.push(child)
  }
  return out
}

function kid(parent: Element, name: string): Element | null {
  return kids(parent, name)[0] ?? null
}

function kidText(parent: Element, name: string): string {
  return kid(parent, name)?.textContent?.trim() ?? ''
}

function xmlLicenses(parent: Element | null): string[] {
  if (!parent) return []
  const out: string[] = []
  for (const license of kids(parent, 'license')) {
    const value = kidText(license, 'id') || kidText(license, 'name')
    if (value) out.push(value)
  }
  for (const expression of kids(parent, 'expression')) {
    const value = expression.textContent?.trim()
    if (value) out.push(value)
  }
  return out
}

function xmlComponent(el: Element): SbomComponent {
  const hashesEl = kid(el, 'hashes')
  return {
    ref: el.getAttribute('bom-ref'),
    name: kidText(el, 'name'),
    group: kidText(el, 'group'),
    version: kidText(el, 'version'),
    type: el.getAttribute('type') ?? '',
    supplier: (() => {
      const supplier = kid(el, 'supplier')
      return (
        (supplier && kidText(supplier, 'name')) || kidText(el, 'publisher') || kidText(el, 'author')
      )
    })(),
    licenses: xmlLicenses(kid(el, 'licenses')),
    purl: kidText(el, 'purl'),
    cpe: kidText(el, 'cpe'),
    hashes: hashesEl
      ? kids(hashesEl, 'hash').map((h) => ({
          alg: h.getAttribute('alg') ?? '',
          value: h.textContent?.trim() ?? '',
        }))
      : [],
    description: kidText(el, 'description'),
  }
}

function collectXmlComponents(parent: Element, out: SbomComponent[]): void {
  for (const el of kids(parent, 'component')) {
    out.push(xmlComponent(el))
    const nested = kid(el, 'components')
    if (nested) collectXmlComponents(nested, out)
  }
}

function collectXmlDependencies(parent: Element, into: Map<string, string[]>): void {
  for (const el of kids(parent, 'dependency')) {
    const ref = el.getAttribute('ref')
    if (!ref) continue
    const children = kids(el, 'dependency')
    const dependsOn = children.map((c) => c.getAttribute('ref') ?? '').filter(Boolean)
    into.set(ref, [...(into.get(ref) ?? []), ...dependsOn])
    collectXmlDependencies(el, into)
  }
}

export function normalizeCycloneDxXml(doc: Document): SbomDocument {
  const root = doc.documentElement
  const namespace = root.namespaceURI ?? ''
  const versionMatch = /\/bom\/(\d+\.\d+)/.exec(namespace)

  const metadata = kid(root, 'metadata')
  const subjectEl = metadata ? kid(metadata, 'component') : null
  const components: SbomComponent[] = []
  const componentsEl = kid(root, 'components')
  if (componentsEl) collectXmlComponents(componentsEl, components)

  const dependencies = new Map<string, string[]>()
  const dependenciesEl = kid(root, 'dependencies')
  if (dependenciesEl) collectXmlDependencies(dependenciesEl, dependencies)

  const toolsEl = metadata ? kid(metadata, 'tools') : null
  const tools = toolsEl
    ? kids(toolsEl, 'tool').map((tool) =>
        [kidText(tool, 'vendor'), kidText(tool, 'name'), kidText(tool, 'version')]
          .filter(Boolean)
          .join(' '),
      )
    : []

  const vulnerabilitiesEl = kid(root, 'vulnerabilities')
  const vulnerabilities = vulnerabilitiesEl
    ? kids(vulnerabilitiesEl, 'vulnerability').map((v) => {
        const ratingsEl = kid(v, 'ratings')
        const rating = ratingsEl ? kid(ratingsEl, 'rating') : null
        const affectsEl = kid(v, 'affects')
        const sourceEl = kid(v, 'source')
        return {
          id: kidText(v, 'id'),
          source: sourceEl ? kidText(sourceEl, 'name') : '',
          url: sourceEl ? kidText(sourceEl, 'url') : '',
          severity: (rating && kidText(rating, 'severity')) || 'unknown',
          score: rating ? num(kidText(rating, 'score')) : null,
          affects: affectsEl
            ? kids(affectsEl, 'target')
                .map((t) => kidText(t, 'ref'))
                .filter(Boolean)
            : [],
          description: kidText(v, 'description'),
        }
      })
    : []

  const normalized: SbomDocument = {
    format: 'CycloneDX',
    specVersion: versionMatch ? versionMatch[1] : '',
    serialNumber: root.getAttribute('serialNumber'),
    created: (metadata && kidText(metadata, 'timestamp')) || null,
    tools,
    subject: subjectEl
      ? {
          ref: subjectEl.getAttribute('bom-ref'),
          name: kidText(subjectEl, 'name'),
          version: kidText(subjectEl, 'version'),
        }
      : null,
    components,
    dependencies,
    vulnerabilities,
    warnings: [],
  }
  normalized.warnings = documentWarnings(normalized)
  return normalized
}

/* -------------------------------------------------------------------------- */
/* SPDX JSON                                                                   */
/* -------------------------------------------------------------------------- */

const SPDX_NO_VALUE = new Set(['NOASSERTION', 'NONE', 'UNSPECIFIED', ''])

/** `Organization: Acme Inc` / `Person: Jane` → the bare name. */
function spdxActor(value: string): string {
  if (SPDX_NO_VALUE.has(value)) return ''
  return value.replace(/^(Organization|Person|Tool)\s*:\s*/i, '').trim()
}

/** Parent → child relationships, mapped onto the CycloneDX `dependsOn` shape. */
const SPDX_FORWARD = new Set(['DEPENDS_ON', 'CONTAINS', 'DYNAMIC_LINK', 'STATIC_LINK'])

export function normalizeSpdx(json: unknown): SbomDocument {
  const creationInfo = rec(json, 'creationInfo')
  const creators = arr(creationInfo, 'creators').map((c) => str(c))

  const components: SbomComponent[] = []
  for (const pkg of arr(json, 'packages')) {
    const licenses: string[] = []
    for (const key of ['licenseConcluded', 'licenseDeclared'] as const) {
      const value = field(pkg, key)
      if (!SPDX_NO_VALUE.has(value) && !licenses.includes(value)) licenses.push(value)
    }
    let purl = ''
    let cpe = ''
    for (const ref of arr(pkg, 'externalRefs')) {
      const type = field(ref, 'referenceType')
      const locator = field(ref, 'referenceLocator')
      if (type === 'purl' && !purl) purl = locator
      if (type.startsWith('cpe') && !cpe) cpe = locator
    }
    components.push({
      ref: field(pkg, 'SPDXID') || null,
      name: field(pkg, 'name'),
      version: field(pkg, 'versionInfo'),
      type: field(pkg, 'primaryPackagePurpose').toLowerCase() || 'package',
      supplier: spdxActor(field(pkg, 'supplier')) || spdxActor(field(pkg, 'originator')),
      licenses,
      purl,
      cpe,
      hashes: arr(pkg, 'checksums').map((c) => ({
        alg: field(c, 'algorithm'),
        value: field(c, 'checksumValue'),
      })),
      description: field(pkg, 'description') || field(pkg, 'summary'),
    })
  }

  const dependencies = new Map<string, string[]>()
  function link(from: string, to: string) {
    if (!from || !to) return
    dependencies.set(from, [...(dependencies.get(from) ?? []), to])
  }
  for (const relation of arr(json, 'relationships')) {
    const type = field(relation, 'relationshipType').toUpperCase()
    const from = field(relation, 'spdxElementId')
    const to = field(relation, 'relatedSpdxElement')
    if (SPDX_FORWARD.has(type)) link(from, to)
    else if (type === 'DEPENDENCY_OF') link(to, from)
  }

  const describes = arr(json, 'documentDescribes')
    .map((d) => str(d))
    .filter(Boolean)
  const subjectRef = describes[0] ?? null
  const subjectPkg = subjectRef ? components.find((c) => c.ref === subjectRef) : undefined

  const doc: SbomDocument = {
    format: 'SPDX',
    specVersion: field(json, 'spdxVersion').replace(/^SPDX-/, ''),
    serialNumber: field(json, 'documentNamespace') || null,
    created: field(creationInfo, 'created') || null,
    tools: creators.filter((c) => /^Tool\s*:/i.test(c)).map(spdxActor),
    subject: subjectRef
      ? {
          ref: subjectRef,
          name: subjectPkg?.name || field(json, 'name'),
          version: subjectPkg?.version ?? '',
        }
      : null,
    components,
    dependencies,
    vulnerabilities: [],
    warnings: [],
  }
  doc.warnings = documentWarnings(doc)
  return doc
}

/* -------------------------------------------------------------------------- */
/* Derived helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Dependency refs that match no component (and no subject). */
export function unresolvedRefs(doc: SbomDocument): string[] {
  const known = new Set<string>()
  for (const component of doc.components) if (component.ref) known.add(component.ref)
  if (doc.subject?.ref) known.add(doc.subject.ref)
  const missing = new Set<string>()
  for (const [ref, dependsOn] of doc.dependencies) {
    if (!known.has(ref)) missing.add(ref)
    for (const target of dependsOn) if (!known.has(target)) missing.add(target)
  }
  return [...missing]
}

function documentWarnings(doc: SbomDocument): string[] {
  const warnings: string[] = []
  const missing = unresolvedRefs(doc)
  if (missing.length > 0) {
    warnings.push(
      `${missing.length} dependency ${missing.length === 1 ? 'ref points' : 'refs point'} to unknown components`,
    )
  }
  if (doc.components.length === 0) warnings.push('This document lists no components')
  return warnings
}

export interface LicenseEntry {
  license: string
  count: number
  /** Component display names carrying this license. */
  components: string[]
}

export const NO_LICENSE = 'No license information'

/** license → count, sorted by count then name; components without licenses are counted too. */
export function licenseSummary(components: SbomComponent[]): LicenseEntry[] {
  const map = new Map<string, string[]>()
  for (const component of components) {
    const label = componentLabel(component)
    const licenses = component.licenses.length > 0 ? component.licenses : [NO_LICENSE]
    for (const license of licenses) {
      const list = map.get(license)
      if (list) list.push(label)
      else map.set(license, [label])
    }
  }
  return [...map.entries()]
    .map(([license, names]) => ({ license, count: names.length, components: names }))
    .sort((a, b) => b.count - a.count || a.license.localeCompare(b.license))
}

/** `name@version`, or just the name when unversioned. */
export function componentLabel(component: SbomComponent | SbomSubject): string {
  const group = 'group' in component ? component.group : ''
  const name = group ? `${group}/${component.name}` : component.name
  return component.version ? `${name}@${component.version}` : name || '(unnamed)'
}

export interface TreeNode {
  ref: string
  label: string
  childCount: number
  children: TreeNode[]
  /** This ref was already expanded elsewhere; children are omitted to keep cycles finite. */
  repeated: boolean
  /** No component carries this ref. */
  unknown: boolean
}

export interface DependencyTree {
  roots: TreeNode[]
  /** Total nodes materialized (used to disable "Expand all" on huge trees). */
  nodeCount: number
  unresolved: string[]
}

/**
 * Roots are the document subject, or every component nobody depends on.
 * A ref is expanded at most once in the whole tree: later occurrences become
 * leaves marked `repeated`, which keeps cycles finite and the size bounded.
 */
export function dependencyTree(doc: SbomDocument): DependencyTree {
  const byRef = new Map<string, SbomComponent>()
  for (const component of doc.components) if (component.ref) byRef.set(component.ref, component)

  const depended = new Set<string>()
  for (const targets of doc.dependencies.values()) for (const t of targets) depended.add(t)

  const rootRefs: string[] = []
  if (doc.subject?.ref && (doc.dependencies.has(doc.subject.ref) || byRef.has(doc.subject.ref))) {
    rootRefs.push(doc.subject.ref)
  }
  for (const ref of doc.dependencies.keys()) {
    if (!depended.has(ref) && !rootRefs.includes(ref)) rootRefs.push(ref)
  }
  if (rootRefs.length === 0) {
    for (const component of doc.components) {
      if (component.ref && !depended.has(component.ref)) rootRefs.push(component.ref)
    }
  }

  const expanded = new Set<string>()
  let nodeCount = 0

  function build(ref: string): TreeNode {
    nodeCount++
    const component = byRef.get(ref)
    const label = component
      ? componentLabel(component)
      : doc.subject?.ref === ref
        ? componentLabel(doc.subject)
        : ref
    const targets = doc.dependencies.get(ref) ?? []
    const node: TreeNode = {
      ref,
      label,
      childCount: targets.length,
      children: [],
      repeated: expanded.has(ref),
      unknown: !component && doc.subject?.ref !== ref,
    }
    if (node.repeated) return node
    expanded.add(ref)
    node.children = targets.map(build)
    return node
  }

  return { roots: rootRefs.map(build), nodeCount, unresolved: unresolvedRefs(doc) }
}

/* -------------------------------------------------------------------------- */
/* CSV export, search and sort                                                 */
/* -------------------------------------------------------------------------- */

export const CSV_COLUMNS = [
  'name',
  'version',
  'type',
  'supplier',
  'licenses',
  'purl',
  'cpe',
  'hashes',
] as const

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** RFC 4180 CSV of the components table (CRLF line endings). */
export function componentsToCsv(components: SbomComponent[]): string {
  const lines = [CSV_COLUMNS.join(',')]
  for (const component of components) {
    lines.push(
      [
        component.group ? `${component.group}/${component.name}` : component.name,
        component.version,
        component.type,
        component.supplier,
        component.licenses.join('; '),
        component.purl,
        component.cpe,
        component.hashes.map((h) => `${h.alg}:${h.value}`).join('; '),
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}

export type SortColumn = 'name' | 'version' | 'type' | 'supplier' | 'licenses' | 'purl'

function sortKey(component: SbomComponent, column: SortColumn): string {
  switch (column) {
    case 'name':
      return component.group ? `${component.group}/${component.name}` : component.name
    case 'licenses':
      return component.licenses.join('; ')
    default:
      return component[column]
  }
}

function haystack(component: SbomComponent): string {
  return [
    component.name,
    component.group ?? '',
    component.version,
    component.type,
    component.supplier,
    component.purl,
    component.cpe,
    component.licenses.join(' '),
  ]
    .join(' ')
    .toLowerCase()
}

/**
 * Search + sort in one pass. `query` matches name, group, version, type,
 * supplier, purl, cpe and licenses, case-insensitively; an empty `column`
 * leaves document order untouched. Never mutates the input.
 */
export function filterSort(
  components: SbomComponent[],
  query: string,
  column: SortColumn | null,
  dir: 'asc' | 'desc',
): SbomComponent[] {
  const needle = query.trim().toLowerCase()
  const rows = needle ? components.filter((c) => haystack(c).includes(needle)) : [...components]
  if (!column) return rows
  const sign = dir === 'asc' ? 1 : -1
  return rows
    .map((component, index) => ({ component, index }))
    .sort((a, b) => {
      const ka = sortKey(a.component, column)
      const kb = sortKey(b.component, column)
      if (ka === '' && kb !== '') return 1
      if (kb === '' && ka !== '') return -1
      return sign * ka.localeCompare(kb, undefined, { numeric: true }) || a.index - b.index
    })
    .map((entry) => entry.component)
}

/** critical → unknown; used to sort and colour the vulnerabilities table. */
export const SEVERITY_ORDER = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
  'none',
  'unknown',
] as const

export function severityRank(severity: string): number {
  const index = SEVERITY_ORDER.indexOf(severity.toLowerCase() as (typeof SEVERITY_ORDER)[number])
  return index === -1 ? SEVERITY_ORDER.length : index
}
