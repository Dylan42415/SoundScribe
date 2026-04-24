import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { chatStorage } from "./storage";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  return _openai;
}
const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    return (getOpenAI() as any)[prop];
  },
});

const GROUNDED_SYSTEM = (ctx: string) => `You are an expert learning assistant and knowledge graph analyst embedded in SoundScribe.

You have been given a Knowledge Graph extracted from a lecture. Help the user learn from it in two ways:

1. FACTUAL questions ("What is X?", "How does X relate to Y?") — answer using entity descriptions and relationships in the context below.
2. STRUCTURAL / LEARNING-PATH questions ("Which node should I start from?", "What are the most important concepts?", "How should I approach this topic?") — use the NODE CENTRALITY rankings. Nodes with more connections are foundational, central ideas; nodes with few connections are details or examples. Recommend a clear learning order and explain why.

RULES:
- Ground every answer in the provided context — do not invent facts not present in the graph.
- For structural questions, explicitly reference the centrality numbers and justify your recommendation.
- Keep answers concise, clear, and educational.
- If the context genuinely has nothing relevant, say so briefly rather than guessing.

${ctx}`;

const HYBRID_SYSTEM = (ctx: string) => `You are a helpful learning assistant for SoundScribe.

If Knowledge Graph context is provided below, prioritise it. For general questions or greetings, respond naturally.

${ctx || "No specific entities matched this query. Provide a general helpful response."}`;

export function registerChatRoutes(app: Express): void {
  // Get all conversations
  app.get("/api/conversations", async (req: Request, res: Response) => {
    try {
      const conversations = await chatStorage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get single conversation with messages
  app.get("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Create new conversation
  app.post("/api/conversations", async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Delete conversation
  app.delete("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Send message and get AI response (streaming)
  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content, recordingId } = req.body;
      const recId = recordingId ? parseInt(String(recordingId)) : undefined;

      // 1. Retrieve relevant KG context, scoped to this recording
      const { context: kgContext, fallback } = await chatStorage.searchKnowledgeGraph(content, recId);

      // Save user message
      await chatStorage.createMessage(conversationId, "user", content);

      // Get conversation history
      const messages = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // 2. Build system prompt
      const useGrounded = kgContext && !fallback;
      console.log(`[Chat Route] mode=${useGrounded ? "grounded" : "hybrid"} recordingId=${recId}`);
      const systemMessage = useGrounded ? GROUNDED_SYSTEM(kgContext) : HYBRID_SYSTEM(kgContext);

      const systemPrompt = { role: "system" as const, content: systemMessage };

      // 3. Stream response
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await openai.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [systemPrompt, ...chatMessages],
        stream: true,
        max_tokens: 2048,
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          fullResponse += delta;
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
      }

      await chatStorage.createMessage(conversationId, "assistant", fullResponse);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });
}
