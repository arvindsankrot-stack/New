import { CATEGORY_LABELS, type CategoryBreakdown as CategoryBreakdownType } from "@/lib/types";

const CATEGORY_COLORS: Record<string, string> = {
  streaming: "bg-violet-500",
  utilities: "bg-sky-500",
  saas: "bg-emerald-500",
  personal_services: "bg-amber-500",
  other: "bg-slate-400",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function CategoryBreakdown({ categories }: { categories: CategoryBreakdownType[] }) {
  const maxMonthly = Math.max(...categories.map((c) => c.monthly_total), 1);

  if (categories.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        No subscriptions yet. Upload a statement to get started.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Spend by category</h2>
      <ul className="mt-5 space-y-4" role="list">
        {categories.map((category) => (
          <li key={category.category}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium text-slate-700">
                {CATEGORY_LABELS[category.category]}{" "}
                <span className="text-slate-400">({category.subscription_count})</span>
              </span>
              <span className="tabular-nums text-slate-600">
                {formatCurrency(category.monthly_total)}/mo
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
              role="img"
              aria-label={`${CATEGORY_LABELS[category.category]}: ${formatCurrency(category.monthly_total)} per month`}
            >
              <div
                className={`h-full rounded-full ${CATEGORY_COLORS[category.category] ?? "bg-slate-400"}`}
                style={{ width: `${Math.max((category.monthly_total / maxMonthly) * 100, 4)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
