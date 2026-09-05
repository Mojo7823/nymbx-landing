# Provenance of the vendored CVSS v4.0 data and algorithm

`firstData.ts` and `score.ts` are derived from the official FIRST CVSS v4.0 calculator.

- Upstream: `https://github.com/FIRSTdotorg/cvss-v4-calculator`
- Commit: `c5b0d409ae9f57c44264c6ce5f27d89298e1d32a`
- License: BSD-2-Clause — "Copyright (c) 2023 FIRST.ORG, Inc., Red Hat, and contributors"
- Retrieved: 2026-09-05

## SHA-256 of the source files

| File              | SHA-256                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `cvss_lookup.js`  | `d533fe625d95e15b7b488a4bf93dab5f7df16b7e38b0c8ee01281d7b31a8165e` |
| `max_composed.js` | `be707cc82c17993a04a84e47b1a8aaa1d0d212b56852254659ce77fd7d959f63` |
| `max_severity.js` | `f838ecb41bfd5114456e7fa7df8a8449ca2735c176867886fa34bd011dee0b24` |
| `cvss_score.js`   | `453ce6767b5c3939b51d1f21315f2649e47b5abeca674be287e94b524472a1bc` |
| `metrics.js`      | `99ee2643587071bf744cd090c4bb2db58d523ed0276efd809871b00a12985a4c` |
| `app.js`          | `4437149a33f4fd698e1a34dfc8bbc337788dd06f768b5b9f8e31f18ccf3455f0` |
| `LICENSE`         | `5d672639189da9bda914dd8c847069cc6959135000b17c45262bb742e5d3b392` |

## What was taken from where

- `firstData.ts` — the three data tables (`cvssLookup_global`, `maxComposed`, `maxSeverity`)
  transcribed to TypeScript from `cvss_lookup.js`, `max_composed.js` and `max_severity.js`.
  Keys, order and values are unchanged; only the syntax differs.
- `score.ts` — a faithful port of `cvss_score()`, `getEQMaxes()`, `extractValueMetric()` and
  `m()` from `cvss_score.js`, plus `macroVector()` (which lives in `cvss_score.js` in this
  commit and is mirrored in `app.js`). The interpolation constants (`step = 0.1`, the
  `*_levels` tables, the EQ3/EQ6 joint next-lower-macro rules, the final
  `Math.round(value * 10) / 10`) are kept exactly.
- `metrics.ts` — metric order and the valid values of each metric from `metrics.js`
  (`expectedMetricOrder`). The human-readable metric and value names/descriptions are our own,
  written from the CVSS v4.0 specification.

## BSD-2-Clause

```
Copyright (c) 2023 FIRST.ORG, Inc., Red Hat, and contributors

Redistribution and use in source and binary forms, with or without modification, are permitted
provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of
   conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of
   conditions and the following disclaimer in the documentation and/or other materials provided
   with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```
