# Bundled SBOM JSON schemas

These files are committed verbatim (byte-identical to upstream) so the SBOM
viewer can validate documents entirely offline — no request is ever made while
a user inspects a file. They are excluded from Prettier (see
`/.prettierignore`) precisely so the SHA-256s below keep verifying.

All of them are JSON Schema draft-07.

## CycloneDX

Source: <https://github.com/CycloneDX/specification>, pinned at commit
`595d98f16159bdf7463adc140509ded479130b8b`, directory `schema/`.
License: Apache-2.0.

| file | upstream path | sha256 |
|---|---|---|
| `bom-1.2.schema.json` | `schema/bom-1.2.schema.json` | `4a84031ce547f2e7fef0c80b334448a2e130c10a31117d038d2c4d2849740622` |
| `bom-1.3.schema.json` | `schema/bom-1.3.schema.json` | `d1e14fde4cf66934ddc31714cdbc3ec3103b15d039dbfb7a05a27bd44b547df0` |
| `bom-1.4.schema.json` | `schema/bom-1.4.schema.json` | `c22ea18d8ede3dbacc22bff3d3216fffe4c7c2b645a20af6aa223dceaaabb596` |
| `bom-1.5.schema.json` | `schema/bom-1.5.schema.json` | `2d956c1d05c092695457a91f3b5c57c749793c013ec224a0935807cfc8ae4480` |
| `bom-1.6.schema.json` | `schema/bom-1.6.schema.json` | `18f57f7482593bad9f21b4feed09084640cbeff419d62ad5090c5ceccca5b37d` |
| `spdx.schema.json` | `schema/spdx.schema.json` | `ea6e844ee6fba1e93473d94834d0ee0996970533497935f932f73d488ffdf4a3` |
| `jsf-0.82.schema.json` | `schema/jsf-0.82.schema.json` | `8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae` |

`spdx.schema.json` (the CycloneDX SPDX license-id enum, `$id`
`http://cyclonedx.org/schema/spdx.schema.json`) and `jsf-0.82.schema.json`
(JSON signature format, used by `signature`) are `$ref`-ed by the `bom-*`
schemas through relative URLs resolved against their `$id`, so they must be
registered with Ajv (`addSchema`) before a BOM schema is compiled.
`bom-1.2` and `bom-1.3` reference only `spdx.schema.json`.

## SPDX

Source: <https://github.com/spdx/spdx-spec>, tag `v2.3`
(commit `aadf3b0b8dbbabdb4d880b0fc714255fea436ff7`), file
`schemas/spdx-schema.json`. License: CC-BY-3.0.

| file | upstream path | sha256 |
|---|---|---|
| `spdx-2.3.schema.json` | `schemas/spdx-schema.json` | `239208b7ac287b3cf5d9a9af23f9d69863971102a5e1587a27a398b43490b89b` |

SPDX 2.2 documents are validated against this 2.3 schema as well; the UI says
so ("validated against SPDX 2.3").

## Verifying

```
cd src/tools/sbom-viewer/schemas && sha256sum *.json
```
