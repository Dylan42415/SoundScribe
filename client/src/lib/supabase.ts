import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co",
  import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key",
);

supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    document.cookie = `auth_token=${session.access_token}; path=/; max-age=${session.expires_in}; SameSite=Lax`;
  } else {
    document.cookie = `auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }

  // Only redirect on SIGNED_IN if we're not already on a protected page
  if (event === "SIGNED_IN") {
    const isProtectedPage = window.location.pathname !== "/" && window.location.pathname !== "";
    if (!isProtectedPage) {
      window.location.replace("/dashboard");
    }
  }
});
