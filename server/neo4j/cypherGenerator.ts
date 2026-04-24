import { openai } from "../replit_integrations/audio";
import { guardCypher } from "./cypherGuard";

const ALLOWED_LABELS = ["Concept", "Topic", "NoteReference"];

const SYSTEM_PROMPT = `You are a read-only Cypher query generator for a Neo4j knowledge graph.

Node labels (ONLY these): ${ALLOWED_LABELS.join(", ")}
Node properties: id (string), title (string), type (string), description (string), weight (float 0-1), recordingId (integer)
Relationship properties: label (string), strength (float 0-1), recordingId (integer)

STRICT RULES — violating any of these will cause the query to be rejected:
1. ONLY generate READ-ONLY Cypher — no CREATE, DELETE, MERGE, SET, REMOVE, DROP, CALL
2. ALL input values MUST be parameterized — use $recordingId, $nodeId, $title etc. NEVER interpolate values
3. ALWAYS include a LIMIT clause — default to LIMIT 20, never exceed LIMIT 50
4. Max relationship hops: *1..3 — never use unbounded paths like [r*] or *1..10
5. ONLY use allowed node labels above
6. Output MUST be a JSON object with exactly two fields: "query" (string) and "params" (object)
7. No explanations, no markdown, no prose — pure JSON only

Example output:
{"query":"MATCH (n:Concept {recordingId: $recordingId}) RETURN n ORDER BY n.weight DESC LIMIT 20","params":{"recordingId":1}}`;

export interface CypherGenerationResult {
  query: string;
  params: Record<string, any>;
  isValid: boolean;
  error?: string;
}

export async function naturalLanguageToCypher(
  naturalLanguage: string,
  context?: { recordingId?: number; nodeId?: string }
): Promise<CypherGenerationResult> {
  const contextParts: string[] = [];
  if (context?.recordingId !== undefined) contextParts.push(`Recording ID: ${context.recordingId} (use $recordingId parameter)`);
  if (context?.nodeId) contextParts.push(`Focused node ID: "${context.nodeId}" (use $nodeId parameter)`);

  const userContent = [
    `Convert this question to a Cypher query:`,
    `"${naturalLanguage}"`,
    contextParts.length > 0 ? `\nContext:\n${contextParts.join("\n")}` : "",
    `\nReturn ONLY a JSON object: {"query": "...", "params": {...}}`,
  ].join("\n");

  try {
    const response = await (openai as any).chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      max_tokens: 400,
      temperature: 0.05, // very low temp for deterministic, rule-following output
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0].message.content?.trim() ?? "{}";

    let parsed: { query?: string; params?: Record<string, any> };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { query: "", params: {}, isValid: false, error: "AI returned malformed JSON." };
    }

    if (!parsed.query || typeof parsed.query !== "string") {
      return { query: "", params: {}, isValid: false, error: "AI response missing 'query' field." };
    }

    // Merge AI-suggested params with context params (context wins for security)
    const params: Record<string, any> = { ...(parsed.params ?? {}) };
    if (context?.recordingId !== undefined) params.recordingId = context.recordingId;
    if (context?.nodeId) params.nodeId = context.nodeId;

    // Run through the guard — this is the final authority
    const guard = guardCypher(parsed.query);
    if (!guard.isValid) {
      return { query: parsed.query, params, isValid: false, error: `Guard rejected AI query: ${guard.error}` };
    }

    return { query: guard.sanitizedQuery!, params, isValid: true };
  } catch (err: any) {
    return {
      query: "",
      params: {},
      isValid: false,
      error: err.message ?? "Failed to generate Cypher",
    };
  }
}
