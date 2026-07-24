import React, { useState, useEffect } from "react";
import { Clock, CalendarClock } from "lucide-react";

export default function LinkCountdown({ expiresAt }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!expiresAt) return null;

  const expiry = new Date(expiresAt).getTime();
  const diff = expiry - now;

  if (diff <= 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#92c141" }}>
        <Clock className="w-3.5 h-3.5" />
        <span>Expired</span>
      </div>
    );
  }

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  const countdown = [
    days > 0 ? `${days}d` : null,
    `${String(hours).padStart(2, "0")}h`,
    `${String(minutes).padStart(2, "0")}m`,
    `${String(seconds).padStart(2, "0")}s`,
  ].filter(Boolean).join(" ");

  const expiryDate = new Date(expiresAt);
  const dateStr = expiryDate.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = expiryDate.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col items-end gap-0.5 shrink-0">
      <div className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "#92c141" }}>
        <Clock className="w-4 h-4" />
        <span className="tabular-nums">{countdown}</span>
      </div>
      <div className="flex items-center gap-1 text-[10px] font-medium" style={{ color: "#92c141" }}>
        <CalendarClock className="w-3 h-3" />
        <span>{dateStr} · {timeStr}</span>
      </div>
    </div>
  );
}