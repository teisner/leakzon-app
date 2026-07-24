import React from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, MapPin, User, Building2, Crosshair, LogOut, FolderTree, ChevronDown, Lock } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { supabase } from "@/api/supabaseClient";
import { useLanguage } from "@/lib/i18n";

export default function ProjectHeader({ project, onZoomToProject, onLogoClick, children, siblingProjects = [], locked, currentUser }) {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const handleLogout = () => {
    supabase.auth.signOut();
    localStorage.removeItem("loggedInUser");
    navigate("/");
  };

  return (
    <header className="bg-card border-b border-border shrink-0">
      <div className="px-4 py-3 flex items-center gap-3">
        <img
          src="/leakzon-logo-white.png"
          alt="LeakZon"
          onClick={onLogoClick}
          className={`h-9 w-auto shrink-0 dark:hidden ${onLogoClick ? "cursor-pointer" : ""}`}
        />
        <img
          src="/leakzon-logo-transparent.png"
          alt="LeakZon"
          onClick={onLogoClick}
          className={`h-9 w-auto shrink-0 hidden dark:block ${onLogoClick ? "cursor-pointer" : ""}`}
        />

        <div className="h-8 w-px bg-border mx-1" />

        {children}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-foreground truncate">
              {project.name}
              {project.parent_project_name && (
                <span className="text-sm font-normal text-muted-foreground"> ({project.parent_project_name})</span>
              )}
              {locked && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-semibold shrink-0">
                  <Lock className="w-3 h-3" />
                  Locked{project.locked_by_name ? ` by ${project.locked_by_name}` : ""}
                </span>
              )}
            </h1>
            {siblingProjects.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="p-1 rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors shrink-0 inline-flex items-center gap-0.5"
                    title="Switch to related project"
                  >
                    <FolderTree className="w-4 h-4" />
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-w-xs">
                  {siblingProjects.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => navigate(`/project/${p.id}`)}
                      className="flex flex-col items-start gap-0.5"
                    >
                      <span className="text-sm font-medium text-foreground">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.city}{p.country ? `, ${p.country}` : ""}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {onZoomToProject && (
              <button
                onClick={onZoomToProject}
                className="p-1 rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors shrink-0"
                title="Zoom to project location"
              >
                <Crosshair className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3" /> {project.utility_name}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {project.city}{project.state ? `, ${project.state}` : ""}{project.country ? `, ${project.country}` : ""}
            </span>
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" /> {project.owner_name || t('project.unassigned')}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1 shrink-0 ml-auto">
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate("/")}
              title={t('project.backToProjects')}
              className="h-11 w-11 rounded-xl inline-flex items-center justify-center hover:bg-accent transition-colors"
            >
              <LayoutDashboard className="w-6 h-6 text-[#1b87c1] dark:text-[#3fbee5]" />
            </button>
            <ThemeToggle />
            <LanguageToggle />
            <button
              onClick={handleLogout}
              title="Logout"
              className="h-9 w-9 rounded-xl inline-flex items-center justify-center hover:bg-accent transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          {currentUser?.full_name && (
            <p className="text-[11px] font-medium text-muted-foreground text-center truncate max-w-[180px]">
              {currentUser.full_name}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}