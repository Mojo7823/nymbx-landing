/**
 * CVSS v3.1 metric definitions, in the canonical vector-string order of the
 * specification (§6), plus parsing and formatting. Descriptions are one-sentence
 * paraphrases of the specification text, written for tooltips.
 */

import { formatVector, parseVector, type MetricDefinition, type MetricValue } from '../vector'

export type V31Group = 'base' | 'temporal' | 'environmental'

export type V31Key =
  | 'AV'
  | 'AC'
  | 'PR'
  | 'UI'
  | 'S'
  | 'C'
  | 'I'
  | 'A'
  | 'E'
  | 'RL'
  | 'RC'
  | 'CR'
  | 'IR'
  | 'AR'
  | 'MAV'
  | 'MAC'
  | 'MPR'
  | 'MUI'
  | 'MS'
  | 'MC'
  | 'MI'
  | 'MA'

export type V31Selection = Record<V31Key, string>

export const NOT_DEFINED = 'X'

const notDefined: MetricValue = {
  value: 'X',
  label: 'Not Defined',
  description: 'The metric is not used; it has no effect on the score.',
}

const ciaValues = (what: string): MetricValue[] => [
  { value: 'H', label: 'High', description: `There is a total loss of ${what}.` },
  { value: 'L', label: 'Low', description: `There is some loss of ${what}, but limited in scope.` },
  { value: 'N', label: 'None', description: `There is no loss of ${what}.` },
]

const requirementValues = (what: string): MetricValue[] => [
  notDefined,
  {
    value: 'H',
    label: 'High',
    description: `Loss of ${what} is likely to have a catastrophic effect on the organisation.`,
  },
  {
    value: 'M',
    label: 'Medium',
    description: `Loss of ${what} is likely to have a serious effect on the organisation.`,
  },
  {
    value: 'L',
    label: 'Low',
    description: `Loss of ${what} is likely to have only a limited effect on the organisation.`,
  },
]

const attackVectorValues: MetricValue[] = [
  {
    value: 'N',
    label: 'Network',
    description: 'The component is bound to the network stack and can be attacked remotely.',
  },
  {
    value: 'A',
    label: 'Adjacent',
    description:
      'The attack is limited to a shared physical or logical network, such as the local subnet.',
  },
  {
    value: 'L',
    label: 'Local',
    description:
      'The attacker works through local read/write/execute access or relies on user interaction.',
  },
  {
    value: 'P',
    label: 'Physical',
    description: 'The attacker must physically touch or manipulate the vulnerable component.',
  },
]

const attackComplexityValues: MetricValue[] = [
  {
    value: 'L',
    label: 'Low',
    description: 'No special conditions are needed; the attack can be repeated reliably.',
  },
  {
    value: 'H',
    label: 'High',
    description: 'A successful attack depends on conditions outside the attacker’s control.',
  },
]

const privilegesValues: MetricValue[] = [
  {
    value: 'N',
    label: 'None',
    description: 'The attacker is unauthorised before the attack and needs no access.',
  },
  {
    value: 'L',
    label: 'Low',
    description: 'The attacker needs privileges that grant access to non-sensitive resources.',
  },
  {
    value: 'H',
    label: 'High',
    description:
      'The attacker needs privileges that grant significant control over the vulnerable component.',
  },
]

const userInteractionValues: MetricValue[] = [
  {
    value: 'N',
    label: 'None',
    description: 'The vulnerability can be exploited without any user taking part.',
  },
  {
    value: 'R',
    label: 'Required',
    description: 'A user must perform some action before the vulnerability can be exploited.',
  },
]

const scopeValues: MetricValue[] = [
  {
    value: 'U',
    label: 'Unchanged',
    description: 'The exploit affects only resources managed by the same security authority.',
  },
  {
    value: 'C',
    label: 'Changed',
    description: 'The exploit can affect resources beyond the vulnerable component’s authority.',
  },
]

function modified(values: MetricValue[]): MetricValue[] {
  return [notDefined, ...values]
}

export const v31Metrics: MetricDefinition<V31Key, V31Group>[] = [
  { key: 'AV', name: 'Attack Vector', group: 'base', values: attackVectorValues },
  { key: 'AC', name: 'Attack Complexity', group: 'base', values: attackComplexityValues },
  { key: 'PR', name: 'Privileges Required', group: 'base', values: privilegesValues },
  { key: 'UI', name: 'User Interaction', group: 'base', values: userInteractionValues },
  { key: 'S', name: 'Scope', group: 'base', values: scopeValues },
  { key: 'C', name: 'Confidentiality', group: 'base', values: ciaValues('confidentiality') },
  { key: 'I', name: 'Integrity', group: 'base', values: ciaValues('integrity') },
  { key: 'A', name: 'Availability', group: 'base', values: ciaValues('availability') },
  {
    key: 'E',
    name: 'Exploit Code Maturity',
    group: 'temporal',
    values: [
      notDefined,
      {
        value: 'H',
        label: 'High',
        description: 'Functional autonomous code exists, or no exploit is needed at all.',
      },
      {
        value: 'F',
        label: 'Functional',
        description: 'Functional exploit code is available and works in most situations.',
      },
      {
        value: 'P',
        label: 'Proof-of-Concept',
        description: 'Proof-of-concept code exists but is not practical for most situations.',
      },
      {
        value: 'U',
        label: 'Unproven',
        description: 'No exploit code is available, or the exploit is theoretical.',
      },
    ],
  },
  {
    key: 'RL',
    name: 'Remediation Level',
    group: 'temporal',
    values: [
      notDefined,
      { value: 'U', label: 'Unavailable', description: 'No remediation is available.' },
      {
        value: 'W',
        label: 'Workaround',
        description: 'An unofficial, non-vendor workaround is available.',
      },
      {
        value: 'T',
        label: 'Temporary Fix',
        description: 'An official but temporary fix, such as a hotfix, is available.',
      },
      {
        value: 'O',
        label: 'Official Fix',
        description: 'A complete vendor patch or upgrade is available.',
      },
    ],
  },
  {
    key: 'RC',
    name: 'Report Confidence',
    group: 'temporal',
    values: [
      notDefined,
      {
        value: 'C',
        label: 'Confirmed',
        description: 'The vulnerability is confirmed by the vendor or detailed reports.',
      },
      {
        value: 'R',
        label: 'Reasonable',
        description: 'Significant details are published but the root cause is unconfirmed.',
      },
      {
        value: 'U',
        label: 'Unknown',
        description: 'Reports are contradictory or the root cause is unknown.',
      },
    ],
  },
  {
    key: 'CR',
    name: 'Confidentiality Requirement',
    group: 'environmental',
    values: requirementValues('confidentiality'),
  },
  {
    key: 'IR',
    name: 'Integrity Requirement',
    group: 'environmental',
    values: requirementValues('integrity'),
  },
  {
    key: 'AR',
    name: 'Availability Requirement',
    group: 'environmental',
    values: requirementValues('availability'),
  },
  {
    key: 'MAV',
    name: 'Modified Attack Vector',
    group: 'environmental',
    values: modified(attackVectorValues),
  },
  {
    key: 'MAC',
    name: 'Modified Attack Complexity',
    group: 'environmental',
    values: modified(attackComplexityValues),
  },
  {
    key: 'MPR',
    name: 'Modified Privileges Required',
    group: 'environmental',
    values: modified(privilegesValues),
  },
  {
    key: 'MUI',
    name: 'Modified User Interaction',
    group: 'environmental',
    values: modified(userInteractionValues),
  },
  { key: 'MS', name: 'Modified Scope', group: 'environmental', values: modified(scopeValues) },
  {
    key: 'MC',
    name: 'Modified Confidentiality',
    group: 'environmental',
    values: modified(ciaValues('confidentiality')),
  },
  {
    key: 'MI',
    name: 'Modified Integrity',
    group: 'environmental',
    values: modified(ciaValues('integrity')),
  },
  {
    key: 'MA',
    name: 'Modified Availability',
    group: 'environmental',
    values: modified(ciaValues('availability')),
  },
]

export const V31_BASE_KEYS: V31Key[] = ['AV', 'AC', 'PR', 'UI', 'S', 'C', 'I', 'A']

export const V31_PREFIX = 'CVSS:3.1'

/** Every metric at its first value for base metrics and "not defined" elsewhere. */
export function defaultV31Selection(): V31Selection {
  const selection = {} as V31Selection
  for (const metric of v31Metrics) selection[metric.key] = metric.values[0].value
  return selection
}

export interface V31ParseResult {
  selection: V31Selection
  /** True when the input used the `CVSS:3.0` prefix; it is scored with the 3.1 equations. */
  wasV30: boolean
}

export function parseV31(input: string): V31ParseResult {
  const { selection, prefix } = parseVector<V31Key>(input, {
    prefixes: [V31_PREFIX, 'CVSS:3.0'],
    definitions: v31Metrics,
    required: V31_BASE_KEYS,
    notDefined: NOT_DEFINED,
  })
  return { selection, wasV30: prefix === 'CVSS:3.0' }
}

export function formatV31(selection: V31Selection): string {
  return formatVector(V31_PREFIX, v31Metrics, selection, NOT_DEFINED)
}

/** True when any temporal metric is set. */
export function hasTemporal(selection: V31Selection): boolean {
  return (['E', 'RL', 'RC'] as V31Key[]).some((k) => selection[k] !== NOT_DEFINED)
}

/** True when any environmental metric is set. */
export function hasEnvironmental(selection: V31Selection): boolean {
  return v31Metrics
    .filter((m) => m.group === 'environmental')
    .some((m) => selection[m.key] !== NOT_DEFINED)
}
