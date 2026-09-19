"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import type { StatementIngestResponse } from "@/lib/types";

type Mode = "file" | "text";

export function StatementUploader() {
  const [mode, setMode] = useState<Mode>("file");
  const [pastedText, setPastedText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StatementIngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await api.postForm<StatementIngestResponse>("/api/ingestion/upload", form);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handlePasteSubmit() {
    if (!pastedText.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await api.post<StatementIngestResponse>("/api/ingestion/paste-text", {
        text: pastedText,
      });
      setResult(response);
      setPastedText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parsing failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setMode("file")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            mode === "file" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
          }`}
        >
          Upload file
        </button>
        <button
          onClick={() => setMode("text")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            mode === "text" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
          }`}
        >
          Paste text
        </button>
      </div>

      {mode === "file" ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileUpload(file);
          }}
          onClick={() => fileInputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-6 py-12 text-center hover:border-brand-400"
        >
          <p className="text-sm font-medium text-slate-700">
            Drop a PDF or CSV statement here, or click to browse
          </p>
          <p className="mt-1 text-xs text-slate-400">Max 15MB. Processed securely, never shared.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={10}
            placeholder="Paste statement text here, e.g.:&#10;09/01  NETFLIX.COM 866-579-7172   $15.49&#10;09/03  SPOTIFY USA               $11.99"
            className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <button
            onClick={handlePasteSubmit}
            disabled={busy || !pastedText.trim()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Parse text
          </button>
        </div>
      )}

      {busy && <p className="mt-4 text-sm text-slate-500">Parsing statement with AI...</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {result && (
        <div className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
          Found {result.transactions_found} recurring charge(s) and detected{" "}
          {result.subscriptions_detected} subscription(s).
        </div>
      )}
    </div>
  );
}
