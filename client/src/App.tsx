import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import RecordingsList from "@/pages/RecordingsList";
import RecordingDetail from "@/pages/RecordingDetail";
import Settings from "@/pages/Settings";
import Login from "@/pages/Login";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useUserStats } from "@/hooks/use-user";
import { LanguageProvider } from "@/lib/i18n";
import ErrorBoundary from "@/components/ErrorBoundary";

function ProtectedRoutes() {
  const { user, isLoading } = useAuth();
  
  // Apply persistent settings on app load
  const { data: stats } = useUserStats(!!user);
  useEffect(() => {
    if (stats && typeof stats === 'object') {
      if (stats.dyslexiaFont) document.body.classList.add('dyslexia-font');
      else document.body.classList.remove('dyslexia-font');
      
      if (stats.highContrast) document.body.classList.add('high-contrast');
      else document.body.classList.remove('high-contrast');
      
      if (stats.darkMode) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    }
  }, [stats]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-primary/20 animate-pulse" />
          <Loader2 className="w-12 h-12 animate-spin text-primary absolute inset-0" />
        </div>
        <p className="text-muted-foreground font-medium animate-pulse text-lg">Waking up SoundScribe...</p>
      </div>
    );
  }

  if (!user) {
    return <Landing />;
  }

  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/recordings" component={RecordingsList} />
      <Route path="/recordings/:id" component={RecordingDetail} />
      <Route path="/settings" component={Settings} />
      <Route path="/login" component={Login} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <TooltipProvider>
          <ErrorBoundary>
            <ProtectedRoutes />
          </ErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
