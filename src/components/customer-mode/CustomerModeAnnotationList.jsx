import React, { useState, useRef, useEffect } from "react";
import { ArrowUpRight, Pencil, MessageSquare, Trash2, ChevronDown, Check, X } from "lucide-react";
import CustomerModeAnnotationTools from "./CustomerModeAnnotationTools";

export default function CustomerModeAnnotationList({ annotations, onDeleteAnnotation, onFocusAnnotation, onRenameAnnotation, onEditComment, mode, setMode }) {
  const [minimized, setMinimized] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const getIcon = (type) => {
    if (type === "comment") return MessageSquare;
    if (type === "arrow") return ArrowUpRight;
    return Pencil;
  };

  const getLabel = (a) => {
    if (a.type === "comment") return a.text || "Untitled comment";
    if (a.type === "arrow") return a.title || "Arrow";
    return a.title || "Drawing";
  };

  const startRenaming = (a) => {
    setRenamingId(a.id);
    setRenameValue(a.title || "");
  };

  const confirmRename = () => {
    if (renamingId && onRenameAnnotation) {
      onRenameAnnotation(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <div className="absolute bottom-3 right-3 z-[1000]">
      <div className="bg-zinc-800 rounded-xl shadow-2xl border-2 border-primary/50 p-3 w-[260px] ring-1 ring-primary/20">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-white flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Annotations ({annotations.length})
          </p>
          <button
            onClick={() => setMinimized((v) => !v)}
            className="p-0.5 rounded text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ChevronDown
              className="w-3.5 h-3.5 transition-transform duration-300"
              style={{ transform: minimized ? "rotate(-90deg)" : "rotate(0deg)" }}
            />
          </button>
        </div>

        <div className="mb-2">
          <CustomerModeAnnotationTools mode={mode} setMode={setMode} />
        </div>

        {!minimized && (
          <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
            {annotations.length === 0 && (
              <p className="text-xs text-zinc-400 py-2">No annotations yet</p>
            )}
            {annotations.map((a) => {
              const Icon = getIcon(a.type);
              const isRenaming = renamingId === a.id;
              const canRename = !!onRenameAnnotation;
              return (
                <div key={a.id} className="flex items-center gap-2 text-xs text-zinc-300">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: a.color || "#3b82f6" }} />
                  <Icon className="w-3 h-3 shrink-0" />
                  <div className="flex-1 min-w-0">
                    {isRenaming ? (
                      <div className="flex items-center gap-1">
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); confirmRename(); }
                            if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
                          }}
                          placeholder={a.type === "arrow" ? "Arrow title..." : "Drawing title..."}
                          className="flex w-full rounded border border-zinc-500 bg-zinc-900 px-1.5 py-0.5 text-xs text-white shadow-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                        />
                        <button onClick={confirmRename} className="p-0.5 rounded hover:bg-white/10 text-green-400 transition-colors" title="Confirm">
                          <Check className="w-3 h-3" />
                        </button>
                        <button onClick={cancelRename} className="p-0.5 rounded hover:bg-white/10 text-zinc-400 transition-colors" title="Cancel">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="cursor-pointer" onClick={() => onFocusAnnotation?.(a)}>
                        <p className="truncate font-medium text-white hover:text-primary transition-colors">{getLabel(a)}</p>
                      </div>
                    )}
                  </div>
                  {a.type === "comment" && onEditComment && !isRenaming && (
                    <button
                      onClick={() => onEditComment(a)}
                      className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors shrink-0"
                      title="Edit comment"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  {canRename && a.type !== "comment" && !isRenaming && (
                    <button
                      onClick={() => startRenaming(a)}
                      className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors shrink-0"
                      title="Rename"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  {!isRenaming && (
                    <button
                      onClick={() => onDeleteAnnotation(a.id)}
                      className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-red-400 transition-colors shrink-0"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}