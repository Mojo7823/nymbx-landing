export interface PdfPermissions {
  print: 'full' | 'low' | 'none'
  modify: 'all' | 'annotate' | 'form' | 'assembly' | 'none'
  extract: boolean
}

export type SecurityOptions =
  | { mode: 'unlock'; inputPassword: string }
  | {
      mode: 'protect'
      inputPassword: string
      userPassword: string
      ownerPassword: string
      permissions: PdfPermissions
    }

export interface SecurityResult {
  bytes: Uint8Array<ArrayBuffer>
  warnings: string[]
}
