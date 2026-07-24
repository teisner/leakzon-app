import React, { useState, useRef, useEffect } from "react";
import { Search, X, MapPin } from "lucide-react";

export default function MeterSearchBar({ meters, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    const q = query.toLowerCase();
    const matches = (meters || [])
      .filter((m) =>
        (m.uid && m.uid.toLowerCase().includes(q)) ||
        (m.address && m.address.toLowerCase().includes(q)) ||
        (m.payer_name && m.payer_name.toLowerCase().includes(q))
      )
      .slice(0, 8);
    setResults(matches);
    setOpen(true);
  }, [query, meters]);

  // When typing narrows to exactly one match, auto-highlight + zoom to it
  useEffect(() => {
    if (results.length === 1) {
      onSelect?.(results[0]);
    } else if (results.length === 0) {
      onSelect?.(null);
    }
  }, [results, onSelect]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (meter) => {
    setQuery(meter.uid);
    setOpen(false);
    onSelect?.(meter);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="absolute top-3 right-3 z-[1000] w-64">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search by UID, address or payer..."
          className="w-full h-9 pl-9 pr-8 rounded-lg border border-slate-200 bg-white/95 backdrop-blur shadow-sm text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 w-full bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden max-h-64 overflow-y-auto">
          {results.map((m) => (
            <button
              key={m.id}
              onClick={() => handleSelect(m)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
            >
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{m.uid}</p>
                {m.address && <p className="text-xs text-slate-400 truncate">{m.address}</p>}
              </div>
            </button>
          ))}
        </div>
      )}

      {open && query.trim() && results.length === 0 && (
        <div className="absolute top-full mt-1 w-full bg-white rounded-lg shadow-lg border border-slate-200 px-3 py-2 text-sm text-slate-400">
          No meters found
        </div>
      )}
    </div>
  );
}