import { useState, useEffect, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useRecordings } from "@/hooks/use-recordings";
import { useGroups } from "@/hooks/use-groups";
import { useNotes } from "@/hooks/use-notes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  Pin, 
  PinOff, 
  Loader2, 
  Check, 
  FolderOpen,
  Mic,
  X
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface NotepadDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotepadDrawer({ open, onOpenChange }: NotepadDrawerProps) {
  const [location] = useLocation();
  const { data: recordings } = useRecordings();
  const { groups } = useGroups();
  
  // Selection state
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");
  const [selectedRecordingId, setSelectedRecordingId] = useState<number | null>(null);

  // Check if we are on a recording detail page
  const [isDetail, params] = useRoute("/recordings/:id");
  
  useEffect(() => {
    if (isDetail && params?.id) {
      setSelectedRecordingId(Number(params.id));
    }
  }, [isDetail, params]);

  const selectedRecording = useMemo(() => {
    return recordings?.find(r => r.id === selectedRecordingId);
  }, [recordings, selectedRecordingId]);

  const { content, setContent, togglePin, isSaving, isPinned } = useNotes(selectedRecording);

  const filteredRecordings = useMemo(() => {
    if (selectedGroupId === "all") return recordings || [];
    if (selectedGroupId === "none") return recordings?.filter(r => !r.groupId) || [];
    return recordings?.filter(r => r.groupId === Number(selectedGroupId)) || [];
  }, [recordings, selectedGroupId]);

  return (
    <div 
      className={cn(
        "fixed inset-y-0 right-0 z-40 w-[400px] sm:w-[500px] bg-card border-l shadow-2xl transition-transform duration-300 ease-in-out flex flex-col",
        open ? "translate-x-0" : "translate-x-full"
      )}
    >
      <div className="p-6 border-b bg-muted/20 flex flex-col relative">
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </Button>

        <div className="flex items-center justify-between pr-8">
          <div className="flex items-center gap-2 text-xl font-semibold">
            <FileText className="w-5 h-5 text-primary" />
            Notepad
          </div>
          {selectedRecording && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground flex items-center gap-1">
                {isSaving ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-3 h-3 text-emerald-500" />
                    Saved
                  </>
                )}
              </span>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={togglePin}
                className={isPinned ? "text-primary" : "text-muted-foreground"}
              >
                {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
              </Button>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <div className="flex-1">
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
              <SelectTrigger className="bg-background">
                <FolderOpen className="w-4 h-4 mr-2 text-muted-foreground" />
                <div className="truncate">
                  <SelectValue placeholder="All Groups" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Recordings</SelectItem>
                <SelectItem value="none">Ungrouped</SelectItem>
                {groups.map(g => (
                  <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Select 
              value={selectedRecordingId ? String(selectedRecordingId) : ""} 
              onValueChange={(v) => setSelectedRecordingId(Number(v))}
            >
              <SelectTrigger className="bg-background">
                <Mic className="w-4 h-4 mr-2 text-muted-foreground" />
                <div className="truncate">
                  <SelectValue placeholder="Select Audio" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {filteredRecordings.map(r => (
                  <SelectItem key={r.id} value={String(r.id)}>{r.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-background relative overflow-hidden">
        {selectedRecording ? (
          <div className="flex-1 flex flex-col p-0">
            <div className="p-4 bg-muted/5 border-b">
               <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                 Linked to: <span className="text-foreground normal-case truncate">{selectedRecording.title}</span>
               </h4>
            </div>
            <Textarea
              placeholder="Start typing your notes here... (Markdown supported)"
              className="flex-1 resize-none border-0 rounded-none focus-visible:ring-0 p-6 text-base leading-relaxed font-sans placeholder:italic"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 opacity-20" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">No Audio Selected</h3>
            <p className="text-sm">
              Select a recording from the dropdowns above or open an audio recording to start taking notes.
            </p>
          </div>
        )}
      </div>

      <div className="p-4 border-t bg-muted/10 text-[10px] text-muted-foreground flex justify-between items-center">
         <span>Notepad automatically saves as you type.</span>
         {selectedRecording && (
           <div className="flex items-center gap-1">
             <div className={`w-2 h-2 rounded-full ${isSaving ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
             {isSaving ? 'Syncing...' : 'Synced'}
           </div>
         )}
      </div>
    </div>
  );
}
