import React, { useState, useEffect } from "react";
import { invokeFunction } from "@/api/functionsClient";
import { supabase } from "@/api/supabaseClient";
import { Plus, Droplets, FolderOpen, Users as UsersIcon, LogOut, LayoutGrid, RefreshCw, Globe, ChevronDown, Archive, Search, ArrowDownUp } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ProjectCard from "@/components/dashboard/ProjectCard";
import CreateProjectDialog from "@/components/dashboard/CreateProjectDialog";
import EditProjectDialog from "@/components/dashboard/EditProjectDialog";
import DeleteProjectDialog from "@/components/dashboard/DeleteProjectDialog";
import ProjectDataDialog from "@/components/dashboard/ProjectDataDialog";
import UsersSection from "@/components/users/UsersSection";
import LoginDialog from "@/components/users/LoginDialog";
import VersionUpdates from "@/components/project/VersionUpdates";
import LanguageToggle from "@/components/LanguageToggle";
import ThemeToggle from "@/components/ThemeToggle";
import { useLanguage } from "@/lib/i18n";
import PreviewBadge from "@/components/PreviewBadge";
import DashboardNav from "@/components/dashboard/DashboardNav";
import ComponentDefaultsSettings from "@/components/dashboard/ComponentDefaultsSettings";

const DASHBOARD_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Assigned-meters percentage shown on the card gauge (assigned / imported).
const projectPct = (p) => {
  const imp = p.imported_meters ?? 0;
  const asg = p.service_connections ?? 0;
  return imp > 0 ? asg / imp : 0;
};
const projectTime = (p) => new Date(p.updated_at || p.created_at || 0).getTime();

const SORT_OPTIONS = [
  { key: "name_asc", label: "Name (A–Z)" },
  { key: "name_desc", label: "Name (Z–A)" },
  { key: "last_used_desc", label: "Last used (newest)" },
  { key: "last_used_asc", label: "Last used (oldest)" },
  { key: "percentage_desc", label: "Progress (high → low)" },
  { key: "percentage_asc", label: "Progress (low → high)" },
];

const SORT_COMPARATORS = {
  name_asc: (a, b) => (a.name || "").localeCompare(b.name || ""),
  name_desc: (a, b) => (b.name || "").localeCompare(a.name || ""),
  last_used_desc: (a, b) => projectTime(b) - projectTime(a),
  last_used_asc: (a, b) => projectTime(a) - projectTime(b),
  percentage_desc: (a, b) => projectPct(b) - projectPct(a),
  percentage_asc: (a, b) => projectPct(a) - projectPct(b),
};

export default function Home() {
  const { t } = useLanguage();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const [deleteProject, setDeleteProject] = useState(null);
  const [dataDialog, setDataDialog] = useState({ open: false, mode: null, project: null });
  const [activeTab, setActiveTab] = useState("projects");
  const [cols, setCols] = useState(3);
  const [refreshing, setRefreshing] = useState(false);
  const [countryFilter, setCountryFilter] = useState(null);
  const [showCountryMenu, setShowCountryMenu] = useState(false);
  const [sortKey, setSortKey] = useState("last_used_desc");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const colClassMap = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" };
  const [loggedInUser, setLoggedInUser] = useState(() => {
    try {
      const saved = localStorage.getItem("loggedInUser");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleForceRefresh = async () => {
    setRefreshing(true);
    try {
      await invokeFunction("refreshProjectStats", {}).catch(() => {});
      const cacheKey = `dashboardProjectsCache_${loggedInUser?.id || 'guest'}`;
      localStorage.removeItem(cacheKey);
      await loadProjects(true);
      toast({ title: t('dashboard.refreshed') });
    } catch {
      toast({ title: t('dashboard.refreshFailed'), variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  const handleUndoOnboarding = async (project) => {
    const { error } = await supabase.from('project').update({ onboarding_complete: false }).eq('id', project.id);
    if (error) {
      toast({ title: t('dashboard.undoFailed'), variant: "destructive" });
      return;
    }
    toast({ title: t('dashboard.onboardingUnlocked'), description: t('dashboard.onboardingUnlockedDesc', { name: project.name }) });
    loadProjects(true);
  };

  const handleArchiveToggle = async (project) => {
    const newVal = !project.archived;
    const { error } = await supabase.from('project').update({ archived: newVal }).eq('id', project.id);
    if (error) {
      toast({ title: t('dashboard.undoFailed'), variant: "destructive" });
      return;
    }
    toast({ title: newVal ? t('dashboard.archiveSuccess') : t('dashboard.unarchiveSuccess') });
    loadProjects(true);
  };

  const isArchiveTab = activeTab === "archive";
  const displayProjects = isArchiveTab
    ? projects.filter((p) => p.archived)
    : projects.filter((p) => !p.archived);

  const loadProjects = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // RLS (has_project_access) already restricts which projects a Project
      // User can see server-side — no client-side assigned_user_ids filter
      // needed here anymore (that array became the project_assignment table).
      const [{ data: projectList, error: projectError }, { data: statsList }] = await Promise.all([
        supabase.from('project').select('*').order('created_at', { ascending: false }),
        supabase.from('project_stats').select('*').limit(10000),
      ]);
      if (projectError) throw projectError;
      const stats = {};
      for (const s of statsList || []) {
        stats[s.project_id] = { total: s.meter_total, assignedCount: s.meter_assigned, dmaCount: s.dma_count };
      }

      const enriched = (projectList || []).map((p) => {
        const s = stats[p.id] || {};
        return {
          ...p,
          num_dma: s.dmaCount ?? 0,
          service_connections: s.assignedCount ?? p.service_connections ?? 0,
          imported_meters: s.total ?? 0,
        };
      });
      setProjects(enriched);
      try {
        localStorage.setItem(`dashboardProjectsCache_${loggedInUser?.id || 'guest'}`, JSON.stringify({ data: enriched, timestamp: Date.now() }));
      } catch {}
    } catch {
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    const cacheKey = `dashboardProjectsCache_${loggedInUser?.id || 'guest'}`;
    let cached = null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        cached = { data: parsed.data, timestamp: parsed.timestamp };
      }
    } catch {}

    // Show cached data immediately for instant render
    if (cached?.data) {
      setProjects(cached.data);
      setLoading(false);
    }

    // Fetch in background if no cache or cache is older than 1 hour
    const cacheAge = cached ? Date.now() - cached.timestamp : Infinity;
    if (!cached || cacheAge >= DASHBOARD_CACHE_TTL) {
      loadProjects(!!cached); // silent if we have cached data to show
    }

    // Hourly background refresh
    const interval = setInterval(() => {
      loadProjects(true);
    }, DASHBOARD_CACHE_TTL);

    return () => clearInterval(interval);
  }, [loggedInUser]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <div className="relative z-10 flex flex-col flex-1 overflow-hidden">
      <header className="bg-card border-b border-border shrink-0">
        <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex flex-col items-start">
            <img
              src="/leakzon-logo-white.png"
              alt="LeakZon Onboarding Platform"
              className="h-14 w-auto dark:hidden"
            />
            <img
              src="/leakzon-logo-transparent.png"
              alt="LeakZon Onboarding Platform"
              className="h-14 w-auto hidden dark:block"
            />
            <PreviewBadge className="mt-0.5 ml-1" />
          </div>
          <div className="ml-4 pl-4 border-l border-border">
            <h1 className="text-xl font-bold text-foreground tracking-tight">{t('dashboard.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            {loggedInUser && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground hidden sm:inline">{loggedInUser.full_name}</span>
                <LanguageToggle />
                <ThemeToggle />
                <Button variant="ghost" size="icon" onClick={() => { supabase.auth.signOut(); localStorage.removeItem("loggedInUser"); setLoggedInUser(null); }} title={t('dashboard.logout')} className="rounded-xl">
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            )}

          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <DashboardNav activeTab={activeTab} onChange={setActiveTab} currentUser={loggedInUser} />
        <main className="flex-1 overflow-auto w-full">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "versionUpdates" ? (
          <VersionUpdates currentUser={loggedInUser} projects={projects} />
        ) : activeTab === "settings" ? (
          <ComponentDefaultsSettings />
        ) : activeTab === "users" ? (
          <UsersSection currentUser={loggedInUser} />
        ) : loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-7 h-7 border-3 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        ) : displayProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-80 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              {isArchiveTab ? <Archive className="w-8 h-8 text-muted-foreground/70" /> : <FolderOpen className="w-8 h-8 text-muted-foreground/70" />}
            </div>
            <h2 className="text-lg font-semibold text-foreground/90 mb-1">{isArchiveTab ? t('dashboard.noArchived') : t('dashboard.noProjects')}</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">{isArchiveTab ? t('dashboard.noArchivedDesc') : t('dashboard.emptyDesc')}</p>
            {!isArchiveTab && (
              <Button onClick={() => setShowCreate(true)} className="gap-2 rounded-xl">
                <Plus className="w-4 h-4" /> {t('dashboard.createFirst')}
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6 gap-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search projects..."
                    className="pl-8 pr-3 py-1 rounded-lg text-xs border border-border bg-card text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary w-48"
                  />
                </div>
                <p className="text-sm text-muted-foreground">{t('dashboard.projectCount', { count: displayProjects.length })}</p>
                <div className="relative">
                  <button
                    onClick={() => setShowCountryMenu((v) => !v)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${countryFilter ? "bg-primary/10 text-primary border-primary/30" : "bg-card text-muted-foreground border-border hover:bg-muted"}`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    {countryFilter || "All Countries"}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {showCountryMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowCountryMenu(false)} />
                      <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg p-1 z-50 min-w-[200px] max-h-[300px] overflow-y-auto">
                        <button
                          onClick={() => { setCountryFilter(null); setShowCountryMenu(false); }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${!countryFilter ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                        >
                          <span>All Countries</span>
                          <span className="text-[10px] opacity-70">{projects.length}</span>
                        </button>
                        {Object.entries(
                          projects.reduce((acc, p) => {
                            const c = p.country || "Unknown";
                            acc[c] = (acc[c] || 0) + 1;
                            return acc;
                          }, {})
                        ).sort((a, b) => b[1] - a[1]).map(([country, count]) => (
                          <button
                            key={country}
                            onClick={() => { setCountryFilter(country); setShowCountryMenu(false); }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${countryFilter === country ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                          >
                            <span>{country}</span>
                            <span className="text-[10px] opacity-70">{count}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="relative">
                  <button
                    onClick={() => setShowSortMenu((v) => !v)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border bg-card text-muted-foreground border-border hover:bg-muted transition-colors"
                  >
                    <ArrowDownUp className="w-3.5 h-3.5" />
                    {SORT_OPTIONS.find((o) => o.key === sortKey)?.label || "Sort"}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {showSortMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                      <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg p-1 z-50 min-w-[200px]">
                        {SORT_OPTIONS.map((opt) => (
                          <button
                            key={opt.key}
                            onClick={() => { setSortKey(opt.key); setShowSortMenu(false); }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${sortKey === opt.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={handleForceRefresh}
                  disabled={refreshing}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  title={t('dashboard.forceRefresh')}
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                  {refreshing && <span className="text-xs text-muted-foreground whitespace-nowrap">{t('dashboard.optimizing')}</span>}
                </button>
                {!isArchiveTab && (
                  <Button onClick={() => setShowCreate(true)} className="gap-2 rounded-xl" size="sm">
                    <Plus className="w-4 h-4" /> {t('dashboard.newProject')}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg p-0.5">
                <LayoutGrid className="w-3.5 h-3.5 text-muted-foreground/70 ml-1.5" />
                {[3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    onClick={() => setCols(n)}
                    className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${cols === n ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${colClassMap[cols]} gap-4`}>
              {displayProjects
                .filter((p) => !countryFilter || (p.country || "Unknown") === countryFilter)
                .filter((p) => !searchQuery.trim() || p.name?.toLowerCase().includes(searchQuery.trim().toLowerCase()))
                .slice()
                .sort(SORT_COMPARATORS[sortKey] || SORT_COMPARATORS.name_asc)
                .map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  cols={cols}
                  onClick={() => navigate(`/project/${p.id}`)}
                  onEdit={setEditProject}
                  onDelete={setDeleteProject}
                  onUndoOnboarding={handleUndoOnboarding}
                  onExport={(project) => setDataDialog({ open: true, mode: "export", project })}
                  onImport={(project) => setDataDialog({ open: true, mode: "import", project })}
                  onDuplicate={(project) => setDataDialog({ open: true, mode: "duplicate", project })}
                  onArchive={handleArchiveToggle}
                />
              ))}
            </div>
          </>
        )}
        </div>
        </main>
      </div>

      </div>
      <CreateProjectDialog open={showCreate} onOpenChange={setShowCreate} onCreated={(project) => { loadProjects(true); navigate(`/project/${project.id}`); }} />
      <EditProjectDialog
        open={!!editProject}
        onOpenChange={(o) => !o && setEditProject(null)}
        project={editProject}
        onUpdated={() => loadProjects(true)}
      />
      <DeleteProjectDialog
        open={!!deleteProject}
        onOpenChange={(o) => !o && setDeleteProject(null)}
        project={deleteProject}
        onDeleted={() => loadProjects(true)}
      />
      <ProjectDataDialog
        open={dataDialog.open}
        onOpenChange={(o) => !o && setDataDialog({ open: false, mode: null, project: null })}
        mode={dataDialog.mode}
        project={dataDialog.project}
        onCompleted={() => loadProjects(true)}
      />
      {!loggedInUser && (
        <LoginDialog
          open={true}
          onOpenChange={() => {}}
          onLoginSuccess={(user) => {
            localStorage.setItem("loggedInUser", JSON.stringify(user));
            setLoggedInUser(user);
          }}
        />
      )}
    </div>
  );
}