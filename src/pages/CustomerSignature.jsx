import React, { useState, useRef, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { jsPDF } from "jspdf";
import { invokeFunction } from "@/api/functionsClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Meter Data Permission Request: the customer names the meter provider,
// their own official name, and the person authorizing access, then draws a
// signature. Submitting generates a PDF granting LeakZon permission to
// access that provider's meter data (via website/API) — basic data,
// consumption, locations, and any other relevant meter data.
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
    providerName.trim() && customerOfficialName.trim() && signerName.trim() && signerTitle.trim() && hasDrawn;

  const buildPdf = (signatureDataUrl) => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const margin = 56;
    const pageWidth = doc.internal.pageSize.getWidth();
    const textWidth = pageWidth - margin * 2;
    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Meter Data Access Permission", margin, y);
    y += 28;

    const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const body =
      `I, ${signerName}, ${signerTitle}, being duly authorized on behalf of ` +
      `${customerOfficialName}, hereby grant LeakZon permission to access meter ` +
      `data maintained by ${providerName}, via that provider's website and/or ` +
      `API, for the purpose of exporting and reading meter data, including but ` +
      `not limited to basic meter information, consumption data, meter ` +
      `locations, and any other relevant meter data.`;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(body, textWidth);
    doc.text(lines, margin, y);
    y += lines.length * 15 + 30;

    if (projectName) {
      doc.text(`Project: ${projectName}`, margin, y);
      y += 20;
    }
    doc.text(`Date: ${today}`, margin, y);
    y += 40;

    doc.addImage(signatureDataUrl, "PNG", margin, y, 200, 88);
    y += 100;
    doc.setDrawColor(150);
    doc.line(margin, y, margin + 250, y);
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.text(signerName, margin, y);
    y += 15;
    doc.setFont("helvetica", "normal");
    doc.text(signerTitle, margin, y);

    return doc;
  };

  const handleSubmit = async () => {
    if (!formValid) return;
    setSubmitting(true);
    try {
      const signatureDataUrl = canvasRef.current.toDataURL("image/png");
      const doc = buildPdf(signatureDataUrl);
      const pdfDataUrl = doc.output("datauristring");

      const res = await invokeFunction("manageCustomerSignature", {
        action: "submit",
        project_id: projectId,
        token,
        provider_name: providerName.trim(),
        customer_official_name: customerOfficialName.trim(),
        signer_name: signerName.trim(),
        signer_title: signerTitle.trim(),
        signature_data: signatureDataUrl,
        pdf_data: pdfDataUrl,
      });
      if (res.data?.error) {
        setError(res.data.error);
      } else {
        doc.save(`meter-data-permission-${providerName.trim().replace(/\s+/g, "-")}.pdf`);
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
        <p className="text-sm font-medium">Permission submitted. A copy of the PDF was downloaded. Thank you.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-4 py-10">
      <div className="w-full max-w-md text-center">
        <h1 className="text-lg font-semibold">Meter Data Permission Request</h1>
        {projectName && <p className="text-sm text-muted-foreground mt-1">{projectName}</p>}
        <p className="text-xs text-muted-foreground mt-2">
          This grants LeakZon permission to access your meter provider's data — basic meter info, consumption,
          locations, and other relevant meter data — via the provider's website or API.
        </p>
      </div>

      <div className="w-full max-w-md space-y-3">
        <div>
          <Label className="text-xs">Meter provider company name</Label>
          <Input value={providerName} onChange={(e) => setProviderName(e.target.value)} placeholder="e.g. Acme Water Metering" />
        </div>
        <div>
          <Label className="text-xs">Customer official name</Label>
          <Input value={customerOfficialName} onChange={(e) => setCustomerOfficialName(e.target.value)} placeholder="e.g. City of Obion" />
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
