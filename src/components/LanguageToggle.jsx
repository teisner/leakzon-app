import React from "react";
import { useLanguage } from "@/lib/i18n";

export default function LanguageToggle() {
  const { lang, setLang } = useLanguage();
  const nextLang = lang === "en" ? "he" : "en";
  const flag = lang === "en" ? "🇺🇸" : "🇮🇱";
  return (
    <button
      onClick={() => setLang(nextLang)}
      title={nextLang === "en" ? "English" : "עברית"}
      className="h-9 w-9 rounded-xl inline-flex items-center justify-center text-lg hover:bg-accent transition-colors"
    >
      {flag}
    </button>
  );
}