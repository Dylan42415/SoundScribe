import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Search, Database, Zap, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GraphQueryPanelProps {
  recordingId?: number;
  nodeId?: string;
}

interface QueryResult {
  query: string;
  rows: Record<string, any>[];
  count: number;
}

export function GraphQueryPanel({ recordingId, nodeId }: GraphQueryPanelProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"nl" | "cypher">("nl");
  const [question, setQuestion] = useState("");
  const [rawQuery, setRawQuery] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [showQuery, setShowQuery] = useState(false);

  const nlMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/graph/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question, recordingId, nodeId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Query failed");
      }
      return res.json() as Promise<QueryResult>;
    },
    onSuccess: (data) => setResult(data),
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Query failed", description: err.message }),
  });

  const cypherMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/graph/cypher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query: rawQuery, params: { recordingId, nodeId } }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Cypher execution failed");
      }
      return res.json() as Promise<QueryResult>;
    },
    onSuccess: (data) => setResult({ ...data, query: rawQuery }),
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Cypher error", description: err.message }),
  });

  const isPending = nlMutation.isPending || cypherMutation.isPending;

  function handleSubmit() {
    setResult(null);
    if (mode === "nl") nlMutation.mutate();
    else cypherMutation.mutate();
  }

  const exampleQuestions = [
    "What are the main concepts?",
    "What should I learn first?",
    "Show prerequisites",
    "What is related to the root concept?",
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <Button
          variant={mode === "nl" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("nl")}
          data-testid="button-nl-mode"
        >
          <Zap className="w-3 h-3 mr-1" />
          AI Query
        </Button>
        <Button
          variant={mode === "cypher" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("cypher")}
          data-testid="button-cypher-mode"
        >
          <Database className="w-3 h-3 mr-1" />
          Cypher
        </Button>
      </div>

      {mode === "nl" ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              placeholder="Ask about your knowledge graph…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isPending && question.trim() && handleSubmit()}
              data-testid="input-nl-query"
              className="text-sm"
            />
            <Button
              onClick={handleSubmit}
              disabled={!question.trim() || isPending}
              size="sm"
              data-testid="button-run-nl-query"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {exampleQuestions.map((q) => (
              <button
                key={q}
                onClick={() => setQuestion(q)}
                className="text-xs px-2 py-0.5 rounded-full border border-border hover:bg-accent text-muted-foreground transition-colors"
                data-testid={`button-example-${q.slice(0, 10).replace(/\s/g, "-")}`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Textarea
            placeholder={`MATCH (n:Concept {recordingId: $recordingId})\nRETURN n ORDER BY n.weight DESC LIMIT 10`}
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            rows={4}
            className="text-xs font-mono"
            data-testid="textarea-cypher-query"
          />
          <Button
            onClick={handleSubmit}
            disabled={!rawQuery.trim() || isPending}
            size="sm"
            data-testid="button-run-cypher"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
            Run Cypher
          </Button>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">{result.count} result{result.count !== 1 ? "s" : ""}</span>
            <button
              onClick={() => setShowQuery(!showQuery)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showQuery ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {showQuery ? "Hide" : "Show"} Cypher
            </button>
          </div>

          {showQuery && result.query && (
            <pre className="text-xs bg-muted p-2 rounded-md font-mono overflow-x-auto whitespace-pre-wrap">
              {result.query}
            </pre>
          )}

          {result.rows.length === 0 ? (
            <p className="text-muted-foreground text-xs italic">No results found.</p>
          ) : (
            <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
              {result.rows.map((row, i) => (
                <div key={i} className="p-2 rounded-md bg-muted/50 border border-border/50 text-xs">
                  {Object.entries(row).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-muted-foreground font-medium min-w-16 shrink-0">{k}:</span>
                      <span className="text-foreground break-all">
                        {typeof v === "object" ? (
                          v?.title ?? v?.label ?? JSON.stringify(v)
                        ) : String(v ?? "")}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
