import { selectUi, useGeneratorStore } from '@store/generatorStore'
import type { ReactNode } from 'react'

/** A titled, collapsible form section. Collapse state lives in the store so it
 *  survives re-renders and can be driven by presets later. */
export function CollapsibleSection({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  const ui = useGeneratorStore(selectUi)
  const toggleSection = useGeneratorStore((s) => s.toggleSection)
  const open = !ui.collapsed[id]

  return (
    <section className="panel">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-800 dark:text-slate-100"
        aria-expanded={open}
        onClick={() => toggleSection(id)}
      >
        <span>{title}</span>
        <span aria-hidden className="text-slate-400">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>}
    </section>
  )
}
