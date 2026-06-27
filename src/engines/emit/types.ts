import type { Diagnostic } from '../types'

export type ConfigLanguage = 'kickstart' | 'yaml'

/** One generated file ready to preview and download. */
export interface EmittedFile {
  filename: string
  content: string
  language: ConfigLanguage
}

/** The uniform return shape of every per-format engine. */
export interface EmitResult {
  files: EmittedFile[]
  diagnostics: Diagnostic[]
}
