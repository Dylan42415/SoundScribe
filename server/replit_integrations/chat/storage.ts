import { db } from "../../db";
import { conversations, messages, entities, relationsTable } from "@shared/schema";
import { eq, desc, and, or, sql, ilike } from "drizzle-orm";

export interface IChatStorage {
  getConversation(id: number): Promise<typeof conversations.$inferSelect | undefined>;
  getAllConversations(): Promise<(typeof conversations.$inferSelect)[]>;
  createConversation(title: string): Promise<typeof conversations.$inferSelect>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<(typeof messages.$inferSelect)[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<typeof messages.$inferSelect>;
  searchKnowledgeGraph(query: string, recordingId?: number): Promise<{ context: string; fallback: boolean }>;
}

// Queries that are really asking about graph topology / learning order — not about specific facts
const STRUCTURAL_QUERY_RE = /start|begin|first|foundational|important|central|hub|overview|order|path|learn|understand|approach|recommend|key concept/i;

export const chatStorage: IChatStorage = {
  async getConversation(id: number) {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  },

  async getAllConversations() {
    return db.select().from(conversations).orderBy(desc(conversations.createdAt));
  },

  async createConversation(title: string) {
    const [conversation] = await db.insert(conversations).values({ title }).returning();
    return conversation;
  },

  async deleteConversation(id: number) {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  },

  async getMessagesByConversation(conversationId: number) {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  },

  async createMessage(conversationId: number, role: string, content: string) {
    const [message] = await db.insert(messages).values({ conversationId, role, content }).returning();
    return message;
  },

  async searchKnowledgeGraph(query: string, recordingId?: number) {
    console.log(`[KG Retrieval] query="${query}" recordingId=${recordingId ?? "none"}`);

    const isStructural = STRUCTURAL_QUERY_RE.test(query);
    const isAbstract   = /topic|about|lecture|summary|overview|themes|context/i.test(query);

    // ── 1. Always fetch every node in this recording with its degree ──────────
    //    This powers both structural questions and the centrality section.
    const allNodesByDegree = await db.execute(sql`
      SELECT
        e.id, e.label, e.type, e.description, e.recording_id,
        COUNT(r.id) AS degree
      FROM entities e
      LEFT JOIN relations r ON e.id = r.source_id OR e.id = r.target_id
      ${recordingId ? sql`WHERE e.recording_id = ${recordingId}` : sql``}
      GROUP BY e.id
      ORDER BY degree DESC
    `);

    const allNodes = allNodesByDegree.rows as {
      id: number; label: string; type: string;
      description: string | null; degree: string;
    }[];

    if (allNodes.length === 0) {
      console.log("[KG Retrieval] No entities found.");
      return { context: "", fallback: true };
    }

    // ── 2. Keyword search for specific-fact queries ───────────────────────────
    const fillerWords = new Set([
      'what','is','the','explain','tell','me','how','about','this','lecture',
      'was','were','main','topic','key','theme','themes','show','describe',
      'can','you','please','give','an','which','node','should','from','better',
      'start','begin','where','that','for','are','and','but','not','with',
    ]);
    const keywords = query.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !fillerWords.has(w));

    let matchedEntities: typeof allNodes = [];

    if (keywords.length > 0) {
      const searchConditions = keywords.map(word =>
        or(
          ilike(entities.label,       `%${word}%`),
          ilike(entities.description, `%${word}%`),
        )
      );
      const baseConditions = recordingId
        ? and(eq(entities.recordingId, recordingId), or(...searchConditions))
        : or(...searchConditions);

      const rows = await db.select().from(entities).where(baseConditions).limit(10);
      // Map to same shape with degree lookup
      matchedEntities = rows.map(r => {
        const found = allNodes.find(n => n.id === r.id);
        return {
          id: r.id, label: r.label, type: r.type,
          description: r.description ?? null,
          recording_id: r.recordingId,
          degree: found?.degree ?? '0',
        };
      });
    }

    // ── 3. For structural / abstract queries, augment with top-hub nodes ──────
    if (isStructural || isAbstract || matchedEntities.length < 2) {
      const existingIds = new Set(matchedEntities.map(n => n.id));
      for (const node of allNodes.slice(0, 6)) {
        if (!existingIds.has(node.id)) {
          matchedEntities.push(node);
          existingIds.add(node.id);
        }
      }
    }

    // ── 4. Resolve relations for matched nodes ────────────────────────────────
    const entityIds = matchedEntities.map(e => e.id);
    const resolvedRelations = await db.execute(sql`
      SELECT
        r.label  AS relation_label,
        r.strength,
        s.label  AS source_label,
        s.description AS source_desc,
        t.label  AS target_label,
        t.description AS target_desc
      FROM relations r
      JOIN entities s ON r.source_id = s.id
      JOIN entities t ON r.target_id = t.id
      WHERE (r.source_id IN ${entityIds} OR r.target_id IN ${entityIds})
      ${recordingId
        ? sql`AND s.recording_id = ${recordingId} AND t.recording_id = ${recordingId}`
        : sql``}
      LIMIT 30
    `);
    const rels = resolvedRelations.rows as any[];

    // ── 5. Build context ──────────────────────────────────────────────────────
    let context = "";

    // Section A: Centrality ranking — crucial for structural questions
    context += "NODE CENTRALITY (ranked by number of connections — higher = more foundational):\n";
    allNodes.slice(0, 12).forEach((n, i) => {
      context += `${i + 1}. ${n.label} (${n.type}) — ${n.degree} connections\n`;
    });
    context += "\n";

    // Section B: Matched entities with descriptions
    context += "RELEVANT ENTITIES:\n";
    matchedEntities.forEach(e => {
      if (!e.label) return;
      context += `- ${e.label} (${e.type}, ${e.degree} connections):\n`;
      context += `  ${e.description ?? "No description available"}\n`;
    });
    context += "\n";

    // Section C: Relationships
    context += "RELATIONSHIPS:\n";
    if (rels.length > 0) {
      rels.forEach(r => {
        const lbl = (r.relation_label ?? "related to").replace(/_/g, " ");
        context += `- ${r.source_label} —[${lbl}]→ ${r.target_label}\n`;
      });
    } else {
      context += "- No specific relationships found.\n";
    }

    console.log(`[KG Retrieval] ${allNodes.length} total nodes, ${matchedEntities.length} matched, ${rels.length} rels. structural=${isStructural}`);
    return {
      context,
      fallback: !isStructural && !isAbstract && matchedEntities.length < 2,
    };
  },
};
