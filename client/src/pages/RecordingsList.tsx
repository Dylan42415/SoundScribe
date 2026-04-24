import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useRecordings } from "@/hooks/use-recordings";
import { RecordingCard } from "@/components/recordings/RecordingCard";
import { AudioRecorder } from "@/components/recordings/AudioRecorder";
import { Input } from "@/components/ui/input";
import { Search, Filter, Loader2, Folder, Settings, Plus, Trash2 } from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useGroups } from "@/hooks/use-groups";
import { Button } from "@/components/ui/button";
import { ManageGroupRecordingsModal } from "@/components/groups/ManageGroupRecordingsModal";
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

export default function RecordingsList() {
  const { data: recordings, isLoading } = useRecordings();
  const { groups, deleteGroup } = useGroups();
  const [location] = useLocation();
  const [search, setSearch] = useState("");
  const [showManageModal, setShowManageModal] = useState(false);

  // Parse group from URL
  const queryParams = new URLSearchParams(window.location.search);
  const groupId = queryParams.get("group");

  const selectedGroup = useMemo(() => {
    if (!groupId || groupId === "none") return null;
    return groups.find(g => g.id === Number(groupId));
  }, [groupId, groups]);

  const filteredRecordings = useMemo(() => {
    let result = recordings || [];
    
    // Filter by group
    if (groupId === "none") {
      result = result.filter(r => !r.groupId);
    } else if (selectedGroup) {
      result = result.filter(r => r.groupId === selectedGroup.id);
    }

    // Filter by search
    if (search) {
      result = result.filter(r => 
        r.title.toLowerCase().includes(search.toLowerCase())
      );
    }

    return result;
  }, [recordings, groupId, selectedGroup, search]);

  const handleDeleteGroup = async () => {
    if (selectedGroup) {
      await deleteGroup.mutateAsync(selectedGroup.id);
      window.history.pushState({}, "", "/recordings");
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-3xl font-bold flex items-center gap-3">
              {selectedGroup ? (
                <>
                  <Folder className="w-8 h-8" style={{ color: selectedGroup.color || undefined }} />
                  {selectedGroup.name}
                </>
              ) : groupId === "none" ? (
                "Ungrouped Recordings"
              ) : (
                "My Recordings"
              )}
            </h1>
            {selectedGroup && (
              <p className="text-muted-foreground text-sm">
                Organizing {filteredRecordings.length} recordings in this group
              </p>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {selectedGroup && (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-2"
                  onClick={() => setShowManageModal(true)}
                >
                  <Plus className="w-4 h-4" />
                  Add Recordings
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Group?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove the group but keep all your recordings. They will be moved to "Ungrouped".
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteGroup} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete Group
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}

            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search recordings..." 
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        <ManageGroupRecordingsModal 
          open={showManageModal} 
          onOpenChange={setShowManageModal}
          group={selectedGroup}
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {filteredRecordings?.map((recording) => (
              <RecordingCard key={recording.id} recording={recording} />
            ))}
            
            {filteredRecordings?.length === 0 && (
               <div className="col-span-full text-center py-20 text-muted-foreground">
                 No recordings found matching your search.
               </div>
            )}
          </div>
        )}
      </div>
      <AudioRecorder />
    </DashboardLayout>
  );
}
