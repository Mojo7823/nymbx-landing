import { describe, expect, it } from 'vitest'
import { collectOfflineAssets, collectShellFiles, type BundleEntryLike } from './offlineAssets'

function chunk(
  fileName: string,
  imports: string[] = [],
  extra: Partial<BundleEntryLike> = {},
): BundleEntryLike {
  return { type: 'chunk', fileName, imports, ...extra }
}

const bundle: Record<string, BundleEntryLike> = {
  'assets/index-aaa.js': chunk('assets/index-aaa.js', ['assets/chunk-shared.js'], {
    isEntry: true,
    facadeModuleId: '/repo/src/main.tsx',
  }),
  'assets/chunk-shared.js': chunk('assets/chunk-shared.js', ['assets/chunk-deep.js']),
  'assets/chunk-deep.js': chunk('assets/chunk-deep.js'),
  'assets/ToolboxRoutes-bbb.js': chunk('assets/ToolboxRoutes-bbb.js', ['assets/chunk-shared.js'], {
    facadeModuleId: '/repo/src/pages/ToolboxRoutes.tsx',
  }),
  'assets/DiffChecker-ccc.js': chunk('assets/DiffChecker-ccc.js', ['assets/chunk-heavy.js'], {
    facadeModuleId: '/repo/src/tools/diff-checker/DiffChecker.tsx',
  }),
  'assets/chunk-heavy.js': chunk('assets/chunk-heavy.js'),
  'assets/index-ddd.css': { type: 'asset', fileName: 'assets/index-ddd.css' },
  'assets/manrope-eee.woff2': { type: 'asset', fileName: 'assets/manrope-eee.woff2' },
  'assets/ocr-core-fff.wasm': { type: 'asset', fileName: 'assets/ocr-core-fff.wasm' },
  'favicon.ico': { type: 'asset', fileName: 'favicon.ico' },
}

describe('collectShellFiles', () => {
  const shell = collectShellFiles(bundle)

  it('includes the entry chunk, the toolbox route chunk and their transitive imports', () => {
    expect(shell).toContain('assets/index-aaa.js')
    expect(shell).toContain('assets/ToolboxRoutes-bbb.js')
    expect(shell).toContain('assets/chunk-shared.js')
    expect(shell).toContain('assets/chunk-deep.js')
  })

  it('includes stylesheets and fonts', () => {
    expect(shell).toContain('assets/index-ddd.css')
    expect(shell).toContain('assets/manrope-eee.woff2')
  })

  it('excludes tool chunks and their private dependencies', () => {
    expect(shell).not.toContain('assets/DiffChecker-ccc.js')
    expect(shell).not.toContain('assets/chunk-heavy.js')
  })

  it('excludes non-shell assets such as wasm and the favicon', () => {
    expect(shell).not.toContain('assets/ocr-core-fff.wasm')
    expect(shell).not.toContain('favicon.ico')
  })
})

describe('collectOfflineAssets', () => {
  const files = collectOfflineAssets(bundle, ['zxing/zxing_reader.wasm'])

  it('lists every hashed js/css/wasm/woff2 asset plus the public extras', () => {
    expect(files).toEqual([
      'assets/DiffChecker-ccc.js',
      'assets/ToolboxRoutes-bbb.js',
      'assets/chunk-deep.js',
      'assets/chunk-heavy.js',
      'assets/chunk-shared.js',
      'assets/index-aaa.js',
      'assets/index-ddd.css',
      'assets/manrope-eee.woff2',
      'assets/ocr-core-fff.wasm',
      'zxing/zxing_reader.wasm',
    ])
  })

  it('leaves files outside /assets out', () => {
    expect(files).not.toContain('favicon.ico')
  })
})
