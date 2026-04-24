import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Mic, 
  Settings, 
  LogOut, 
  BookOpen,
  Globe,
  Folder,
  Plus,
  Hash,
  ChevronDown,
  ChevronRight,
  FileText
} from "lucide-react";
import { useGroups } from "@/hooks/use-groups";
import { useState } from "react";
import { CreateGroupModal } from "@/components/groups/CreateGroupModal";
import { NotepadDrawer } from "@/components/layout/NotepadDrawer";
import { supabase } from "@/lib/supabase";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUserStats } from "@/hooks/use-user";
import { useTranslation } from "@/lib/i18n";

export function Sidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();
  const { data: stats } = useUserStats();
  const { language, setLanguage, t } = useTranslation();
  const { groups } = useGroups();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [groupsExpanded, setGroupsExpanded] = useState(true);
  const [showNotepad, setShowNotepad] = useState(false);

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: t("sidebar.dashboard") },
    { href: "/recordings", icon: Mic, label: t("sidebar.recordings") },
    { href: "/settings", icon: Settings, label: t("sidebar.settings") },
  ];

  const languages = [
    { code: "en", label: "English" },
    { code: "es", label: "Español" },
    { code: "fr", label: "Français" },
    { code: "de", label: "Deutsch" },
    { code: "zh", label: "中文" },
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

        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer group ${
            showNotepad
              ? "bg-primary/10 text-primary font-medium shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          onClick={() => setShowNotepad(!showNotepad)}
        >
          <FileText className={`w-5 h-5 ${showNotepad ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
          <span>Notepad</span>
        </div>
        
        <div className="pt-4 pb-2">
          <div 
            className="flex items-center justify-between px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
            onClick={() => setGroupsExpanded(!groupsExpanded)}
          >
            <span>Groups</span>
            <div className="flex items-center gap-1">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCreateModal(true);
                }}
                className="hover:bg-muted p-1 rounded-md"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              {groupsExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </div>
          </div>

          {groupsExpanded && (
            <div className="mt-1 space-y-1">
              <Link href="/recordings?group=none">
                <div className={`flex items-center gap-3 px-4 py-2 rounded-xl transition-all duration-200 cursor-pointer text-sm ${
                  location === "/recordings" && new URLSearchParams(window.location.search).get("group") === "none"
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}>
                  <Hash className="w-4 h-4" />
                  <span>Ungrouped</span>
                </div>
              </Link>

              {groups.map((group) => {
                const isActive = new URLSearchParams(window.location.search).get("group") === String(group.id);
                return (
                  <Link key={group.id} href={`/recordings?group=${group.id}`}>
                    <div className={`flex items-center gap-3 px-4 py-2 rounded-xl transition-all duration-200 cursor-pointer text-sm ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}>
                      <Folder className="w-4 h-4" style={{ color: group.color || undefined }} />
                      <span className="truncate">{group.name}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
        
        <div className="pt-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground group">
                <Globe className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
                <span>{t("sidebar.language")} ({language.toUpperCase()})</span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
              {languages.map((lang) => (
                <DropdownMenuItem 
                  key={lang.code} 
                  onClick={() => setLanguage(lang.code)}
                  className={language === lang.code ? "bg-primary/10 font-medium" : ""}
                >
                  {lang.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <CreateGroupModal 
          open={showCreateModal} 
          onOpenChange={setShowCreateModal} 
        />
        <NotepadDrawer 
          open={showNotepad} 
          onOpenChange={setShowNotepad} 
        />
      </nav>

      <div className="p-4 border-t space-y-4">
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          onClick={() => logout()}
        >
          <LogOut className="w-5 h-5" />
          <span>{t("sidebar.logout") || "Logout"}</span>
        </Button>
      </div>
    </aside>
  );
}
