import React, { useState } from "react";
import { MapPin, User, Building2, MoreVertical, Pencil, Trash2, Lock, Unlock, Download, Upload, Copy, Archive, ArchiveRestore, FolderTree } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { isoToFlag, findCountryByName } from "@/lib/countryCodes";
import MeterGauge from "@/components/dashboard/MeterGauge";
import { useLanguage } from "@/lib/i18n";

export default function ProjectCard({ project, onClick, onEdit, onDelete, onUndoOnboarding, onExport, onImport, onDuplicate, onArchive, cols = 3 }) {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

  const imported = project.imported_meters ?? 0;
  const assigned = project.service_connections ?? 0;
  const gaugeSize = cols >= 6 ? 72 : cols >= 5 ? 84 : cols >= 4 ? 100 : 110;
  const compact = cols >= 5;
  const scale = cols >= 6
    ? { name: "text-xs", body: "text-[11px]", bodyIcon: "w-2.5 h-2.5", locIcon: "w-3 h-3", dmaNum: "text-sm", dmaLabel: "text-[11px]", flag: "text-sm", gap: "gap-3", pad: "p-3", legend: "text-[10px]" }
    : cols >= 5
    ? { name: "text-sm", body: "text-xs", bodyIcon: "w-3 h-3", locIcon: "w-3.5 h-3.5", dmaNum: "text-base", dmaLabel: "text-xs", flag: "text-sm", gap: "gap-3", pad: "p-4", legend: "text-[10px]" }
    : cols >= 4
    ? { name: "text-sm", body: "text-sm", bodyIcon: "w-3.5 h-3.5", locIcon: "w-4 h-4", dmaNum: "text-base", dmaLabel: "text-sm", flag: "text-base", gap: "gap-4", pad: "p-4", legend: "text-[11px]" }
    : { name: "text-base", body: "text-sm", bodyIcon: "w-3.5 h-3.5", locIcon: "w-4 h-4", dmaNum: "text-lg", dmaLabel: "text-sm", flag: "text-base", gap: "gap-4", pad: "p-5", legend: "text-[11px]" };

  return (
    <div
      onClick={() => onClick?.(project)}
      className={`group relative rounded-2xl ${scale.pad} cursor-pointer transition-all duration-300 ease-out border hover:shadow-[0_8px_30px_-6px_rgba(0,188,212,0.15)] hover:-translate-y-1 overflow-hidden ${
        project.locked
          // Locked projects get a warm amber tint, matching the lock badge, so
          // they read as read-only at a glance across the grid.
          ? "bg-amber-500/[0.07] border-amber-500/30 hover:border-amber-500/50"
          : "bg-card border-border hover:border-primary/40"
      }`}
    >
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="absolute top-4 right-4 p-1.5 rounded-lg bg-secondary/60 backdrop-blur-sm border border-border hover:bg-secondary text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-all duration-300 z-20"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => onEdit?.(project)}>
            <Pencil className="w-4 h-4 mr-2" /> {t('card.editDetails')}
          </DropdownMenuItem>
          {project.onboarding_complete && (
            <DropdownMenuItem onClick={() => onUndoOnboarding?.(project)}>
              <Unlock className="w-4 h-4 mr-2" /> {t('card.undoOnboarding')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => onExport?.(project)}>
            <Download className="w-4 h-4 mr-2" /> {t('card.exportData')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onImport?.(project)}>
            <Upload className="w-4 h-4 mr-2" /> {t('card.importOverwrite')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDuplicate?.(project)}>
            <Copy className="w-4 h-4 mr-2" /> {t('card.duplicate')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onArchive?.(project)}>
            {project.archived
              ? <><ArchiveRestore className="w-4 h-4 mr-2" /> {t('card.unarchive')}</>
              : <><Archive className="w-4 h-4 mr-2" /> {t('card.archive')}</>}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-red-500 focus:text-red-500" onClick={() => onDelete?.(project)}>
            <Trash2 className="w-4 h-4 mr-2" /> {t('card.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className={`relative z-10 flex ${scale.gap}`}>
        {/* Left column — project info */}
        <div className="flex-1 min-w-0 flex flex-col">
          <h3 className={`${scale.name} font-bold text-foreground break-words tracking-tight group-hover:text-primary transition-colors duration-300 leading-snug`}>{project.name}</h3>
          {project.parent_project_name && (
            <span className={`inline-flex items-center gap-1 ${scale.body} text-muted-foreground mt-0.5`}>
              <FolderTree className={`${scale.bodyIcon} text-primary/50`} />
              {project.parent_project_name}
            </span>
          )}
          {project.onboarding_complete && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full mt-1 w-fit">
              <Lock className="w-2.5 h-2.5" /> {t('dashboard.onboardingComplete')}
            </span>
          )}
          {project.archived && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full mt-1 w-fit">
              <Archive className="w-2.5 h-2.5" /> {t('card.archived')}
            </span>
          )}
          <p className={`${scale.body} text-muted-foreground mt-2 flex items-center gap-1.5`}>
            <Building2 className={`${scale.bodyIcon} text-primary/70`} />
            {project.utility_name}
          </p>
          <div className={`flex items-center gap-1.5 ${scale.body} text-muted-foreground mt-1.5`}>
            <MapPin className={`${scale.locIcon} text-primary/70`} />
            {project.country && (
              <span className={`${scale.flag} leading-none shrink-0`} title={project.country}>
                {isoToFlag(findCountryByName(project.country)?.iso)}
              </span>
            )}
            <span className="truncate">
              {project.city}
              {project.state ? `, ${project.state}` : ""}
              {project.country ? `, ${project.country}` : ""}
            </span>
          </div>
          <div className={`flex items-center gap-1.5 ${scale.body} text-muted-foreground mt-1.5`}>
            <User className={`${scale.locIcon} text-primary/70`} />
            <span>{project.owner_name || t('card.unassigned')}</span>
          </div>
          <div className="mt-auto pt-4 flex items-center gap-1.5">
            {project.locked && (
              <span
                className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-500 shrink-0"
                title="Project locked"
              >
                <Lock className="w-3 h-3" />
              </span>
            )}
            <span className={`${scale.dmaNum} font-bold text-foreground tabular-nums`}>{project.num_dma ?? 0}</span>
            <span className={`${scale.dmaLabel} text-muted-foreground`}>{t('panel.dmas')}</span>
          </div>
        </div>

        {/* Right column — gauge + legend */}
        <div className="flex flex-col items-center gap-2 shrink-0" style={{ width: gaugeSize }}>
          <MeterGauge imported={imported} assigned={assigned} size={gaugeSize} />
          <div className="space-y-1.5 w-full">
            <div className="flex items-center gap-1.5 justify-center">
              <span className="w-2 h-2 rounded-full bg-muted shrink-0" />
              <span className={`font-bold text-foreground tabular-nums ${scale.legend}`}>{imported}</span>
              {!compact && <span className="text-muted-foreground text-[10px] ml-0.5">{t('card.importedMeters')}</span>}
            </div>
            <div className="flex items-center gap-1.5 justify-center">
              <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
              <span className={`font-bold text-foreground tabular-nums ${scale.legend}`}>{assigned}</span>
              {!compact && <span className="text-muted-foreground text-[10px] ml-0.5">{t('card.dmaAssignedMeters')}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}