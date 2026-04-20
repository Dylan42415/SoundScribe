interface Entity {
  id: string;
  label: string;
  weight?: number;
  type?: string;
  description?: string;
}

interface Relation {
  source: string;
  target: string;
  strength?: number;
  label?: string;
}

interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

export interface MindMapNode {
  id: string;
  label: string;
  type?: string;
  description?: string;
  children: MindMapNode[];
  edges?: { target: string; label?: string }[];
}

/**
 * Deterministically transforms a Knowledge Graph into a Mind Map structure.
 * Now includes support for graph edges beyond simple hierarchy.
 */
export function transformKGToMindMap(kg: KnowledgeGraph): MindMapNode {
  console.log('🧠 transformKGToMindMap called with:', {
    entityCount: kg.entities?.length || 0,
    relationCount: kg.relations?.length || 0,
  });

  if (!kg.entities || kg.entities.length === 0) {
    return { id: "root", label: "Central Idea", children: [] };
  }

  const entities = kg.entities || [];
  const relations = kg.relations || [];

  // 1. Noise Filtering
  const GENERIC_LABELS = new Set(["thing", "stuff", "example", "concept", "entity", "object", "item"]);
  const MIN_WEIGHT = 0.2; // Filter low importance entities
  const MIN_STRENGTH = 0.2; // Filter weak relations

  const filteredEntities = entities.filter(e => 
    !GENERIC_LABELS.has(e.label.toLowerCase()) && 
    (e.weight === undefined || e.weight >= MIN_WEIGHT)
  );

  const filteredEntityIds = new Set(filteredEntities.map(e => e.id));

  const filteredRelations = relations.filter(r => 
    filteredEntityIds.has(r.source) && 
    filteredEntityIds.has(r.target) &&
    (r.strength === undefined || r.strength >= MIN_STRENGTH)
  );

  if (filteredEntities.length === 0) {
     return { id: "root", label: "Central Idea", children: [] };
  }

  // 2. Root Selection
  const scores = new Map<string, number>();
  filteredEntities.forEach(e => scores.set(e.id, e.weight || 1));

  filteredRelations.forEach(r => {
    const strength = r.strength || 1;
    if (scores.has(r.source)) scores.set(r.source, (scores.get(r.source) || 0) + strength);
    if (scores.has(r.target)) scores.set(r.target, (scores.get(r.target) || 0) + strength);
  });

  let rootId = filteredEntities[0].id;
  let maxScore = -1;
  scores.forEach((score, id) => {
    if (score > maxScore) {
      maxScore = score;
      rootId = id;
    }
  });

  const rootEntity = filteredEntities.find(e => e.id === rootId)!;

  // 3. Tree Construction (Best Parent Assignment)
  // We want to assign each node to its best parent (strongest edge) 
  // ensuring max depth of 2 (Root -> Child -> Grandchild).

  const assignments = new Map<string, { parentId: string, strength: number, depth: number }>();
  const nodes = new Map<string, MindMapNode>();

  // Initialize Root
  nodes.set(rootId, {
    id: rootEntity.id,
    label: rootEntity.label,
    type: rootEntity.type,
    description: rootEntity.description,
    children: [],
    edges: []
  });

  // Find all reachable nodes within 2 hops via strongest paths

  // Step A: Find candidates for Depth 1 (neighbors of root)
  const depth1Candidates = new Map<string, number>(); // id -> strength
  filteredRelations.forEach(r => {
    if (r.source === rootId && r.target !== rootId) {
      const s = r.strength || 1;
      const current = depth1Candidates.get(r.target) || 0;
      if (s > current) depth1Candidates.set(r.target, s);
    }
    if (r.target === rootId && r.source !== rootId) {
       const s = r.strength || 1;
       const current = depth1Candidates.get(r.source) || 0;
       if (s > current) depth1Candidates.set(r.source, s);
    }
  });

  // Step B: Find candidates for Depth 2 (neighbors of Depth 1)
  // But wait, a node might be reachable from Root (strength 0.2) AND from a Child (strength 0.9).
  // It should be a Grandchild (Depth 2).

  // Let's iterate all potential nodes and find their best parent.
  // Valid parents are: Root (Depth 0) OR a Depth 1 Node.
  // A Depth 1 Node is defined as a node whose BEST parent is Root.

  // Let's settle Depth 1 first?
  // If we settle Depth 1 based on Root connections, we might lock a node into Depth 1 even if it has a stronger connection to another Depth 1 node (which would make it Depth 2? No, if it's connected to Depth 1 node, it becomes Depth 2. If it's connected to Root, it's Depth 1).
  // Wait, being Depth 1 is usually "better" (closer to root).
  // But the "Strongest Relation" rule says "attach to strongest relation".
  // If Root->A is strength 0.2, and B->A is strength 0.9 (where B is a child of Root), 
  // then A should be a child of B (Depth 2), not Root (Depth 1).

  // So:
  // 1. Identify all nodes reachable from Root within 2 hops (ignoring direction for reachability, but strength matters).
  // 2. For each node (excluding Root), find ALL incoming edges from other reachable nodes.
  // 3. Pick the single strongest edge (u, v) where u is "closer" to root? 
  // No, just strongest edge.
  // But we need to avoid cycles and ensure root connectivity.

  // Let's stick to the "Global Optimization" approach limited to Depth 2.

  // 1. Collect all edges. Sort by Strength DESC.
  // 2. Build the tree greedily, respecting max depth.

  const sortedRelations = [...filteredRelations].sort((a, b) => (b.strength || 1) - (a.strength || 1));
  const nodeDepth = new Map<string, number>();
  nodeDepth.set(rootId, 0);

  const parentMap = new Map<string, string>(); // child -> parent

  for (const r of sortedRelations) {
    // We want to attach 'other' to 'current' if 'current' is already in tree and 'other' is not.
    // Directions can be either way for structural attachment, usually we treat relations as bidirectional for clustering, 
    // unless strict direction is implied. KG relations are directed, but "mind map" hierarchy might just follow strength.
    // Let's check both directions.

    // Case 1: Source is in tree, Target is not.
    if (nodeDepth.has(r.source) && !nodeDepth.has(r.target)) {
      const d = nodeDepth.get(r.source)!;
      if (d < 2) { // Can extend to depth d+1
        nodeDepth.set(r.target, d + 1);
        parentMap.set(r.target, r.source);
      }
    }
    // Case 2: Target is in tree, Source is not.
    else if (nodeDepth.has(r.target) && !nodeDepth.has(r.source)) {
      const d = nodeDepth.get(r.target)!;
      if (d < 2) {
        nodeDepth.set(r.source, d + 1);
        parentMap.set(r.source, r.target);
      }
    }
    // Case 3: Both in tree - ignore (cycle or cross edge).
    // Case 4: Neither in tree - skip (will be picked up later when one end is added).
  }

  // Now reconstruct the tree structure from parentMap
  // First create all MindMapNodes
  filteredEntities.forEach(e => {
    if (nodeDepth.has(e.id)) {
      nodes.set(e.id, {
        id: e.id,
        label: e.label,
        type: e.type,
        description: e.description,
        children: [],
        edges: []
      });
    }
  });

  // Link children to parents
  parentMap.forEach((parentId, childId) => {
    const parent = nodes.get(parentId);
    const child = nodes.get(childId);
    if (parent && child) {
      parent.children.push(child);
      // Find the edge label for this connection
      const rel = filteredRelations.find(r => 
        (r.source === parentId && r.target === childId) || 
        (r.source === childId && r.target === parentId)
      );
      if (rel) {
        // We add the edge metadata to the PARENT node's edges array pointing to child?
        // Or strictly strictly strictly structural?
        // The MindMapNode interface has `edges?: { target: string; label?: string }[]`.
        // This seems to be for visual edges.
        parent.edges = parent.edges || [];
        parent.edges.push({ target: childId, label: rel.label });
      }
    }
  });

  return nodes.get(rootId)!;
}
