import React, { useState, useEffect, useRef, useMemo } from "react";
import { uploadFile } from "@/api/storageClient";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Upload, X, Lightbulb, RefreshCw, Bug, Image as ImageIcon, Clock, FolderOpen } from "lucide-react";

const REQUEST_TYPES = [
  { value: "feature_request", label: "New Feature", Icon: Lightbulb, color: "text-amber-500 border-amber-500/30 bg-amber-500/10" },
  { value: "update_existing", label: "Update Existing", Icon: RefreshCw, color: "text-blue-500 border-blue-500/30 bg-blue-500/10" },
  { value: "bug_report", label: "Bug Report", Icon: Bug, color: "text-red-500 border-red-500/30 bg-red-500/10" },
];

const STATUS_CONFIG = {
  open: { label: "Open", className: "text-amber-500 border-amber-500/30 bg-amber-500/10" },
  in_progress: { label: "In Progress", className: "text-blue-500 border-blue-500/30 bg-blue-500/10" },
  resolved: { label: "Resolved", className: "text-green-500 border-green-500/30 bg-green-500/10" },
  closed: { label: "Closed", className: "text-muted-foreground border-border bg-muted" },
};

/**
 * VersionUpdates — a single global list of version update requests.
 *
 * Modes:
 *  - project-scoped: `project` is provided → new requests are pre-tagged with
 *    this project, but the list still shows ALL requests across every project.
 *  - global (dashboard): `project` is null → new requests show a project
 *    selector so the user can optionally tag a related project.
 */
export default function VersionUpdates({ project, currentUser, projects }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [requestType, setRequestType] = useState("feature_request");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(project?.id || "");
  const fileInputRef = useRef(null);

  const isProjectScoped = !!project;

  // Build a lookup of project id → name for displaying the related-project badge
  const projectNameMap = useMemo(() => {
    const map = {};
    (projects || []).forEach((p) => { map[p.id] = p.name; });
    return map;
  }, [projects]);

  const loadRequests = () => {
    setLoading(true);
    // submitted_by_name (denormalized in Base44) is dropped — join system_user
    // for display instead.
    supabase
      .from('version_update')
      .select('*, system_user(full_name)')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => setRequests(data || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRequests();
  }, []);

  // Keep the form's selected project in sync when the project prop changes
  useEffect(() => {
    setSelectedProjectId(project?.id || "");
  }, [project?.id]);

  const resetForm = () => {
    setRequestType("feature_request");
    setTitle("");
    setDescription("");
    setScreenshotUrl("");
    setSelectedProjectId(project?.id || "");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleScreenshotUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.includes("png")) {
      alert("Only PNG files are allowed.");
      return;
    }
    setUploadingScreenshot(true);
    try {
      const { file_url } = await uploadFile({ file });
      setScreenshotUrl(file_url);
    } catch {
      alert("Failed to upload screenshot.");
    } finally {
      setUploadingScreenshot(false);
    }
  };

  const handleRemoveScreenshot = () => {
    setScreenshotUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from('version_update').insert({
      project_id: selectedProjectId || null,
      request_type: requestType,
      title: title.trim(),
      description: description.trim(),
      screenshot_url: screenshotUrl || null,
      submitted_by_id: currentUser?.id || null,
      status: "open",
    });
    setSubmitting(false);
    if (error) {
      alert("Failed to submit request.");
      return;
    }
    resetForm();
    setShowForm(false);
    loadRequests();
  };

  const handleStatusChange = async (requestId, newStatus) => {
    await supabase.from('version_update').update({ status: newStatus }).eq('id', requestId);
    loadRequests();
  };

  const handleDelete = async (requestId) => {
    await supabase.from('version_update').delete().eq('id', requestId);
    loadRequests();
  };

  const isAdmin = currentUser?.user_type === "Admin";

  const headerSubtitle = isProjectScoped
    ? `Request new features, suggest updates, or report bugs. New requests will be tagged as related to ${project.name}.`
    : "Request new features, suggest updates, or report bugs across all projects.";

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Version Updates</h1>
            <p className="text-sm text-muted-foreground mt-1">{headerSubtitle}</p>
          </div>
          <Button onClick={() => setShowForm((v) => !v)} className="gap-2">
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? "Cancel" : "New Request"}
          </Button>
        </div>

        {/* New Request Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="space-y-2">
              <Label>Request Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {REQUEST_TYPES.map(({ value, label, Icon, color }) => (
                  <button
                    key={value}
                    onClick={() => setRequestType(value)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      requestType === value
                        ? color
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                Related Project
                {!isProjectScoped && <span className="text-muted-foreground/50 text-xs ml-1">(optional)</span>}
              </Label>
              {isProjectScoped ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-sm">
                  <FolderOpen className="w-4 h-4 text-primary" />
                  <span className="font-medium">{project.name}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedProjectId("")}
                    className="ml-auto text-muted-foreground hover:text-foreground"
                    title="Remove project association"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">— No specific project —</option>
                  {(projects || []).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Title <span className="text-muted-foreground/50 text-xs">(optional)</span></Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief summary of your request..."
              />
            </div>

            <div className="space-y-2">
              <Label>Description <span className="text-red-500">*</span></Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the feature, update, or bug in detail..."
                rows={5}
              />
            </div>

            {/* Screenshot Upload */}
            <div className="space-y-2">
              <Label>Screenshot <span className="text-muted-foreground/50 text-xs">(optional, PNG only)</span></Label>
              {screenshotUrl ? (
                <div className="relative inline-block">
                  <img src={screenshotUrl} alt="Screenshot" className="max-h-48 rounded-lg border border-border" />
                  <button
                    onClick={handleRemoveScreenshot}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg hover:bg-destructive/90"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingScreenshot}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {uploadingScreenshot ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {uploadingScreenshot ? "Uploading..." : "Upload PNG Screenshot"}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png"
                onChange={handleScreenshotUpload}
                className="hidden"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={!description.trim() || submitting} className="gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Request
              </Button>
            </div>
          </div>
        )}

        {/* Requests List */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <Lightbulb className="w-7 h-7 text-muted-foreground/70" />
            </div>
            <p className="text-sm text-muted-foreground">No version update requests yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Click "New Request" to submit one.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => {
              const typeConfig = REQUEST_TYPES.find((r) => r.value === req.request_type);
              const statusConfig = STATUS_CONFIG[req.status] || STATUS_CONFIG.open;
              const TypeIcon = typeConfig?.Icon || Lightbulb;
              const relatedProjectName = req.project_id ? projectNameMap[req.project_id] : null;
              const isHighlighted = isProjectScoped && req.project_id === project?.id;
              return (
                <div key={req.id} className={`bg-card border rounded-xl p-4 space-y-3 transition-colors ${isHighlighted ? "border-primary/40 ring-1 ring-primary/20" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border ${typeConfig?.color || "border-border bg-muted"}`}>
                        <TypeIcon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {req.title && (
                          <h3 className="font-semibold text-foreground text-sm">{req.title}</h3>
                        )}
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-0.5">{req.description}</p>
                        {req.screenshot_url && (
                          <a href={req.screenshot_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-2">
                            <img src={req.screenshot_url} alt="Screenshot" className="max-h-32 rounded-lg border border-border" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={statusConfig.className}>
                        {statusConfig.label}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" />
                        {typeConfig?.label || req.request_type}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(req.created_at).toLocaleString()}
                      </span>
                      {req.system_user?.full_name && (
                        <span>by {req.system_user.full_name}</span>
                      )}
                      {relatedProjectName && (
                        <span className="flex items-center gap-1 text-primary">
                          <FolderOpen className="w-3 h-3" />
                          {relatedProjectName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <select
                          value={req.status}
                          onChange={(e) => handleStatusChange(req.id, e.target.value)}
                          className="h-7 text-xs rounded-md border border-input bg-transparent px-2"
                        >
                          {Object.entries(STATUS_CONFIG).map(([value, cfg]) => (
                            <option key={value} value={value}>{cfg.label}</option>
                          ))}
                        </select>
                      )}
                      {(isAdmin || req.submitted_by_id === currentUser?.id) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500"
                          onClick={() => handleDelete(req.id)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}