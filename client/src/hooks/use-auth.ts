import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";
import { supabase } from "../lib/supabase";

async function fetchUser(): Promise<User | null> {
  // Add a 5-second timeout for the initial session check
  const timeoutPromise = new Promise<null>((_, reject) => 
    setTimeout(() => reject(new Error("Auth session timeout")), 5000)
  );

  try {
    const { data: { session } } = await Promise.race([
      supabase.auth.getSession(),
      timeoutPromise
    ]) as any;

    if (!session) return null;
    const u = session.user;
    return {
      id: u.id,
      email: u.email!,
      firstName: u.user_metadata?.full_name?.split(" ")[0] || "User",
      lastName: u.user_metadata?.full_name?.split(" ")[1] || "",
      profileImageUrl: u.user_metadata?.avatar_url,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  } catch (error) {
    console.error("[auth] fetchUser error or timeout:", error);
    return null; // Fail gracefully to unauthenticated state
  }
}

async function logout(): Promise<void> {
  await supabase.auth.signOut();
  window.location.href = "/";
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, 
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
