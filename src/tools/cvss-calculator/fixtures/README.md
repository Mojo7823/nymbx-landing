# CVSS fixtures

Two committed fixture files, consumed by `../fixtures.test.ts`. They are the regression oracle
for the scoring modules: if a fixture and the code disagree, the code is wrong.

## `first-examples.json`

Extracted from FIRST's **CVSS v4.0 Examples** document (retrieved 2026-09-05).

- `pairs` — **the array the test uses.** 35 entries, each with a v3.1 vector and its published
  v3.1 base score plus a v4.0 vector and its published v4.0 score (68 score values in total,
  since two of the 35 pairs carry only one usable score). These are the scores printed in the
  document itself, so they are FIRST's own numbers.
- `examples` — **not used.** Labels there were associated with vectors by a heuristic during
  extraction and several are wrong. Kept only so the extraction is auditable.

## `oracle-vectors.json`

Randomly generated vectors scored with the Red Hat `cvss` Python library 3.6, which reproduces
all 68 values in `first-examples.json`. Independent JavaScript implementations agree with it on
all 400 v4.0 vectors.

- `v4` — 400 v4.0 vectors (half carry threat / environmental / supplemental metrics) with
  `score` and `severity`.
- `v31` — 400 v3.1 vectors (half carry temporal / environmental metrics) with `base`,
  `temporal`, `environmental` and the three `severities`.

Note on the v3.1 set: 7 of the 400 have an environmental score that differs from the base score
even though no environmental metric is set. That is correct — the Scope-Changed environmental
formula uses `(MISS * 0.9731 - 0.02) ^ 13` where the base formula uses `(ISS - 0.02) ^ 15`. Do
not "fix" it by short-circuiting the environmental score to the base score.
