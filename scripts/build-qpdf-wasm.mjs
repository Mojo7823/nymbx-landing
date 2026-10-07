import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const work = await mkdtemp(join(tmpdir(), 'nymbx-qpdf-build-'))
const source = join(work, 'source')
const upstream = 'c63e51341d11abfb97c38012d6b6070efa10bbf1'
const compiler = 'nymbx-qpdf-compiler:3.1.73'

function run(command, args, cwd = source) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}`)
}

await mkdir(source)
run('git', ['init'], source)
run('git', ['fetch', '--depth', '1', 'https://github.com/jsscheller/qpdf-wasm.git', upstream])
run('git', ['checkout', 'FETCH_HEAD'])
const buildPath = join(source, 'scripts/buildDeps.js')
const build = await readFile(buildPath, 'utf8')
const original = 'let CFLAGS = "-pthread -sUSE_PTHREADS -msimd128";'
if (!build.includes(original)) throw new Error('Pinned upstream compiler flags changed')
// Catching must be enabled while compiling libqpdf, not just its final CLI.
// Otherwise a failed UTF-8 password bypasses QPDF's legacy encoding recovery.
await writeFile(
  buildPath,
  build.replace(
    original,
    'let CFLAGS = "-pthread -sUSE_PTHREADS -msimd128 -sNO_DISABLE_EXCEPTION_CATCHING=1";',
  ),
)
run('docker', ['build', '-t', compiler, '.'])
run('docker', [
  'run',
  '--rm',
  '-e',
  'RELEASE=1',
  '-v',
  `${source}:/src`,
  '-w',
  '/src',
  compiler,
  'bash',
  '-lc',
  'npm ci && node scripts/download.js && node scripts/buildDeps.js',
])

const packageDir = join(work, 'package')
await mkdir(packageDir)
const files = [
  ['out/qpdf.js', 'qpdf.js'],
  ['out/qpdf.wasm', 'qpdf.wasm'],
  ['LICENSE', 'LICENSE'],
  ['lib/qpdf/LICENSE.txt', 'LICENSE-QPDF.txt'],
  ['out/share/doc/libjpeg-turbo/LICENSE.md', 'LICENSE-LIBJPEG.md'],
  ['out/share/doc/libjpeg-turbo/README.ijg', 'LICENSE-IJG.txt'],
  ['lib/zlib/README', 'LICENSE-ZLIB.txt'],
]
for (const [from, to] of files) await copyFile(join(source, from), join(packageDir, to))
await writeFile(
  join(packageDir, 'package.json'),
  `${JSON.stringify(
    {
      name: 'qpdf-wasm',
      version: '0.1.0-nymbx.1',
      type: 'module',
      main: 'qpdf.js',
      files: files.map(([, name]) => name),
      license: 'Apache-2.0',
      repository: 'https://github.com/jsscheller/qpdf-wasm',
      nymbxBuild: {
        upstream,
        emsdk: '3.1.73',
        fix: 'Enable libqpdf exception catching at compile time',
      },
    },
    null,
    2,
  )}\n`,
)
await mkdir(join(root, 'vendor'), { recursive: true })
run('npm', ['pack', '--pack-destination', join(root, 'vendor')], packageDir)
console.log(
  'Rebuilt vendor/qpdf-wasm-0.1.0-nymbx.1.tgz; install it with npm install ./vendor/qpdf-wasm-0.1.0-nymbx.1.tgz',
)
