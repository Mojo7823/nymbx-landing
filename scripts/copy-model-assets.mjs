// Self-host the @imgly/background-removal model + onnxruntime assets under
// public/models/ so the background-remover tool never touches a third-party
// CDN (privacy invariant). Runs via the predev/prebuild hooks; the copy is
// skipped when the target already matches the installed package version.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
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
