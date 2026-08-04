import React, { useState, useRef, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { jsPDF } from "jspdf";
import { invokeFunction } from "@/api/functionsClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  const [providerName, setProviderName] = useState("");
  const [customerOfficialName, setCustomerOfficialName] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [signerPhone, setSignerPhone] = useState("");

  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

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
    const textWidth = pageWidth - margin * 2;
    const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

    const logo = await loadLogo();
    let y = margin;
    if (logo) {
      const logoW = 130;
      const logoH = (logo.naturalHeight / logo.naturalWidth) * logoW;
      doc.addImage(logo, "PNG", margin, y, logoW, logoH);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Date: ${today}`, pageWidth - margin, margin + 10, { align: "right" });
    doc.setTextColor(0);
    y += 60;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Authorization to Access Meter Provider Data", margin, y);
    y += 26;

    doc.setFont("helvetica", "normal");
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
        <CheckCircle2 className="w-8 h-8 text-green-500" />
        <p className="text-sm font-medium">Authorization submitted. A copy of the PDF was downloaded. Thank you.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-4 py-10">
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
          <Input value={providerName} onChange={(e) => setProviderName(e.target.value)} placeholder="e.g. Acme Water Metering" />
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
  );
}
