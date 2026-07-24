import React, { useMemo, useState, useEffect } from "react";
import { AlertTriangle, ArrowRight, BookOpen, Calculator, Check, Copy, Droplets, Info, List, Minus, Plus } from "lucide-react";
import { buildNetworkStory, buildNetworkNarrative, getNetworkStoryNoDataText } from "@/lib/networkStory";
import { useLanguage } from "@/lib/i18n";

const ICONS = {
  overview: Droplets,
  flow: ArrowRight,
  detail: List,
  calc: Calculator,
  warning: AlertTriangle,
};

export default function NetworkStory({ nodes, links, dmas, meters, meterCounts }) {
  const { lang, t } = useLanguage();
  const [fontScale, setFontScale] = useState(1);
  const [copied, setCopied] = useState(false);
  const [storyStyle, setStoryStyle] = useState("informative"); // "informative" | "story"

  const sections = useMemo(
    () => buildNetworkStory(nodes, links, dmas, meters, meterCounts, lang),
    [nodes, links, dmas, meters, meterCounts, lang]
  );

  const narrative = useMemo(
    () => buildNetworkNarrative(nodes, links, dmas, meters, meterCounts, lang),
    [nodes, links, dmas, meters, meterCounts, lang]
  );

  const handleCopy = () => {
    const text = storyStyle === "story"
      ? narrative.join("\n\n")
      : sections.map((s) => `${s.title}\n${s.lines.join("\n")}`).join("\n\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const fontSize = `${0.75 * fontScale}rem`;

  // Flatten all text to compute total characters for the typewriter effect
  const flatTexts = useMemo(() => {
    if (storyStyle === "story") return narrative;
    const items = [];
    for (const section of sections) {
      items.push(section.title);
      for (const line of section.lines) items.push(line);
    }
    return items;
  }, [sections, narrative, storyStyle]);

  const totalChars = flatTexts.reduce((sum, t) => sum + t.length, 0);
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    setCharCount(0);
    if (totalChars === 0) return;
    const speed = Math.max(8, Math.min(30, 2500 / totalChars));
    const interval = setInterval(() => {
      setCharCount((prev) => {
        if (prev >= totalChars) { clearInterval(interval); return prev; }
        return prev + 1;
      });
    }, speed);
    return () => clearInterval(interval);
  }, [flatTexts, totalChars]);

  // Distribute charCount across sections → visibleTitle + visibleLines
  const visibleSections = useMemo(() => {
    let remaining = charCount;
    return sections.map((section) => {
      const titleShow = Math.min(remaining, section.title.length);
      remaining -= titleShow;
      const visibleTitle = section.title.slice(0, titleShow);
      const visibleLines = [];
      for (const line of section.lines) {
        const lineShow = Math.min(remaining, line.length);
        remaining -= lineShow;
        if (lineShow > 0) visibleLines.push(line.slice(0, lineShow));
        if (lineShow < line.length) break;
      }
      return { ...section, visibleTitle, visibleLines };
    });
  }, [sections, charCount]);

  const isTyping = charCount < totalChars;

  // Distribute charCount across narrative paragraphs for story mode
  const visibleNarrative = useMemo(() => {
    if (storyStyle !== "story") return [];
    let remaining = charCount;
    return narrative
      .map((para) => {
        const show = Math.min(remaining, para.length);
        remaining -= show;
        return para.slice(0, show);
      })
      .filter((p) => p.length > 0);
  }, [narrative, charCount, storyStyle]);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 bg-card">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">{lang === 'he' ? 'סיפור הרשת' : 'Network Story'}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-md border border-border overflow-hidden" title="Toggle story style">
            <button
              onClick={() => setStoryStyle("informative")}
              className={`w-6 h-6 flex items-center justify-center transition-colors ${storyStyle === "informative" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              title="Informative style"
            >
              <List className="w-3 h-3" />
            </button>
            <button
              onClick={() => setStoryStyle("story")}
              className={`w-6 h-6 flex items-center justify-center transition-colors ${storyStyle === "story" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              title="Storytelling style"
            >
              <BookOpen className="w-3 h-3" />
            </button>
          </div>
          <button onClick={handleCopy} className="w-6 h-6 flex items-center justify-center rounded-md border border-border hover:bg-muted text-muted-foreground" title="Copy story text">
            {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
          </button>
          <button onClick={() => setFontScale((s) => Math.max(0.75, +(s - 0.15).toFixed(2)))} className="w-6 h-6 flex items-center justify-center rounded-md border border-border hover:bg-muted text-muted-foreground" title="Decrease font size">
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-[10px] text-muted-foreground min-w-[24px] text-center">{Math.round(fontScale * 100)}%</span>
          <button onClick={() => setFontScale((s) => Math.min(2.5, +(s + 0.15).toFixed(2)))} className="w-6 h-6 flex items-center justify-center rounded-md border border-border hover:bg-muted text-muted-foreground" title="Increase font size">
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>
      {storyStyle === "story" ? (
        visibleNarrative.length === 0 ? (
          <p className="text-muted-foreground" style={{ fontSize }}>{getNetworkStoryNoDataText(lang)}</p>
        ) : (
          <div className="space-y-3 text-muted-foreground leading-relaxed" style={{ fontSize }}>
            {visibleNarrative.map((para, i) => {
              const isLast = i === visibleNarrative.length - 1;
              return (
                <p key={i}>
                  {para}
                  {isTyping && isLast && <span className="typewriter-cursor" />}
                </p>
              );
            })}
          </div>
        )
      ) : (
        <>
          {visibleSections.length === 0 && (
            <p className="text-muted-foreground" style={{ fontSize }}>{getNetworkStoryNoDataText(lang)}</p>
          )}
          {visibleSections.map((section, idx) => {
            const Icon = ICONS[section.icon] || Info;
            const isWarning = section.icon === "warning";
            if (!section.visibleTitle) return null;

            const sectionFullyTyped =
              section.visibleTitle === section.title &&
              section.visibleLines.length === section.lines.length &&
              section.visibleLines.every((vl, i) => vl === section.lines[i]);
            const isTypingSection = isTyping && !sectionFullyTyped;
            const titleCursor = isTypingSection && section.visibleTitle.length < section.title.length;

            return (
              <div key={idx} className="space-y-1.5">
                <h4 className="font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5" style={{ fontSize }}>
                  <Icon className={`w-3 h-3 ${isWarning ? "text-amber-500" : "text-primary"}`} />
                  {section.visibleTitle}
                  {titleCursor && <span className="typewriter-cursor" />}
                </h4>
                <ul className="space-y-1 text-muted-foreground pl-4 leading-relaxed" style={{ fontSize }}>
                  {section.visibleLines.map((line, i) => {
                    const isLast = i === section.visibleLines.length - 1;
                    const lineCursor = isTypingSection && !titleCursor && isLast;
                    return (
                      <li key={i} className={section.lines[i]?.startsWith("⚠") ? "text-amber-600" : ""}>
                        {line}
                        {lineCursor && <span className="typewriter-cursor" />}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}