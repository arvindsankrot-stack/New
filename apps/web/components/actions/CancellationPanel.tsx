"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { GenerateCancellationResponse, Subscription } from "@/lib/types";

const METHODS: { value: string; label: string }[] = [
  { value: "email", label: "Cancellation email" },
  { value: "link", label: "Direct cancel link" },
  { value: "manual", label: "Step-by-step guide" },
];

export function CancellationPanel({ subscription }: { subscription: Subscription }) {
  const [method, setMethod] = useState("email");
  const [result, setResult] = useState<GenerateCancellationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate(selectedMethod: string) {
    setMethod(selectedMethod);
    setLoading(true);
    setCopied(false);
    try {
      const response = await api.post<GenerateCancellationResponse>("/api/actions/cancel", {
        subscription_id: subscription.id,
        method: selectedMethod,
      });
      setResult(response);
    } finally {
      setLoading(false);
    }
  }

  async function copyEmail() {
    if (!result?.email_body) return;
    await navigator.clipboard.writeText(`Subject: ${result.email_subject}\n\n${result.email_body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {METHODS.map((m) => (
          <button
            key={m.value}
            onClick={() => generate(m.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              method === m.value && result ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-slate-500">Generating...</p>}

      {!loading && result && method === "email" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Subject</p>
          <p className="mt-1 font-medium text-slate-900">{result.email_subject}</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Body</p>
          <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-700">
            {result.email_body}
          </pre>
          <button
            onClick={copyEmail}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {copied ? "Copied!" : "Copy email"}
          </button>
        </div>
      )}

      {!loading && result && method === "link" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          {result.cancel_url ? (
            <a
              href={result.cancel_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Open {subscription.vendor_name} cancellation page &rarr;
            </a>
          ) : (
            <p className="text-sm text-slate-500">
              No direct cancellation link on file for {subscription.vendor_name} yet. Try the
              step-by-step guide instead.
            </p>
          )}
        </div>
      )}

      {!loading && result && method === "manual" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <ol className="space-y-3">
            {result.steps.map((step, idx) => (
              <li key={idx} className="flex gap-3 text-sm text-slate-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {idx + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          {result.guide?.requires_phone_call && (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              This vendor typically requires a phone call to cancel
              {result.guide.phone_number ? `: ${result.guide.phone_number}` : "."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
