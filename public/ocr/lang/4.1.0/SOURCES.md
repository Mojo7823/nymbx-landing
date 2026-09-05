# OCR language data — provenance

These files are the Tesseract "fast" (integer LSTM) language models the OCR tool
(`src/tools/ocr/`) loads. They are committed to this repository on purpose:
`tesseract.js` would otherwise fetch language data from
`cdn.jsdelivr.net` / `tessdata.projectnaptha.com`, which the site's privacy
invariant forbids. Everything the OCR tool loads must come from our own origin.

There is no npm package for `tessdata_fast`, so the files cannot be copied from
`node_modules` at build time the way the OCR engine (`public/ocr/engine/`) is.

## Upstream

- Repository: <https://github.com/tesseract-ocr/tessdata_fast>
- Version / directory name: `4.1.0` (the repository's latest release tag)
- Pinned commit: `87416418657359cb625c412a48b6e1d6d41c29bd`
- Download URL template:
  `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/<lang>.traineddata`
- License: Apache License 2.0 (see the upstream `LICENSE`).

## Processing

Each `<lang>.traineddata` was downloaded verbatim and compressed deterministically
with:

```sh
gzip -9 -n -c <lang>.traineddata > <lang>.traineddata.gz
```

`-n` omits the original name and timestamp, so the output is byte-reproducible.
`tesseract.js` is configured with `gzip: true` and fetches
`<langPath>/<lang>.traineddata.gz`.

## Checksums

SHA-256 of the upstream files as downloaded:

| file                  | bytes     | sha256                                                             |
| --------------------- | --------- | ------------------------------------------------------------------ |
| `eng.traineddata`     | 4,113,088 | `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2` |
| `chi_tra.traineddata` | 2,366,642 | `529c5b5797d64b126065cd55f2bb4c7fd7b15790798091b1ff259941a829330b` |
| `chi_sim.traineddata` | 2,469,156 | `a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730` |
| `ind.traineddata`     | 1,122,661 | `69786901da87ab8766c1ea7fbb10b28f2110c14da3f6c8f2735df131fba95d88` |

SHA-256 of the committed gzipped files:

| file                     | bytes     | sha256                                                             |
| ------------------------ | --------- | ------------------------------------------------------------------ |
| `eng.traineddata.gz`     | 1,976,293 | `2a66ec904bc0e7657b27e200a874c01e1bc8a58b756cbbaa9afbae736fa50edc` |
| `chi_tra.traineddata.gz` | 1,663,208 | `52ce5cdc5080a5847a02635b18a676fe41676840a86bd27e99954c24df9cd895` |
| `chi_sim.traineddata.gz` | 1,723,430 | `4283fa5b14125acc2622823f2f96bb57e1d1374fa53a26164bc183d1d563df84` |
| `ind.traineddata.gz`     | 609,584   | `4db3b77cbe739d873721f7ec9af4d7b9b9596e5231e12f70886b891c92f46232` |

The gzipped byte sizes above are mirrored in the `LANGUAGES` catalog in
`src/tools/ocr/ocrEngine.ts`, which needs exact sizes for byte-level download
progress. `ocrEngine.test.ts` asserts they stay positive; update both together.

## Updating

1. Pick a new upstream commit and download the four `.traineddata` files from it.
2. Re-gzip with the exact command above.
3. Put them in a **new** `public/ocr/lang/<version>/` directory (the files are
   served `immutable`, so the version directory must change), update
   `LANG_VERSION` and the `bytes` values in `src/tools/ocr/ocrEngine.ts`, and
   rewrite this file.
