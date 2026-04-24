import { useState, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Recording } from "@shared/schema";

export function useNotes(recording: Recording | undefined) {
  const { toast } = useToast();
  const [localContent, setLocalContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Reset or update content when recording changes
    const notes = recording?.notes as any;
    setLocalContent(notes?.content || "");
  }, [recording?.id, recording?.notes]);

  const updateNotesMutation = useMutation({
    mutationFn: async (updates: { content: string; pinned?: boolean }) => {
      if (!recording) return;
      const path = buildUrl(api.recordings.updateNotes.path, { id: recording.id });
      const res = await fetch(path, {
        method: api.recordings.updateNotes.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<Recording>;
    },
    onSuccess: (updated) => {
      if (!recording) return;
      queryClient.invalidateQueries({ queryKey: [api.recordings.list.path] });
      queryClient.setQueryData([buildUrl(api.recordings.get.path, { id: recording.id })], updated);
    },
  });

  // Auto-save effect
  useEffect(() => {
    if (!recording || localContent === (recording.notes as any)?.content) return;

    const timeout = setTimeout(async () => {
      setIsSaving(true);
      try {
        await updateNotesMutation.mutateAsync({ content: localContent });
      } finally {
        setIsSaving(false);
      }
    }, 1000);

    return () => clearTimeout(timeout);
  }, [localContent, recording?.id, updateNotesMutation]);

  const togglePin = async () => {
    if (!recording) return;
    const notes = recording.notes as any || {};
    await updateNotesMutation.mutateAsync({ 
      content: localContent, 
      pinned: !notes.pinned 
    });
  };

  return {
    content: localContent,
    setContent: setLocalContent,
    togglePin,
    isSaving: isSaving || updateNotesMutation.isPending,
    isPinned: (recording?.notes as any)?.pinned || false,
  };
}
