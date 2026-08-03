import React, { useState, useRef, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { invokeFunction } from "@/api/functionsClient";
import { Button } from "@/components/ui/button";

// Quick test page: customer draws a signature on a canvas and submits it.
// Gated by the same customer_view_link token as the rest of the customer
// surface (see manageCustomerSignature Edge Function).
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

  const handleSubmit = async () => {
    if (!hasDrawn) return;
    setSubmitting(true);
    try {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      const res = await invokeFunction("manageCustomerSignature", {
        action: "submit", project_id: projectId, token, signature_data: dataUrl,
      });
      if (res.data?.error) setError(res.data.error);
      else setSigned(true);
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
        <p className="text-sm font-medium">Signature submitted. Thank you.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 py-8">
      <h1 className="text-lg font-semibold">
        {projectName ? `Please sign for ${projectName}` : "Please sign below"}
      </h1>
      <canvas
        ref={canvasRef}
        width={500}
        height={220}
        className="border border-border rounded-md touch-none bg-white"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <div className="flex gap-2">
        <Button variant="outline" onClick={handleClear} disabled={submitting}>
          Clear
        </Button>
        <Button onClick={handleSubmit} disabled={!hasDrawn || submitting}>
          {submitting ? "Submitting..." : "Submit Signature"}
        </Button>
      </div>
    </div>
  );
}
