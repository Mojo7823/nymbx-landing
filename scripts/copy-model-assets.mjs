// Self-host the @imgly/background-removal model + onnxruntime assets under
// public/models/ so the background-remover tool never touches a third-party
// CDN (privacy invariant). Runs via the predev/prebuild hooks; the copy is
// skipped when the target already matches the installed package version.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'node_modules', '@imgly', 'background-removal-data', 'dist')
const target = join(root, 'public', 'models')
const stamp = join(target, '.version')

if (!existsSync(source)) {
  console.error('copy-model-assets: @imgly/background-removal-data is not installed')
  process.exit(1)
}

const { version } = JSON.parse(
  readFileSync(join(root, 'node_modules', '@imgly', 'background-removal-data', 'package.json')),
)

if (existsSync(stamp) && readFileSync(stamp, 'utf8') === version) {
  console.log(`copy-model-assets: public/models already at ${version}, skipping`)
} else {
  console.log(`copy-model-assets: copying model assets ${version} → public/models …`)
  cpSync(source, target, { recursive: true })
  writeFileSync(stamp, version)
  console.log('copy-model-assets: done')
}

// Self-host the zxing-wasm reader binary for the QR reader tool so decoding
// never touches the default jsDelivr CDN (privacy invariant). Same
// skip-if-current logic, stamped by package version.
const zxingSource = join(root, 'node_modules', 'zxing-wasm', 'dist', 'reader', 'zxing_reader.wasm')
const zxingTargetDir = join(root, 'public', 'zxing')
const zxingTarget = join(zxingTargetDir, 'zxing_reader.wasm')
const zxingStamp = join(zxingTargetDir, '.version')

if (!existsSync(zxingSource)) {
  console.error('copy-model-assets: zxing-wasm reader binary is not installed')
  process.exit(1)
}
const { version: zxingVersion } = JSON.parse(
  readFileSync(join(root, 'node_modules', 'zxing-wasm', 'package.json')),
)

if (existsSync(zxingStamp) && readFileSync(zxingStamp, 'utf8') === zxingVersion) {
  console.log(`copy-model-assets: public/zxing already at ${zxingVersion}, skipping`)
} else {
  console.log(`copy-model-assets: copying zxing reader ${zxingVersion} → public/zxing …`)
  mkdirSync(zxingTargetDir, { recursive: true })
  cpSync(zxingSource, zxingTarget)
  writeFileSync(zxingStamp, zxingVersion)
  console.log('copy-model-assets: done')
}
// Self-host Noto Sans TC for the PDF watermark tool's CJK text embedding
// (fetched lazily, from our origin only). Same skip-if-current logic.
const fontSource = join(
  root,
  'node_modules',
  '@expo-google-fonts',
  'noto-sans-tc',
  '400Regular',
  'NotoSansTC_400Regular.ttf',
)
const fontTarget = join(root, 'public', 'fonts', 'NotoSansTC-Regular.ttf')

if (!existsSync(fontSource)) {
  console.error('copy-model-assets: @expo-google-fonts/noto-sans-tc is not installed')
  process.exit(1)
}
if (existsSync(fontTarget)) {
  console.log('copy-model-assets: public/fonts already present, skipping')
} else {
  cpSync(fontSource, fontTarget)
  console.log('copy-model-assets: copied Noto Sans TC → public/fonts')
}

// Self-host the tesseract.js OCR engine (worker script + WASM cores) under
// public/ocr/engine/<version>/ so the OCR tool never touches jsDelivr
// (privacy invariant — the library's defaults point at a CDN). Language data
// is NOT copied here: there is no npm package for tessdata_fast, so the
// gzipped packs are committed under public/ocr/lang/ (see its SOURCES.md).
//
// Only the `*.wasm.js` builds are copied. tesseract.js's browser adapter
// (node_modules/tesseract.js/src/worker-script/browser/getCore.js) always
// `importScripts()` one of those single-file builds, which carry the WASM
// inline as base64; the sibling `.wasm` and loader `.js` files are used by the
// Node adapter only and would add ~18 MB of dead weight to the image.
const ocrEngineSource = join(root, 'node_modules', 'tesseract.js', 'dist')
const ocrCoreSource = join(root, 'node_modules', 'tesseract.js-core')

if (!existsSync(ocrEngineSource) || !existsSync(ocrCoreSource)) {
  console.error('copy-model-assets: tesseract.js / tesseract.js-core is not installed')
  process.exit(1)
}
const { version: ocrVersion } = JSON.parse(
  readFileSync(join(root, 'node_modules', 'tesseract.js', 'package.json')),
)
const ocrTargetDir = join(root, 'public', 'ocr', 'engine', ocrVersion)
const ocrStamp = join(root, 'public', 'ocr', 'engine', '.version')

if (existsSync(ocrStamp) && readFileSync(ocrStamp, 'utf8') === ocrVersion) {
  console.log(`copy-model-assets: public/ocr/engine already at ${ocrVersion}, skipping`)
} else {
  console.log(`copy-model-assets: copying tesseract.js engine ${ocrVersion} → public/ocr/engine …`)
  const coreTargetDir = join(ocrTargetDir, 'core')
  mkdirSync(coreTargetDir, { recursive: true })
  cpSync(join(ocrEngineSource, 'worker.min.js'), join(ocrTargetDir, 'worker.min.js'))
  for (const file of readdirSync(ocrCoreSource).filter((f) => f.endsWith('.wasm.js'))) {
    cpSync(join(ocrCoreSource, file), join(coreTargetDir, file))
  }
  // The tool prefetches these files with byte-level progress before handing
  // over to tesseract.js, so it needs their exact sizes and the version
  // directory name. Written unversioned (like models/resources.json) and
  // therefore always revalidated; the files it points at are immutable.
  const files = {}
  for (const rel of ['worker.min.js', ...readdirSync(coreTargetDir).map((f) => `core/${f}`)]) {
    files[rel] = statSync(join(ocrTargetDir, rel)).size
  }
  writeFileSync(
    join(root, 'public', 'ocr', 'engine', 'manifest.json'),
    `${JSON.stringify({ version: ocrVersion, files }, null, 2)}\n`,
  )
  writeFileSync(ocrStamp, ocrVersion)
  console.log('copy-model-assets: done')
}
