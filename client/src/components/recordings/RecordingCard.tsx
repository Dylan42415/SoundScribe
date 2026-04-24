import { Link } from "wouter";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mic, PlayCircle, FileText, BrainCircuit, Clock, Trash2, Loader2, Sparkles, Folder } from "lucide-react";
import { useDeleteRecording } from "@/hooks/use-recordings";
import { useGroups } from "@/hooks/use-groups";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Recording } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

interface Props {
  recording: Recording;
}

export function RecordingCard({ recording }: Props) {
  const deleteMutation = useDeleteRecording();
  const { groups } = useGroups();

  const isProcessing = recording.status === "processing";
  const isCompleted = recording.status === "completed";
  const isFailed = recording.status === "failed";

  const group = groups.find(g => g.id === recording.groupId);

  return (
    <Card className="interactive-card relative overflow-hidden group">
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isProcessing ? "bg-amber-100 text-amber-600 animate-pulse" : 
              isCompleted ? "bg-secondary/10 text-secondary" : 
              "bg-muted text-muted-foreground"
            }`}>
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}
            </div>
            <div>
              <Link href={`/recordings/${recording.id}`}>
                <h3 className="font-heading font-semibold text-lg hover:text-primary transition-colors cursor-pointer">
                  {recording.title}
                </h3>
              </Link>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <Clock className="w-3 h-3" />
                <span>{format(new Date(recording.createdAt!), "MMM d, yyyy • h:mm a")}</span>
                <span>•</span>
                <span>{Math.round(recording.duration / 60)} mins</span>
                {group && (
                  <>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <Folder className="w-3 h-3" style={{ color: group.color || undefined }} />
                      <span>{group.name}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity -mr-2 text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Recording</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{recording.title}"? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  onClick={() => deleteMutation.mutate(recording.id)}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="flex items-center gap-2 mt-4">
          {isCompleted ? (
            <>
              <Badge variant="secondary" className="gap-1 bg-secondary/10 text-secondary hover:bg-secondary/20 border-0">
                <Sparkles className="w-3 h-3" /> AI Processed
              </Badge>
              {recording.mindMap && <Badge variant="outline" className="gap-1"><BrainCircuit className="w-3 h-3" /> Mind Map</Badge>}
              {recording.transcript && <Badge variant="outline" className="gap-1"><FileText className="w-3 h-3" /> Transcript</Badge>}
            </>
          ) : isProcessing ? (
            <Badge variant="outline" className="gap-1 border-amber-200 text-amber-700 bg-amber-50">
              <Loader2 className="w-3 h-3 animate-spin" /> Analyzing audio...
            </Badge>
          ) : isFailed ? (
            <Badge variant="destructive">Processing Failed</Badge>
          ) : (
             <Badge variant="outline">Pending Analysis</Badge>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <Link href={`/recordings/${recording.id}`}>
            <Button className={isCompleted ? "bg-primary" : "bg-muted text-muted-foreground hover:bg-muted/80"}>
              {isCompleted ? "View Study Guide" : "View Details"}
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
