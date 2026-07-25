import React, { useState } from "react";
import { FolderOpen, Users as UsersIcon, Archive, GitPullRequest, Settings2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import SidebarLockControl from "@/components/SidebarLockControl";

export default function DashboardNav({ activeTab, onChange, currentUser }) {
  const { t } = useLanguage();
  const canViewVersionUpdates = currentUser?.user_type === "LeakZon" || currentUser?.user_type === "Admin";
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem("dashboardNavMode");
    return saved === "open" || saved === "closed" ? saved : "closed";
  });

  const handleModeChange = (next) => {
    setMode(next);
    localStorage.setItem("dashboardNavMode", next);
  };

  const expanded = mode === "open";

  const items = [
    { key: "projects", label: t('dashboard.projects'), Icon: FolderOpen },
    { key: "archive", label: t('dashboard.archive'), Icon: Archive },
    { key: "users", label: t('dashboard.users'), Icon: UsersIcon },
    ...(canViewVersionUpdates ? [{ key: "versionUpdates", label: t('dashboard.versionUpdates'), Icon: GitPullRequest }] : []),
    ...(canViewVersionUpdates ? [{ key: "settings", label: "Settings", Icon: Settings2 }] : []),
  ];

  return (
    <nav
      className={`shrink-0 bg-background border-r border-border flex flex-col py-4 transition-[width,padding] duration-200 overflow-hidden ${
        expanded ? "w-52 px-3" : "w-16 px-2"
      }`}
    >
      <div className="space-y-1">
        {items.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            title={label}
            className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === key
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            } ${expanded ? "justify-start" : "justify-center"}`}
          >
            {activeTab === key && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
            )}
            <Icon className="w-5 h-5 shrink-0" />
            {expanded && <span className="whitespace-nowrap">{label}</span>}
          </button>
        ))}
      </div>

      <div className="mt-auto pt-2">
        <SidebarLockControl
          mode={mode}
          onChange={handleModeChange}
          expanded={expanded}
          labels={{
            open: t('sidebar.open'),
            closed: t('sidebar.closed'),
          }}
        />
      </div>
    </nav>
  );
}