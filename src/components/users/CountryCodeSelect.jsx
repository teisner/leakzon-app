import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Search } from "lucide-react";
import { COUNTRY_CODES, isoToFlag } from "@/lib/countryCodes";

export default function CountryCodeSelect({ value, onChange, className }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  const selected = COUNTRY_CODES.find((c) => c.iso === value) || COUNTRY_CODES.find((c) => c.iso === "IL");

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = search
    ? COUNTRY_CODES.filter((c) =>
        c.country.toLowerCase().includes(search.toLowerCase()) ||
        c.code.includes(search)
      )
    : COUNTRY_CODES;

  return (
    <div className={`relative ${className || ""}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent transition-colors whitespace-nowrap"
      >
        <span className="text-base leading-none">{isoToFlag(selected.iso)}</span>
        <span className="text-slate-700 font-medium">+{selected.code}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-white rounded-lg shadow-xl border border-slate-200 max-h-64 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country..."
                className="w-full pl-7 pr-2 py-1.5 text-sm rounded-md border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.map((c) => (
              <button
                key={`${c.iso}-${c.code}`}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                  setSearch("");
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors ${
                  selected.iso === c.iso ? "bg-blue-50" : ""
                }`}
              >
                <span className="text-base">{isoToFlag(c.iso)}</span>
                <span className="flex-1 truncate text-slate-700">{c.country}</span>
                <span className="text-slate-400 text-xs">+{c.code}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-sm text-slate-400 text-center">No countries found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}