import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co",
  import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key",
);

supabase.auth.onAuthStateChange((event, session) => {
  console.log(`[auth] Event: ${event}`, session ? `(User: ${session.user.id})` : "(No session)");
  
  if (session) {
    document.cookie = `auth_token=${session.access_token}; path=/; max-age=${session.expires_in}; SameSite=Lax`;
  } else {
    document.cookie = `auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }

  // Only redirect on SIGNED_IN if we're not already on a protected page
  if (event === "SIGNED_IN") {
    const isProtectedPage = window.location.pathname !== "/" && window.location.pathname !== "";
    console.log(`[auth] SIGNED_IN detected. Current path: ${window.location.pathname}, Protected: ${isProtectedPage}`);
    if (!isProtectedPage) {
      console.log("[auth] Redirecting to /dashboard");
      window.location.replace("/dashboard");
    }
  }
});
