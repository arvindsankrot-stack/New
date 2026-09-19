"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { CATEGORY_LABELS, type Subscription } from "@/lib/types";

const STATUS_STYLES: Record<Subscription["status"], string> = {
  active: "bg-emerald-100 text-emerald-700",
  trial: "bg-sky-100 text-sky-700",
  cancelled: "bg-slate-100 text-slate-500",
  unknown: "bg-slate-100 text-slate-500",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function SubscriptionTable({ subscriptions: initial }: { subscriptions: Subscription[] }) {
  const [subscriptions, setSubscriptions] = useState(initial);

  async function updateUsage(id: string, usage: number) {
    setSubscriptions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, usage_frequency_per_month: usage } : s))
    );
    await api.patch(`/api/subscriptions/${id}`, { usage_frequency_per_month: usage });
  }

  if (subscriptions.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        No subscriptions detected yet.{" "}
        <Link href="/upload" className="font-medium text-brand-600 hover:underline">
          Upload a statement
        </Link>{" "}
        to get started.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Vendor</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Cycle</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Uses/mo</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {subscriptions.map((sub) => (
            <tr key={sub.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-900">{sub.vendor_name}</td>
              <td className="px-4 py-3 text-slate-600">{CATEGORY_LABELS[sub.category]}</td>
              <td className="px-4 py-3 capitalize text-slate-600">{sub.billing_cycle.replace("_", " ")}</td>
              <td className="px-4 py-3 tabular-nums text-slate-900">{formatCurrency(sub.amount)}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[sub.status]}`}>
                  {sub.status}
                </span>
              </td>
              <td className="px-4 py-3">
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  defaultValue={sub.usage_frequency_per_month ?? ""}
                  onBlur={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!Number.isNaN(value)) updateUsage(sub.id, value);
                  }}
                  className="w-16 rounded-md border border-slate-200 px-2 py-1 text-xs"
                  placeholder="-"
                />
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/actions/${sub.id}`}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Cancel it
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
