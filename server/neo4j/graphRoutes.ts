import type { Express } from "express";
import {
  runSafeCypher,
  expandNode,
  getRelatedNodes,
  getRecordingGraph,
  testConnection,
} from "./neo4jService";
import { naturalLanguageToCypher } from "./cypherGenerator";
import { guardCypher } from "./cypherGuard";
import { graphQueryCache, cacheKey, invalidateRecordingCache } from "./graphCache";

export function registerGraphRoutes(app: Express): void {

  // ── Health check ─────────────────────────────────────────────────────────────
  app.get("/api/graph/health", async (_req, res) => {
    const connected = await testConnection();
    res.json({ connected, cacheSize: graphQueryCache.size });
  });

  // ── Full graph for a recording ────────────────────────────────────────────────
  app.get("/api/graph/recording/:recordingId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const recordingId = Number(req.params.recordingId);
    if (!Number.isInteger(recordingId) || recordingId <= 0) {
      return res.status(400).json({ message: "Invalid recording ID." });
    }

    const cKey = `graph:recording:${recordingId}`;
    const cached = graphQueryCache.get(cKey);
    if (cached) return res.json(cached);

    try {
      const graph = await getRecordingGraph(recordingId);
      graphQueryCache.set(cKey, graph as any);
      res.json(graph);
    } catch (err: any) {
      console.error("[graph] recording fetch error:", err.message);
      res.status(500).json({ message: "Failed to fetch graph." });
    }
  });

  // ── Expand a node's neighborhood ──────────────────────────────────────────────
  app.post("/api/graph/expand", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { nodeId, depth } = req.body as { nodeId?: string; depth?: number };

    if (!nodeId || typeof nodeId !== "string" || nodeId.trim().length === 0) {
      return res.status(400).json({ message: "nodeId is required." });
    }

    const safeDepth = Math.min(Math.max(1, Number(depth) || 2), 3);
    const cKey = `expand:${nodeId}:${safeDepth}`;
    const cached = graphQueryCache.get(cKey);
    if (cached) return res.json({ nodes: cached, edges: [], fromCache: true });

    try {
      const result = await expandNode(nodeId.trim(), safeDepth);
      const seen = new Set<string>();
      const nodes: any[] = [];
      const edges: any[] = [];

      for (const record of result.records) {
        for (const key of ["c", "n"]) {
          const node = record.get(key);
          if (node && !seen.has(node.properties.id)) {
            seen.add(node.properties.id);
            nodes.push(node.properties);
          }
        }
        const rArr = record.get("r");
        if (Array.isArray(rArr)) {
          for (const r of rArr) {
            if (r) {
              edges.push({ label: r.properties?.label ?? r.type, strength: r.properties?.strength });
            }
          }
        }
      }

      graphQueryCache.set(cKey, nodes);
      res.json({ nodes, edges });
    } catch (err: any) {
      console.error("[graph] expand error:", err.message);
      res.status(500).json({ message: "Failed to expand node." });
    }
  });

  // ── Related nodes for a node ─────────────────────────────────────────────────
  app.get("/api/graph/related/:nodeId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const nodeId = req.params.nodeId?.trim();
    if (!nodeId) return res.status(400).json({ message: "nodeId is required." });

    const cKey = `related:${nodeId}`;
    const cached = graphQueryCache.get(cKey);
    if (cached) return res.json({ nodes: cached, fromCache: true });

    try {
      const result = await getRelatedNodes(nodeId);
      const nodes = result.records.map((r) => ({
        ...r.get("n").properties,
        relationLabel: r.get("r")?.properties?.label ?? r.get("r")?.type,
      }));
      graphQueryCache.set(cKey, nodes);
      res.json({ nodes });
    } catch (err: any) {
      console.error("[graph] related error:", err.message);
      res.status(500).json({ message: "Failed to get related nodes." });
    }
  });

  // ── Natural language → AI Cypher → Safe execution ────────────────────────────
  app.post("/api/graph/query", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { question, recordingId, nodeId } = req.body as {
      question?: string;
      recordingId?: number;
      nodeId?: string;
    };

    if (!question?.trim()) {
      return res.status(400).json({ message: "question is required." });
    }
    if (question.length > 500) {
      return res.status(400).json({ message: "Question too long (max 500 chars)." });
    }

    try {
      const generated = await naturalLanguageToCypher(question, {
        recordingId: recordingId ? Number(recordingId) : undefined,
        nodeId,
      });

      if (!generated.isValid) {
        return res.status(400).json({
          message: generated.error ?? "Query could not be generated safely.",
        });
      }

      // runSafeCypher applies guard + cache + timeout
      const rows = await runSafeCypher(generated.query, generated.params, { useCache: true });
      res.json({ query: generated.query, rows, count: rows.length });
    } catch (err: any) {
      console.error("[graph] AI query error:", err.message);
      res.status(500).json({ message: err.message ?? "Query execution failed." });
    }
  });

  // ── Raw validated Cypher execution ───────────────────────────────────────────
  app.post("/api/graph/cypher", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { query, params = {} } = req.body as { query?: string; params?: Record<string, any> };

    if (!query?.trim()) {
      return res.status(400).json({ message: "query is required." });
    }

    // Validate params — only allow primitive values (no object injection)
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === "object" && v !== null) {
        return res.status(400).json({ message: `Parameter "${k}" must be a primitive value.` });
      }
    }

    // Guard check (also applied inside runSafeCypher, but surface error early)
    const guard = guardCypher(query);
    if (!guard.isValid) {
      return res.status(400).json({ message: guard.error });
    }

    try {
      const rows = await runSafeCypher(query, params, { useCache: true });
      res.json({ query: guard.sanitizedQuery, rows, count: rows.length });
    } catch (err: any) {
      console.error("[graph] cypher error:", err.message);
      res.status(500).json({ message: err.message ?? "Cypher execution failed." });
    }
  });

  // ── Cache management ─────────────────────────────────────────────────────────
  app.delete("/api/graph/cache", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { recordingId } = req.query;
    if (recordingId) {
      invalidateRecordingCache(Number(recordingId));
      res.json({ message: `Cache invalidated for recording ${recordingId}.` });
    } else {
      graphQueryCache.clear();
      res.json({ message: "Graph query cache cleared." });
    }
  });
}
