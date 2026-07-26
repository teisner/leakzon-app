import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/api/supabaseClient";
import CountryCodeSelect from "@/components/users/CountryCodeSelect";
import { useLanguage } from "@/lib/i18n";

export default function UserDialog({ open, onOpenChange, user, currentUser, onSaved }) {
  const { t } = useLanguage();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryIso, setCountryIso] = useState("IL");
  const [countryCode, setCountryCode] = useState("972");
  const [username, setUsername] = useState("");
  const [userType, setUserType] = useState("LeakZon");
  // "" = All Countries. Stored as NULL so it reads as "no preference".
  const [preferredCountry, setPreferredCountry] = useState("");
  const [countries, setCountries] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const canChangeType = currentUser?.user_type === "Admin";

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || "");
      setEmail(user.email || "");
      setPhone(user.phone || "");
      setCountryIso(user.country_iso || "IL");
      setCountryCode(user.country_code || "972");
      setUsername(user.username || "");
      setUserType(user.user_type || "LeakZon");
      setPreferredCountry(user.preferred_country || "");
    } else {
      setFullName("");
      setEmail("");
      setPhone("");
      setCountryIso("IL");
      setCountryCode("972");
      setUsername("");
      setUserType("User");
      setPreferredCountry("");
    }
    setError(null);
  }, [user, open]);

  // The dashboard's country filter is built from the countries actually in use
  // by projects, so offer exactly those rather than a fixed world list.
  useEffect(() => {
    if (!open) return;
    supabase.from('project').select('country').then(({ data }) => {
      const list = [...new Set((data || []).map((p) => p.country).filter(Boolean))].sort();
      setCountries(list);
    });
  }, [open]);

  const handleCountryChange = (c) => {
    setCountryIso(c.iso);
    setCountryCode(c.code);
  };

  const handleSave = async () => {
    setError(null);
    if (!fullName.trim() || !email.trim() || !username.trim()) {
      setError(t('userDialog.requiredFields'));
      return;
    }
    setSaving(true);
    const data = {
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      country_code: countryCode,
      country_iso: countryIso,
      username: username.trim(),
      user_type: userType,
      preferred_country: preferredCountry || null,
    };
    const { error: saveError } = user
      ? await supabase.from('system_user').update(data).eq('id', user.id)
      : await supabase.from('system_user').insert(data);
    setSaving(false);
    if (saveError) {
      setError(saveError.message || t('userDialog.saveFailed'));
      return;
    }
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? t('userDialog.editUser') : t('userDialog.addUser')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <Label>{t('userDialog.fullName')}</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" className="mt-1.5" />
          </div>

          <div>
            <Label>{t('userDialog.email')}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@example.com" className="mt-1.5" />
          </div>

          <div>
            <Label>{t('userDialog.phone')}</Label>
            <div className="flex gap-2 mt-1.5">
              <CountryCodeSelect value={countryIso} onChange={handleCountryChange} className="shrink-0" />
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="501234567"
                className="flex-1"
              />
            </div>
          </div>

          <div>
            <Label>{t('userDialog.username')}</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="johndoe" className="mt-1.5" />
            {user && (
              <p className="text-xs text-muted-foreground mt-1">{t('userDialog.usernameNote')}</p>
            )}
          </div>

          <div>
            <Label>{t('userDialog.userType')}</Label>
            <Select value={userType} onValueChange={setUserType} disabled={!canChangeType}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LeakZon">LeakZon</SelectItem>
                <SelectItem value="Super User">Super User</SelectItem>
                <SelectItem value="Project User">Project User</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            {!canChangeType && (
              <p className="text-xs text-muted-foreground mt-1">{t('userDialog.userTypeNote')}</p>
            )}
          </div>

          <div>
            <Label>{t('userDialog.preferredCountry')}</Label>
            <Select value={preferredCountry || "__all__"} onValueChange={(v) => setPreferredCountry(v === "__all__" ? "" : v)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('userDialog.allCountries')}</SelectItem>
                {countries.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">{t('userDialog.preferredCountryNote')}</p>
          </div>

          {!user && (
            <div className="bg-blue-500/10 border border-blue-500/25 rounded-lg p-3">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {t('userDialog.firstLoginNote')}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('userDialog.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {user ? t('userDialog.saveChanges') : t('userDialog.addUserBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}