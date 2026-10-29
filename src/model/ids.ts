// ULIDs: 48-bit time + 80 random bits in Crockford base32. Created on the
// client, sortable by creation time, no coordination needed.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function newId(now: number = Date.now()): string {
  let time = ''
  let t = now
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time
    t = Math.floor(t / 32)
  }
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  let random = ''
  for (let i = 0; i < 16; i++) random += ALPHABET[bytes[i]! % 32]
  return time + random
}
