import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Group, InsertGroup } from "@shared/schema";

export function useGroups() {
  const { toast } = useToast();

  const groupsQuery = useQuery<Group[]>({
    queryKey: [api.groups.list.path],
  });

  const createGroupMutation = useMutation({
    mutationFn: async (group: InsertGroup) => {
      const res = await fetch(api.groups.create.path, {
        method: api.groups.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(group),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<Group>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.groups.list.path] });
      toast({ title: "Success", description: "Group created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Group> & { id: number }) => {
      const path = buildUrl(api.groups.update.path, { id });
      const res = await fetch(path, {
        method: api.groups.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<Group>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.groups.list.path] });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: number) => {
      const path = buildUrl(api.groups.delete.path, { id });
      const res = await fetch(path, {
        method: api.groups.delete.method,
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.groups.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.recordings.list.path] });
      toast({ title: "Success", description: "Group deleted successfully" });
    },
  });

  const assignRecordingsMutation = useMutation({
    mutationFn: async ({ groupId, recordingIds }: { groupId: number | null, recordingIds: number[] }) => {
      const path = buildUrl(api.groups.assignRecordings.path, { id: groupId ?? 0 });
      const res = await fetch(path, {
        method: api.groups.assignRecordings.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingIds }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.recordings.list.path] });
      toast({ title: "Success", description: "Recordings moved successfully" });
    },
  });

  return {
    groups: groupsQuery.data ?? [],
    isLoading: groupsQuery.isLoading,
    createGroup: createGroupMutation,
    updateGroup: updateGroupMutation,
    deleteGroup: deleteGroupMutation,
    assignRecordings: assignRecordingsMutation,
  };
}
