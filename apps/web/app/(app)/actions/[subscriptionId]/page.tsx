"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Subscription } from "@/lib/types";
import { CancellationPanel } from "@/components/actions/CancellationPanel";

export default function ActionCenterPage() {
  const params = useParams<{ subscriptionId: string }>();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Subscription[]>("/api/subscriptions")
      .then((all) => setSubscription(all.find((s) => s.id === params.subscriptionId) ?? null))
      .finally(() => setLoading(false));
  }, [params.subscriptionId]);

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (!subscription) return <p className="text-sm text-red-600">Subscription not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Cancel {subscription.vendor_name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose how you&apos;d like to cancel — Subs-Guard generates the email, link, or steps for you.
        </p>
      </div>
      <CancellationPanel subscription={subscription} />
    </div>
  );
}
