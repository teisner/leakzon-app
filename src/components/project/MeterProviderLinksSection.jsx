import React, { useState, useEffect, useCallback } from "react";
import { Link2, ExternalLink, Plus, Pencil, Trash2, Eye, EyeOff, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/api/supabaseClient";
import { useToast } from "@/components/ui/use-toast";

const MAX_LINKS = 10;
const EMPTY_FORM = { description: "", url: "", username: "", password: "" };

export default function MeterProviderLinksSection({ projectId }) {
  const { toast } = useToast();
  const [links, setLinks] = useState([]);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {...link} = edit
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [linkToDelete, setLinkToDelete] = useState(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("project_external_link")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setLinks(data || []);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditing({});
  };

  const openEdit = (link) => {
    setForm({
      description: link.description || "",
      url: link.url || "",
      username: link.username || "",
      password: link.password || "",
    });
    setEditing(link);
  };

  const closeDialog = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.description.trim() || !form.url.trim()) return;
    setSaving(true);
    const payload = {
      project_id: projectId,
      description: form.description.trim(),
      url: form.url.trim(),
      username: form.username.trim() || null,
      password: form.password || null,
    };
    const isNew = !editing?.id;
    const { error } = isNew
      ? await supabase.from("project_external_link").insert(payload)
      : await supabase.from("project_external_link").update(payload).eq("id", editing.id);
    setSaving(false);
    if (error) {
      toast({ variant: "destructive", title: "Failed to save", description: error.message });
      return;
    }
    toast({ title: isNew ? "Link added" : "Link updated" });
    closeDialog();
    load();
  };

  const handleDelete = async () => {
    if (!linkToDelete) return;
    const { error } = await supabase.from("project_external_link").delete().eq("id", linkToDelete.id);
    if (error) {
      toast({ variant: "destructive", title: "Failed to delete", description: error.message });
    } else {
      setLinks((prev) => prev.filter((l) => l.id !== linkToDelete.id));
      toast({ title: "Link deleted" });
    }
    setLinkToDelete(null);
  };

  const handleOpen = (link) => {
    window.open(link.url, "_blank", "noopener,noreferrer");
  };

  const handleCopy = async (value, label) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast({ title: `${label} copied` });
  };

  const togglePasswordVisible = (id) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const atLimit = links.length >= MAX_LINKS;

  return (
    <div className="py-4 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-foreground">
          Meter Provider Access Links ({links.length}/{MAX_LINKS})
        </p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={openAdd} disabled={atLimit}>
          <Plus className="w-3.5 h-3.5" /> Add Link
        </Button>
      </div>

      {links.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No links yet — e.g. the meter provider's own portal login.
        </p>
      ) : (
        <div className="space-y-2">
          {links.map((link) => (
            <div key={link.id} className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <p className="text-xs font-medium text-foreground truncate">{link.description}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleOpen(link)}>
                    <ExternalLink className="w-3.5 h-3.5" /> Open
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(link)} title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-500 hover:text-red-600"
                    onClick={() => setLinkToDelete(link)}
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              {(link.username || link.password) && (
                <div className="mt-1.5 pl-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  {link.username && (
                    <button
                      type="button"
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => handleCopy(link.username, "Username")}
                      title="Copy username"
                    >
                      User: <span className="font-mono">{link.username}</span>
                      <Copy className="w-3 h-3" />
                    </button>
                  )}
                  {link.password && (
                    <span className="flex items-center gap-1">
                      Pass:{" "}
                      <span className="font-mono">
                        {visiblePasswords[link.id] ? link.password : "•".repeat(Math.min(link.password.length, 10))}
                      </span>
                      <button
                        type="button"
                        className="hover:text-foreground"
                        onClick={() => togglePasswordVisible(link.id)}
                        title={visiblePasswords[link.id] ? "Hide password" : "Show password"}
                      >
                        {visiblePasswords[link.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                      <button
                        type="button"
                        className="hover:text-foreground"
                        onClick={() => handleCopy(link.password, "Password")}
                        title="Copy password"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Link" : "Add Link"}</DialogTitle>
            <DialogDescription>
              A meter provider portal or other external access this project needs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Badger Meter portal"
              />
            </div>
            <div>
              <Label className="text-xs">URL</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Username</Label>
                <Input
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Password</Label>
                <Input
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.description.trim() || !form.url.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!linkToDelete} onOpenChange={(open) => !open && setLinkToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this link?</AlertDialogTitle>
            <AlertDialogDescription>
              {linkToDelete && <>This removes <strong>{linkToDelete.description}</strong> for good.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
