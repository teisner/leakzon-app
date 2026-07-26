import React, { useState } from "react";
import { Map as MapIcon, Database, ArrowUpDown, Network, Rocket, Boxes, Eye, Settings, GitPullRequest, ArrowUpCircle } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import SidebarLockControl from "@/components/SidebarLockControl";
import { APP_VERSION } from "@/lib/version";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import UpdateAvailableDialog from "@/components/UpdateAvailableDialog";

export default function ProjectNav({ viewMode, onChange, onImportData, locked, onOpenWizard, onOpenCustomerView, customerAnnotationCount = 0, currentUser }) {
  const canViewVersionUpdates = currentUser?.user_type === "LeakZon" || currentUser?.user_type === "Admin";
  const { t } = useLanguage();
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem("projectNavMode");
    return saved === "open" || saved === "closed" ? saved : "closed";
  });

  const handleModeChange = (next) => {
    setMode(next);
    localStorage.setItem("projectNavMode", next);
  };

  const expanded = mode === "open";
  // Hourly poll of the deployed version — badge appears when this tab is behind.
  const { latestVersion } = useVersionCheck();
  const [showUpdate, setShowUpdate] = useState(false);

  const views = [
    { key: "gis", label: t('view.gisMap'), Icon: MapIcon },
    { key: "data", label: t('view.meterData'), Icon: Database },
    { key: "network", label: t('view.networkDesign'), Icon: Network },
    { key: "inventory", label: t('view.wetworkInventory'), Icon: Boxes },
  ];

  const navItem = ({ key, label, Icon, onClick, active, disabled }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      } disabled:opacity-40 disabled:cursor-not-allowed ${expanded ? "justify-start" : "justify-center"}`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
      )}
      <Icon className="w-5 h-5 shrink-0" />
      {expanded && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );

  return (
    <nav
      className={`shrink-0 bg-background border-r border-border flex flex-col py-4 transition-all duration-200 overflow-hidden ${
        expanded ? "w-52 px-3" : "w-16 px-2"
      }`}
    >
      <button
        onClick={onOpenWizard}
        title={t('wizard.title')}
        className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors bg-primary/10 text-primary hover:bg-primary/20 ${expanded ? "justify-start" : "justify-center"}`}
      >
        <Rocket className="w-5 h-5 shrink-0" />
        {expanded && <span className="whitespace-nowrap">{t('wizard.title')}</span>}
      </button>

      <div className="my-3 border-t border-border" />

      <div className="space-y-1">
        {views.map(({ key, label, Icon }) =>
          navItem({
            key,
            label,
            Icon,
            onClick: () => onChange(key),
            active: viewMode === key,
            disabled: false,
          })
        )}
      </div>

      <div className="my-3 border-t border-border" />

      <div className="space-y-1">
        {navItem({
          key: "import",
          label: t('view.importExport'),
          Icon: ArrowUpDown,
          onClick: onImportData,
          active: viewMode === "import",
          disabled: false,
        })}
      </div>

      <div className="my-3 border-t border-border" />

      <div className="space-y-1">
        <button
          onClick={onOpenCustomerView}
          title="Customer View"
          className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-blue-500 hover:text-blue-600 hover:bg-blue-500/10 ${expanded ? "justify-start" : "justify-center"}`}
        >
          <Eye className="w-5 h-5 shrink-0" />
          {expanded && <span className="whitespace-nowrap">Customer View</span>}
          {customerAnnotationCount > 0 && (
            <span className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ring-background">
              {customerAnnotationCount > 99 ? "99+" : customerAnnotationCount}
            </span>
          )}
        </button>
      </div>

      <div className="mt-auto space-y-1 pt-2">
        {canViewVersionUpdates && navItem({
          key: "versionUpdates",
          label: "Version Updates",
          Icon: GitPullRequest,
          onClick: () => onChange("versionUpdates"),
          active: viewMode === "versionUpdates",
          disabled: false,
        })}
        {navItem({
          key: "settings",
          label: "Settings",
          Icon: Settings,
          onClick: () => onChange("settings"),
          active: viewMode === "settings",
          disabled: false,
        })}
        <SidebarLockControl
          mode={mode}
          onChange={handleModeChange}
          expanded={expanded}
          labels={{
            open: t('sidebar.open'),
            closed: t('sidebar.closed'),
          }}
        />
        <div className="mt-2 pt-2 border-t border-border">
          <div className="flex items-center justify-center gap-1.5">
            <p className="text-[10px] text-green-600 dark:text-green-400 tabular-nums">Ver {APP_VERSION}</p>
            {latestVersion && (
              <button
                onClick={() => setShowUpdate(true)}
                title={`Version ${latestVersion} is available`}
                className="relative flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white shrink-0 hover:bg-amber-600 transition-colors"
              >
                <ArrowUpCircle className="w-3 h-3" />
                <span className="absolute inset-0 rounded-full bg-amber-500 animate-ping opacity-60" />
              </button>
            )}
          </div>
        </div>
      </div>

      <UpdateAvailableDialog
        open={showUpdate}
        onOpenChange={setShowUpdate}
        latestVersion={latestVersion}
      />
    </nav>
  );
}