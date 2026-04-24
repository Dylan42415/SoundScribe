import neo4j, { Driver, Session, QueryResult } from "neo4j-driver";
import { guardCypher } from "./cypherGuard";
import { graphQueryCache, cacheKey } from "./graphCache";
import { safeLog } from "../config/env";

let _driver: Driver | null = null;

const QUERY_TIMEOUT_MS = 5000; // 5-second hard limit for user-facing queries

function getDriver(): Driver {
  if (!_driver) {
    const uri = process.env.NEO4J_URI;
    const username = process.env.NEO4J_USERNAME;
    const password = process.env.NEO4J_PASSWORD;

    if (!uri || !username || !password) {
      throw new Error(
        "Neo4j credentials not configured. Set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD in Replit Secrets."
      );
    }

    _driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
      maxConnectionPoolSize: 10,
      connectionAcquisitionTimeout: 5000,
    });
  }
  return _driver;
}

export async function closeDriver(): Promise<void> {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}

// ── Low-level runner (internal use only — no guard, no cache) ─────────────────

export async function runCypher(
  query: string,
  params: Record<string, any> = {}
): Promise<QueryResult> {
  const driver = getDriver();
  const database = process.env.NEO4J_DATABASE || "neo4j";
  const session: Session = driver.session({ database });
  try {
    return await session.run(query, params);
  } finally {
    await session.close();
  }
}

// ── Safe runner for ALL user-facing queries ───────────────────────────────────
// Applies: guard validation → cache check → timeout → safe logging

export async function runSafeCypher(
  rawQuery: string,
  params: Record<string, any> = {},
  options: { useCache?: boolean } = {}
): Promise<any[]> {
  // 1. Guard validation
  const guard = guardCypher(rawQuery);
  if (!guard.isValid) {
    throw new Error(`Cypher guard rejected query: ${guard.error}`);
  }
  const query = guard.sanitizedQuery!;

  // 2. Cache lookup
  const useCache = options.useCache !== false;
  const key = cacheKey(query, params);
  if (useCache) {
    const cached = graphQueryCache.get(key);
    if (cached) {
      safeLog("cache hit", { key: key.slice(0, 80) });
      return cached;
    }
  }

  // 3. Execute with timeout
  safeLog("running query", query.slice(0, 200));

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Graph query timed out after 5 seconds.")), QUERY_TIMEOUT_MS)
  );

  const queryPromise = runCypher(query, params);
  const result = await Promise.race([queryPromise, timeoutPromise]);

  // 4. Serialize records
  const rows = result.records.map((record) => {
    const obj: Record<string, any> = {};
    for (const key of record.keys) {
      const val = record.get(key);
      obj[key as string] = val?.properties ?? val;
    }
    return obj;
  });

  // 5. Cache result
  if (useCache) {
    graphQueryCache.set(key, rows);
  }

  return rows;
}

export async function testConnection(): Promise<boolean> {
  try {
    await runCypher("RETURN 1 as ping");
    return true;
  } catch {
    return false;
  }
}

// ── Graph upsert helpers (internal writes — bypass guard intentionally) ────────

export interface Neo4jEntity {
  id: string;
  label: string;
  type: string;
  description?: string;
  weight?: number;
  recordingId: number;
}

export interface Neo4jRelation {
  sourceId: string;
  targetId: string;
  label: string;
  strength?: number;
  recordingId: number;
}

export async function upsertKnowledgeGraph(
  recordingId: number,
  entities: Neo4jEntity[],
  relations: Neo4jRelation[]
): Promise<void> {
  for (const entity of entities) {
    await runCypher(
      `MERGE (n:Concept {id: $id})
       SET n.title = $title,
           n.type = $type,
           n.description = $description,
           n.weight = $weight,
           n.recordingId = $recordingId`,
      {
        id: entity.id,
        title: entity.label,
        type: entity.type,
        description: entity.description ?? "",
        weight: entity.weight ?? 0.5,
        recordingId: entity.recordingId,
      }
    );
  }

  for (const rel of relations) {
    const relType = sanitizeRelType(rel.label);
    await runCypher(
      `MATCH (a:Concept {id: $sourceId})
       MATCH (b:Concept {id: $targetId})
       MERGE (a)-[r:${relType} {recordingId: $recordingId}]->(b)
       SET r.strength = $strength, r.label = $label`,
      {
        sourceId: rel.sourceId,
        targetId: rel.targetId,
        strength: rel.strength ?? 0.5,
        recordingId: rel.recordingId,
        label: rel.label,
      }
    );
  }
}

export async function deleteRecordingGraph(recordingId: number): Promise<void> {
  await runCypher(
    `MATCH (n:Concept {recordingId: $recordingId})-[r]-()
     DELETE r`,
    { recordingId }
  );
  await runCypher(
    `MATCH (n:Concept {recordingId: $recordingId})
     WHERE NOT (n)-[]-()
     DELETE n`,
    { recordingId }
  );
}

// ── Pre-built safe read queries ───────────────────────────────────────────────

export async function expandNode(nodeId: string, depth: number = 2): Promise<QueryResult> {
  const safeDepth = Math.min(depth, 3);
  return runCypher(
    `MATCH path = (c:Concept {id: $id})-[r*1..${safeDepth}]-(n)
     RETURN c, r, n, path
     LIMIT 50`,
    { id: nodeId }
  );
}

export async function getRelatedNodes(nodeId: string): Promise<QueryResult> {
  return runCypher(
    `MATCH (c:Concept {id: $id})-[r]->(n)
     RETURN n, r
     ORDER BY n.weight DESC
     LIMIT 20`,
    { id: nodeId }
  );
}

export async function getRecordingGraph(recordingId: number): Promise<{
  nodes: any[];
  edges: any[];
}> {
  const result = await runCypher(
    `MATCH (n:Concept {recordingId: $recordingId})
     OPTIONAL MATCH (n)-[r]->(m:Concept {recordingId: $recordingId})
     RETURN n, r, m
     LIMIT 50`,
    { recordingId }
  );

  const nodesMap = new Map<string, any>();
  const edges: any[] = [];

  for (const record of result.records) {
    const n = record.get("n");
    const r = record.get("r");
    const m = record.get("m");

    if (n) {
      const p = n.properties;
      nodesMap.set(p.id, { id: p.id, title: p.title, type: p.type, description: p.description, weight: p.weight });
    }
    if (m) {
      const p = m.properties;
      nodesMap.set(p.id, { id: p.id, title: p.title, type: p.type, description: p.description, weight: p.weight });
    }
    if (r) {
      const rp = r.properties;
      edges.push({
        source: rp.sourceId ?? r.startNodeElementId,
        target: rp.targetId ?? r.endNodeElementId,
        label: rp.label ?? r.type,
        strength: rp.strength,
      });
    }
  }

  return { nodes: Array.from(nodesMap.values()), edges };
}

function sanitizeRelType(label: string): string {
  return (
    label
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_") || "RELATED_TO"
  );
}
