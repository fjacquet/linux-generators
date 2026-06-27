export type DiffLine = { tag: 'same' | 'add' | 'del'; text: string }

const LINE_CAP = 1000

/** Positional fallback for very large inputs: equal-by-index, else del+add. */
function positionalDiff(a: string[], b: string[]): DiffLine[] {
  const out: DiffLine[] = []
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i]
    const y = b[i]
    if (x !== undefined && x === y) out.push({ tag: 'same', text: x })
    else {
      if (x !== undefined) out.push({ tag: 'del', text: x })
      if (y !== undefined) out.push({ tag: 'add', text: y })
    }
  }
  return out
}

/** Line-level diff via LCS. O(N×M); above LINE_CAP lines either side it degrades
 *  to a positional diff to keep the browser responsive. Pure. */
export function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split('\n')
  const B = b.split('\n')
  if (A.length > LINE_CAP || B.length > LINE_CAP) return positionalDiff(A, B)

  const n = A.length
  const m = B.length
  // Allocate (n+1) × (m+1) table initialised to 0
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))

  // Fill DP table bottom-up; hoist row refs to satisfy noUncheckedIndexedAccess
  for (let i = n - 1; i >= 0; i--) {
    const rowI = lcs[i] as number[]
    const rowI1 = lcs[i + 1] as number[]
    for (let j = m - 1; j >= 0; j--) {
      rowI[j] = A[i] === B[j] ? (rowI1[j + 1] ?? 0) + 1 : Math.max(rowI1[j] ?? 0, rowI[j + 1] ?? 0)
    }
  }

  // Trace back through DP table to build diff output
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    const rowI = lcs[i] as number[]
    const rowI1 = lcs[i + 1] as number[]
    if (A[i] === B[j]) {
      out.push({ tag: 'same', text: A[i] as string })
      i++
      j++
    } else if ((rowI1[j] ?? 0) >= (rowI[j + 1] ?? 0)) {
      out.push({ tag: 'del', text: A[i] as string })
      i++
    } else {
      out.push({ tag: 'add', text: B[j] as string })
      j++
    }
  }
  while (i < n) out.push({ tag: 'del', text: A[i++] as string })
  while (j < m) out.push({ tag: 'add', text: B[j++] as string })
  return out
}
