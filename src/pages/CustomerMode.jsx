import React, { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2, AlertCircle, Building2, User, MapPin } from "lucide-react";
import { invokeFunction } from "@/api/functionsClient";
import CustomerModeMap from "@/components/customer-mode/CustomerModeMap";
import ApproveDesignBar from "@/components/customer-mode/ApproveDesignBar";
import LinkCountdown from "@/components/customer-mode/LinkCountdown";

export default function CustomerMode() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Always force dark mode for Customer Mode
  useEffect(() => {
    document.documentElement.classList.add("dark");
    const prevTitle = document.title;
    const favicon = document.querySelector("link[rel='icon']");
    const prevHref = favicon?.href;
    document.title = "LeakZon Onboarding";
    if (favicon) {
      favicon.href = "/leakzon-logo-white.png";
    }
    return () => {
      document.documentElement.classList.remove("dark");
      document.title = prevTitle;
      if (favicon && prevHref) favicon.href = prevHref;
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await invokeFunction("getCustomerModeData", { project_id: projectId, token });
        const d = res.data;
        if (!d) {
          setError("Failed to load project data.");
        } else if (d.error) {
          setError(d.error);
        } else if (!d.project) {
          setError("Project not found.");
        } else {
          setData(d);
        }
      } catch (err) {
        const msg = err?.response?.data?.error || err?.message || "Failed to load.";
        setError(typeof msg === "string" ? msg : "Failed to load.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background gap-3">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-lg font-semibold text-foreground">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { project, layers, dmas, meters, isolated_points } = data;
  const locationParts = [project.city, project.state, project.country].filter(Boolean);
  const location = locationParts.join(", ");

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <header className="bg-card border-b border-border shrink-0">
        <div className="px-4 py-2.5 flex items-center gap-3">
          <img
            src="/leakzon-logo-transparent.png"
            alt="LeakZon"
            className="h-8 w-auto shrink-0"
          />
          <div className="h-7 w-px bg-border mx-1" />
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-foreground truncate">{project.name}</h1>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {location}
                </span>
              )}
              {project.utility_name && (
                <span className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> {project.utility_name}
                </span>
              )}
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" /> {project.owner_name || "—"}
              </span>
            </div>
          </div>
          {data.link_expires_at && <LinkCountdown expiresAt={data.link_expires_at} />}
        </div>
      </header>

      <div className="flex-1 overflow-hidden relative">
        <CustomerModeMap
          project={project}
          layers={layers}
          dmas={dmas}
          meters={meters}
          isolatedPoints={isolated_points}
          token={token}
        />
        <ApproveDesignBar project={project} token={token} />
      </div>
    </div>
  );
}