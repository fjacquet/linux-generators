/** Join a list into a textarea value. */
export const toLines = (items: string[]): string => items.join('\n')

/** Split a textarea value into a trimmed, blank-free list. */
export const fromLines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
