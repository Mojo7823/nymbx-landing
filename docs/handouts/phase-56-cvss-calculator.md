# Phase 56 Handout — CVSS calculator

**Audience:** the agent implementing Phase 56 (T1) and the agents verifying it (T2–T4). Self-contained; read fully before writing code. [/PLAN.md](../../PLAN.md) (Phase 56) and [/CLAUDE.md](../../CLAUDE.md) are authoritative if anything here seems ambiguous.

---

## 1. Goal

Add **CVSS calculator** at `/tools/cvss-calculator` (`src/tools/cvss-calculator/`): metric pickers for **CVSS v3.1** (Base, Temporal, Environmental) and **CVSS v4.0** (Base, Threat, Environmental, Supplemental) that stay in sync with a vector string, a live score with severity band and gauge, copy buttons, and shareable state in the URL hash. Scores must match the FIRST reference exactly. No dependencies, no network, nothing persisted.

Registry entry exists (`slug: 'cvss-calculator'`, `phase: 56`, `status: soon`, icon `Gauge`). Flip it to `'available'`, add the lazy route in `src/tools/routes.ts`, and insert `'cvss-calculator'` into the "available" list in `src/lib/registry.test.ts` **in registry order** (after `'sbom-viewer'`).

## 2. Sources of truth (verified 2026-09-05)

- **CVSS v3.1 Specification**, section 7 (equations) — a saved copy is at `/tmp/claude-1000/-home-devi-nymbx-landing/b14f9c57-88a0-427d-a794-a98d3b5d9d09/scratchpad/cvss-assets/v3.1-specification-document.html`. The formulas are reproduced in §3 below; implement them from §3 and cross-check with the saved spec.
- **CVSS v4.0 reference implementation**: `FIRSTdotorg/cvss-v4-calculator` at commit `c5b0d409ae9f57c44264c6ce5f27d89298e1d32a` (BSD-2-Clause, "Copyright (c) 2023 FIRST.ORG, Inc., Red Hat, and contributors"). Files are downloaded to `…/scratchpad/cvss-assets/first-v4/`: `cvss_lookup.js` (the 270-entry macro-vector → score table), `max_composed.js`, `max_severity.js`, `cvss_score.js` (the interpolation algorithm), `metrics.js` (metric order and valid values), `LICENSE`. **Port `cvss_score.js` faithfully to TypeScript and vendor the three data tables verbatim** into `src/tools/cvss-calculator/v4/firstData.ts` with the copyright/SPDX header and a `SOURCES.md` next to it recording the commit and each file's SHA-256 (compute them). A vendored reference is how "match the official calculator" becomes provable.
- **Fixtures** (copy into `src/tools/cvss-calculator/fixtures/`, committed):
  - `first-examples.json` → use the `pairs` array only (35 pairs of v3.1 + v4.0 vectors with the scores printed in FIRST's v4.0 Examples document; 68 values). Ignore the `examples` array — its labels were associated by a heuristic and several are wrong.
  - `oracle-vectors.json` → 400 random v4.0 vectors (half with threat/environmental/supplemental metrics) with `score` and `severity`, and 400 random v3.1 vectors (half with temporal/environmental metrics) with `base`, `temporal`, `environmental` and `severities`. Produced with the Red Hat `cvss` Python library 3.6, which reproduces all 68 FIRST values; independent JS implementations agree with it on all 400 v4 vectors. **Note the v3.1 subtlety below before you "fix" a mismatch.**

## 3. CVSS v3.1 equations (spec §7; implement exactly)

Metric weights: AV N 0.85 / A 0.62 / L 0.55 / P 0.2 · AC L 0.77 / H 0.44 · PR N 0.85 / L 0.62 (**0.68 if Scope Changed**) / H 0.27 (**0.5 if Scope Changed**) · UI N 0.85 / R 0.62 · C, I, A: H 0.56 / L 0.22 / N 0 · E X 1 / H 1 / F 0.97 / P 0.94 / U 0.91 · RL X 1 / U 1 / W 0.97 / T 0.96 / O 0.95 · RC X 1 / C 1 / R 0.96 / U 0.92 · CR, IR, AR: X 1 / H 1.5 / M 1 / L 0.5. Modified metrics (MAV, MAC, MPR, MUI, MS, MC, MI, MA) take the base metric's value when `X`; **MPR's weight uses the *modified* scope (MS, falling back to S)**.

```
Roundup(x): i = round(x * 100000); return i % 10000 === 0 ? i / 100000 : (floor(i / 10000) + 1) / 10
ISS = 1 − (1−C)(1−I)(1−A)
Impact = S:U ? 6.42·ISS : 7.52·(ISS−0.029) − 3.25·(ISS−0.02)^15
Exploitability = 8.22·AV·AC·PR·UI
Base = Impact ≤ 0 ? 0 : S:U ? Roundup(min(Impact+Exploitability, 10)) : Roundup(min(1.08·(Impact+Exploitability), 10))
Temporal = Roundup(Base·E·RL·RC)
MISS = min(1 − (1−MC·CR)(1−MI·IR)(1−MA·AR), 0.915)
ModifiedImpact = MS:U ? 6.42·MISS : 7.52·(MISS−0.029) − 3.25·(MISS·0.9731 − 0.02)^13        ← v3.1 differs from base here
ModifiedExploitability = 8.22·MAV·MAC·MPR·MUI
Environmental = ModifiedImpact ≤ 0 ? 0
              : MS:U ? Roundup(Roundup(min(ModifiedImpact+ModifiedExploitability, 10))·E·RL·RC)
              :        Roundup(Roundup(min(1.08·(ModifiedImpact+ModifiedExploitability), 10))·E·RL·RC)
Severity (both versions): 0 None · 0.1–3.9 Low · 4.0–6.9 Medium · 7.0–8.9 High · 9.0–10.0 Critical
```

**Subtlety:** because the Scope-Changed environmental formula uses `(MISS·0.9731 − 0.02)^13` while the base formula uses `(ISS − 0.02)^15`, the environmental score can differ from the base score by 0.1 **even when no environmental metric is set** (e.g. `CVSS:3.1/AV:P/AC:L/PR:L/UI:N/S:C/C:N/I:H/A:H` → base 7.1, environmental 7.0). This is correct per spec and the FIRST calculator; the fixtures encode it (7 of the 400 v3.1 vectors). Do not special-case "no environmental metrics → environmental = base".

Show sub-scores in the UI: Impact, Exploitability (and Modified Impact / Modified Exploitability when environmental metrics are set), each rounded to one decimal for display only — compute with full precision.

## 4. CVSS v4.0 scoring (port of `cvss_score.js`)

- Metric order and values: from `metrics.js` — Base (AV AC AT PR UI VC VI VA SC SI SA), Threat (E), Environmental (CR IR AR MAV MAC MAT MPR MUI MVC MVI MVA MSC MSI MSA), Supplemental (S AU R V RE U; `U` takes `X | Clear | Green | Amber | Red`). Supplemental metrics never affect the score.
- Effective values for scoring: modified metrics override base ones when not `X`; `E` defaults to `A` when `X`; CR/IR/AR default to `H` when `X`; **MSI/MSA `S` (Safety) is a value only the modified metric has** and drives EQ4.
- MacroVector (six digits EQ1–EQ6) exactly as in the reference (`app.js` `macroVector`, also documented in the Red Hat port quoted below): EQ1 from AV/PR/UI, EQ2 from AC/AT, EQ3 from VC/VI/VA, EQ4 from MSI/MSA/SC/SI/SA, EQ5 from E, EQ6 from CR·VC / IR·VI / AR·VA. If VC, VI, VA, SC, SI, SA are all `N` → score 0.0.
- **Rounding note (added after T1):** the reference's final `Math.round(value * 10) / 10` mis-rounds two of the 400 random fixture vectors because of accumulated binary error (a true 4.95 arrives as 4.9499999…); the port snaps to six decimals via an integer intermediate before rounding half-up, so 5.0/5.7 come out as the fixtures and the Python oracle expect. This is the only arithmetic deviation from the reference.
- Score: `lookup[macroVector]` then the interpolation in `cvss_score.js`: build the next-lower macro vectors per EQ (EQ3 and EQ6 are handled jointly), find the first `maxComposed` vector with no negative severity distance, compute per-EQ severity distances with the reference's level tables, normalise by `maxSeverity` (×0.1 per step in the reference — keep the exact constants), average over the EQs that have a lower neighbour, subtract, clamp to [0, 10], and round with the reference's `Math.round(value * 10) / 10` (guard against floating error the same way the reference does).
- Nomenclature (spec §1.3): label the result **CVSS-B** (base only), **CVSS-BT** (threat set), **CVSS-BE** (environmental set) or **CVSS-BTE** (both). Show the macro vector next to the score (e.g. `EQ 000000`).
- Vector string: canonical form is `CVSS:4.0/` + metrics **in the `metrics.js` order**, omitting `X` values. Parsing accepts any order and case-insensitive values, rejects unknown metrics, invalid values, duplicates and missing base metrics, and reports the offending segment (`Unknown metric "AX" in segment 3`). Same for v3.1 (`CVSS:3.1/` prefix; also accept `CVSS:3.0/` input and convert with a note that it is scored with the 3.1 equations).

## 5. UX specification

Use `ToolLayout` (`title="CVSS calculator"`, `description="Score vulnerabilities with CVSS v3.1 and v4.0 — exact FIRST equations, shareable by link"`, `badge="client-side"`). Conventions: `src/tools/uuid-password-generator/` and `src/tools/timestamp-converter/` (control-heavy tools with result cards and copy buttons), `src/tools/pdf-sign-annotate/` (tabs), `src/components/CopyButton.tsx`.

1. **Version tabs**: `CVSS v4.0` (default) and `CVSS v3.1`. Switching versions keeps its own state per version; the hash reflects the active one.
2. **Vector bar** at the top: a monospace text input holding the canonical vector, editable — typing/pasting a valid vector updates every picker (debounced 200 ms); an invalid string shows the parse error under the field without touching the pickers; `Copy vector`, `Copy score` and `Reset` buttons; a `Share link` button that copies `location.href` (with the hash) and toasts.
3. **Metric groups** as collapsible sections (Base always open; Temporal/Threat, Environmental, Supplemental collapsed until a value is set or the user opens them): each metric is a row with its name, a button group of values (the abbreviation plus the full word, e.g. `N Network`), the selected value highlighted; hovering/focusing a value shows its one-sentence spec description in a `title` tooltip (write these short descriptions yourself from the spec; keep them to one sentence). `X Not Defined` is the first option of every optional metric.
4. **Score card** (sticky on desktop beside the groups, on top on mobile): the score in large type with the severity band colour (None grey, Low green, Medium amber, High orange, Critical red — use the existing semantic tokens, e.g. `bg-rose-soft text-rose` for Critical/High, amber for Medium, mint for Low), the nomenclature label (`CVSS-BTE` / for v3.1 the three scores Base, Temporal, Environmental with the Environmental one emphasised when set), a semicircular gauge (inline SVG arc, 0–10), and the sub-scores / macro vector in small monospace text. Everything updates live.
5. **URL hash**: `#CVSS:4.0/AV:N/…` — read on mount (`location.hash`), select the matching version, and populate; keep in sync on every change with `history.replaceState` (never `pushState`); react to `hashchange` (browser back). Invalid hash → ignored with a small notice. Nothing else is persisted (no settings store use).
6. **Keyboard/a11y**: button groups are `role="radiogroup"` with `aria-checked`; arrow keys move within a group; the score card has `aria-live="polite"`.
7. **Privacy note**: "Runs entirely in your browser. The link you copy contains only the vector string."

## 6. Code layout

```
src/tools/cvss-calculator/
  CvssCalculator.tsx            page: tabs, vector bar, groups, score card, hash sync
  MetricGroup.tsx               one collapsible group of metric rows (radiogroups)
  ScoreGauge.tsx                SVG semicircle gauge
  v31/metrics.ts (+ .test.ts)   metric definitions, weights, descriptions, parse/format
  v31/score.ts   (+ .test.ts)   Roundup and the equations of §3 → { base, temporal, environmental, impact, exploitability, modifiedImpact, modifiedExploitability, severities }
  v4/metrics.ts  (+ .test.ts)   metric definitions (order/values from metrics.js), descriptions, parse/format, effective values, macroVector
  v4/firstData.ts               vendored lookup / maxComposed / maxSeverity (BSD-2-Clause header)
  v4/SOURCES.md                 provenance + SHA-256s
  v4/score.ts    (+ .test.ts)   port of cvss_score.js → { score, severity, macroVector, nomenclature }
  fixtures/first-examples.json, fixtures/oracle-vectors.json, fixtures/README.md (how they were produced)
  fixtures.test.ts              every fixture value must match exactly (68 + 400 + 400 vectors, all three v3.1 scores)
  severity.ts (+ .test.ts)      band thresholds shared by both versions
  hash.ts (+ .test.ts)          hash ↔ state helpers (pure)
```

Strict TS, no `any`, no new dependencies. The whole tool must stay a small lazy chunk; confirm with `npm run build` that the dashboard entry chunk is unchanged.

## 7. Tasks (T1 — in order; `npm run lint` and `npm run typecheck` after each step; `npm run test` at the end)

1. Vendor the FIRST data + `SOURCES.md` (compute SHA-256 of each source file with `sha256sum`), copy the fixtures.
2. `v31/metrics.ts`, `v31/score.ts` with tests (hand-checked cases: `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` = 9.8; `…/S:C/C:H/I:H/A:H` = 10.0; the 7.1/7.0 subtlety vector above; Roundup edge cases 4.00 → 4.0, 4.02 → 4.1, floating noise 4.000000001 → 4.0).
3. `v4/metrics.ts`, `v4/firstData.ts`, `v4/score.ts` with tests (e.g. `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N` = 9.3 Critical; all-`N` impact → 0.0; a CVSS-BTE example from the fixtures).
4. `fixtures.test.ts` — must be fully green before any UI work. If a fixture disagrees with your port, the port is wrong (both oracles agree); re-read `cvss_score.js`.
5. `severity.ts`, `hash.ts` with tests.
6. UI per §5; route, registry status, registry test.
7. `npm run build`; entry chunk unchanged.
8. Browser smoke test (Python Playwright, `vite preview` **from the repo root** on 127.0.0.1:4173): open `/tools/cvss-calculator#CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` → v3.1 tab active, score 9.8 Critical, pickers reflect the vector; click `PR: L` → 8.8 and the hash updates; switch to v4.0, pick a full base vector and paste `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N` into the vector bar → 9.3; paste `CVSS:4.0/AV:Q/…` → error mentions `AV`. Record all requests (same-origin GETs only). Stop the preview with `kill <pid>` of the node process, never `pkill -f`.

Do not commit. Report: files, gate numbers (including the fixture test count), entry chunk before/after, smoke-test output, decisions the handout did not cover, anything unfinished.

## 8. Verification (T2/T3, by the verifier)

Fixtures and sources in `/tmp/claude-1000/-home-devi-nymbx-landing/b14f9c57-88a0-427d-a794-a98d3b5d9d09/scratchpad/cvss-assets/` (also committed under the tool's `fixtures/`). The Red Hat `cvss` Python library (3.6) is installed in the user site: `python3 -c "from cvss import CVSS4; print(CVSS4('CVSS:4.0/...').base_score)"` and `CVSS3(...).scores()` give an independent oracle for any vector you type into the UI.

Checks:
1. **Unit oracle**: `npm run test` passes with the fixture test covering all 868 values; report the count.
2. **UI vs oracle, v4.0**: for 15 vectors of your choice (include CVSS-B, -BT, -BE, -BTE, an all-`N` impact vector, `MSI:S`, and supplemental metrics), paste each into the vector bar and compare the displayed score, nomenclature label and severity with the Python oracle; then reproduce two of them by clicking the pickers only and confirm the vector bar shows the canonical string.
3. **UI vs oracle, v3.1**: 15 vectors including temporal-only, environmental-only, both, `S:C` with `MPR`, and the 7.1/7.0 subtlety vector — compare Base, Temporal and Environmental with `CVSS3(...).scores()`.
4. **Parsing**: wrong metric (`AV:Q`), unknown metric (`AX:N`), duplicate (`AV:N/AV:L`), missing base metric, lowercase input (`cvss:4.0/av:n/…` — must be accepted and canonicalised), metrics out of order (accepted, re-ordered), `CVSS:3.0/` prefix (accepted with the note), garbage → each gives a precise message and leaves the pickers unchanged.
5. **Hash**: open with a hash → state restored; change a metric → `location.hash` updates via `replaceState` (`history.length` unchanged); browser back from a previous hash → state follows; invalid hash → notice, defaults shown; `Share link` copies `location.href`.
6. **Copy buttons**: `Copy vector`, `Copy score` contents match the display (clipboard permission granted in the context).
7. **Version switch**: each tab keeps its own state; the hash reflects the active tab.
8. **Privacy/persistence**: no requests beyond the lazy chunk; nothing in IndexedDB/localStorage.
9. **A11y**: radiogroups with `aria-checked`; arrow keys move selection within a group; the score region is `aria-live`.
10. **Console/pageerror**: none. **Gates**: report numbers.

Visual (T3): 1280 and 390, light and dark: v4.0 default (CVSS-B), v4.0 with threat + environmental expanded (CVSS-BTE), v3.1 with all three scores, an error state in the vector bar. `scrollWidth <= viewport`; button groups wrap on 390 without clipping; the gauge and score remain readable; severity colours legible in dark mode.

## 9. Definition of done

Gates green; every §8 check passes on a fresh production build (T4); PLAN.md Phase 56 needs no change unless a decision diverged — if so, update it in the same commit and say which.
