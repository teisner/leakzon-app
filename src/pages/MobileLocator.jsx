import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { callFunction } from "@/lib/publicFunction";
import { MapPin, Loader2, ChevronDown, Smartphone, CheckCircle2 } from "lucide-react";
import MobileMeterMap from "@/components/mobile/MobileMeterMap";
import ProjectOverviewMap from "@/components/mobile/ProjectOverviewMap";

export default function MobileLocator() {
  const { projectId } = useParams();
  const [meters, setMeters] = useState([]);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [view, setView] = useState("locate");

  useEffect(() => {
    callFunction("getUnlocatedMeters", { project_id: projectId })
      .then((res) => {
        setMeters(res?.meters || []);
        setProject(res?.project || null);
      })
      .catch(() => setError("Failed to load meters"))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleSaved = (meterId) => {
    setMeters((prev) => prev.filter((m) => m.id !== meterId));
    setExpandedId(null);
  };

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
          </div>
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
        ) : meters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
            <h2 className="text-lg font-semibold text-slate-900">All Done!</h2>
            <p className="text-sm text-slate-500 mt-1">
              All meters have been located. Thank you!
            </p>
          </div>
        ) : (
          meters.map((meter, idx) => {
            const isExpanded = expandedId === meter.id;
            return (
              <div
                key={meter.id}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : meter.id)}
                  className="w-full flex items-start gap-3 p-4 text-left active:bg-slate-50"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 text-xs font-bold shrink-0 mt-0.5">
                    {idx + 1}
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
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 mt-1 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4">
                    <MobileMeterMap meter={meter} project={project} onSave={handleSaved} />
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