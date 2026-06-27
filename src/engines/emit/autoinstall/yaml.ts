import { parse, stringify } from 'yaml'

// Thin deterministic wrapper around the `yaml` library (eemeli). We rely on a
// real library — not a hand-rolled emitter — because escaping, block scalars
// for multi-line scripts, and nested netplan/storage are a catastrophic-failure
// surface for Subiquity. Key order is the object's insertion order (the engine
// builds objects in canonical order), so output is deterministic.
export function toYaml(value: unknown): string {
  return stringify(value, { lineWidth: 0 })
}

/** Parse a raw YAML override (e.g. Curtin storage.config). Throws on invalid YAML. */
export function fromYaml(text: string): unknown {
  return parse(text)
}
