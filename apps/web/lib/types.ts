export type SubscriptionCategory = "streaming" | "utilities" | "saas" | "personal_services" | "other";
export type BillingCycle = "weekly" | "monthly" | "quarterly" | "yearly" | "one_time";
export type SubscriptionStatus = "active" | "trial" | "cancelled" | "unknown";

export interface Subscription {
  id: string;
  user_id: string;
  vendor_name: string;
  normalized_vendor: string;
  category: SubscriptionCategory;
  billing_cycle: BillingCycle;
  amount: number;
  currency: string;
  status: SubscriptionStatus;
  last_charge_date: string | null;
  next_expected_charge_date: string | null;
  usage_frequency_per_month: number | null;
  confidence: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type AlertType =
  | "price_increase"
  | "low_usage"
  | "trial_ending"
  | "duplicate_service"
  | "new_subscription";

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertStatus = "open" | "acknowledged" | "dismissed" | "resolved";

export interface Alert {
  id: string;
  user_id: string;
  subscription_id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  detail: string;
  metadata: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
}

export interface CategoryBreakdown {
  category: SubscriptionCategory;
  subscription_count: number;
  monthly_total: number;
  yearly_total: number;
}

export interface DashboardSummary {
  total_monthly_burn: number;
  total_yearly_burn: number;
  active_subscription_count: number;
  trial_subscription_count: number;
  open_alert_count: number;
  by_category: CategoryBreakdown[];
}

export interface CancellationGuide {
  id: string;
  normalized_vendor: string;
  display_name: string;
  cancel_url: string | null;
  difficulty: string | null;
  steps: string[];
  requires_phone_call: boolean;
  phone_number: string | null;
}

export interface GenerateCancellationResponse {
  subscription_id: string;
  guide: CancellationGuide | null;
  method: string;
  email_subject: string | null;
  email_body: string | null;
  cancel_url: string | null;
  steps: string[];
}

export interface StatementIngestResponse {
  statement_id: string;
  status: string;
  transactions_found: number;
  subscriptions_detected: number;
  subscriptions: string[];
}

export const CATEGORY_LABELS: Record<SubscriptionCategory, string> = {
  streaming: "Streaming",
  utilities: "Utilities",
  saas: "SaaS",
  personal_services: "Personal Services",
  other: "Other",
};
