declare module 'qpdf-wasm' {
  export interface QpdfModule {
    callMain(args: string[]): number | undefined
    WORKERFS: object
    FS: {
      init(
        stdin: () => number | null,
        stdout: (byte: number) => void,
        stderr: (byte: number) => void,
      ): void
      mkdir(path: string): void
      mount(type: object, options: { blobs: { name: string; data: Blob }[] }, path: string): void
      writeFile(path: string, contents: string): void
      readFile(path: string): Uint8Array<ArrayBuffer>
    }
  }

  export default function createQpdf(options: {
    noInitialRun: boolean
    noFSInit: boolean
    locateFile: (file: string) => string
    preRun: (module: QpdfModule) => void
  }): Promise<QpdfModule>
}
