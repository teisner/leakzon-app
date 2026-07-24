import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Trash2, Loader2, Inbox, FileText } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useToast } from "@/components/ui/use-toast";

export default function ImportLogsView({ open, onOpenChange, projectId, onCleared }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [clearing, setClearing] = useState(false);
  const { toast } = useToast();

  const loadLogs = () => {
    setLoading(true);
    supabase
      .from('import_log')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setLogs(data || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open && projectId) loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const handleClearAll = async () => {
    setClearing(true);
    const { error } = await supabase.from('import_log').delete().eq('project_id', projectId);
    if (error) {
      toast({ title: "Failed to clear logs", description: error.message, variant: "destructive" });
    } else {
      setLogs([]);
      onCleared?.();
      toast({ title: "Error logs cleared", description: "All import error logs have been removed." });
    }
    setClearing(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[82vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Import Error Log
            {logs.length > 0 && (
              <Badge variant="destructive" className="text-xs">{logs.length}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-slate-500">
            Unmatched UIDs from consumption data uploads.
          </p>
          {logs.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleClearAll} disabled={clearing} className="gap-1.5 text-red-600 hover:text-red-700 h-7">
              {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Clear All
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 max-h-[55vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Inbox className="w-12 h-12 mb-3 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">No error logs</p>
              <p className="text-xs text-slate-400 mt-1">Unmatched UIDs from consumption uploads will appear here.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {logs.map((log) => {
                const isOpen = expanded === log.id;
                const rowData = log.row_data || null;
                return (
                  <div key={log.id} className="border border-slate-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpanded(isOpen ? null : log.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
                    >
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-medium text-slate-900 truncate">{log.uid_value || "—"}</span>
                          <span className="text-xs text-slate-400">{log.error_message}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <FileText className="w-3 h-3 text-slate-400" />
                          <span className="text-[10px] text-slate-400 truncate">{log.source_file_name || "—"}</span>
                          {log.created_at && (
                            <span className="text-[10px] text-slate-400">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    {isOpen && rowData && (
                      <div className="border-t border-slate-100 bg-slate-50/50 p-3">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Row Data</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          {Object.entries(rowData).map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <span className="text-slate-400 font-medium shrink-0">{k}:</span>
                              <span className="text-slate-700 truncate">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}