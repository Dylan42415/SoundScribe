import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Mic, 
  Settings, 
  LogOut, 
  BookOpen
} from "lucide-react";
import { useUserStats } from "@/hooks/use-user";

export function Sidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();
  const { data: stats } = useUserStats();

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/recordings", icon: Mic, label: "Recordings" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <aside className="w-64 border-r bg-card h-screen fixed left-0 top-0 flex flex-col z-20 hidden md:flex">
      <div className="p-6 border-b flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="font-heading font-bold text-xl tracking-tight text-primary">SoundScribe</span>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href || location.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer group ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                <span>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t space-y-4">


        <Button 
          variant="outline" 
          className="w-full justify-start gap-2 border-dashed" 
          onClick={() => logout()}
        >
          <LogOut className="w-4 h-4" />
          Log Out
        </Button>
      </div>
    </aside>
  );
}
