import type { DashboardSummary } from "@/lib/types";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function BurnSummaryCards({ summary }: { summary: DashboardSummary }) {
  const cards = [
    { label: "Monthly burn", value: formatCurrency(summary.total_monthly_burn) },
    { label: "Yearly burn", value: formatCurrency(summary.total_yearly_burn) },
    { label: "Active subscriptions", value: summary.active_subscription_count.toString() },
    { label: "Open alerts", value: summary.open_alert_count.toString(), highlight: summary.open_alert_count > 0 },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">{card.label}</p>
          <p
            className={`mt-2 text-2xl font-semibold ${
              card.highlight ? "text-amber-600" : "text-slate-900"
            }`}
          >
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
