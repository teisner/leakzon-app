import React, { useEffect, useState } from "react";

const SECONDS = 10;

// A small reward for whoever has been staring at a DMA boundary for an hour.
// Ctrl+Shift+C on the GIS map; closes itself after ten seconds.
export default function CoffeeBreak({ onDone }) {
  const [left, setLeft] = useState(SECONDS);

  useEffect(() => {
    const tick = setInterval(() => setLeft((n) => n - 1), 1000);
    const end = setTimeout(onDone, SECONDS * 1000);
    // Escape shouldn't be the only way out, but it shouldn't be blocked either.
    const onKey = (e) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(tick);
      clearTimeout(end);
      window.removeEventListener("keydown", onKey);
    };
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-10 py-8 shadow-2xl">
        <p className="text-base font-bold text-foreground">Brewing…</p>

        <div className="coffee-scene">
          {/* Steam — three wisps, offset so they don't rise in lockstep */}
          <span className="coffee-steam" style={{ left: 26, animationDelay: "0s" }} />
          <span className="coffee-steam" style={{ left: 40, animationDelay: "0.6s" }} />
          <span className="coffee-steam" style={{ left: 54, animationDelay: "1.2s" }} />

          {/* Drip from the filter into the cup */}
          <span className="coffee-drip" />

          {/* Cup */}
          <div className="coffee-cup">
            <div className="coffee-fill" />
          </div>
          <div className="coffee-handle" />
          <div className="coffee-saucer" />
        </div>

        <p className="text-sm text-muted-foreground">
          Take a break. Back in <span className="font-bold tabular-nums text-foreground">{Math.max(0, left)}</span>s
        </p>

        <button
          onClick={onDone}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          skip
        </button>
      </div>
    </div>
  );
}
