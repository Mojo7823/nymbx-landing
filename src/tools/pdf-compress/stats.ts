export interface SizeComparison {
  /** Signed percent change; negative when the output is smaller. */
  percentChange: number
  smaller: boolean
}

export function compareSizes(before: number, after: number): SizeComparison {
  const percentChange = before <= 0 ? 0 : ((after - before) / before) * 100
  return { percentChange, smaller: after < before }
}
