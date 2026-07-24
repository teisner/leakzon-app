import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/api/supabaseClient";
import { ChevronsUpDown, Check } from "lucide-react";

/**
 * Combobox-style input for parent project names.
 * Suggests existing parent project names from the DB, but also allows typing a new one.
 */
export default function ParentProjectInput({ value, onChange, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    supabase
      .from('project')
      .select('parent_project_name')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        const names = (data || [])
          .map((p) => p.parent_project_name)
          .filter((n) => n && n.trim());
        setSuggestions([...new Set(names)].sort((a, b) => a.localeCompare(b)));
      });
  }, []);

  const filtered = suggestions.filter((s) =>
    s.toLowerCase().includes((value || "").toLowerCase())
  );

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectValue = (val) => {
    onChange(val);
    setOpen(false);
    setHighlight(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      if (filtered.length > 0) setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && open && highlight >= 0) {
      e.preventDefault();
      selectValue(filtered[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        value={value || ""}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlight(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />
      <ChevronsUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
          {filtered.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selectValue(s); }}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full flex items-center justify-between px-3 py-1.5 text-sm text-left transition-colors ${highlight === i ? "bg-accent text-accent-foreground" : "text-popover-foreground hover:bg-accent"}`}
            >
              <span>{s}</span>
              {value && s.toLowerCase() === value.trim().toLowerCase() && <Check className="w-3.5 h-3.5 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}