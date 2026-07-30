import React, { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { callFunction } from "@/lib/publicFunction";
import { MapPin, Loader2, ChevronDown, Smartphone, CheckCircle2, AlertTriangle, Crosshair, MessageSquarePlus } from "lucide-react";
import MobileMeterMap from "@/components/mobile/MobileMeterMap";
import ProjectOverviewMap from "@/components/mobile/ProjectOverviewMap";
import FieldNoteForm from "@/components/mobile/FieldNoteForm";

export default function MobileLocator() {
  const { projectId } = useParams();
  // The emailed link carries a share token — this page is opened in the field
  // with no login, so every backend call has to present it.
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [meters, setMeters] = useState([]);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [view, setView] = useState("locate");
  // Which of the two jobs is open on the expanded meter: place it, or say why
  // you cannot. Both are reasonable outcomes of walking to an address.
  const [mode, setMode] = useState("locate");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    callFunction("getUnlocatedMeters", { project_id: projectId, token })
      .then((res) => {
        setMeters(res?.meters || []);
        setProject(res?.project || null);
      })
      .catch(() => setError(token ? "Failed to load meters — this link may have expired." : "This link is missing its access token. Please use the full link from the email."))
      .finally(() => setLoading(false));
  }, [projectId, token]);

  const handleSaved = (meterId) => {
    setMeters((prev) => prev.filter((m) => m.id !== meterId));
    setExpandedId(null);
  };

  // A note does not take the meter off the list — it still has no location, and
  // the office may well come back with an answer. It just stops being anonymous.
  const handleNoteSaved = (meterId, note) => {
    setMeters((prev) => prev.map((m) => (
      m.id === meterId ? { ...m, field_note: note || null, field_note_at: note ? new Date().toISOString() : null } : m
    )));
  };

  const reportedCount = meters.filter((m) => m.field_note).length;
  const shown = filter === "reported" ? meters.filter((m) => m.field_note)
    : filter === "open" ? meters.filter((m) => !m.field_note)
    : meters;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-0.5">
            <MapPin className="w-5 h-5 text-blue-600" />
            <h1 className="text-base font-bold text-slate-900">Mobile Locator</h1>
          </div>
          <p className="text-xs text-slate-500">{project?.name || "Project"}</p>
        </div>
        {/* Counter */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-3 bg-blue-50 rounded-lg px-4 py-2.5">
            <div className="flex-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-blue-700">{meters.length}</span>
              <span className="text-sm text-blue-600">
                meter{meters.length !== 1 ? "s" : ""} remaining
              </span>
            </div>
            {reportedCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-1">
                <AlertTriangle className="w-3 h-3" /> {reportedCount} reported
              </span>
            )}
          </div>
          {reportedCount > 0 && (
            <div className="flex gap-1.5 mt-2">
              {[
                { key: "all", label: `All ${meters.length}` },
                { key: "open", label: `Not yet reported ${meters.length - reportedCount}` },
                { key: "reported", label: `Reported ${reportedCount}` },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                    filter === f.key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* View toggle */}
      <div className="px-4 pb-3">
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            onClick={() => setView("locate")}
            className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors ${view === "locate" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            Locate Meters
          </button>
          <button
            onClick={() => setView("map")}
            className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors ${view === "map" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            Project Map
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-3 max-w-2xl mx-auto">
        {view === "map" ? (
          <ProjectOverviewMap projectId={projectId} project={project} />
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
            <h2 className="text-lg font-semibold text-slate-900">All Done!</h2>
            <p className="text-sm text-slate-500 mt-1">
              All meters have been located. Thank you!
            </p>
          </div>
        ) : (
          shown.map((meter, idx) => {
            const isExpanded = expandedId === meter.id;
            return (
              <div
                key={meter.id}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm"
              >
                <button
                  onClick={() => { setExpandedId(isExpanded ? null : meter.id); setMode("locate"); }}
                  className="w-full flex items-start gap-3 p-4 text-left active:bg-slate-50"
                >
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0 mt-0.5 ${
                    meter.field_note ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-600"
                  }`}>
                    {meter.field_note ? <AlertTriangle className="w-4 h-4" /> : idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 font-mono break-all">
                      {meter.uid}
                    </p>
                    {meter.payer_name && (
                      <p className="text-xs text-slate-600 mt-0.5">{meter.payer_name}</p>
                    )}
                    {meter.address && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{meter.address}</p>
                    )}
                    {!meter.address && !meter.payer_name && (
                      <p className="text-xs text-slate-300 mt-0.5">No additional info</p>
                    )}
                    {/* What was already reported, so nobody repeats the trip */}
                    {meter.field_note && (
                      <p className="mt-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                        {meter.field_note}
                      </p>
                    )}
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 mt-1 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4">
                    {/* Place it, or say why you cannot */}
                    <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 mb-3">
                      <button
                        onClick={() => setMode("locate")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium ${mode === "locate" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                      >
                        <Crosshair className="w-3.5 h-3.5" /> Set location
                      </button>
                      <button
                        onClick={() => setMode("note")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium ${mode === "note" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                      >
                        <MessageSquarePlus className="w-3.5 h-3.5" /> Report an issue
                      </button>
                    </div>
                    {mode === "locate" ? (
                      <MobileMeterMap
                        meter={meter}
                        project={project}
                        projectId={projectId}
                        onSave={handleSaved}
                        token={token}
                      />
                    ) : (
                      <FieldNoteForm meter={meter} token={token} onSaved={handleNoteSaved} />
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop notice */}
      <div className="hidden md:flex fixed bottom-4 left-1/2 -translate-x-1/2 items-center gap-1.5 bg-slate-800 text-white text-xs px-4 py-2 rounded-lg shadow-lg">
        <Smartphone className="w-3.5 h-3.5" />
        This page is optimized for mobile devices
      </div>
    </div>
  );
}