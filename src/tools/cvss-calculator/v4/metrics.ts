/**
 * CVSS v4.0 metric definitions. The metric order and the valid values of each
 * metric are taken from the reference implementation's `metrics.js`
 * (`expectedMetricOrder`) — see SOURCES.md. Names and descriptions are written
 * from the CVSS v4.0 specification.
 */

import { formatVector, parseVector, type MetricDefinition, type MetricValue } from '../vector'

export type V4Group = 'base' | 'threat' | 'environmental' | 'supplemental'

export type V4Key =
  | 'AV'
  | 'AC'
  | 'AT'
  | 'PR'
  | 'UI'
  | 'VC'
  | 'VI'
  | 'VA'
  | 'SC'
  | 'SI'
  | 'SA'
  | 'E'
  | 'CR'
  | 'IR'
  | 'AR'
  | 'MAV'
  | 'MAC'
  | 'MAT'
  | 'MPR'
  | 'MUI'
  | 'MVC'
  | 'MVI'
  | 'MVA'
  | 'MSC'
  | 'MSI'
  | 'MSA'
  | 'S'
  | 'AU'
  | 'R'
  | 'V'
  | 'RE'
  | 'U'

export type V4Selection = Record<V4Key, string>

export const NOT_DEFINED = 'X'

const notDefined: MetricValue = {
  value: 'X',
  label: 'Not Defined',
  description: 'The metric is not used; it has no effect on the score.',
}

const impactValues = (subject: string, what: string): MetricValue[] => [
  { value: 'H', label: 'High', description: `There is a total loss of ${what} in ${subject}.` },
  {
    value: 'L',
    label: 'Low',
    description: `There is some loss of ${what} in ${subject}, limited in scope or degree.`,
  },
  { value: 'N', label: 'None', description: `There is no loss of ${what} in ${subject}.` },
]

const attackVectorValues: MetricValue[] = [
  {
    value: 'N',
    label: 'Network',
    description: 'The vulnerable system is bound to the network stack and reachable remotely.',
  },
  {
    value: 'A',
    label: 'Adjacent',
    description:
      'The attack is limited to a shared logical or physical network, such as Bluetooth.',
  },
  {
    value: 'L',
    label: 'Local',
    description:
      'The attacker works through local read/write/execute access rather than a network.',
  },
  {
    value: 'P',
    label: 'Physical',
    description: 'The attacker must physically touch or manipulate the vulnerable system.',
  },
]

const attackComplexityValues: MetricValue[] = [
  {
    value: 'L',
    label: 'Low',
    description: 'The attacker need not evade any built-in security-hardening mechanism.',
  },
  {
    value: 'H',
    label: 'High',
    description: 'The attacker must evade or circumvent a security-hardening mechanism.',
  },
]

const attackRequirementsValues: MetricValue[] = [
  {
    value: 'N',
    label: 'None',
    description:
      'The attack succeeds against any deployment, with no deployment-specific prerequisite.',
  },
  {
    value: 'P',
    label: 'Present',
    description:
      'A specific deployment or execution condition must hold for the attack to succeed.',
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
    description: 'The attacker needs basic user privileges on the vulnerable system.',
  },
  {
    value: 'H',
    label: 'High',
    description: 'The attacker needs administrative or equivalent privileges.',
  },
]

const userInteractionValues: MetricValue[] = [
  {
    value: 'N',
    label: 'None',
    description: 'The vulnerability can be exploited without any user taking part.',
  },
  {
    value: 'P',
    label: 'Passive',
    description: 'Exploitation needs limited, involuntary interaction from a user of the system.',
  },
  {
    value: 'A',
    label: 'Active',
    description: 'Exploitation needs a user to perform specific, conscious interactions.',
  },
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

const safety: MetricValue = {
  value: 'S',
  label: 'Safety',
  description:
    'The consequence to the subsequent system meets the IEC 61508 definition of marginal or worse.',
}

function modified(values: MetricValue[]): MetricValue[] {
  return [notDefined, ...values]
}

export const v4Metrics: MetricDefinition<V4Key, V4Group>[] = [
  { key: 'AV', name: 'Attack Vector', group: 'base', values: attackVectorValues },
  { key: 'AC', name: 'Attack Complexity', group: 'base', values: attackComplexityValues },
  { key: 'AT', name: 'Attack Requirements', group: 'base', values: attackRequirementsValues },
  { key: 'PR', name: 'Privileges Required', group: 'base', values: privilegesValues },
  { key: 'UI', name: 'User Interaction', group: 'base', values: userInteractionValues },
  {
    key: 'VC',
    name: 'Vulnerable System Confidentiality',
    group: 'base',
    values: impactValues('the vulnerable system', 'confidentiality'),
  },
  {
    key: 'VI',
    name: 'Vulnerable System Integrity',
    group: 'base',
    values: impactValues('the vulnerable system', 'integrity'),
  },
  {
    key: 'VA',
    name: 'Vulnerable System Availability',
    group: 'base',
    values: impactValues('the vulnerable system', 'availability'),
  },
  {
    key: 'SC',
    name: 'Subsequent System Confidentiality',
    group: 'base',
    values: impactValues('subsequent systems', 'confidentiality'),
  },
  {
    key: 'SI',
    name: 'Subsequent System Integrity',
    group: 'base',
    values: impactValues('subsequent systems', 'integrity'),
  },
  {
    key: 'SA',
    name: 'Subsequent System Availability',
    group: 'base',
    values: impactValues('subsequent systems', 'availability'),
  },
  {
    key: 'E',
    name: 'Exploit Maturity',
    group: 'threat',
    values: [
      notDefined,
      {
        value: 'A',
        label: 'Attacked',
        description: 'Attacks or exploitation automation targeting this vulnerability are known.',
      },
      {
        value: 'P',
        label: 'Proof-of-Concept',
        description: 'Proof-of-concept code is public but no attacks are known.',
      },
      {
        value: 'U',
        label: 'Unreported',
        description: 'No public exploit code or known attacks exist.',
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
    key: 'MAT',
    name: 'Modified Attack Requirements',
    group: 'environmental',
    values: modified(attackRequirementsValues),
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
  {
    key: 'MVC',
    name: 'Modified Vulnerable System Confidentiality',
    group: 'environmental',
    values: modified(impactValues('the vulnerable system', 'confidentiality')),
  },
  {
    key: 'MVI',
    name: 'Modified Vulnerable System Integrity',
    group: 'environmental',
    values: modified(impactValues('the vulnerable system', 'integrity')),
  },
  {
    key: 'MVA',
    name: 'Modified Vulnerable System Availability',
    group: 'environmental',
    values: modified(impactValues('the vulnerable system', 'availability')),
  },
  {
    key: 'MSC',
    name: 'Modified Subsequent System Confidentiality',
    group: 'environmental',
    values: modified(impactValues('subsequent systems', 'confidentiality')),
  },
  {
    key: 'MSI',
    name: 'Modified Subsequent System Integrity',
    group: 'environmental',
    values: [notDefined, safety, ...impactValues('subsequent systems', 'integrity')],
  },
  {
    key: 'MSA',
    name: 'Modified Subsequent System Availability',
    group: 'environmental',
    values: [notDefined, safety, ...impactValues('subsequent systems', 'availability')],
  },
  {
    key: 'S',
    name: 'Safety',
    group: 'supplemental',
    values: [
      notDefined,
      {
        value: 'N',
        label: 'Negligible',
        description: 'Consequences to human safety are negligible or absent.',
      },
      {
        value: 'P',
        label: 'Present',
        description: 'Consequences to human safety meet the IEC 61508 marginal level or worse.',
      },
    ],
  },
  {
    key: 'AU',
    name: 'Automatable',
    group: 'supplemental',
    values: [
      notDefined,
      {
        value: 'N',
        label: 'No',
        description: 'An attacker cannot automate all four steps of the kill chain.',
      },
      {
        value: 'Y',
        label: 'Yes',
        description:
          'An attacker can automate reconnaissance, weaponisation, delivery and exploitation.',
      },
    ],
  },
  {
    key: 'R',
    name: 'Recovery',
    group: 'supplemental',
    values: [
      notDefined,
      {
        value: 'A',
        label: 'Automatic',
        description: 'The system recovers by itself after the attack.',
      },
      {
        value: 'U',
        label: 'User',
        description: 'A user must act to restore the system after the attack.',
      },
      {
        value: 'I',
        label: 'Irrecoverable',
        description: 'The system cannot be restored to its pre-attack state.',
      },
    ],
  },
  {
    key: 'V',
    name: 'Value Density',
    group: 'supplemental',
    values: [
      notDefined,
      {
        value: 'D',
        label: 'Diffuse',
        description: 'The system holds limited resources, so a single exploit yields little.',
      },
      {
        value: 'C',
        label: 'Concentrated',
        description: 'The system is rich in resources, so a single exploit yields a lot.',
      },
    ],
  },
  {
    key: 'RE',
    name: 'Vulnerability Response Effort',
    group: 'supplemental',
    values: [
      notDefined,
      {
        value: 'L',
        label: 'Low',
        description: 'The remediation is trivial to apply and needs no downtime.',
      },
      {
        value: 'M',
        label: 'Moderate',
        description: 'The remediation needs a support team and a modest amount of work.',
      },
      {
        value: 'H',
        label: 'High',
        description: 'The remediation needs a significant, complex or risky effort.',
      },
    ],
  },
  {
    key: 'U',
    name: 'Provider Urgency',
    group: 'supplemental',
    values: [
      notDefined,
      { value: 'Clear', label: 'Clear', description: 'The provider rates the urgency as clear.' },
      { value: 'Green', label: 'Green', description: 'The provider rates the urgency as green.' },
      { value: 'Amber', label: 'Amber', description: 'The provider rates the urgency as amber.' },
      { value: 'Red', label: 'Red', description: 'The provider rates the urgency as red.' },
    ],
  },
]

export const V4_BASE_KEYS: V4Key[] = [
  'AV',
  'AC',
  'AT',
  'PR',
  'UI',
  'VC',
  'VI',
  'VA',
  'SC',
  'SI',
  'SA',
]

export const V4_PREFIX = 'CVSS:4.0'

export function defaultV4Selection(): V4Selection {
  const selection = {} as V4Selection
  for (const metric of v4Metrics) selection[metric.key] = metric.values[0].value
  return selection
}

export function parseV4(input: string): V4Selection {
  return parseVector<V4Key>(input, {
    prefixes: [V4_PREFIX],
    definitions: v4Metrics,
    required: V4_BASE_KEYS,
    notDefined: NOT_DEFINED,
  }).selection
}

export function formatV4(selection: V4Selection): string {
  return formatVector(V4_PREFIX, v4Metrics, selection, NOT_DEFINED)
}

export function hasGroupSet(selection: V4Selection, group: V4Group): boolean {
  return v4Metrics.filter((m) => m.group === group).some((m) => selection[m.key] !== NOT_DEFINED)
}

/**
 * Effective value of a metric for scoring — a faithful port of `m()` from
 * `cvss_score.js`: `E:X` becomes `A`, `CR/IR/AR:X` become `H`, and any modified
 * metric that is set overrides the base metric it shadows.
 */
export function effectiveValue(selection: V4Selection, metric: string): string {
  const selected = selection[metric as V4Key]

  if (metric === 'E' && selected === 'X') return 'A'
  if (metric === 'CR' && selected === 'X') return 'H'
  if (metric === 'IR' && selected === 'X') return 'H'
  if (metric === 'AR' && selected === 'X') return 'H'

  const modifiedKey = `M${metric}`
  if (Object.prototype.hasOwnProperty.call(selection, modifiedKey)) {
    const modifiedSelected = selection[modifiedKey as V4Key]
    if (modifiedSelected !== 'X') return modifiedSelected
  }

  return selected
}

/** Port of `macroVector()` from `cvss_score.js` — the six EQ digits. */
export function macroVector(selection: V4Selection): string {
  const m = (metric: string) => effectiveValue(selection, metric)

  // EQ1
  let eq1: string
  if (m('AV') === 'N' && m('PR') === 'N' && m('UI') === 'N') eq1 = '0'
  else if (
    (m('AV') === 'N' || m('PR') === 'N' || m('UI') === 'N') &&
    !(m('AV') === 'N' && m('PR') === 'N' && m('UI') === 'N') &&
    m('AV') !== 'P'
  )
    eq1 = '1'
  else eq1 = '2'

  // EQ2
  const eq2 = m('AC') === 'L' && m('AT') === 'N' ? '0' : '1'

  // EQ3
  let eq3: string
  if (m('VC') === 'H' && m('VI') === 'H') eq3 = '0'
  else if (m('VC') === 'H' || m('VI') === 'H' || m('VA') === 'H') eq3 = '1'
  else eq3 = '2'

  // EQ4
  let eq4: string
  if (m('MSI') === 'S' || m('MSA') === 'S') eq4 = '0'
  else if (m('SC') === 'H' || m('SI') === 'H' || m('SA') === 'H') eq4 = '1'
  else eq4 = '2'

  // EQ5
  let eq5: string
  if (m('E') === 'A') eq5 = '0'
  else if (m('E') === 'P') eq5 = '1'
  else eq5 = '2'

  // EQ6
  const eq6 =
    (m('CR') === 'H' && m('VC') === 'H') ||
    (m('IR') === 'H' && m('VI') === 'H') ||
    (m('AR') === 'H' && m('VA') === 'H')
      ? '0'
      : '1'

  return eq1 + eq2 + eq3 + eq4 + eq5 + eq6
}
