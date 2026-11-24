/**
 * Guard for free text copied from untrusted audit reports.
 * - Secret-like values (JWTs, long keys, password assignments) are never stored.
 * - Security-finding language (vulnerability descriptions) belongs to a restricted
 *   security workflow, not to the map (brief: "Confidential risk findings ... DO NOT put
 *   vulnerability descriptions into the map's public-facing content").
 * Withheld text is replaced by a fixed marker and the field name is recorded.
 */
export const WITHHELD = '[محجوب: محتوى أمني يُعالج في مسار مقيّد]';

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,              // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/,
  /(?:key|secret|token)\W{0,5}[A-Fa-f0-9]{32,}/i,              // hex secret next to a key word
  /\b(?=[A-Za-z0-9+]*\d)(?=[A-Za-z0-9+]*[a-z])(?=[A-Za-z0-9+]*[A-Z])[A-Za-z0-9+]{40,}={0,2}/, // base64-like blob
  /\b(?:password|passwd|pwd)\s*[:=]\s*\S+/i,
  /\bbearer\s+[A-Za-z0-9._-]{24,}/i,
];

const SECURITY_FINDING_PATTERNS: RegExp[] = [
  /\bunauthenticated\b/i,
  /\bno (?:user )?auth(?:entication|orization)?\b/i,
  /\bwithout (?:any )?auth(?:entication)?\b/i,
  /\bpublic(?:ly)? (?:accessible|exposed)\b.*\b(?:pii|personal)/i,
  /\bhard-?coded (?:jwt|secret|signing|key|password|credential|admin)/i,
  /\bdefault (?:admin|password|credential)/i,
  /\bseed(?:s|ed)? (?:two )?(?:staff |default )?(?:accounts?|admin|password)/i,
  /\bplain[- ]?text\b.*\b(?:secret|key|password|credential)/i,
  /\b(?:secret|key|password|credential)s?\b.*\bplain[- ]?text\b/i,
  /\bpassword ?hash\b/i,
  /\bpasswordHash\b/,
  /\bnational id\b.*\bpassword\b|\bpassword\b.*\bnational id\b/i,
  /\bvulnerab/i,
  /\bexploit/i,
  /\bbypass(?:es)? (?:auth|admin|business)/i,
  /\bskip(?:s)? (?:the )?admin/i,
  /\.credentials\.json/i,
  /\bopen cors\b/i,
  /\bpii in logs?\b|\blogs? (?:full )?(?:api )?bodies\b|\blogs phones\b/i,
];

export type GuardResult = { text: string | null; withheld: boolean; reason: 'secret' | 'security_finding' | null };

export function guardText(value: string | null | undefined): GuardResult {
  if (value === null || value === undefined) return { text: null, withheld: false, reason: null };
  const text = String(value);
  if (SECRET_VALUE_PATTERNS.some((p) => p.test(text))) return { text: WITHHELD, withheld: true, reason: 'secret' };
  if (SECURITY_FINDING_PATTERNS.some((p) => p.test(text))) return { text: WITHHELD, withheld: true, reason: 'security_finding' };
  return { text, withheld: false, reason: null };
}

/** True if the string looks like it contains a secret value (used by validators/leak checks). */
export function containsSecretValue(text: string): boolean {
  return SECRET_VALUE_PATTERNS.some((p) => p.test(text));
}
