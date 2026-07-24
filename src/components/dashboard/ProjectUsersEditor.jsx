import React, { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { UserPlus, X, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/lib/i18n";

export default function ProjectUsersEditor({ project, onChange }) {
  const { t } = useLanguage();
  const [projectUsers, setProjectUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");

  const assignedIds = project?.assigned_user_ids || [];

  const loadProjectUsers = () => {
    setLoading(true);
    supabase
      .from('system_user')
      .select('*')
      .eq('user_type', 'Project User')
      .order('full_name')
      .then(({ data }) => setProjectUsers(data || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProjectUsers();
  }, []);

  const assignedUsers = projectUsers.filter((u) => assignedIds.includes(u.id));
  const availableUsers = projectUsers.filter((u) => !assignedIds.includes(u.id));

  const handleAdd = () => {
    if (!selectedUserId) return;
    const newIds = [...assignedIds, selectedUserId];
    onChange?.(newIds);
    setSelectedUserId("");
  };

  const handleRemove = (userId) => {
    const newIds = assignedIds.filter((id) => id !== userId);
    onChange?.(newIds);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
        {t('editProject.projectUsers')}
      </div>
      <p className="text-xs text-slate-400 -mt-1">{t('editProject.projectUsersDesc')}</p>

      {/* Add user */}
      {availableUsers.length > 0 && (
        <div className="flex gap-2">
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder={t('editProject.selectUser')} />
            </SelectTrigger>
            <SelectContent>
              {availableUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.full_name} ({u.username})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={handleAdd}
            disabled={!selectedUserId}
            className="shrink-0 h-9 w-9 rounded-md border border-input bg-transparent hover:bg-accent inline-flex items-center justify-center disabled:opacity-50"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Assigned list */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('editProject.loadingUsers')}
        </div>
      ) : assignedUsers.length === 0 ? (
        <p className="text-xs text-slate-400">{t('editProject.noProjectUsers')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {assignedUsers.map((u) => (
            <Badge key={u.id} variant="outline" className="gap-1.5 text-teal-600 border-teal-200 bg-teal-50 pr-1.5">
              {u.full_name}
              <button
                onClick={() => handleRemove(u.id)}
                className="ml-0.5 rounded-full hover:bg-teal-100 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}