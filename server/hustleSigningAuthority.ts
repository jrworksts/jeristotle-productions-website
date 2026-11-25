/** Validate the EXISTING managed cookie authority; never create, rotate, persist or
 * reveal a key. The platform's observed authority is a 22-character URL-safe token,
 * not a 32-byte example string. Length/format is not a claim about entropy.
 * HMAC callers retain their existing purpose-separated prefixes, and sponsored
 * review retains its existing purpose-specific key derivation. Auth is unchanged.
 */
export function hustleExistingSigningAuthority(value: string): Buffer {
  if (typeof value !== 'string') throw new Error('Existing server cookie signing authority unavailable');
  const key = Buffer.from(value, 'utf8');
  // Preserve the already supported >=32-byte authority and all its signature bytes.
  if (key.length >= 32) return key;
  // Narrow actual managed token format. Do not accept short passwords, whitespace,
  // placeholders, examples or repeated-character synthetic authority.
  if (value.length === 22 && /^[A-Za-z0-9_-]{22}$/.test(value) &&
      new Set(value).size >= 10 && !/test|mock|example|secret|manus|development|change/i.test(value)) return key;
  throw new Error('Existing server cookie signing authority unavailable');
}
