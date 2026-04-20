import { supabase } from "../lib/supabase";
import { Button } from "@/components/ui/button";

export default function Login() {
  const handleLogin = async () => {
    // We will use anonymous login or google for this template
    // For free tiers, google OAuth is out-of-the-box in Supabase
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-muted/30">
      <div className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-sm border text-center space-y-6">
        <h1 className="font-heading font-bold text-3xl">Welcome Back</h1>
        <p className="text-muted-foreground">Sign in to continue to SoundScribe</p>
        <Button onClick={handleLogin} className="w-full text-lg h-12">
          Sign In with Google
        </Button>
      </div>
    </div>
  );
}
