import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useRecording, useProcessRecording } from "@/hooks/use-recordings";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Download, RefreshCw, FileText, BrainCircuit, BookOpen } from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { KnowledgeGraph } from "@/components/recordings/KnowledgeGraph";
import { FlashcardSet } from "@/components/recordings/FlashcardSet";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

type TranscriptSegment = { time: string | null; text: string; index: number };
type WordToken = { segIndex: number; wordIndex: number; word: string; startSec: number; endSec: number };
type WordTiming = { word: string; start: number; end: number };

function parseTranscript(input: string): TranscriptSegment[] {
  const lines = input.split(/\n+/).map(line => line.trim()).filter(Boolean);
  return lines.map((line, index) => {
    const match =
      line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/) ||
      line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+[-–:]\s*(.*)$/);
    if (match) {
      return { time: match[1], text: match[2] || "", index };
    }
    return { time: null, text: line, index };
  });
}

function timeToSeconds(time: string): number {
  const parts = time.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function buildWordTokensFromTimings(segments: TranscriptSegment[], wordTimings: WordTiming[], audioDuration: number): WordToken[] {
  const tokens: WordToken[] = [];
  const segWords = segments.map((seg) => ({
    segIndex: seg.index,
    words: seg.text.split(/\s+/).filter(Boolean),
  }));

  let timingIdx = 0;
  for (const seg of segWords) {
    for (let wi = 0; wi < seg.words.length; wi++) {
      const timing = wordTimings[timingIdx];
      if (timing) {
        tokens.push({
          segIndex: seg.segIndex,
          wordIndex: wi,
          word: seg.words[wi],
          startSec: timing.start,
          endSec: timing.end,
        });
        timingIdx++;
      }
    }
  }
  // Extend the last token to the full audio duration so highlighting covers the tail
  if (tokens.length > 0 && audioDuration > 0) {
    tokens[tokens.length - 1].endSec = Math.max(tokens[tokens.length - 1].endSec, audioDuration);
  }
  return tokens;
}

function buildWordTokens(segments: TranscriptSegment[], audioDuration: number): WordToken[] {
  const tokens: WordToken[] = [];
  const hasAnyTime = segments.some(s => s.time !== null);

  if (!hasAnyTime && audioDuration > 0) {
    const allWords = segments.flatMap((seg, si) =>
      seg.text.split(/\s+/).filter(Boolean).map((word, wi) => ({ segIndex: si, wordIndex: wi, word }))
    );
    const wordDuration = audioDuration / Math.max(allWords.length, 1);
    allWords.forEach((w, i) => {
      tokens.push({
        segIndex: w.segIndex,
        wordIndex: w.wordIndex,
        word: w.word,
        startSec: i * wordDuration,
        endSec: (i + 1) * wordDuration,
      });
    });
    return tokens;
  }

  segments.forEach((seg, si) => {
    if (!seg.time) return;
    const segStartSec = timeToSeconds(seg.time);
    let segEndSec: number;
    const nextTimed = segments.slice(si + 1).find(s => s.time !== null);
    if (nextTimed && nextTimed.time) {
      segEndSec = timeToSeconds(nextTimed.time);
    } else {
      segEndSec = audioDuration > segStartSec ? audioDuration : segStartSec + 30;
    }
    const words = seg.text.split(/\s+/).filter(Boolean);
    const segDuration = Math.max(segEndSec - segStartSec, 0.5);
    const wordDuration = segDuration / Math.max(words.length, 1);
    words.forEach((word, wi) => {
      tokens.push({
        segIndex: seg.index,
        wordIndex: wi,
        word,
        startSec: segStartSec + wi * wordDuration,
        endSec: segStartSec + (wi + 1) * wordDuration,
      });
    });
  });
  return tokens;
}

export default function RecordingDetail() {
  const [match, params] = useRoute("/recordings/:id");
  const id = parseInt(params?.id || "0");
  const { data: recording, isLoading } = useRecording(id);
  const processMutation = useProcessRecording();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const audioRef = useRef<HTMLAudioElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const wordTokensRef = useRef<WordToken[]>([]);
  const activeWordKeyRef = useRef<string | null>(null);
  const lastSegmentTimeRef = useRef<number>(-1);

  // Bug 6 fix: resolve Supabase storage path to a signed URL
  useEffect(() => {
    if (!recording?.audioUrl) return;
    const url = recording.audioUrl;
    // If it's already a full URL (YouTube imports, etc.) use it directly
    if (url.startsWith('http://') || url.startsWith('https://')) {
      setAudioSrc(url);
      return;
    }

    // Clean the path if it has prefixes
    let objectPath = url;
    if (objectPath.startsWith('/objects/uploads/')) {
       objectPath = objectPath.slice(17);
    } else if (objectPath.startsWith('/objects/')) {
       objectPath = objectPath.slice(9);
    }

    // Resolve via Supabase storage - Use signed URL for better reliability (handles private buckets)
    supabase.storage
      .from('recordings')
      .createSignedUrl(objectPath, 7200) // 2 hour window
      .then(({ data, error }) => {
        if (error) {
          console.error("Error creating signed URL:", error);
          // Fallback to public URL if signed fails
          const { data: publicData } = supabase.storage.from('recordings').getPublicUrl(objectPath);
          setAudioSrc(publicData.publicUrl);
        } else if (data?.signedUrl) {
          setAudioSrc(data.signedUrl);
        }
      });
  }, [recording?.audioUrl]);

  // Ensure audio element reloads when source changes
  useEffect(() => {
    if (audioRef.current && audioSrc) {
      audioRef.current.load();
    }
  }, [audioSrc]);

  const applyHighlight = (key: string | null) => {
    if (key === activeWordKeyRef.current) return;
    if (activeWordKeyRef.current) {
      transcriptRef.current
        ?.querySelector(`[data-word-key="${activeWordKeyRef.current}"]`)
        ?.classList.remove("word-active");
    }
    if (key) {
      transcriptRef.current
        ?.querySelector(`[data-word-key="${key}"]`)
        ?.classList.add("word-active");
    }
    activeWordKeyRef.current = key;
  };

  const findActiveKey = (t: number): string | null => {
    const tokens = wordTokensRef.current;
    if (!tokens.length) return null;
    let lo = 0, hi = tokens.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (t < tokens[mid].startSec) hi = mid - 1;
      else if (t >= tokens[mid].endSec) lo = mid + 1;
      else return `${tokens[mid].segIndex}-${tokens[mid].wordIndex}`;
    }
    return null;
  };

  const stopRaf = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const startRaf = () => {
    stopRaf();
    const tick = () => {
      if (audioRef.current) {
        const t = audioRef.current.currentTime;
        applyHighlight(findActiveKey(t));
        // Update React state only when segment changes (~every few seconds)
        const seg = Math.floor(t);
        if (seg !== lastSegmentTimeRef.current) {
          lastSegmentTimeRef.current = seg;
          setCurrentTime(t);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    return () => stopRaf();
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
      startRaf();
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
      stopRaf();
    }
  };

  const quizMutation = useMutation({
    mutationFn: async () => {
      const url = buildUrl(api.recordings.createQuiz.path, { id });
      const res = await fetch(url, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Quiz generation failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.recordings.get.path, id] });
      toast({ title: "Quiz Generated", description: "Your study quiz is ready!" });
    },
    onError: (err: any) => {
      console.error("Quiz error:", err);
      toast({ variant: "destructive", title: "Error", description: "Quiz generation failed." });
    }
  });

  const studyData = recording?.studyGuide as any;
  const keyConcepts = studyData?.keyConcepts || [];
  const insights = studyData?.insights || [];
  const quiz = studyData?.quiz || [];

  const transcriptSegments = useMemo(
    () => (recording?.transcript ? parseTranscript(recording.transcript) : []),
    [recording?.transcript]
  );

  const hasTimestamps = useMemo(
    () => transcriptSegments.some(s => s.time !== null),
    [transcriptSegments]
  );

  const wordTimings = useMemo(
    () => (recording?.wordTimings as WordTiming[] | null) ?? null,
    [recording?.wordTimings]
  );

  const wordTokens = useMemo(() => {
    if (!transcriptSegments.length) return [];
    if (wordTimings && wordTimings.length > 0) {
      return buildWordTokensFromTimings(transcriptSegments, wordTimings, audioDuration);
    }
    if (audioDuration > 0) {
      return buildWordTokens(transcriptSegments, audioDuration);
    }
    return [];
  }, [transcriptSegments, audioDuration, wordTimings]);

  // Keep ref in sync so the rAF closure always sees fresh tokens without capturing stale state
  useEffect(() => {
    wordTokensRef.current = wordTokens;
    // Re-apply highlight immediately with new tokens (e.g. after duration loads)
    if (audioRef.current && !audioRef.current.paused) {
      applyHighlight(findActiveKey(audioRef.current.currentTime));
    }
  }, [wordTokens]);

  // After every React render, reapply the word-active class — React resets className on re-render
  useEffect(() => {
    const key = activeWordKeyRef.current;
    if (key && transcriptRef.current) {
      transcriptRef.current
        .querySelector(`[data-word-key="${key}"]`)
        ?.classList.add("word-active");
    }
  });

  const activeSegmentIndex = useMemo(() => {
    if (!transcriptSegments.length) return -1;
    let active = 0;
    for (const segment of transcriptSegments) {
      if (!segment.time) continue;
      if (timeToSeconds(segment.time) <= currentTime) active = segment.index;
    }
    return active;
  }, [currentTime, transcriptSegments]);

  useEffect(() => {
    const activeEl = transcriptRef.current?.querySelector(`[data-segment-index="${activeSegmentIndex}"]`);
    if (activeEl) activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeSegmentIndex]);

  const seekToSegment = (segment: TranscriptSegment) => {
    if (!audioRef.current || !segment.time) return;
    const t = timeToSeconds(segment.time);
    audioRef.current.currentTime = t;
    applyHighlight(findActiveKey(t));
    lastSegmentTimeRef.current = Math.floor(t);
    setCurrentTime(t);
    audioRef.current.play().catch(console.error);
    setIsPlaying(true);
  };

  const handleRetry = () => {
    processMutation.mutate(id, {
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Retry Failed",
          description: err?.message || "Could not restart analysis. Please try again.",
        });
      },
    });
  };

  // Bug 8 fix: export transcript + summary as a markdown file
  const handleExport = () => {
    if (!recording) return;
    const lines: string[] = [
      `# ${recording.title}`,
      `Recorded: ${format(new Date(recording.createdAt!), 'PPP')}`,
      '',
      '## Summary',
      recording.summary?.replace(/<[^>]+>/g, '') || 'No summary available.',
      '',
      '## Transcript',
      recording.transcript || 'No transcript available.',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${recording.title.replace(/[^a-z0-9]/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const renderKnowledgeGraph = () => {
    const kgData = recording?.knowledgeGraph as any;
    const rawKgData = (recording as any)?.rawKnowledgeGraph as any;
    if (!kgData || !kgData.entities || !kgData.relations) {
      return (
        <div className="flex flex-col items-center justify-center h-[600px] bg-muted/10 rounded-xl border border-dashed p-4">
          <p className="text-muted-foreground font-medium mb-2">No knowledge graph generated yet.</p>
        </div>
      );
    }
    return (
      <KnowledgeGraph
        recordingId={id}
        entities={kgData.entities}
        relations={kgData.relations}
        rawEntities={rawKgData?.entities}
        rawRelations={rawKgData?.relations}
      />
    );
  };

  if (isLoading) return null;
  if (!recording) return <DashboardLayout><div>Recording not found</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold">{recording.title}</h1>
            <p className="text-muted-foreground mt-1">
              Recorded on {format(new Date(recording.createdAt!), "PPPP")} • {Math.round(recording.duration / 60)} mins
            </p>
          </div>
          <div className="flex gap-2">
            {recording.status === "failed" && (
              <Button onClick={handleRetry} disabled={processMutation.isPending}>
                <RefreshCw className={`w-4 h-4 mr-2 ${processMutation.isPending ? "animate-spin" : ""}`} />
                Retry Analysis
              </Button>
            )}
            {recording.status === "completed" && (
              <Button variant="outline" onClick={handleRetry} disabled={processMutation.isPending}>
                <RefreshCw className={`w-4 h-4 mr-2 ${processMutation.isPending ? "animate-spin" : ""}`} />
                {processMutation.isPending ? "Re-analyzing…" : "Re-Analyze"}
              </Button>
            )}
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
          </div>
        </div>

        <Card className="p-6 bg-card border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              {/* Bug 7 fix: removed redundant custom Play/Pause button; native controls handle playback */}
              <audio
                ref={audioRef}
                src={audioSrc || undefined}
                onLoadedMetadata={() => setAudioDuration(audioRef.current?.duration || 0)}
                onPlay={() => { setIsPlaying(true); startRaf(); }}
                onPause={() => { setIsPlaying(false); stopRaf(); }}
                onEnded={() => { setIsPlaying(false); stopRaf(); applyHighlight(null); lastSegmentTimeRef.current = -1; setCurrentTime(0); }}
                onSeeked={() => {
                  if (!audioRef.current) return;
                  const t = audioRef.current.currentTime;
                  applyHighlight(findActiveKey(t));
                  lastSegmentTimeRef.current = Math.floor(t);
                  setCurrentTime(t);
                }}
                controls
                className="w-full h-10 accent-primary"
              />
            </div>
          </div>
        </Card>

        {recording.status === "completed" ? (
          <Tabs defaultValue="transcript" className="w-full">
            <TabsList className="grid w-full grid-cols-3 lg:w-[400px] mb-8">
              <TabsTrigger value="transcript"><FileText className="w-4 h-4 mr-2" /> Transcript</TabsTrigger>
              <TabsTrigger value="kg"><BrainCircuit className="w-4 h-4 mr-2" /> Knowledge Graph</TabsTrigger>
              <TabsTrigger value="study"><BookOpen className="w-4 h-4 mr-2" /> Study Guide</TabsTrigger>
            </TabsList>

            <TabsContent value="transcript" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <Card className="p-6 leading-relaxed text-lg text-foreground/80">
                {recording.transcript ? (
                  <div ref={transcriptRef} className="max-h-[520px] overflow-y-auto pr-2 space-y-3">
                    {transcriptSegments.map((segment, index) => {
                      const isActiveSegment = hasTimestamps
                        ? segment.index === activeSegmentIndex
                        : false;
                      const segWords = segment.text.split(/(\s+)/).filter(Boolean);
                      return (
                        <div
                          key={index}
                          data-segment-index={segment.index}
                          className={`rounded-lg px-3 py-2 transition-colors duration-300 ${
                            isActiveSegment ? "bg-primary/5" : ""
                          }`}
                        >
                          {segment.time && (
                            <button
                              type="button"
                              onClick={() => seekToSegment(segment)}
                              className="mr-2 text-xs font-semibold text-primary/60 hover:text-primary transition-colors"
                              title="Click to seek"
                            >
                              [{segment.time}]
                            </button>
                          )}
                          <span className="leading-relaxed">
                            {(() => {
                              let wordIdx = 0;
                              return segWords.map((chunk, i) => {
                                if (/^\s+$/.test(chunk)) return <span key={i}>{chunk}</span>;
                                const wKey = `${segment.index}-${wordIdx++}`;
                                return (
                                  <span
                                    key={i}
                                    data-word-key={wKey}
                                    className={`rounded px-[1px] ${isActiveSegment ? "text-foreground" : "text-foreground/80"}`}
                                  >
                                    {chunk}
                                  </span>
                                );
                              });
                            })()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-muted-foreground italic">Transcript not available.</div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="kg" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              {renderKnowledgeGraph()}
            </TabsContent>

            <TabsContent value="study" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="grid gap-6">
                <Card className="p-6">
                  <h3 className="font-heading text-xl font-bold mb-4">Summary</h3>
                  <div className="prose prose-blue max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: recording.summary || "" }} />
                </Card>

                {keyConcepts.length > 0 && (
                  <Card className="p-6 bg-primary/5 border-primary/10">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="font-heading text-xl font-bold">Interactive Flashcards</h3>
                      <div className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full uppercase tracking-wider">
                        Study Mode
                      </div>
                    </div>
                    <FlashcardSet cards={keyConcepts} />
                  </Card>
                )}

                {insights.length > 0 && (
                  <Card className="p-6 bg-gradient-to-br from-amber-50 to-orange-50/30 border-amber-100 shadow-sm border-2">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-2 bg-amber-100 rounded-lg">
                        <BrainCircuit className="w-5 h-5 text-amber-700" />
                      </div>
                      <h3 className="font-heading text-xl font-bold text-amber-900">Hidden Insights</h3>
                    </div>
                    <div className="grid gap-4">
                      {insights.map((insight: any, i: number) => (
                        <div key={i} className="flex gap-4 p-3 rounded-xl bg-white/60">
                          <div className="h-6 w-6 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                            {i + 1}
                          </div>
                          <div>
                            <h4 className="font-bold text-amber-900 leading-snug">{insight.title}</h4>
                            <p className="text-sm text-amber-800/80 mt-1 italic">{insight.explanation}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                <Card className="p-6">
                  <h3 className="font-heading text-xl font-bold mb-4">Key Concepts</h3>
                  {keyConcepts.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {keyConcepts.map((concept: any, i: number) => (
                        <div key={i} className="p-4 rounded-lg bg-muted/50 border">
                          <h4 className="font-bold mb-1">{concept.title}</h4>
                          <p className="text-sm text-muted-foreground">{concept.explanation}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic">No key concepts were generated for this recording.</p>
                  )}
                </Card>
                <Card className="p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-heading text-xl font-bold">Practice Quiz</h3>
                    {quiz.length === 0 && (
                      <Button onClick={() => quizMutation.mutate()} disabled={quizMutation.isPending}>
                        {quizMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating Quiz...</> : "Create Quiz"}
                      </Button>
                    )}
                  </div>
                  {quiz.length > 0 ? (
                    <div className="space-y-6">
                      {quiz.map((q: any, i: number) => (
                        <Card key={i} className="p-4 border-2">
                          <p className="font-medium mb-4">{i + 1}. {q.question}</p>
                          <div className="grid gap-2">
                            {(() => {
                              const options = (q.options && q.options.length > 0) ? q.options : ["True", "False"];
                              // Safeguard: Ensure the correct answer is actually in the options
                              if (q.answer && !options.includes(q.answer)) {
                                options.push(q.answer);
                              }
                              return options.map((opt: string) => (
                                <Button
                                  key={opt}
                                  variant={selectedAnswers[i] === opt ? (opt === q.answer ? "default" : "destructive") : "outline"}
                                  className="justify-start h-auto py-3 px-4 text-left whitespace-normal transition-all hover:scale-[1.01]"
                                  onClick={() => setSelectedAnswers(prev => ({ ...prev, [i]: opt }))}
                                  disabled={!!selectedAnswers[i]}
                                  title={opt}
                                >
                                  {opt}
                                </Button>
                              ));
                            })()}
                          </div>
                          {selectedAnswers[i] && (
                            <div className="mt-4 p-3 bg-primary/10 rounded-lg text-sm">
                              <p className="font-bold text-primary mb-1">
                                {selectedAnswers[i] === q.answer ? "Correct!" : `Incorrect. The correct answer is ${q.answer}.`}
                              </p>
                              <p className="text-muted-foreground">{q.explanation}</p>
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-muted/30 rounded-lg border border-dashed">
                      <p className="text-muted-foreground">No quiz yet. Click the button above to generate one!</p>
                    </div>
                  )}
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <Card className="p-12 flex flex-col items-center justify-center text-center border-dashed">
            {recording.status === "processing" || recording.status === "pending" ? (
              <>
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                <h3 className="text-xl font-bold mb-2">AI Analysis in Progress</h3>
                <p className="text-muted-foreground max-w-md">We are transcribing your audio, generating a mind map, and creating a personalized study guide. This usually takes 1-2 minutes.</p>
              </>
            ) : (
              <div className="text-destructive">
                <h3 className="text-xl font-bold mb-2">Analysis Failed</h3>
                <p>Something went wrong. Please try again.</p>
              </div>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
