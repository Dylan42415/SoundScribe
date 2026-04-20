import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useRecordings } from "@/hooks/use-recordings";
import { RecordingCard } from "@/components/recordings/RecordingCard";
import { AudioRecorder } from "@/components/recordings/AudioRecorder";
import { Input } from "@/components/ui/input";
import { Search, Filter, Loader2 } from "lucide-react";
import { useState } from "react";

export default function RecordingsList() {
  const { data: recordings, isLoading } = useRecordings();
  const [search, setSearch] = useState("");

  const filteredRecordings = recordings?.filter(r => 
    r.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="font-heading text-3xl font-bold">My Recordings</h1>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
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
