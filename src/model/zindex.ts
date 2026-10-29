// Fractional indexes: strings that sort between any two others, so several
// people can restack objects at once without renumbering anything.
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const BASE = DIGITS.length

function digit(c: string): number {
  const d = DIGITS.indexOf(c)
  if (d < 0) throw new Error(`Invalid index character "${c}"`)
  return d
}

/**
 * A key strictly between `a` and `b` (`null` — no bound). The result never
 * ends with the lowest digit, so there is always room below it too.
 */
export function keyBetween(a: string | null, b: string | null): string {
  const lo = a ?? ''
  if (b !== null && lo >= b) throw new Error(`keyBetween: "${a}" is not below "${b}"`)
  let result = ''
  let upperOpen = b === null
  for (let i = 0; ; i++) {
    const da = i < lo.length ? digit(lo[i]!) : 0
    const db = upperOpen ? BASE : i < b!.length ? digit(b![i]!) : 0
    if (!upperOpen && da === db) {
      result += DIGITS[da]
      continue
    }
    const mid = Math.floor((da + db) / 2)
    if (mid > da) return result + DIGITS[mid]
    // The digits are neighbours: keep `a`'s digit; from here on the upper bound is open.
    result += DIGITS[da]
    upperOpen = true
  }
}

/** `n` keys in order between `a` and `b`. */
export function keysBetween(a: string | null, b: string | null, n: number): string[] {
  const keys: string[] = []
  let prev = a
  for (let i = 0; i < n; i++) {
    const key = keyBetween(prev, b)
    keys.push(key)
    prev = key
  }
  return keys
}

/** Stacking order: by key, ties by id, so every client sorts the same way. */
export function compareZ(a: { z: string; id: string }, b: { z: string; id: string }): number {
  if (a.z !== b.z) return a.z < b.z ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
