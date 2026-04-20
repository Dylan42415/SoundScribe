import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Menu, BookOpen } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center">
          <BookOpen className="w-12 h-12 text-primary/30 mb-4" />
          <div className="h-4 w-32 bg-muted rounded-full"></div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = "/";
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar />
      
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-card border-b z-30 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-lg text-primary">SoundScribe</span>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="w-6 h-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64">
             <Sidebar />
          </SheetContent>
        </Sheet>
      </div>

      <main className="flex-1 md:ml-64 p-4 md:p-8 mt-16 md:mt-0 transition-all duration-300">
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
