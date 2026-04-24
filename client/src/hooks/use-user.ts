import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { UserStats } from "@shared/schema";
import { z } from "zod";

// Runtime validation helper
function parseResponse<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error("Validation failed:", result.error);
    throw result.error;
  }
  return result.data;
}

export function useUserStats(enabled: boolean = true) {
  return useQuery({
    queryKey: [api.user.getStats.path],
    enabled,
    queryFn: async () => {
      const res = await fetch(api.user.getStats.path, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return null; // Handle first-time user
        throw new Error("Failed to fetch user stats");
      }
      return parseResponse(api.user.getStats.responses[200], await res.json());
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: { dyslexiaFont?: boolean; highContrast?: boolean; voiceSpeed?: string }) => {
      const res = await fetch(api.user.updateSettings.path, {
        method: api.user.updateSettings.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return parseResponse(api.user.updateSettings.responses[200], await res.json());
    },
    onSuccess: (data) => {
      queryClient.setQueryData([api.user.getStats.path], data);
      
      // Apply side effects immediately
      if (data.dyslexiaFont) document.body.classList.add('dyslexia-font');
      else document.body.classList.remove('dyslexia-font');
      
      if (data.highContrast) document.body.classList.add('high-contrast');
      else document.body.classList.remove('high-contrast');
    },
  });
}

export function useAddCoins() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (amount: number) => {
      const res = await fetch(api.user.addCoins.path, {
        method: api.user.addCoins.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to add coins");
      return parseResponse(api.user.addCoins.responses[200], await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.user.getStats.path] }),
  });
}
