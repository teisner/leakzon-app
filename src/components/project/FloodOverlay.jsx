import React, { useEffect, useState } from "react";

// The pipe cracks, then water pours out of it, then the screen fills.
const BURST_MS = 1400;   // crack and first spray, before the water gets going
const FILL_SECONDS = 9;  // rising water, from the burst until the tank is full

function Fish({ color = "#f9a825", size = 26 }) {
  return (
    <svg viewBox="0 0 64 32" width={size * 2} height={size} aria-hidden="true">
      <path d="M40 16c0 7-8 12-18 12S4 23 4 16 12 4 22 4s18 5 18 12Z" fill={color} />
      <path d="M40 16l18-11v22L40 16Z" fill={color} opacity="0.85" />
      <path d="M22 5c3 3 3 8 0 11" stroke={color} strokeWidth="2" fill="none" opacity="0.6" />
      <circle cx="14" cy="14" r="2.4" fill="#0b2b3f" />
    </svg>
  );
}

function Shark({ size = 54 }) {
  return (
    <svg viewBox="0 0 120 48" width={size * 2.4} height={size} aria-hidden="true">
      <path d="M78 26c0 9-16 15-34 15S6 35 6 26 22 12 44 12s34 5 34 14Z" fill="#5b7a8c" />
      <path d="M78 26l36-14-10 14 10 14-36-14Z" fill="#4a6675" />
      {/* dorsal fin */}
      <path d="M44 12 52 0l8 13Z" fill="#4a6675" />
      <path d="M30 38 24 48l14-6Z" fill="#4a6675" />
      <circle cx="20" cy="23" r="2.8" fill="#0b2b3f" />
      {/* gill slits */}
      <path d="M32 20v10M37 19v12M42 20v10" stroke="#42606f" strokeWidth="1.6" />
    </svg>
  );
}

function Turtle({ size = 40 }) {
  return (
    <svg viewBox="0 0 80 48" width={size * 1.7} height={size} aria-hidden="true">
      <ellipse cx="38" cy="26" rx="26" ry="17" fill="#2f7d5d" />
      <ellipse cx="38" cy="26" rx="19" ry="12" fill="#3f9b73" />
      <path d="M38 14v24M26 20l24 12M50 20 26 32" stroke="#2b6b50" strokeWidth="1.6" />
      {/* head and flippers */}
      <ellipse cx="68" cy="24" rx="9" ry="7" fill="#3f9b73" />
      <circle cx="72" cy="22" r="1.9" fill="#0b2b3f" />
      <path d="M20 12c-8-4-14-2-16 2 4 3 10 4 16 1Z" fill="#3f9b73" />
      <path d="M20 40c-8 4-14 2-16-2 4-3 10-4 16-1Z" fill="#3f9b73" />
    </svg>
  );
}

// Ctrl+Shift+F on the GIS map. The thickest main on screen bursts, the water
// pours out of it and fills the screen, and the tank then comes alive.
// Runs until Escape — there is no timer, so it behaves like a screen saver.
//
// The overlay is pointer-events: none throughout. A screen saver that swallowed
// clicks could strand someone on a map they were mid-edit on if the key never
// registered; Escape is the way out, but the app is never actually blocked.
//
// `map` and `origin` are optional: a project with no pipe layer loaded has
// nothing to burst, so the water simply rises from the bottom instead.
export default function FloodOverlay({ onDone, map, origin }) {
  const [phase, setPhase] = useState(origin ? "burst" : "rising");
  const [full, setFull] = useState(false);
  // Where on screen the pipe is. Recomputed as the map moves, so the jet stays
  // on the pipe while the fly-to zoom is still settling.
  const [point, setPoint] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  useEffect(() => {
    if (!origin) return undefined;
    const gush = setTimeout(() => setPhase("rising"), BURST_MS);
    return () => clearTimeout(gush);
  }, [origin]);

  useEffect(() => {
    if (phase !== "rising") return undefined;
    const filled = setTimeout(() => setFull(true), FILL_SECONDS * 1000);
    return () => clearTimeout(filled);
  }, [phase]);

  useEffect(() => {
    if (!map || !origin) return undefined;
    const update = () => {
      const container = map.getContainer();
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const p = map.latLngToContainerPoint([origin.lat, origin.lng]);
      setPoint({ x: rect.left + p.x, y: rect.top + p.y });
    };
    update();
    map.on("move zoom viewreset", update);
    return () => map.off("move zoom viewreset", update);
  }, [map, origin]);

  // Spread out so they don't swim in formation.
  const fish = [
    { top: "22%", color: "#f9a825", size: 22, dur: 17, delay: 0.5, dir: "rtl" },
    { top: "38%", color: "#ef6c54", size: 30, dur: 23, delay: 3, dir: "ltr" },
    { top: "55%", color: "#ffd166", size: 18, dur: 14, delay: 1.8, dir: "rtl" },
    { top: "68%", color: "#4dd0e1", size: 26, dur: 20, delay: 6, dir: "ltr" },
    { top: "80%", color: "#f48fb1", size: 20, dur: 26, delay: 9, dir: "rtl" },
    { top: "47%", color: "#aed581", size: 16, dur: 12, delay: 12, dir: "ltr" },
  ];

  // Jets fan out across the upper half — a pressurised main sprays up and out,
  // not down into the ground.
  const jets = [-150, -125, -100, -75, -55, -30, -5];

  return (
    <div className="fixed inset-0 z-[11000] pointer-events-none overflow-hidden">
      {/* The break itself, pinned to the pipe on the map. */}
      {point && (
        <div className="flood-burst" style={{ left: point.x, top: point.y }}>
          <span className="flood-shock" />
          <span className="flood-shock flood-shock-late" />
          {jets.map((angle, i) => (
            <span
              key={angle}
              className="flood-jet"
              style={{
                // Angle rides on a custom property: the keyframes need to
                // rotate AND stretch the jet, and a `scale` property alongside
                // an inline `transform` would scale in the parent's axes
                // instead of the jet's own.
                "--jet-angle": `${angle}deg`,
                animationDelay: `${i * 0.09}s`,
                height: 90 + (i % 3) * 55,
              }}
            />
          ))}
          {/* Spray that keeps coming while the water is still rising. */}
          <span className="flood-plume" />
        </div>
      )}

      {/* Water body — rises, then stays. */}
      {phase === "rising" && (
        <div className="flood-body">
          <div className="flood-wave flood-wave-back" />
          <div className="flood-wave flood-wave-front" />
          <div className="flood-water">
            {/* Two drifting caustic layers, so the water itself keeps moving
                once the surface has stopped climbing. */}
            <span className="flood-caustics" />
            <span className="flood-caustics flood-caustics-slow" />
            <span className="flood-current" />
          </div>
        </div>
      )}

      {/* Bubbles, once there is water to rise through. */}
      {full && [8, 19, 31, 44, 57, 68, 79, 91].map((left, i) => (
        <span
          key={left}
          className="flood-bubble"
          style={{
            left: `${left}%`,
            animationDelay: `${i * 1.3}s`,
            animationDuration: `${6 + (i % 4) * 1.8}s`,
            width: 5 + (i % 3) * 5,
            height: 5 + (i % 3) * 5,
          }}
        />
      ))}

      {full && (
        <>
          {fish.map((f, i) => (
            <span
              key={i}
              className={`flood-swimmer ${f.dir === "ltr" ? "flood-swim-ltr" : "flood-swim-rtl"}`}
              style={{ top: f.top, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s` }}
            >
              <Fish color={f.color} size={f.size} />
            </span>
          ))}

          {/* Occasional visitors — long durations with big delays, so they
              cross now and then rather than circling constantly. */}
          <span className="flood-swimmer flood-swim-rtl" style={{ top: "30%", animationDuration: "34s", animationDelay: "10s" }}>
            <Shark />
          </span>
          <span className="flood-swimmer flood-swim-ltr" style={{ top: "72%", animationDuration: "46s", animationDelay: "24s" }}>
            <Turtle />
          </span>
        </>
      )}

      {origin && (
        <p className="flood-label">
          Burst main — {origin.label}
          {origin.layerName ? ` · ${origin.layerName}` : ""}
        </p>
      )}
      <p className="flood-hint">Press Esc</p>
    </div>
  );
}
