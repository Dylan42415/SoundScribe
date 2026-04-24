import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mic, BrainCircuit, Sparkles, Accessibility, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";

export default function Landing() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [showAuth, setShowAuth] = useState(false);
  useEffect(() => {
    if (user) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        const { error, data } = await supabase.auth.signUp({ email, password });
        if (error) {
          if (error.message.includes("already registered") || error.message.includes("taken")) {
            setError("This email is already taken. Try signing in instead!");
          } else {
            setError(error.message);
          }
        } else if (data.user?.identities?.length === 0) {
          setError("This email is already taken. Try signing in instead!");
        } else {
          setMessage("Account created! Check your email for a confirmation link.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            setError("Incorrect email or password. Please try again.");
          } else {
            setError(error.message);
          }
        }
        // Redirect is handled by onAuthStateChange in lib/supabase.ts
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) setError(error.message);
    } catch (err: any) {
      setError(err.message || "Failed to start Google login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background font-sans overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <span className="font-heading font-bold text-xl text-foreground">SoundScribe</span>
          </div>
          <div className="flex items-center gap-4">
            <Button onClick={() => { setShowAuth(true); setIsSignUp(false); }}>Sign In</Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
              <Sparkles className="w-4 h-4" />
              <span>AI-Powered Learning Assistant</span>
            </div>
            <h1 className="font-heading text-5xl sm:text-6xl font-bold leading-tight tracking-tight text-foreground">
              Turn Audio into <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
                Actionable Knowledge
              </span>
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed max-w-xl">
              Record lectures, meetings, or thoughts. SoundScribe automatically transcribes, summarizes, and creates study guides tailored for diverse learning needs.
            </p>
            <div className="flex flex-wrap gap-4 pt-4">
              <Button
                size="lg"
                className="h-12 px-8 text-lg shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all"
                onClick={() => { setShowAuth(true); setIsSignUp(true); }}
              >
                Start Recording Free
              </Button>
              <Button size="lg" variant="outline" className="h-12 px-8 text-lg">
                View Demo
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative"
          >
            <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-3xl blur-2xl opacity-50" />
            <div className="relative bg-card rounded-2xl shadow-2xl border border-border/50 overflow-hidden">
               <img
                 src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=2070"
                 alt="App Dashboard Preview"
                 className="w-full h-auto object-cover opacity-90"
               />
               <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent flex items-end p-8">
                 <div className="space-y-2">
                   <div className="flex gap-2 mb-2">
                     <span className="px-2 py-1 bg-white/20 backdrop-blur rounded text-xs text-white font-medium">Mind Map</span>
                     <span className="px-2 py-1 bg-white/20 backdrop-blur rounded text-xs text-white font-medium">Summary</span>
                   </div>
                   <h3 className="text-white font-bold text-xl">Biology 101: Cellular Respiration</h3>
                   <p className="text-white/80 text-sm">Processed just now • 45 mins saved</p>
                 </div>
               </div>
            </div>
          </motion.div>
        </div>
      </header>

      {/* Features Grid */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="font-heading text-3xl font-bold mb-4">Designed for How You Learn</h2>
            <p className="text-muted-foreground text-lg">
              Whether you're a visual learner, auditory processor, or need accessibility support, we've got you covered.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-card p-8 rounded-2xl border shadow-sm hover:shadow-lg transition-all">
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-6">
                <Mic className="w-6 h-6" />
              </div>
              <h3 className="font-heading font-bold text-xl mb-3">Instant Transcription</h3>
              <p className="text-muted-foreground">
                Never miss a word. Get accurate, timestamped transcripts of your recordings instantly.
              </p>
            </div>

            <div className="bg-card p-8 rounded-2xl border shadow-sm hover:shadow-lg transition-all">
              <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center mb-6">
                <BrainCircuit className="w-6 h-6" />
              </div>
              <h3 className="font-heading font-bold text-xl mb-3">Visual Mind Maps</h3>
              <p className="text-muted-foreground">
                Automatically generate structured mind maps to visualize connections between complex topics.
              </p>
            </div>

            <div className="bg-card p-8 rounded-2xl border shadow-sm hover:shadow-lg transition-all">
              <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center mb-6">
                <Accessibility className="w-6 h-6" />
              </div>
              <h3 className="font-heading font-bold text-xl mb-3">Accessibility First</h3>
              <p className="text-muted-foreground">
                Dyslexia-friendly fonts, high contrast modes, and adjustable playback speeds built-in.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t">
        <div className="max-w-7xl mx-auto px-4 text-center text-muted-foreground">
          <p>© 2024 SoundScribe. Empowering learners everywhere.</p>
        </div>
      </footer>

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuth && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowAuth(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-card p-8 rounded-2xl shadow-2xl w-full max-w-sm border"
            >
              <h2 className="font-heading font-bold text-2xl mb-1 text-center">
                {isSignUp ? "Create Account" : "Welcome Back"}
              </h2>
              <p className="text-muted-foreground text-center mb-6 text-sm">
                {isSignUp ? "Sign up to start recording for free" : "Sign in to continue to SoundScribe"}
              </p>

              <form onSubmit={handleAuth} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>

                {error && <p className="text-sm text-red-500 bg-red-50 p-3 rounded-lg">{error}</p>}
                {message && <p className="text-sm text-green-600 bg-green-50 p-3 rounded-lg">{message}</p>}

                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isSignUp ? "Create Account" : "Sign In"}
                </Button>
              </form>

              <div className="mt-6 relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3">
                <Button 
                  variant="outline" 
                  className="w-full h-11 bg-white hover:bg-gray-50 flex items-center justify-center gap-2 border shadow-sm"
                  onClick={handleGoogleAuth}
                  disabled={loading}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Google
                </Button>
              </div>

              <div className="mt-4 text-center text-sm text-muted-foreground">
                {isSignUp ? (
                  <>Already have an account?{" "}
                    <button onClick={() => { setIsSignUp(false); setError(null); setMessage(null); }} className="text-primary font-medium hover:underline">
                      Sign in
                    </button>
                  </>
                ) : (
                  <>Don't have an account?{" "}
                    <button onClick={() => { setIsSignUp(true); setError(null); setMessage(null); }} className="text-primary font-medium hover:underline">
                      Sign up
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
