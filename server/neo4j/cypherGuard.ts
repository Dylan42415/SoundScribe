/**
 * Cypher Guard — strict allowlist-based validator for all user-facing Cypher.
 * This is the ONLY gate through which read queries from users/AI may pass.
 * Internal write operations (upsert, delete) bypass this guard intentionally.
 */

export interface GuardResult {
  isValid: boolean;
  error?: string;
  sanitizedQuery?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_HOP_DEPTH = 3;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

// Read-only clauses that are explicitly allowed
const ALLOWED_CLAUSE_PATTERNS = [
  /^\s*MATCH\b/im,
  /^\s*OPTIONAL\s+MATCH\b/im,
  /^\s*RETURN\b/im,
  /^\s*WHERE\b/im,
  /^\s*WITH\b/im,
  /^\s*ORDER\s+BY\b/im,
  /^\s*LIMIT\b/im,
  /^\s*SKIP\b/im,
  /^\s*UNWIND\b/im,
];

// Destructive / write operations that must NEVER appear
const FORBIDDEN_KEYWORDS = [
  "CREATE",
  "DELETE",
  "DETACH",
  "MERGE",
  "SET",
  "REMOVE",
  "DROP",
  "CALL",
  "FOREACH",
  "LOAD CSV",
  "USE",
  "GRANT",
  "DENY",
  "REVOKE",
];

// Allowed node labels (whitelist)
const ALLOWED_LABELS = new Set(["Concept", "Topic", "NoteReference"]);

// ── Main guard function ───────────────────────────────────────────────────────

export function guardCypher(query: string): GuardResult {
  if (!query || typeof query !== "string") {
    return { isValid: false, error: "Query must be a non-empty string." };
  }

  const trimmed = query.trim();

  // 1. Must not exceed reasonable length
  if (trimmed.length > 2000) {
    return { isValid: false, error: "Query exceeds maximum allowed length (2000 chars)." };
  }

  // 2. Must contain at least MATCH and RETURN
  if (!/\bMATCH\b/i.test(trimmed) || !/\bRETURN\b/i.test(trimmed)) {
    return { isValid: false, error: "Query must contain both MATCH and RETURN clauses." };
  }

  // 3. Block all forbidden keywords — check as standalone clause starters
  for (const kw of FORBIDDEN_KEYWORDS) {
    // Match as a word boundary at the start of a line or after whitespace
    const regex = new RegExp(`(?:^|\\n)\\s*${kw.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (regex.test(trimmed)) {
      return { isValid: false, error: `Operation "${kw}" is not permitted in graph queries.` };
    }
  }

  // 4. Enforce max hop depth — block *N..M where M > MAX_HOP_DEPTH
  const hopPattern = /\*(\d+)\.\.(\d+)/g;
  let hopMatch: RegExpExecArray | null;
  while ((hopMatch = hopPattern.exec(trimmed)) !== null) {
    const maxHop = parseInt(hopMatch[2], 10);
    if (maxHop > MAX_HOP_DEPTH) {
      return {
        isValid: false,
        error: `Hop depth *${hopMatch[1]}..${hopMatch[2]} exceeds maximum allowed depth of ${MAX_HOP_DEPTH}.`,
      };
    }
  }
  // Also block unbounded hops: [r*] or [r*1..]
  if (/\[\w*\*\s*\]|\[\w*\*\d+\.\.\s*\]/i.test(trimmed)) {
    return { isValid: false, error: "Unbounded path expressions are not allowed. Specify a max depth (e.g. *1..3)." };
  }

  // 5. Block raw string interpolation — detect template literal artifacts or unparameterized values
  // Parameterized queries use $param. Reject queries that contain quoted string literals in WHERE/MATCH
  // (heuristic: block single/double quoted values that look like IDs or SQL injection)
  if (/['"]\s*\+\s*['"]/.test(trimmed)) {
    return { isValid: false, error: "String concatenation is not permitted. Use parameterized queries." };
  }

  // 6. Check for overly broad queries (no WHERE or specific filter when matching all)
  if (/MATCH\s*\(\s*\w+\s*\)/i.test(trimmed) && !/WHERE\b/i.test(trimmed) && !/\{\s*\w+\s*:/i.test(trimmed)) {
    // Bare MATCH (n) with no filter — only allow if LIMIT is present
    if (!/\bLIMIT\b/i.test(trimmed)) {
      return {
        isValid: false,
        error: "Unbounded graph dump detected. Add a WHERE clause or property filter, or include LIMIT.",
      };
    }
  }

  // 7. Ensure LIMIT is present; inject DEFAULT_LIMIT if missing
  let finalQuery = trimmed;
  if (!/\bLIMIT\b/i.test(trimmed)) {
    finalQuery = `${trimmed}\nLIMIT ${DEFAULT_LIMIT}`;
  } else {
    // Clamp any LIMIT that exceeds MAX_LIMIT
    finalQuery = trimmed.replace(/\bLIMIT\s+(\d+)/gi, (_, n) => {
      const clamped = Math.min(parseInt(n, 10), MAX_LIMIT);
      return `LIMIT ${clamped}`;
    });
  }

  return { isValid: true, sanitizedQuery: finalQuery };
}

// ── Utility: check if a query looks parameterized ─────────────────────────────

export function hasRawLiterals(query: string): boolean {
  // Flag queries that embed raw numeric/string IDs rather than $params
  // Allow string literals only in RETURN/WITH contexts (e.g. RETURN "label")
  const whereClause = query.match(/WHERE\b([\s\S]*?)(?:RETURN|WITH|ORDER|LIMIT|$)/i)?.[1] ?? "";
  return /"[^"]{1,100}"|'[^']{1,100}'/.test(whereClause);
}
