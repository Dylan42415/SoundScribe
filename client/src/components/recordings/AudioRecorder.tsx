import { useState, useRef, useEffect } from "react";
import { useVoiceRecorder } from "@/integrations/audio";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, Save, Upload, Youtube, FileAudio, ChevronUp } from "lucide-react";
import { useUpload } from "@/hooks/use-upload";
import { useCreateRecording, useProcessRecording } from "@/hooks/use-recordings";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function AudioRecorder() {
  const { state, startRecording, stopRecording } = useVoiceRecorder();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);

  // Audio file state
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [uploadedAudioFile, setUploadedAudioFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<NodeJS.Timeout>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // YouTube state
  const [isYouTubeDialogOpen, setIsYouTubeDialogOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");

  const { uploadFile, isUploading } = useUpload();
  const createMutation = useCreateRecording();
  const processMutation = useProcessRecording();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Close upload menu when clicking outside
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showUploadMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUploadMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showUploadMenu]);

  useEffect(() => {
    if (state === "recording") {
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [state]);

  const handleStop = async () => {
    const blob = await stopRecording();
    setRecordedBlob(blob);
    setUploadedAudioFile(null);
    setIsDialogOpen(true);
    setTitle(`New Recording ${new Date().toLocaleDateString()}`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size === 0) {
      toast({ variant: "destructive", title: "Error", description: "Invalid audio file: File is empty." });
      return;
    }

    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.onloadedmetadata = () => {
      setDuration(Math.round(audio.duration));
      setUploadedAudioFile(file);
      setRecordedBlob(null);
      setAudioUrl(url);
      setTitle(file.name.replace(/\.[^/.]+$/, ""));
      setIsDialogOpen(true);
    };
    audio.onerror = () => {
      toast({ variant: "destructive", title: "Error", description: "Could not read audio file. Please ensure it is a valid format." });
    };
  };

  const handleSave = async () => {
    const activeFile = uploadedAudioFile || recordedBlob;
    if (!activeFile || !user) return;

    if (activeFile.size === 0) {
      toast({ variant: "destructive", title: "Error", description: "Invalid audio file: File is empty." });
      return;
    }

    try {
      const fileToUpload = activeFile instanceof File
        ? activeFile
        : new File([activeFile], `recording-${Date.now()}.webm`, { type: "audio/webm" });
      const uploadRes = await uploadFile(fileToUpload);
      if (!uploadRes) throw new Error("Upload failed");

      const recording = await createMutation.mutateAsync({
        userId: user.id,
        title: title || "Untitled Recording",
        audioUrl: uploadRes.objectPath,
        duration,
        status: "pending",
      });

      processMutation.mutate(recording.id);

      toast({ title: "Recording Saved", description: "Your recording is now being analyzed by AI." });
      setIsDialogOpen(false);
      setRecordedBlob(null);
      setUploadedAudioFile(null);
      setAudioUrl(null);
      setIsPlaying(false);
      setDuration(0);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: `Failed to save recording: ${error.message || "Unknown error"}` });
    }
  };

  // YouTube import mutation
  const youtubeMutation = useMutation({
    mutationFn: async ({ url, title }: { url: string; title: string }) => {
      const res = await fetch('/api/recordings/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeUrl: url, title: title || undefined }),
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to import YouTube video');
      }
      return res.json();
    },
    onSuccess: (recording) => {
      queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });
      processMutation.mutate(recording.id);
      toast({ title: "YouTube Video Imported", description: "Audio extracted and analysis has started." });
      setIsYouTubeDialogOpen(false);
      setYoutubeUrl("");
      setYoutubeTitle("");
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Import Failed", description: err.message || "Could not import YouTube video." });
    },
  });

  const handleYouTubeSubmit = () => {
    if (!youtubeUrl.trim()) return;
    youtubeMutation.mutate({ url: youtubeUrl.trim(), title: youtubeTitle.trim() });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const togglePlay = () => {
    const audio = audioPreviewRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-4">
      {audioUrl && (
        <audio ref={audioPreviewRef} src={audioUrl} onEnded={() => setIsPlaying(false)} preload="metadata" className="hidden" />
      )}

      {state === "recording" && (
        <div className="bg-destructive text-destructive-foreground px-4 py-2 rounded-full shadow-lg animate-pulse font-mono font-medium">
          Recording • {formatTime(duration)}
        </div>
      )}

      <div className="flex gap-4 items-end">
        <input type="file" accept=".mp3,.wav,.m4a" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />

        {/* Upload button with two-choice menu */}
        {state !== "recording" && (
          <div className="relative" ref={menuRef}>
            <Button
              size="lg"
              variant="outline"
              className="h-16 w-16 rounded-full shadow-xl bg-background hover:scale-105 transition-transform"
              onClick={() => setShowUploadMenu(v => !v)}
            >
              <Upload className="w-6 h-6" />
            </Button>

            {showUploadMenu && (
              <div className="absolute bottom-20 right-0 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden w-52 z-50">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Import audio</p>
                </div>
                <button
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                  onClick={() => { setShowUploadMenu(false); fileInputRef.current?.click(); }}
                >
                  <FileAudio className="w-4 h-4 text-blue-500" />
                  Upload MP3 / Audio file
                </button>
                <button
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-700 transition-colors"
                  onClick={() => { setShowUploadMenu(false); setIsYouTubeDialogOpen(true); }}
                >
                  <Youtube className="w-4 h-4 text-red-500" />
                  Import from YouTube
                </button>
                <div className="flex justify-center py-2">
                  <ChevronUp className="w-4 h-4 text-gray-300" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mic / Stop button */}
        {state === "recording" ? (
          <Button
            size="lg"
            variant="destructive"
            className="h-16 w-16 rounded-full shadow-xl hover:scale-105 transition-transform"
            onClick={handleStop}
          >
            <Square className="w-6 h-6 fill-current" />
          </Button>
        ) : (
          <Button
            size="lg"
            className="h-16 w-16 rounded-full shadow-xl bg-primary hover:bg-primary/90 hover:scale-105 transition-transform"
            onClick={startRecording}
          >
            <Mic className="w-6 h-6" />
          </Button>
        )}
      </div>

      {/* Save recorded / uploaded audio dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Recording</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lecture Name..." />
            </div>
            <div className="bg-muted p-4 rounded-lg flex justify-between items-center text-sm">
              <div className="flex flex-col">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-mono font-medium">{formatTime(duration)}</span>
              </div>
              {audioUrl && (
                <Button size="sm" variant="secondary" onClick={togglePlay} className="h-9">
                  {isPlaying ? <Square className="w-4 h-4 mr-2 fill-current" /> : <Mic className="w-4 h-4 mr-2" />}
                  {isPlaying ? "Pause Preview" : "Play Preview"}
                </Button>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isUploading || createMutation.isPending}>
              {isUploading || createMutation.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                : <><Save className="w-4 h-4 mr-2" /> Save & Process</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* YouTube import dialog */}
      <Dialog open={isYouTubeDialogOpen} onOpenChange={setIsYouTubeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Youtube className="w-5 h-5 text-red-500" />
              Import from YouTube
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>YouTube URL</Label>
              <Input
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                onKeyDown={(e) => e.key === 'Enter' && handleYouTubeSubmit()}
              />
              <p className="text-xs text-muted-foreground">
                The audio will be extracted, transcribed, and fully analysed.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Title <span className="text-muted-foreground font-normal">(optional — auto-filled from YouTube)</span></Label>
              <Input
                value={youtubeTitle}
                onChange={(e) => setYoutubeTitle(e.target.value)}
                placeholder="Override title..."
              />
            </div>

            {youtubeMutation.isPending && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                <span>Downloading audio from YouTube — this may take a minute for longer videos…</span>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsYouTubeDialogOpen(false)} disabled={youtubeMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleYouTubeSubmit}
              disabled={!youtubeUrl.trim() || youtubeMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {youtubeMutation.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing…</>
                : <><Youtube className="w-4 h-4 mr-2" /> Import & Analyse</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
