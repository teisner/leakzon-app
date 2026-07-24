import React, { useState, useEffect, useRef } from "react";
import { X, Trash2, Check } from "lucide-react";

export default function CustomerModeCommentEditor({ comment, onSave, onDelete, onClose }) {
  const [text, setText] = useState(comment?.text || "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSave = () => {
    onSave(comment.id, text.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (!text.trim()) {
        onDelete(comment.id);
      } else {
        onClose();
      }
    }
  };

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[2000] w-[300px]">
      <div className="bg-zinc-700/95 backdrop-blur rounded-lg shadow-xl border border-border p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-foreground/90">Comment</p>
          <button onClick={onClose} className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your comment..."
          rows={3}
          className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
        <div className="flex items-center justify-between mt-2">
          <button
            onClick={() => onDelete(comment.id)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1 px-3 py-1 rounded text-xs font-medium text-white bg-primary hover:bg-primary/90 transition-colors"
          >
            <Check className="w-3 h-3" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}