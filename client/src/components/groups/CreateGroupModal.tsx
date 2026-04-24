import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Folder, Palette, Loader2 } from "lucide-react";

interface CreateGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateGroupModal({ open, onOpenChange }: CreateGroupModalProps) {
  const { data: recordings } = useRecordings();
  const { createGroup, assignRecordings } = useGroups();
  
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [selectedRecordings, setSelectedRecordings] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const colors = [
    "#ef4444", "#f97316", "#f59e0b", "#10b981", 
    "#3b82f6", "#6366f1", "#8b5cf6", "#d946ef"
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const group = await createGroup.mutateAsync({
        name,
        color,
        icon: "Folder",
      });

      if (selectedRecordings.length > 0) {
        await assignRecordings.mutateAsync({
          groupId: group.id,
          recordingIds: selectedRecordings,
        });
      }

      onOpenChange(false);
      setName("");
      setColor("#3b82f6");
      setSelectedRecordings([]);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-primary" />
            Create New Group
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Group Name</Label>
            <Input 
              id="name" 
              placeholder="e.g. Biology, Meetings..." 
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Theme Color
            </Label>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                    color === c ? "border-primary scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Add Recordings</Label>
              <button 
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => {
                   if (selectedRecordings.length === recordings?.length) {
                     setSelectedRecordings([]);
                   } else {
                     setSelectedRecordings(recordings?.map(r => r.id) || []);
                   }
                }}
              >
                {selectedRecordings.length === recordings?.length ? "Deselect All" : "Select All"}
              </button>
            </div>
            
            <ScrollArea className="h-[200px] rounded-md border p-2">
              <div className="space-y-2">
                {recordings?.map((recording) => (
                  <div key={recording.id} className="flex items-center space-x-2 p-1 hover:bg-muted rounded-md transition-colors">
                    <Checkbox 
                      id={`rec-${recording.id}`} 
                      checked={selectedRecordings.includes(recording.id)}
                      onCheckedChange={() => toggleRecording(recording.id)}
                    />
                    <label
                      htmlFor={`rec-${recording.id}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1 truncate"
                    >
                      {recording.title}
                    </label>
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
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
