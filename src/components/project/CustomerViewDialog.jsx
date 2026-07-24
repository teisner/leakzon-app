import React, { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, ExternalLink, Ban, Plus, Check, Clock, Link2, CalendarPlus } from "lucide-react";
import { invokeFunction } from "@/api/functionsClient";
import { useToast } from "@/components/ui/use-toast";

export default function CustomerViewDialog({ open, onOpenChange, projectId, projectName }) {
  const { toast } = useToast();
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(7);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const loadLinks = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await invokeFunction("manageCustomerViewLinks", {
        action: "list",
        project_id: projectId,
      });
      setLinks(res.data?.links || []);
    } catch {
      /* skip */
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) loadLinks();
  }, [open, loadLinks]);

  const hasActiveLink = links.some((l) => l.is_valid);

  const buildUrl = (token) => {
    const origin = window.location.origin;
    return `${origin}/customer-mode/${projectId}?token=${token}`;
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await invokeFunction("manageCustomerViewLinks", {
        action: "create",
        project_id: projectId,
        days: parseInt(days),
      });
      if (res.data?.error) {
        toast({ variant: "destructive", title: "Cannot create link", description: res.data.error });
      } else if (res.data?.link) {
        toast({ title: "Link created", description: `Valid for ${days} days` });
        await loadLinks();
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to create link",
        description: err?.response?.data?.error || err?.message || "Unknown error",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleExtend = async (linkId) => {
    const addDays = Math.max(1, Math.min(365, parseInt(days) || 7));
    try {
      const res = await invokeFunction("manageCustomerViewLinks", {
        action: "extend",
        link_id: linkId,
        days: addDays,
      });
      if (res.data?.error) {
        toast({ variant: "destructive", title: "Cannot extend link", description: res.data.error });
      } else {
        toast({ title: "Link extended", description: `Added ${addDays} day${addDays === 1 ? "" : "s"}` });
        await loadLinks();
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to extend link", description: err?.response?.data?.error || err?.message });
    }
  };

  const handleDisable = async (linkId) => {
    try {
      await invokeFunction("manageCustomerViewLinks", {
        action: "disable",
        link_id: linkId,
      });
      toast({ title: "Link disabled" });
      await loadLinks();
    } catch {
      toast({ variant: "destructive", title: "Failed to disable link" });
    }
  };

  const handleCopy = async (link) => {
    const url = buildUrl(link.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(link.id);
      toast({ title: "Link copied to clipboard" });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({ variant: "destructive", title: "Failed to copy" });
    }
  };

  const handleOpen = (link) => {
    window.open(buildUrl(link.token), "_blank");
  };

  const formatDate = (iso) => {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" /> Customer View Links
          </DialogTitle>
          <DialogDescription>
            Create shareable links for "{projectName}". Each link has a limited validity period.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Create new link section */}
          <div className="flex items-end gap-2 p-3 rounded-lg border border-border bg-muted/30">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Days (create / extend)
              </label>
              <Input
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="h-9"
                disabled={creating}
              />
            </div>
            <Button
              onClick={handleCreate}
              disabled={hasActiveLink || creating || !days || days < 1}
              className="h-9"
            >
              {creating ? (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 animate-spin" /> Creating...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> Create Link
                </span>
              )}
            </Button>
          </div>

          {hasActiveLink && (
            <p className="text-xs text-amber-600 dark:text-amber-500 px-1">
              An active link already exists. Disable it before creating a new one.
            </p>
          )}

          {/* Links list */}
          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Clock className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : links.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Link2 className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No links created yet</p>
              </div>
            ) : (
              links.map((link) => {
                const expired = link.is_expired;
                const disabled = !link.is_active;
                const active = link.is_valid;
                return (
                  <div
                    key={link.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      active
                        ? "border-green-500/40 bg-green-500/5"
                        : "border-border bg-muted/20 opacity-75"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-foreground">
                          {active ? "Active" : disabled ? "Disabled" : "Expired"}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          active
                            ? "bg-green-500/15 text-green-600 dark:text-green-400"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {active ? `${Math.ceil((new Date(link.expires_at) - new Date()) / (1000 * 60 * 60 * 24))} days left` : "Inactive"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Expires {formatDate(link.expires_at)}
                      </p>
                      {link.created_by_name && (
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                          Created by {link.created_by_name}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {active && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => handleCopy(link)}
                            title="Copy link"
                          >
                            {copiedId === link.id ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => handleOpen(link)}
                            title="Open link"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {/* Extend is available for active and expired (not user-disabled) links */}
                      {!disabled && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-blue-600 hover:text-blue-700"
                          onClick={() => handleExtend(link.id)}
                          title={`Extend by ${days || 7} day${(parseInt(days) || 7) === 1 ? "" : "s"}${expired ? " (reactivates)" : ""}`}
                        >
                          <CalendarPlus className="w-4 h-4" />
                        </Button>
                      )}
                      {!disabled && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-500 hover:text-red-600"
                          onClick={() => handleDisable(link.id)}
                          title="Disable link"
                        >
                          <Ban className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}