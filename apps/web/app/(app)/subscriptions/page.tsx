"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Subscription } from "@/lib/types";
import { SubscriptionTable } from "@/components/subscriptions/SubscriptionTable";

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Subscription[]>("/api/subscriptions")
      .then(setSubscriptions)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Subscriptions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Everything Subs-Guard has detected across your uploaded statements.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading subscriptions...</p>
      ) : (
        <SubscriptionTable subscriptions={subscriptions} />
      )}
    </div>
  );
}
