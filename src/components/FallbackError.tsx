import type { FallbackProps } from 'react-error-boundary'

export function FallbackError({ error }: FallbackProps) {
  return (
    <div role="alert" className="panel m-4">
      <p className="font-semibold text-diag-error">Something went wrong.</p>
      <pre className="mt-2 overflow-auto text-xs">
        {error instanceof Error ? error.message : String(error)}
      </pre>
    </div>
  )
}
