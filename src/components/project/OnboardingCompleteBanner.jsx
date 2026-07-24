import React, { useEffect } from "react";
import confetti from "canvas-confetti";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OnboardingCompleteBanner({ show, onClose }) {
  useEffect(() => {
    if (!show) return;

    const duration = 4000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"],
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"],
      });
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    // Initial burst
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"],
    });

    frame();

    const timer = setTimeout(() => {
      onClose?.();
    }, 6000);

    return () => clearTimeout(timer);
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative bg-white rounded-3xl shadow-2xl px-12 py-10 max-w-md mx-4 text-center animate-[scaleIn_0.4s_ease-out]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="w-12 h-12 text-emerald-500" />
        </div>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          Your onboarding is completed
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          All project data has been locked. You can manage this from the project dashboard.
        </p>

        <Button onClick={onClose} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl px-8">
          Done
        </Button>
      </div>

      <style>{`
        @keyframes scaleIn {
          from { transform: scale(0.7); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}