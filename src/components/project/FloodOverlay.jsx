import React, { useEffect, useMemo, useRef, useState } from "react";
import { createTank, stepTank, spriteTransform } from "@/lib/aquarium";

// Seconds of rising water before the tank is full and the fish arrive.
const FILL_SECONDS = 8;

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
      {/* gill slits, behind the jaw so an open mouth isn't drawn over */}
      <path d="M32 20v10M37 19v12M42 20v10" stroke="#42606f" strokeWidth="1.6" />
      {/* Jaw. The group is flat against the mouth line at rest and is opened by
          scaling it down from that line, so nothing shows when it is shut —
          --gape is written by the animation loop, 0 to 1. */}
      <g className="flood-jaw">
        <path d="M46 26 6 26 38 45Z" fill="#2b1420" />
        <path d="M6 26 38 45" stroke="#4a6675" strokeWidth="5" strokeLinecap="round" fill="none" />
      </g>
      {/* Upper teeth stay put; they just appear as the mouth opens. */}
      <g className="flood-teeth">
        <path d="M13 26l3 6 3-6ZM22 26l3 6 3-6ZM31 26l3 6 3-6ZM40 26l2.5 5 2.5-5Z" fill="#f4f8fa" />
      </g>
      <circle cx="20" cy="23" r="2.8" fill="#0b2b3f" />
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

// Ctrl+Shift+F on the GIS map. Waves roll in, the screen fills, and the tank
// then comes alive. Runs until Escape — there is no timer, so it behaves like
// a screen saver.
//
// The overlay is pointer-events: none throughout. A screen saver that swallowed
// clicks could strand someone on a map they were mid-edit on if the key never
// registered; Escape is the way out, but the app is never actually blocked.
export default function FloodOverlay({ onDone }) {
  const [full, setFull] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    const filled = setTimeout(() => setFull(true), FILL_SECONDS * 1000);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(filled);
    };
  }, [onDone]);

  // The tank. Everything roams freely, fish bolt from sharks and sharks eat
  // them, so positions come from a real update loop rather than keyframes.
  const bounds = useRef({ width: window.innerWidth, height: window.innerHeight });
  const entities = useMemo(() => createTank(bounds.current), []);
  const nodes = useRef({});
  const [chomps, setChomps] = useState([]);

  useEffect(() => {
    if (!full) return undefined;
    const onResize = () => {
      bounds.current = { width: window.innerWidth, height: window.innerHeight };
    };
    window.addEventListener("resize", onResize);

    let frame = 0;
    let last = performance.now();
    const started = last;
    const tick = (now) => {
      // Clamped, so a backgrounded tab doesn't teleport everything on return.
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const eaten = stepTank(entities, dt, bounds.current, now - started);
      for (const e of entities) {
        const node = nodes.current[e.id];
        if (!node) continue;
        node.style.transform = spriteTransform(e, e.kind === "turtle");
        node.style.opacity = e.hiddenUntil ? "0" : "1";
        if (e.kind === "shark") node.style.setProperty("--gape", e.gape.toFixed(3));
      }
      if (eaten.length) {
        setChomps((prev) => [
          ...prev.slice(-4),
          ...eaten.map((hit) => ({ key: `${hit.id}-${now}`, x: hit.x, y: hit.y })),
        ]);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [full, entities]);

  return (
    <div className="fixed inset-0 z-[11000] pointer-events-none overflow-hidden">
      {/* Water body — rises, then stays. */}
      <div className="flood-body">
        <div className="flood-wave flood-wave-back" />
        <div className="flood-wave flood-wave-front" />
        <div className="flood-water">
          {/* Drifting caustics and a slow swell, so the water itself keeps
              moving once the surface has stopped climbing. */}
          <span className="flood-caustics" />
          <span className="flood-caustics flood-caustics-slow" />
          <span className="flood-current" />
        </div>
      </div>

      {/* Bubbles, once there is water to rise through. Negative delays for the
          same reason as the fish: a column already rising, not one starting. */}
      {full && [8, 19, 31, 44, 57, 68, 79, 91].map((left, i) => (
        <span
          key={left}
          className="flood-bubble"
          style={{
            left: `${left}%`,
            animationDelay: `-${(i * 0.9).toFixed(1)}s`,
            animationDuration: `${6 + (i % 4) * 1.8}s`,
            width: 5 + (i % 3) * 5,
            height: 5 + (i % 3) * 5,
          }}
        />
      ))}

      {full && entities.map((e) => (
        <span
          key={e.id}
          ref={(node) => { nodes.current[e.id] = node; }}
          className="flood-swimmer"
        >
          {e.kind === "fish" && <Fish color={e.color} size={e.size} />}
          {e.kind === "shark" && <Shark size={e.size} />}
          {e.kind === "turtle" && <Turtle size={e.size} />}
        </span>
      ))}

      {/* Where a fish just went. */}
      {chomps.map((c) => (
        <span key={c.key} className="flood-chomp" style={{ left: c.x, top: c.y }} />
      ))}

      <p className="flood-hint">Press Esc</p>
    </div>
  );
}
