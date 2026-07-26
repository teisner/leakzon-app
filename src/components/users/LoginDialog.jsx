import React, { useState } from "react";
import { Dialog, DialogPortal, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, Lock, Mail, KeyRound, CheckCircle2, ArrowLeft, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useLanguage } from "@/lib/i18n";
import { APP_VERSION } from "@/lib/version";

const BG_IMAGE = "/login-background.png";
const LOGO_URL = "/leakzon-logo-transparent.png";

const PinInput = ({ value, onChange, placeholder, autoFocus }) => (
  <Input
    type="password"
    inputMode="numeric"
    maxLength={6}
    value={value}
    onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
    placeholder={placeholder || "••••••"}
    className="text-center text-2xl tracking-[0.5em] font-mono"
    autoFocus={autoFocus}
  />
);

export default function LoginDialog({ open, onOpenChange, onLoginSuccess }) {
  const { t } = useLanguage();
  const [step, setStep] = useState("username"); // username → setPassword | enterPassword → forgot → reset → success
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [userName, setUserName] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [infoMessage, setInfoMessage] = useState(null);

  const reset = () => {
    setStep("username");
    setIdentifier("");
    setPassword("");
    setConfirmPassword("");
    setTempPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setUserName("");
    setError(null);
    setInfoMessage(null);
  };

  const handleClose = (open) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const callAuth = async (payload) => {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-login`, {
      method: "POST",
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw { response: { data } };
    return data;
  };

  const handleCheckUser = async () => {
    setError(null);
    if (!identifier.trim()) {
      setError(t('login.enterUsername'));
      return;
    }
    setLoading(true);
    try {
      const data = await callAuth({ action: "check", identifier: identifier.trim() });
      setUserName(data.full_name);
      if (data.has_password) {
        setStep("enterPassword");
      } else {
        setStep("setPassword");
      }
    } catch (err) {
      setError(err.response?.data?.error || t('login.userNotFound'));
    }
    setLoading(false);
  };

  const handleLogin = async () => {
    setError(null);
    if (password.length !== 6) {
      setError(t('login.password6Digits'));
      return;
    }
    setLoading(true);
    try {
      const data = await callAuth({ action: "login", identifier: identifier.trim(), password });
      // Establish a real Supabase session so subsequent supabase-js calls are
      // authenticated and RLS can see this user (see custom_access_token_hook,
      // Phase 1) — auth-login mints this via the Admin API server-side.
      await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
      onLoginSuccess?.({ id: data.user_id, full_name: data.full_name, email: data.email, user_type: data.user_type });
    } catch (err) {
      setError(err.response?.data?.error || t('login.loginFailed'));
    }
    setLoading(false);
  };

  const handleSetPassword = async () => {
    setError(null);
    if (password.length !== 6) {
      setError(t('login.passwordExactly6'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('login.passwordsNoMatch'));
      return;
    }
    setLoading(true);
    try {
      const data = await callAuth({ action: "setPassword", identifier: identifier.trim(), password });
      // Same as the login path — without setSession there's no JWT, so RLS
      // treats the user as anonymous and they see an empty dashboard.
      if (data.access_token) {
        await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
      }
      onLoginSuccess?.({ id: data.user_id, full_name: data.full_name, email: data.email, user_type: data.user_type });
    } catch (err) {
      setError(err.response?.data?.error || t('login.setPasswordFailed'));
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    setError(null);
    setLoading(true);
    try {
      await callAuth({ action: "forgotPassword", identifier: identifier.trim() });
      setInfoMessage(t('login.tempSent'));
      setStep("reset");
    } catch (err) {
      setError(err.response?.data?.error || t('login.tempSendFailed'));
    }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    setError(null);
    if (tempPassword.length !== 6) {
      setError(t('login.tempPassword6'));
      return;
    }
    if (newPassword.length !== 6) {
      setError(t('login.newPassword6'));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError(t('login.newPasswordsNoMatch'));
      return;
    }
    setLoading(true);
    try {
      const data = await callAuth({
        action: "resetPassword",
        identifier: identifier.trim(),
        tempPassword,
        newPassword,
      });
      // Same as the login path — without setSession there's no JWT, so RLS
      // treats the user as anonymous and they see an empty dashboard.
      if (data.access_token) {
        await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
      }
      onLoginSuccess?.({ id: data.user_id, full_name: data.full_name, email: data.email, user_type: data.user_type });
    } catch (err) {
      setError(err.response?.data?.error || t('login.resetFailed'));
    }
    setLoading(false);
  };

  const titles = {
    username: t('login.login'),
    setPassword: t('login.setPassword'),
    enterPassword: t('login.enterPassword'),
    forgot: t('login.forgotPassword'),
    reset: t('login.resetPassword'),
    success: t('login.welcome'),
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogPortal>
        {/* Background image overlay */}
        <div
          className="fixed inset-0 z-50 bg-cover bg-center"
          style={{ backgroundImage: `url(${BG_IMAGE})` }}
        >
          <div className="absolute inset-0 bg-black/45" />
        </div>

        {/* Logo */}
        <div className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-[calc(50%+220px)] flex flex-col items-center gap-2 pointer-events-none">
          <img src={LOGO_URL} alt="LeakZon" className="h-28 w-auto" />
          <p className="text-base font-medium tracking-[0.2em] text-white/90 uppercase">{t('login.platform')}</p>
        </div>

        {/* Login card */}
        <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-xl">
          <button
            onClick={() => handleClose(false)}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>

          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {step === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : (
                <Lock className="w-5 h-5 text-slate-600" />
              )}
              {titles[step]}
            </DialogTitle>
          </DialogHeader>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mt-4">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {infoMessage && !error && (
            <div className="flex items-start gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-3 mt-4">
              <Mail className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Step: Username */}
          {step === "username" && (
            <div className="space-y-4 mt-4">
              <div>
                <Label>{t('login.usernameOrEmail')}</Label>
                <Input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCheckUser()}
                  placeholder={t('login.enterUsernameOrEmail')}
                  className="mt-1.5"
                  autoFocus
                />
              </div>
              <Button onClick={handleCheckUser} disabled={loading} className="w-full gap-1.5">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('login.continue')}
              </Button>
            </div>
          )}

          {/* Step: Set Password (first time) */}
          {step === "setPassword" && (
            <div className="space-y-4 mt-4">
              <p className="text-sm text-slate-500">
                 {t('login.welcomeSet', { name: userName })}
               </p>
              <div>
                <Label>{t('login.sixDigitPassword')}</Label>
                <div className="mt-1.5">
                  <PinInput value={password} onChange={setPassword} autoFocus />
                </div>
                </div>
                <div>
                <Label>{t('login.confirmPassword')}</Label>
                <div className="mt-1.5">
                  <PinInput value={confirmPassword} onChange={setConfirmPassword} />
                </div>
              </div>
              <Button onClick={handleSetPassword} disabled={loading} className="w-full gap-1.5">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('login.setPasswordBtn')}
              </Button>
              <button
                onClick={() => { setStep("username"); setError(null); }}
                className="w-full text-xs text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" /> {t('login.back')}
              </button>
            </div>
          )}

          {/* Step: Enter Password */}
          {step === "enterPassword" && (
            <div className="space-y-4 mt-4">
              <p className="text-sm text-slate-500">
                 {t('login.welcomeBack', { name: userName })}
               </p>
              <div>
                <Label>{t('login.sixDigitPassword')}</Label>
                <div className="mt-1.5">
                  <PinInput value={password} onChange={setPassword} autoFocus />
                </div>
                </div>
                <Button onClick={handleLogin} disabled={loading} className="w-full gap-1.5">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('login.loginBtn')}
              </Button>
              <button
                onClick={() => { setStep("forgot"); setError(null); setInfoMessage(null); }}
                className="w-full text-xs text-blue-500 hover:text-blue-700 flex items-center justify-center gap-1"
              >
                <KeyRound className="w-3 h-3" /> {t('login.forgotPasswordQ')}
              </button>
            </div>
          )}

          {/* Step: Forgot Password */}
          {step === "forgot" && (
            <div className="space-y-4 mt-4">
              <p className="text-sm text-slate-500">
                 {t('login.forgotDesc', { identifier })}
               </p>
               <Button onClick={handleForgotPassword} disabled={loading} className="w-full gap-1.5">
                 {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                 {t('login.sendTempPassword')}
              </Button>
              <button
                onClick={() => { setStep("enterPassword"); setError(null); }}
                className="w-full text-xs text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" /> {t('login.backToLogin')}
              </button>
            </div>
          )}

          {/* Step: Reset Password */}
          {step === "reset" && (
            <div className="space-y-3 mt-4">
              <div>
                <Label>{t('login.tempPassword')}</Label>
                <div className="mt-1.5">
                  <PinInput value={tempPassword} onChange={setTempPassword} autoFocus />
                </div>
                </div>
                <div>
                <Label>{t('login.newPassword')}</Label>
                <div className="mt-1.5">
                  <PinInput value={newPassword} onChange={setNewPassword} />
                </div>
                </div>
                <div>
                <Label>{t('login.confirmNewPassword')}</Label>
                <div className="mt-1.5">
                  <PinInput value={confirmNewPassword} onChange={setConfirmNewPassword} />
                </div>
              </div>
              <Button onClick={handleResetPassword} disabled={loading} className="w-full gap-1.5">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('login.resetPasswordBtn')}
              </Button>
            </div>
          )}

          {/* Step: Success */}
          {step === "success" && (
            <div className="space-y-4 py-4 text-center mt-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <p className="text-sm text-slate-600">
                 {t('login.loggedInSuccess', { name: userName ? `, ${userName}` : "" })}
               </p>
               <DialogFooter>
                 <Button onClick={() => handleClose(false)} className="w-full">{t('login.done')}</Button>
              </DialogFooter>
            </div>
          )}

          {/* Footer for non-success steps */}
          {step !== "success" && step !== "username" && (
            <DialogFooter className="sm:justify-start mt-4">
              <p className="text-xs text-slate-400">{t('login.secureLogin')}</p>
            </DialogFooter>
          )}

          <p className="text-[10px] text-slate-400 tabular-nums text-right mt-3">
            Ver {APP_VERSION}
          </p>
        </div>
      </DialogPortal>
    </Dialog>
  );
}