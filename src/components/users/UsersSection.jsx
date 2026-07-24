import React, { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Lock, LockOpen, Users as UsersIcon, Loader2 } from "lucide-react";
import { isoToFlag } from "@/lib/countryCodes";
import UserDialog from "@/components/users/UserDialog";
import { useLanguage } from "@/lib/i18n";

export default function UsersSection({ currentUser }) {
  const { t } = useLanguage();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);

  const isAdmin = currentUser?.user_type === "Admin";
  // Non-admins see only themselves in the list
  const visibleUsers = isAdmin ? users : users.filter((u) => u.id === currentUser?.id);
  const canEdit = (u) => isAdmin || currentUser?.id === u.id;
  // Only admins can delete users
  const canDelete = (u) => isAdmin && currentUser?.id !== u.id;

  const loadUsers = () => {
    setLoading(true);
    supabase
      .from('system_user')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setUsers(data || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleDelete = async () => {
    if (!deleteUser) return;
    const { error } = await supabase.from('system_user').delete().eq('id', deleteUser.id);
    if (error) {
      console.error("Failed to delete user:", error);
      return;
    }
    setDeleteUser(null);
    loadUsers();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UsersIcon className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-bold text-foreground">{t('users.title')}</h2>
          <span className="text-sm text-muted-foreground/70">({visibleUsers.length})</span>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowAdd(true)} className="gap-2 rounded-xl">
            <Plus className="w-4 h-4" /> {t('users.addUser')}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 text-muted-foreground/70 animate-spin" />
        </div>
      ) : visibleUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
            <UsersIcon className="w-7 h-7 text-muted-foreground/70" />
          </div>
          <p className="text-sm text-muted-foreground mb-3">{t('users.noUsers')}</p>
          {isAdmin && (
            <Button onClick={() => setShowAdd(true)} className="gap-2 rounded-xl">
              <Plus className="w-4 h-4" /> {t('users.addUser')}
                </Button>
              )}
              </div>
              ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted border-b border-border">
                  <th className="text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">{t('users.colName')}</th>
                  <th className="text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">{t('users.colEmail')}</th>
                  <th className="text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">{t('users.colPhone')}</th>
                  <th className="text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">{t('users.colUsername')}</th>
                  <th className="text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">{t('users.colType')}</th>
                  <th className="text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">{t('users.colPassword')}</th>
                  {isAdmin && (
                    <th className="text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">{t('users.colLastLogin')}</th>
                  )}
                  <th className="text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">{t('users.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{u.full_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-muted-foreground">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {u.phone ? (
                        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                          <span className="text-base leading-none">{isoToFlag(u.country_iso)}</span>
                          <span className="text-muted-foreground/70">+{u.country_code || "1"}</span>
                          <span>{u.phone}</span>
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-muted-foreground font-mono">{u.username}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={
                        u.user_type === "Admin" ? "gap-1 text-purple-600 border-purple-200 bg-purple-50"
                        : u.user_type === "Super User" ? "gap-1 text-blue-600 border-blue-200 bg-blue-50"
                        : u.user_type === "Project User" ? "gap-1 text-teal-600 border-teal-200 bg-teal-50"
                        : u.user_type === "LeakZon" ? "gap-1 text-blue-600 border-transparent bg-transparent"
                        : "gap-1 text-muted-foreground border-border bg-muted"
                      }>
                        {u.user_type || "LeakZon"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {u.password_hash ? (
                        <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200 bg-emerald-50">
                          <Lock className="w-3 h-3" /> {t('users.passwordSet')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-amber-600 border-amber-200 bg-amber-50">
                          <LockOpen className="w-3 h-3" /> {t('users.passwordNotSet')}
                        </Badge>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <p className="text-sm text-muted-foreground">{u.last_login ? new Date(u.last_login).toLocaleString() : t('users.never')}</p>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit(u) && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setEditUser(u)} title={t('users.editUser')}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {canDelete(u) && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => setDeleteUser(u)} title={t('users.deleteUser')}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteUser(null)}>
          <div className="bg-card rounded-xl shadow-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{t('users.deleteTitle')}</p>
                <p className="text-sm text-muted-foreground">{t('users.deleteWarning')}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {t('users.deleteConfirm', { name: deleteUser.full_name, username: deleteUser.username })}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteUser(null)}>{t('users.cancel')}</Button>
              <Button variant="destructive" onClick={handleDelete} className="gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> {t('users.delete')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <UserDialog
        open={showAdd || !!editUser}
        onOpenChange={(open) => { if (!open) { setShowAdd(false); setEditUser(null); } }}
        user={editUser}
        currentUser={currentUser}
        onSaved={loadUsers}
      />
    </div>
  );
}