import { useState, useEffect } from "react";
import { useRecordings } from "@/hooks/use-recordings";
import { useGroups } from "@/hooks/use-groups";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Folder, Loader2 } from "lucide-react";
import type { Group } from "@shared/schema";

interface ManageGroupRecordingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: Group | null;
}

export function ManageGroupRecordingsModal({ open, onOpenChange, group }: ManageGroupRecordingsModalProps) {
  const { data: recordings } = useRecordings();
  const { assignRecordings } = useGroups();
  
  const [selectedRecordings, setSelectedRecordings] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && group && recordings) {
      const currentInGroup = recordings
        .filter(r => r.groupId === group.id)
        .map(r => r.id);
      setSelectedRecordings(currentInGroup);
    }
  }, [open, group, recordings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group) return;

    setIsSubmitting(true);
    try {
      // 1. Find recordings to remove (were in group but now unchecked)
      const currentInGroup = recordings
        ?.filter(r => r.groupId === group.id)
        .map(r => r.id) || [];
      
      const toRemove = currentInGroup.filter(id => !selectedRecordings.includes(id));
      
      // 2. Find recordings to add (were not in group but now checked)
      const toAdd = selectedRecordings.filter(id => !currentInGroup.includes(id));

      if (toRemove.length > 0) {
        await assignRecordings.mutateAsync({
          groupId: null,
          recordingIds: toRemove,
        });
      }

      if (toAdd.length > 0) {
        await assignRecordings.mutateAsync({
          groupId: group.id,
          recordingIds: toAdd,
        });
      }

      onOpenChange(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleRecording = (id: number) => {
    setSelectedRecordings(prev => 
      prev.includes(id) ? prev.filter(rid => rid !== id) : [...prev, id]
    );
  };

  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="w-5 h-5" style={{ color: group.color || undefined }} />
            Manage {group.name}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Select Recordings</Label>
              <p className="text-xs text-muted-foreground">{selectedRecordings.length} selected</p>
            </div>
            
            <ScrollArea className="h-[300px] rounded-md border p-2">
              <div className="space-y-2">
                {recordings?.map((recording) => (
                  <div key={recording.id} className="flex items-center space-x-2 p-1 hover:bg-muted rounded-md transition-colors">
                    <Checkbox 
                      id={`manage-rec-${recording.id}`} 
                      checked={selectedRecordings.includes(recording.id)}
                      onCheckedChange={() => toggleRecording(recording.id)}
                    />
                    <div className="flex-1 truncate">
                      <label
                        htmlFor={`manage-rec-${recording.id}`}
                        className="text-sm font-medium leading-none cursor-pointer block truncate"
                      >
                        {recording.title}
                      </label>
                      {recording.groupId && recording.groupId !== group.id && (
                        <span className="text-[10px] text-muted-foreground">
                          Currently in another group
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {(!recordings || recordings.length === 0) && (
                  <p className="text-center py-8 text-sm text-muted-foreground">No recordings available</p>
                )}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
