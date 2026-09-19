"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Alert, DashboardSummary } from "@/lib/types";
import { BurnSummaryCards } from "@/components/dashboard/BurnSummaryCards";
import { CategoryBreakdown } from "@/components/dashboard/CategoryBreakdown";
import { AlertCard } from "@/components/alerts/AlertCard";

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [summaryData, alertsData] = await Promise.all([
          api.get<DashboardSummary>("/api/dashboard/summary"),
          api.get<Alert[]>("/api/alerts?status_filter=open"),
        ]);
        if (!cancelled) {
          setSummary(summaryData);
          setAlerts(alertsData.slice(0, 3));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading dashboard...</p>;
  }

  if (error || !summary) {
    return <p className="text-sm text-red-600">{error ?? "Something went wrong."}</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Your recurring spend at a glance.</p>
      </div>

      <BurnSummaryCards summary={summary} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CategoryBreakdown categories={summary.by_category} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Recent alerts</h2>
            <Link href="/alerts" className="text-sm font-medium text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {alerts.length === 0 ? (
              <p className="text-sm text-slate-500">No open alerts. You&apos;re all caught up.</p>
            ) : (
              alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
