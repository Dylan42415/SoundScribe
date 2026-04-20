import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes } from "./integrations/auth";
import { registerChatRoutes } from "./integrations/chat";
import { registerImageRoutes } from "./integrations/image";
import { registerAudioRoutes } from "./integrations/audio";
import { registerObjectStorageRoutes, ObjectStorageService } from "./integrations/object_storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import { openai, speechToText } from "./integrations/audio";
import { toFile } from "openai";
import fs from "fs";
import path from "path";
import os from "os";
import { exec, execSync, spawn } from "child_process";
import { promisify } from "util";
import { transformKGToMindMap } from "./utils/mindMapTransformer";

const execAsync = promisify(exec);

// Resolve ffmpeg path once at startup (cross-platform: check local bin first on Windows, then `where`/`which`)
const FFMPEG_BIN = (() => {
  if (process.platform === 'win32') {
    const localFfmpeg = path.join(process.cwd(), 'bin', 'ffmpeg.exe');
    if (fs.existsSync(localFfmpeg)) return localFfmpeg;
    try {
      return execSync('where ffmpeg').toString().trim().split('\n')[0].trim();
    } catch {
      return 'ffmpeg';
    }
  }
  try {
    return execSync('which ffmpeg').toString().trim();
  } catch {
    return 'ffmpeg';
  }
})();

// Resolve yt-dlp path (cross-platform)
const YT_DLP = (() => {
  if (process.platform === 'win32') {
    const localYtDlp = path.join(process.cwd(), 'bin', 'yt-dlp.exe');
    if (fs.existsSync(localYtDlp)) return localYtDlp;
    try {
      return execSync('where yt-dlp').toString().trim().split('\n')[0].trim();
    } catch {
      return path.join(process.cwd(), 'bin', 'yt-dlp'); // Fallback to provided binary
    }
  }
  return path.join(process.cwd(), 'bin', 'yt-dlp');
})();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // 1. Setup Auth (Must be first)
  await setupAuth(app);
  registerAuthRoutes(app);

  // 2. Register Integrations
  registerChatRoutes(app);
  registerImageRoutes(app);
  registerAudioRoutes(app);
  registerObjectStorageRoutes(app);

  const objectStorage = new ObjectStorageService();

  // 3. Application Routes

  // --- User Stats ---
  app.get(api.user.getStats.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any).claims.sub;
    
    let stats = await storage.getUserStats(userId);
    if (!stats) {
      // Initialize stats if not exists
      stats = await storage.createUserStats({ userId });
    }
    res.json(stats);
  });

  app.patch(api.user.updateSettings.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any).claims.sub;
    const input = api.user.updateSettings.input.parse(req.body);
    const stats = await storage.updateUserStats(userId, input);
    res.json(stats);
  });

  // --- Recordings ---
  app.get(api.recordings.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any).claims.sub;
    const recordings = await storage.getRecordings(userId);
    res.json(recordings);
  });

  app.get(api.recordings.get.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const recording = await storage.getRecording(Number(req.params.id));
    if (!recording) return res.status(404).json({ message: "Recording not found" });
    if (recording.userId !== (req.user as any).claims.sub) return res.sendStatus(403);
    res.json(recording);
  });

  app.post(api.recordings.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any).claims.sub;
    
    try {
      const input = api.recordings.create.input.parse(req.body);
      const recording = await storage.createRecording({
        userId,
        title: input.title,
        audioUrl: input.audioUrl,
        duration: input.duration,
      });
      res.status(201).json(recording);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.recordings.delete.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const id = Number(req.params.id);
    const recording = await storage.getRecording(id);
    if (!recording) return res.status(404).json({ message: "Not found" });
    if (recording.userId !== (req.user as any).claims.sub) return res.sendStatus(403);
    
    await storage.deleteRecording(id);
    res.sendStatus(204);
  });

  // --- AI Processing ---
  app.post(api.recordings.process.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any).claims.sub;
    const id = Number(req.params.id);

    const recording = await storage.getRecording(id);
    if (!recording) return res.status(404).json({ message: "Not found" });
    if (recording.userId !== userId) return res.sendStatus(403);

    // Start processing (async? for now sync to keep simple or use background job if long)
    // Since we're using OpenAI, it might take 10-20s. We should probably set status to 'processing' and return, 
    // but the user wants "Show processing animation". 
    // We'll update status to 'processing' and return the updated recording immediately.
    // The actual processing continues in background.
    
    await storage.updateRecording(id, { status: "processing" });
    
    // Background processing
    (async () => {
      const tempFiles: string[] = [];
      try {
        // 1. Download file from Object Storage
        const tempFilePath = path.join(os.tmpdir(), `rec-${id}-${Date.now()}.webm`); 
        tempFiles.push(tempFilePath);
        await objectStorage.downloadObjectEntityTo(recording.audioUrl, tempFilePath);

        // 2. Validate and Normalize with ffmpeg
        // Convert to 44.1kHz, 2 channels, standard MP3
        const normalizedPath = path.join(os.tmpdir(), `norm-${id}-${Date.now()}.mp3`);
        tempFiles.push(normalizedPath);
        
        console.log(`🚀 Normalizing audio for recording ${id}`);
        await execAsync(`"${FFMPEG_BIN}" -i "${tempFilePath}" -ar 44100 -ac 2 -b:a 192k "${normalizedPath}"`);

        // 3. Chunking logic (if > 60s)
        const duration = recording.duration;
        let transcriptText = "";
        let wordTimingsData: Array<{word: string, start: number, end: number}> | null = null;

        const formatSegmentsToTimestampedText = (segments: Array<{start: number, text: string}>, offsetSecs: number = 0): string => {
          return segments.map(seg => {
            const t = seg.start + offsetSecs;
            const mins = Math.floor(t / 60);
            const secs = Math.floor(t % 60);
            return `[${mins}:${secs.toString().padStart(2, "0")}] ${seg.text.trim()}`;
          }).join("\n");
        };

        const extractWordTimings = (transcription: any, offsetSecs: number = 0): Array<{word: string, start: number, end: number}> => {
          if (!transcription.words?.length) return [];
          return transcription.words.map((w: any) => ({
            word: w.word,
            start: (w.start ?? 0) + offsetSecs,
            end: (w.end ?? 0) + offsetSecs,
          }));
        };

        if (duration > 60) {
          console.log(`🚀 Chunking long audio (${duration}s) for recording ${id}`);
          const chunkPattern = path.join(os.tmpdir(), `chunk-${id}-%03d.mp3`);
          await execAsync(`"${FFMPEG_BIN}" -i "${normalizedPath}" -f segment -segment_time 60 -c copy "${chunkPattern}"`);
          
          const chunks = fs.readdirSync(os.tmpdir())
            .filter(f => f.startsWith(`chunk-${id}-`) && f.endsWith(".mp3"))
            .sort();
            
          wordTimingsData = [];
          for (let ci = 0; ci < chunks.length; ci++) {
            const chunk = chunks[ci];
            const chunkPath = path.join(os.tmpdir(), chunk);
            tempFiles.push(chunkPath);
            console.log(`🚀 Transcribing chunk: ${chunk}`);
            const transcription = await openai.audio.transcriptions.create({
              file: fs.createReadStream(chunkPath),
              model: process.env.TRANSCRIPTION_MODEL || "whisper-large-v3-turbo",
              response_format: "verbose_json",
            }) as any;
            
            const offset = ci * 60; // each segment is exactly 60 seconds
            const chunkTimings = extractWordTimings(transcription, offset);
            wordTimingsData.push(...chunkTimings);
            
            if (transcription.segments?.length) {
              const chunkTextTimestamped = formatSegmentsToTimestampedText(transcription.segments, offset);
              transcriptText += (transcriptText ? "\n" : "") + chunkTextTimestamped;
            } else {
              transcriptText += (transcriptText ? "\n" : "") + (transcription.text || "");
            }
          }
        } else {
          console.log(`🚀 Transcribing single file for recording ${id}`);
          const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(normalizedPath),
            model: process.env.TRANSCRIPTION_MODEL || "whisper-large-v3-turbo",
            response_format: "verbose_json",
          }) as any;
          
          wordTimingsData = extractWordTimings(transcription, 0);
          
          if (transcription.segments?.length) {
             transcriptText = formatSegmentsToTimestampedText(transcription.segments, 0);
          } else {
             transcriptText = transcription.text || "";
          }
        }

        console.log(`🚀 Transcription completed for recording ${id}`);

        // Add logging for uploaded MP3 processing
        if (recording.audioUrl.includes("/uploads/")) {
          console.log("🚀 Starting processing for uploaded MP3", id);
        }

        // 4. Generate Knowledge Graph
        const KG_SYSTEM_PROMPT = `You are generating a semantic knowledge graph from a transcript. Do NOT use proper nouns or named systems. Always abstract nodes to describe their function or role, not their name.

RULES:

1. NODES describe functions/roles only:
   - type "concept": protocol, standard, rule, mechanism, principle
   - type "entity": system, component, actor, role, data structure
   - type "event": process, operation, action, transformation, step
   - Every node MUST have a "description" of at least 2 full sentences:
     Sentence 1: What this concept/entity IS and what it does.
     Sentence 2: Why it matters or how it connects to the bigger picture.
   - NEVER use single-word or one-phrase descriptions.

2. EDGES use only precise semantic verbs — never generic ones:
   Allowed: defines, invokes, exposes, returns, transforms, enables, orchestrates,
            decomposes_into, requires, produces, constrains, extends, delegates,
            validates, triggers, standardizes, depends_on, implements, classifies
   Forbidden: connects, relates_to, associated_with, has, is, uses (too vague)

3. INFER MISSING INTERMEDIATE NODES where concepts imply structure:
   - "communication" → "communication rules" → "message format" → "transport mechanism"
   - "query" → "query result"
   - "capability exposure" → "capability registry" → "invocation interface"

4. SEPARATE ROLES FROM INSTANCES:
   Prefer: "requester system", "provider system", "orchestrator", "consumer", "validator"
   Only use a domain-specific proper name when it is the core subject of the transcript.

5. WEIGHT & STRENGTH:
   - weight (0–1): centrality of the node to the lecture's core argument
   - strength (0–1): confidence in the relationship based on transcript evidence

Return ONLY valid JSON — no prose, no markdown — with exactly this structure:
{
  "entities": [
    { "id": "E1", "label": "<functional label>", "type": "concept|entity|event", "weight": 0.0, "description": "<2-sentence functional explanation>" }
  ],
  "relations": [
    { "source": "E1", "target": "E2", "label": "<precise_semantic_verb>", "strength": 0.0 }
  ]
}`;

        const kgCompletion = await openai.chat.completions.create({
          model: process.env.ANALYSIS_MODEL || "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: KG_SYSTEM_PROMPT },
            { role: "user",   content: `Generate the semantic knowledge graph for this transcript:\n\n${transcriptText.substring(0, 100000)}` },
          ],
          response_format: { type: "json_object" },
        });

        const knowledgeGraph = JSON.parse(kgCompletion.choices[0].message.content || "{}");

        // 4b. Learner-friendly transformation pass
        const LEARNER_SYSTEM_PROMPT = `You are transforming a semantic knowledge graph into a learner-friendly version for students.

RULES:

1. SIMPLIFY NODE LABELS
   - Replace technical/abstract terms with plain-language equivalents learners immediately understand.
   - Keep the functional meaning intact — do not change the semantics.
   - Examples: "invocation interface" → "Request Handler", "transport mechanism" → "Message Carrier",
     "requester system" → "Client", "provider system" → "Server", "communication rules" → "How Systems Talk"

2. SIMPLIFY EDGE LABELS
   - Use everyday verbs that learners recognize: uses, talks to, provides, sends, controls, creates,
     needs, reads from, writes to, calls, breaks into, groups into, starts with, leads to.
   - Replace jargon: "invokes" → "calls", "decomposes_into" → "breaks into",
     "orchestrates" → "controls", "exposes" → "provides", "delegates" → "passes to",
     "standardizes" → "defines the rules for", "validates" → "checks".
   - Keep "defines" and "enables" only when the simpler alternative would lose meaning.

3. MARK THE ENTRY POINT
   - Choose EXACTLY ONE node a learner should start from (the top-level concept or the "why" of the topic).
   - Set "root": true on that ONE entity.
   - Set "root": false on ALL other entities. This is mandatory — every non-root entity must have "root": false.

4. ADD READING ORDER
   - Number every entity with "readingOrder": integer starting at 1 (root = 1).
   - Order nodes from most central → supporting detail → peripheral examples.

5. PRESERVE STRUCTURE & ENHANCE CONTEXT
   - Keep all entity ids, types, and weights EXACTLY as given.
   - REWRITE "description": You MUST write EXACTLY 2 full functional sentences for each entity based on the overall transcript. Do not blindly copy the old description!
     Sentence 1: What this concept/entity IS in everyday terms.
     Sentence 2: Why it matters to the core narrative or system.
   - Keep all relation source, target, and strength EXACTLY as given.
   - ONLY change: entity labels, relation labels, descriptions, and add root + readingOrder fields.

Return ONLY valid JSON — no prose, no markdown:
{
  "entities": [
    { "id": "E1", "label": "<simplified label>", "type": "...", "weight": 0.0, "description": "...", "root": false, "readingOrder": 1 }
  ],
  "relations": [
    { "source": "E1", "target": "E2", "label": "<simple verb>", "strength": 0.0 }
  ]
}`;

        const learnerCompletion = await openai.chat.completions.create({
          model: process.env.ANALYSIS_MODEL || "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: LEARNER_SYSTEM_PROMPT },
            { role: "user",   content: `Transform this knowledge graph into a learner-friendly version:\n\n${JSON.stringify(knowledgeGraph)}` },
          ],
          response_format: { type: "json_object" },
        });

        const learnerKG = (() => {
          try {
            const parsed = JSON.parse(learnerCompletion.choices[0].message.content || "{}");
            // Fall back to raw KG if learner pass returns malformed data
            if (!parsed.entities?.length) return knowledgeGraph;
            return parsed;
          } catch {
            return knowledgeGraph;
          }
        })();

        console.log(`✅ Learner KG: ${learnerKG.entities?.length} nodes, root="${learnerKG.entities?.find((e: any) => e.root)?.label}"`);

        // Use the deterministic transformer to create a strict hierarchy (from learner KG)
        const learnerMindMap = transformKGToMindMap(learnerKG);

        // 5. Generate Expert Narrative Analysis and Structured System Mapping
        const analysisPrompt = `
          You are a documentary scriptwriter and philosophical analyst. 
          Your goal is to weave the transcript into a deep, human-centered story while simultaneously mapping its structural mechanics.

          [PHASE 1] NARRATIVE UNDERSTANDING (HUMAN LAYER)
          Extract the human story: WHO is involved, WHERE is the tension, WHAT is the lived reality, and WHY does it matter on a philosophical level?
          
          [PHASE 2] SYSTEM UNDERSTANDING (STRUCTURAL LAYER)
          Independently map the technical systems, cause-effect cycles, and data-driven impacts.

          [PHASE 3] SYNTHESIS & NARRATION
          Combine layers into a 3-5 sentence HUMAN SUMMARY.
          CRITICAL VOICE RULES:
          - DO NOT MENTION: "Knowledge Graph," "nodes," "entities," "relationships," or "connections."
          - DO NOT USE: "The graph shows," "Core concepts include," "The system demonstrates."
          - TONE: Epic, investigative, or deeply philosophical (like a National Geographic documentary). Focus on the "Meaning" behind the facts.

          [PHASE 4] KNOWLEDGE GRAPH BUILDING
          Convert system understanding into a precise graph. Use verbs of impact: Enables, Alters, Records, Accelerates, Constrains.
          
          [PHASE 5] HIDDEN INSIGHTS
          Reveal 2-3 psychological, social, or existential implications not explicitly stated in the text.

          CONTEXT (Transcript):
          ${transcriptText}

          Return ONLY a valid JSON object with these keys:
          - "summary": (string) The synthesized 3-5 sentence narrative summary in HTML format. (MUST NOT SOUND LIKE A REPORT). Use 'stealth bolding' for key terms.
          - "keyConcepts": (array) 6-10 mixed human + system nodes as objects { "title": string, "explanation": string }.
          - "knowledgeGraph": (object) { "entities": [ {id, label, type, root, description} ], "relations": [ {source, target, label} ] }.
          - "studyGuide": (array) 5-8 quiz questions as objects { "question": string, "options": string[] (empty for T/F), "type": "multiple-choice" | "true-false", "answer": string, "explanation": string }.
          - "insights": (array) 2-3 deeper interpretations as objects { "title": string, "explanation": string }.
        `;

        const completion = await openai.chat.completions.create({
          model: process.env.ANALYSIS_MODEL || "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: analysisPrompt }],
          response_format: { type: "json_object" },
        });

        console.log(`🚀 Synthesis analysis completed for recording ${id}`);

        const result = JSON.parse(completion.choices[0].message.content || "{}");

        // Fallback for very short transcripts or AI omissions
        if ((!result.keyConcepts || result.keyConcepts.length === 0) && transcriptText.length > 0) {
           console.log("⚠️ AI returned empty keyConcepts, applying fallback...");
           result.keyConcepts = [{
             title: "Core Subject",
             explanation: `This recording covers the core topics discussed in "${recording.title || "this session"}".`
           }];
        }

        // Use the synthesized KG if available, otherwise fall back to the learner KG
        const finalKG = (result.knowledgeGraph && result.knowledgeGraph.entities?.length > 0) 
          ? result.knowledgeGraph 
          : learnerKG;

        // Generate the deterministic mind map from the final Expert KG
        const hierarchicalMindMap = transformKGToMindMap(finalKG);

        // Logging for verification
        console.log("KG Analysis:", {
          rawNodes:    knowledgeGraph.entities?.length,
          finalNodes:  finalKG.entities?.length,
          rootNode:    finalKG.entities?.find((e: any) => e.root)?.label ?? hierarchicalMindMap.label,
          depth1Children: hierarchicalMindMap.children.length,
          resultKeys: Object.keys(result)
        });

        // 6. Update DB — store the synthesis-enhanced analysis
        await storage.updateRecording(id, {
          status: "completed",
          transcript: transcriptText,
          summary: result.summary || "No summary generated.",
          mindMap: hierarchicalMindMap,
          knowledgeGraph: finalKG,
          rawKnowledgeGraph: knowledgeGraph,
          studyGuide: {
            keyConcepts: result.keyConcepts || [],
            quiz: result.studyGuide || [],
            insights: result.insights || []
          },
          wordTimings: wordTimingsData,
        });

        console.log(`✅ Recording ${id} status updated to completed`);

        // 7. Store entities and relations in dedicated tables from final KG
        await storage.clearKG(id);
        const entityMap = new Map<string, number>();

        for (const entity of finalKG.entities || []) {
          const storedEntity = await storage.createEntity({
            recordingId: id,
            label: entity.label,
            type: entity.type,
            description: entity.description || "",
            properties: { isRoot: entity.root || false, originalId: entity.id },
          });
          entityMap.set(entity.id, storedEntity.id);
        }

        for (const rel of finalKG.relations || []) {
          // Robustly handle both 'from/to' and 'source/target' keys
          const fromKey = rel.from || rel.source;
          const toKey = rel.to || rel.target;

          const fromId = entityMap.get(fromKey);
          const toId = entityMap.get(toKey);
          
          if (fromId && toId) {
            await storage.createRelation({
              recordingId: id,
              sourceId: fromId,
              targetId: toId,
              label: rel.label
            });
          } else {
            console.warn(`⚠️ Skipping relation for recording ${id}: mapping failed for ${fromKey}->${toKey}`);
          }
        }
        console.log(`✅ Knowledge Graph storage completed for recording ${id}`);

      } catch (error) {
        console.error("Processing error:", error);
        await storage.updateRecording(id, { status: "failed" });
      } finally {
        // Cleanup all temp files
        for (const f of tempFiles) {
          try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {}
        }
      }
    })();

    const updated = await storage.getRecording(id);
    res.json(updated);
  });

  app.post(api.recordings.createQuiz.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any).claims.sub;
    const id = Number(req.params.id);

    const recording = await storage.getRecording(id);
    if (!recording) return res.status(404).json({ message: "Not found" });
    if (recording.userId !== userId) return res.sendStatus(403);

    try {
      const prompt = `
        Based on the provided Knowledge Graph for this lecture, create a diverse, challenging quiz.
        
        Knowledge Graph: ${JSON.stringify(recording.knowledgeGraph || {})}
        Existing Summary: ${recording.summary}

        Generate a quiz with 5-10 questions. Mix Multiple Choice (preferred) and True/False.
        
        CRITICAL RULES:
        - For "multiple-choice" questions: you MUST provide exactly 4 answer options in the "options" array (one correct, three plausible distractors).
        - For "true-false" questions: set "options" to [] (empty array); the UI will add True/False automatically.
        - The "answer" field must exactly match one of the options strings.
        - Do NOT return empty "options" arrays for multiple-choice questions ever.
        
        Return valid JSON with a "quiz" key containing an array of objects:
        { "question": string, "options": string[] (4 items for multiple-choice, empty for true-false), "type": "multiple-choice" | "true-false", "answer": string, "explanation": string }
      `;

      const completion = await openai.chat.completions.create({
        model: process.env.ANALYSIS_MODEL || "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(completion.choices[0].message.content || "{}");
      
      // Safely merge with existing studyGuide, ensuring it's an object structure
      const existingStudyGuide = (recording.studyGuide && !Array.isArray(recording.studyGuide)) 
        ? (recording.studyGuide as any) 
        : { keyConcepts: [] };

      const updated = await storage.updateRecording(id, {
        studyGuide: {
          ...existingStudyGuide,
          quiz: result.quiz || []
        }
      });

      res.json(updated);
    } catch (error) {
      console.error("Quiz generation error:", error);
      res.status(500).json({ message: "Quiz generation failed" });
    }
  });

  // ── YouTube import (via yt-dlp standalone binary) ───────────────────────────
  // YT_DLP is now resolved at the top of the file

  function runYtDlp(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const proc = spawn(YT_DLP, args);
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.slice(-400) || `yt-dlp exited ${code}`)));
      proc.on('error', reject);
    });
  }

  function isValidYouTubeUrl(url: string): boolean {
    try {
      const u = new URL(url);
      return (
        ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com'].includes(u.hostname) &&
        (u.searchParams.has('v') || u.hostname === 'youtu.be')
      );
    } catch { return false; }
  }

  app.post('/api/recordings/youtube', async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any).claims.sub;

    const { youtubeUrl, title: userTitle } = req.body as { youtubeUrl: string; title?: string };
    if (!youtubeUrl || !isValidYouTubeUrl(youtubeUrl)) {
      return res.status(400).json({ message: 'Invalid YouTube URL.' });
    }

    const tmpBase = path.join(os.tmpdir(), `yt-${Date.now()}`);
    const tempMp3 = `${tmpBase}.mp3`;
    const tempCookies = `${tmpBase}-cookies.txt`;

    try {
      // Write YouTube cookies to a temp file if the secret is set
      const cookiesContent = process.env.YOUTUBE_COOKIES;
      if (cookiesContent) {
        fs.writeFileSync(tempCookies, cookiesContent, 'utf8');
      }

      const YT_COMMON_ARGS = [
        '--no-playlist',
        '--extractor-args', 'youtube:player_client=android,ios,tv_embedded',
        '--add-headers', 'User-Agent:com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
        ...(cookiesContent ? ['--cookies', tempCookies] : []),
      ];

      // 1. Get metadata (fast, no download)
      const metaJson = await runYtDlp([
        '--dump-json',
        ...YT_COMMON_ARGS,
        youtubeUrl,
      ]);
      const meta = JSON.parse(metaJson);
      const videoTitle = userTitle?.trim() || meta.title || 'YouTube Recording';
      const durationSeconds = Math.round(meta.duration || 0);

      // 2. Download best audio and convert to mp3 in one yt-dlp call
      await runYtDlp([
        ...YT_COMMON_ARGS,
        '-x', '--audio-format', 'mp3', '--audio-quality', '192K',
        '--ffmpeg-location', FFMPEG_BIN,
        '-o', tempMp3,
        youtubeUrl,
      ]);

      // yt-dlp appends .mp3 if the output path doesn't end in it yet
      const actualPath = fs.existsSync(tempMp3) ? tempMp3 : `${tmpBase}.mp3`;

      // 3. Upload to object storage
      const audioBuffer = fs.readFileSync(actualPath);
      fs.unlinkSync(actualPath);

      const audioPath = await objectStorage.uploadBuffer(audioBuffer, 'audio/mpeg');

      // 4. Create recording in DB
      const recording = await storage.createRecording({
        userId,
        title: videoTitle,
        audioUrl: audioPath,
        duration: durationSeconds,
      });

      try { if (fs.existsSync(tempCookies)) fs.unlinkSync(tempCookies); } catch (_) {}
      res.status(201).json(recording);
    } catch (err: any) {
      console.error('YouTube import error:', err);
      // Clean up any temp files
      try { if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3); } catch (_) {}
      try { if (fs.existsSync(tempCookies)) fs.unlinkSync(tempCookies); } catch (_) {}
      res.status(500).json({ message: err.message || 'Failed to import YouTube audio.' });
    }
  });

  return httpServer;
}
