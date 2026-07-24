import React, { useState, useEffect } from "react";
import { invokeFunction } from "@/api/functionsClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Smartphone, Send, Loader2, CheckCircle2, Mail } from "lucide-react";

export default function MobileLocatorDialog({ open, onOpenChange, projectId, projectName }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [meterCount, setMeterCount] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setEmail("");
      setSent(false);
      setError(null);
      setMeterCount(null);
      invokeFunction("getUnlocatedMeters", { project_id: projectId })
        .then((res) => setMeterCount(res.data?.count ?? 0))
        .catch(() => {});
    }
  }, [open, projectId]);

  const handleSend = async () => {
    if (!email) return;
    setSending(true);
    setError(null);
    try {
      const res = await invokeFunction("sendMobileLocatorEmail", {
        project_id: projectId,
        email,
        origin: "https://ob.leakzon.app",
      });
      setSent(true);
      setMeterCount(res.data?.count ?? meterCount);
    } catch {
      setError("Failed to send email. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {!sent ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100">
                  <Smartphone className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <DialogTitle>Mobile Locator</DialogTitle>
                  <DialogDescription>
                    Send a link to a field technician
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {meterCount !== null && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3">
                  <Mail className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-sm text-amber-800">
                    <span className="font-bold">{meterCount}</span> meter
                    {meterCount !== 1 ? "s" : ""} need GPS location
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="ml-email">Technician Email</Label>
                <Input
                  id="ml-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="technician@example.com"
                  disabled={sending}
                />
                <p className="text-xs text-slate-500">
                  They'll receive a link to a mobile app for pinning meters on the map.
                </p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={sending}
              >
                Cancel
              </Button>
              <Button onClick={handleSend} disabled={sending || !email}>
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Send Link
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="flex flex-col items-center text-center py-6">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Email Sent!</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-xs">
              A link to the Mobile Locator has been sent to{" "}
              <span className="font-medium text-slate-700">{email}</span>.
            </p>
            {meterCount != null && (
              <p className="text-xs text-slate-400 mt-2">
                {meterCount} meter{meterCount !== 1 ? "s" : ""} to locate
              </p>
            )}
            <Button onClick={() => onOpenChange(false)} className="mt-4">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}