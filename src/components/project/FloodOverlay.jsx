import React, { useEffect } from "react";

// Rise, hold, drain — matches the CSS timings below.
const DURATION_MS = 15000;

// Ctrl+Shift+F on the GIS map. Deliberately does not block the map: the water
// is pointer-events: none throughout, so work carries on underneath it.
export default function FloodOverlay({ onDone }) {
  useEffect(() => {
    const end = setTimeout(onDone, DURATION_MS);
    const onKey = (e) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(end);
      window.removeEventListener("keydown", onKey);
    };
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-[11000] pointer-events-none overflow-hidden">
      <div className="flood-body">
        {/* Two wave layers drifting at different speeds so the surface never
            repeats visibly. */}
        <div className="flood-wave flood-wave-back" />
        <div className="flood-wave flood-wave-front" />
        <div className="flood-water" />
      </div>
      {/* A few bubbles rising through it. */}
      {[12, 28, 45, 63, 79, 91].map((left, i) => (
        <span
          key={left}
          className="flood-bubble"
          style={{ left: `${left}%`, animationDelay: `${2 + i * 1.4}s`, width: 6 + (i % 3) * 4, height: 6 + (i % 3) * 4 }}
        />
      ))}
    </div>
  );
}
