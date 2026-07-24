import React from "react";
import { ArrowUpRight, Pencil, MessageSquare, X } from "lucide-react";

export const ANNOTATION_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6",
  "#a855f7", "#ec4899", "#000000", "#ffffff",
];

export default function CustomerModeAnnotationTools({ mode, setMode }) {
  const tools = [
    { key: "comment", label: "Comment", sub: "Note", Icon: MessageSquare },
    { key: "arrow", label: "Arrow", sub: "Arrow", Icon: ArrowUpRight },
    { key: "draw", label: "Draw", sub: "Drawing", Icon: Pencil },
  ];

  return (
    <div className="w-full">
      <div className="grid grid-cols-3 gap-1.5">
        {tools.map(({ key, sub, Icon }) => {
          const active = mode === key;
          return (
            <button
              key={key}
              onClick={() => setMode(active ? null : key)}
              className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg border transition-all ${
                active
                  ? "bg-primary text-white border-primary shadow-md scale-[1.03]"
                  : "bg-zinc-700 text-zinc-200 border-zinc-600 hover:bg-zinc-600 hover:border-primary/40"
              }`}
              title={sub}
            >
              <Icon className="w-6 h-6" />
              <span className="text-[10px] font-semibold leading-none">{sub}</span>
            </button>
          );
        })}
      </div>

      {mode && (
        <button
          onClick={() => setMode(null)}
          className="mt-1.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-white bg-destructive hover:bg-destructive/90 transition-colors"
          title="Done"
        >
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
      )}
    </div>
  );
}