"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Alert } from "@/lib/types";
import { AlertCard } from "@/components/alerts/AlertCard";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  async function loadAlerts() {
    const data = await api.get<Alert[]>("/api/alerts?status_filter=open");
    setAlerts(data);
    setLoading(false);
  }

  useEffect(() => {
    loadAlerts();
  }, []);

  async function handleDismiss(id: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    await api.patch(`/api/alerts/${id}`, { status: "dismissed" });
  }

  async function handleScan() {
    setScanning(true);
    await api.post("/api/alerts/scan");
    await loadAlerts();
    setScanning(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Alerts</h1>
          <p className="mt-1 text-sm text-slate-500">
            Price increases, low usage, and trial reminders, detected automatically.
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {scanning ? "Scanning..." : "Re-scan now"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading alerts...</p>
      ) : alerts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          No open alerts. You&apos;re all caught up.
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onDismiss={handleDismiss} />
          ))}
        </div>
      )}
    </div>
  );
}
