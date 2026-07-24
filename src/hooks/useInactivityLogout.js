import { useEffect, useRef } from "react";
import { supabase } from "@/api/supabaseClient";

const INACTIVITY_LIMIT = 24 * 60 * 60 * 1000; // 24 hours
const ACTIVITY_KEY = "lastActivityTime";
const USER_KEY = "loggedInUser";
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const THROTTLE_MS = 60 * 1000; // update at most once per minute
const EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"];

export function useInactivityLogout(enabled = true) {
  const throttleRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    const checkAndLogout = () => {
      const last = Number(localStorage.getItem(ACTIVITY_KEY) || 0);
      if (last && Date.now() - last > INACTIVITY_LIMIT) {
        supabase.auth.signOut();
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(ACTIVITY_KEY);
        window.location.href = "/";
      }
    };

    // On mount: if already past the limit, log out immediately
    checkAndLogout();

    // Seed timestamp if none exists yet
    if (!localStorage.getItem(ACTIVITY_KEY)) {
      localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    }

    const updateActivity = () => {
      if (throttleRef.current) return;
      throttleRef.current = setTimeout(() => {
        localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
        throttleRef.current = null;
      }, THROTTLE_MS);
    };

    EVENTS.forEach((evt) =>
      window.addEventListener(evt, updateActivity, { passive: true })
    );

    const interval = setInterval(checkAndLogout, CHECK_INTERVAL);

    return () => {
      EVENTS.forEach((evt) =>
        window.removeEventListener(evt, updateActivity)
      );
      clearInterval(interval);
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, [enabled]);
}