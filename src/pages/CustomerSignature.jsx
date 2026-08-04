import React, { useState, useRef, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { jsPDF } from "jspdf";
import { invokeFunction } from "@/api/functionsClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Alphabetical, "Other" always last. "Badger Meter" (not "Budger") is the
// real manufacturer name.
const PROVIDER_OPTIONS = [
  "Badger Meter", "Itron", "Kamstrup", "Master Meter", "Neptune", "Sensus", "Zenner USA",
];

const INTRO_TEXT =
  "To complete your onboarding, LeakZon needs read access to your account on your meter provider's " +
  "platform. This lets us pull your meter inventory, consumption readings, and account records so we " +
  "can build your network model and detect leaks. We access only the data linked to your utility's " +
  "account, and we never modify or delete anything on the provider's system.";

function consentText(orgName, providerPlatform) {
  const org = orgName || "[Organization Name]";
  const provider = providerPlatform || "[Meter Provider Platform]";
  return [
    `I confirm that I am authorized to act on behalf of ${org}, and I hereby grant LeakZon Ltd. ` +
      `permission to access and retrieve customer, meter, and consumption data associated with our ` +
      `account on ${provider}, for the purposes of onboarding, data analysis, and ongoing leak-detection ` +
      `services.`,
    "I understand this authorization remains in effect until I revoke it in writing, and that LeakZon " +
      "will handle this data in accordance with its Privacy Policy and our service agreement.",
  ];
}

// Splits text into {text, highlight} runs around (case-insensitive)
// occurrences of `term`, so the meter provider's name can be visually called
// out wherever it appears in the consent copy — on the page and in the PDF.
function splitHighlight(text, term) {
  if (!term) return [{ text, highlight: false }];
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escaped})`, "gi");
  return text.split(re).filter(Boolean).map((chunk) => ({
    text: chunk,
    highlight: chunk.toLowerCase() === term.toLowerCase(),
  }));
}

function HighlightedText({ text, term }) {
  return splitHighlight(text, term).map((part, i) =>
    part.highlight ? (
      <strong key={i} className="text-primary font-semibold">
        {part.text}
      </strong>
    ) : (
      <React.Fragment key={i}>{part.text}</React.Fragment>
    )
  );
}

// Draws a paragraph in the PDF with `term` bolded/colored wherever it occurs
// (wrapping-aware: splitTextToSize wraps first, then each line is drawn run
// by run so the highlight survives the wrap). Returns the y position after.
function drawParagraphWithHighlight(doc, text, x, y, maxWidth, term) {
  const lines = doc.splitTextToSize(text, maxWidth);
  for (const line of lines) {
    let cursorX = x;
    for (const part of splitHighlight(line, term)) {
      doc.setFont("helvetica", part.highlight ? "bold" : "normal");
      if (part.highlight) doc.setTextColor(21, 101, 192);
      doc.text(part.text, cursorX, y);
      cursorX += doc.getTextWidth(part.text);
      doc.setTextColor(0);
    }
    y += 14;
  }
  doc.setFont("helvetica", "normal");
  return y;
}

// This is a formal document the customer signs — always light mode, frames
// every screen state (loading/error/signed/form) the same way, regardless of
// the app's own theme.
function PageFrame({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-100 p-4 sm:p-8">
      <div className="w-full max-w-2xl border border-neutral-300 rounded-lg bg-white p-6 sm:p-10">
        {children}
      </div>
    </div>
  );
}

// Loads the full LeakZon logo (icon + wordmark) as an <img> jsPDF can embed
// directly.
function loadLogo() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/leakzon-logo-full.png";
  });
}

// Meter Data Permission Request: the customer names their meter provider,
// their organization, and the person authorizing access, then signs.
// Submitting generates a PDF granting LeakZon permission to access that
// provider's meter data (via website/API) — basic data, consumption,
// locations, and any other relevant meter data.
export default function CustomerSignature() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // providerName is the single value used everywhere (form validity, PDF,
  // submission) — the dropdown and the "Other" text field both just write
  // into it.
  const [providerName, setProviderName] = useState("");
  const [providerSelection, setProviderSelection] = useState("");
  const [customProviderName, setCustomProviderName] = useState("");
  const [customerOfficialName, setCustomerOfficialName] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [signerPhone, setSignerPhone] = useState("");

  const handleProviderSelect = (value) => {
    setProviderSelection(value);
    setProviderName(value === "Other" ? customProviderName : value);
  };

  const handleCustomProviderChange = (value) => {
    setCustomProviderName(value);
    setProviderName(value);
  };

  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  // This page is a formal document the customer signs — always light mode,
  // regardless of the project's/app's theme. A plain one-shot removal isn't
  // enough: on a fresh page load ThemeProvider (an ancestor, so its mount
  // effect fires AFTER this one — React runs child effects before parent
  // effects) defaults to dark and re-adds the class right after this runs,
  // leaving the page stuck in dark mode. The observer strips it back off
  // for the lifetime of this page instead of racing it once.
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    root.classList.remove("dark");
    const observer = new MutationObserver(() => {
      if (root.classList.contains("dark")) root.classList.remove("dark");
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      if (hadDark) root.classList.add("dark");
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await invokeFunction("manageCustomerSignature", {
          action: "load", project_id: projectId, token,
        });
        if (res.data?.error) setError(res.data.error);
        else setProjectName(res.data?.project?.name || "");
      } catch (err) {
        setError(err?.response?.data?.error || err?.message || "Failed to load.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId, token]);

  useEffect(() => {
    if (loading || error) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, [loading, error]);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    const { x, y } = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => {
    drawingRef.current = false;
  };

  const handleClear = () => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    setHasDrawn(false);
  };

  const formValid =
    providerName.trim() &&
    customerOfficialName.trim() &&
    signerName.trim() &&
    signerTitle.trim() &&
    signerPhone.trim() &&
    hasDrawn;

  const buildPdf = async (signatureDataUrl) => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const margin = 56;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const textWidth = pageWidth - margin * 2;
    const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

    // Letterhead: logo top-left, a divider under it, then the date right-
    // aligned below the divider.
    const logo = await loadLogo();
    let y = margin;
    if (logo) {
      const logoW = 130;
      const logoH = (logo.naturalHeight / logo.naturalWidth) * logoW;
      doc.addImage(logo, "PNG", margin, y, logoW, logoH);
      y += logoH;
    } else {
      y += 40;
    }
    y += 14;
    doc.setDrawColor(180);
    doc.line(margin, y, pageWidth - margin, y);
    y += 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Date: ${today}`, pageWidth - margin, y, { align: "right" });
    doc.setTextColor(0);
    y += 30;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Authorization to Access Meter Provider Data", pageWidth / 2, y, { align: "center" });
    y += 34;

    // Addressee block: "To <PROVIDER, all caps>" above the "To whom it may
    // concern," salutation, letter-style.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`To ${providerName.toUpperCase()}`, margin, y);
    y += 20;
    doc.setFont("helvetica", "normal");
    doc.text("To whom it may concern,", margin, y);
    y += 26;

    doc.setFontSize(10.5);
    let lines = doc.splitTextToSize(INTRO_TEXT, textWidth);
    doc.text(lines, margin, y);
    y += lines.length * 14 + 18;

    const [consentPara1, consentPara2] = consentText(customerOfficialName, providerName);
    y = drawParagraphWithHighlight(doc, consentPara1, margin, y, textWidth, providerName || "[Meter Provider Platform]");
    y += 14;
    lines = doc.splitTextToSize(consentPara2, textWidth);
    doc.text(lines, margin, y);
    y += lines.length * 14 + 14;
    y += 10;

    if (projectName) {
      doc.text(`Project: ${projectName}`, margin, y);
      y += 20;
    }

    doc.addImage(signatureDataUrl, "PNG", margin, y, 200, 88);
    y += 100;
    doc.setDrawColor(150);
    doc.line(margin, y, margin + 260, y);
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.text(signerName, margin, y);
    y += 15;
    doc.setFont("helvetica", "normal");
    doc.text(signerTitle, margin, y);
    y += 15;
    doc.text(`Phone: ${signerPhone}`, margin, y);

    // Footer: divider near the bottom, "Confidential" centered under it.
    const footerLineY = pageHeight - 56;
    doc.setDrawColor(180);
    doc.line(margin, footerLineY, pageWidth - margin, footerLineY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("Confidential", pageWidth / 2, footerLineY + 18, { align: "center" });
    doc.setTextColor(0);

    return doc;
  };

  const handleSubmit = async () => {
    if (!formValid) return;
    setSubmitting(true);
    try {
      const signatureDataUrl = canvasRef.current.toDataURL("image/png");
      const doc = await buildPdf(signatureDataUrl);
      const pdfDataUrl = doc.output("datauristring");

      const res = await invokeFunction("manageCustomerSignature", {
        action: "submit",
        project_id: projectId,
        token,
        provider_name: providerName.trim(),
        customer_official_name: customerOfficialName.trim(),
        signer_name: signerName.trim(),
        signer_title: signerTitle.trim(),
        signer_phone: signerPhone.trim(),
        signature_data: signatureDataUrl,
        pdf_data: pdfDataUrl,
      });
      if (res.data?.error) {
        setError(res.data.error);
      } else {
        doc.save(`meter-data-authorization-${providerName.trim().replace(/\s+/g, "-")}.pdf`);
        setSigned(true);
      }
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageFrame>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
        </div>
      </PageFrame>
    );
  }

  if (error) {
    return (
      <PageFrame>
        <div className="flex flex-col items-center justify-center gap-3 text-center py-10">
          <AlertCircle className="w-8 h-8 text-red-500" />
          <p className="text-sm text-neutral-600">{error}</p>
        </div>
      </PageFrame>
    );
  }

  if (signed) {
    return (
      <PageFrame>
        <div className="flex flex-col items-center justify-center gap-3 text-center py-10">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
          <p className="text-sm font-medium">Authorization submitted. A copy of the PDF was downloaded. Thank you.</p>
        </div>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
    <div className="flex flex-col items-center gap-5">
      <div className="w-full max-w-md text-center">
        <img src="/leakzon-logo-full.png" alt="LeakZon" className="h-10 w-auto mx-auto mb-3" />
        <h1 className="text-lg font-semibold">Authorization to Access Meter Provider Data</h1>
        {projectName && <p className="text-sm text-muted-foreground mt-1">{projectName}</p>}
        <p className="text-xs text-muted-foreground mt-3 text-left leading-relaxed">{INTRO_TEXT}</p>
      </div>

      <div className="w-full max-w-md text-xs text-muted-foreground leading-relaxed space-y-2 text-left border-y border-border py-3">
        {consentText(customerOfficialName, providerName).map((para, i) => (
          <p key={i}>
            <HighlightedText text={para} term={providerName || "[Meter Provider Platform]"} />
          </p>
        ))}
      </div>

      <div className="w-full max-w-md space-y-3">
        <div>
          <Label className="text-xs">Organization Name</Label>
          <Input value={customerOfficialName} onChange={(e) => setCustomerOfficialName(e.target.value)} placeholder="e.g. City of Obion" />
        </div>
        <div>
          <Label className="text-xs">Meter Provider Platform</Label>
          <Select value={providerSelection} onValueChange={handleProviderSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Select a provider" />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
          {providerSelection === "Other" && (
            <Input
              className="mt-2"
              value={customProviderName}
              onChange={(e) => handleCustomProviderChange(e.target.value)}
              placeholder="Provider name"
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Authorized person's name</Label>
            <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Full name" />
          </div>
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} placeholder="e.g. Utility Director" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Phone number</Label>
          <Input value={signerPhone} onChange={(e) => setSignerPhone(e.target.value)} placeholder="e.g. (555) 123-4567" />
        </div>
      </div>

      <div className="w-full max-w-md">
        <Label className="text-xs">Signature</Label>
        <canvas
          ref={canvasRef}
          width={440}
          height={180}
          className="border border-border rounded-md touch-none bg-white w-full"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={handleClear} disabled={submitting}>
          Clear
        </Button>
        <Button onClick={handleSubmit} disabled={!formValid || submitting}>
          {submitting ? "Submitting..." : "Sign & Submit"}
        </Button>
      </div>
    </div>
    </PageFrame>
  );
}
