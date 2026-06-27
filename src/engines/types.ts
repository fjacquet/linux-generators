// Shared engine vocabulary. Pure types — no runtime, no React/DOM.

export type Severity = 'error' | 'warning'

/**
 * A single validation/emit finding surfaced in the UI's DiagnosticsList.
 * `field` is a dotted path into the InstallSpec (e.g. `network.interfaces.0.ip`)
 * used to anchor the message to a form control.
 */
export interface Diagnostic {
  severity: Severity
  field: string
  message: string
}
