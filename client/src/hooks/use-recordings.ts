import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertRecording } from "@shared/schema";
import { z } from "zod";

function parseResponse<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error("Validation failed:", result.error);
    throw result.error;
  }
  return result.data;
}

export function useRecordings() {
  return useQuery({
    queryKey: [api.recordings.list.path],
    queryFn: async () => {
      const res = await fetch(api.recordings.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch recordings");
      return parseResponse(api.recordings.list.responses[200], await res.json());
    },
  });
}

export function useRecording(id: number) {
  return useQuery({
    queryKey: [api.recordings.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.recordings.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to fetch recording");
      }
      return parseResponse(api.recordings.get.responses[200], await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateRecording() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertRecording) => {
      const validated = api.recordings.create.input.parse(data);
      const res = await fetch(api.recordings.create.path, {
        method: api.recordings.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create recording");
      return parseResponse(api.recordings.create.responses[201], await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.recordings.list.path] }),
  });
}

export function useProcessRecording() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.recordings.process.path, { id });
      const res = await fetch(url, {
        method: api.recordings.process.method,
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 402) throw new Error("Not enough coins to process this recording");
        throw new Error("Failed to process recording");
      }
      return parseResponse(api.recordings.process.responses[200], await res.json());
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: [api.recordings.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.recordings.get.path, id] });
      // Also update user stats since coins were consumed
      queryClient.invalidateQueries({ queryKey: ["/api/user/stats"] });
    },
  });
}

export function useDeleteRecording() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.recordings.delete.path, { id });
      const res = await fetch(url, {
        method: api.recordings.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete recording");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.recordings.list.path] }),
  });
}
