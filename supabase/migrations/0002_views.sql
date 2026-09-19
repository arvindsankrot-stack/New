-- Convenience views for dashboard aggregation.
-- Normalizing billing_cycle -> monthly/yearly amounts in SQL keeps the frontend
-- and backend from duplicating this math.

create or replace view subscription_normalized as
select
  s.*,
  case s.billing_cycle
    when 'weekly'    then s.amount * 4.345
    when 'monthly'   then s.amount
    when 'quarterly' then s.amount / 3
    when 'yearly'    then s.amount / 12
    when 'one_time'  then 0
  end as monthly_amount,
  case s.billing_cycle
    when 'weekly'    then s.amount * 52.14
    when 'monthly'   then s.amount * 12
    when 'quarterly' then s.amount * 4
    when 'yearly'    then s.amount
    when 'one_time'  then s.amount
  end as yearly_amount
from subscriptions s;

-- RLS on the base table is inherited by views owned by the same role in
-- Supabase (security_invoker), but we pin it explicitly for clarity/safety.
alter view subscription_normalized set (security_invoker = true);

create or replace view dashboard_category_burn as
select
  user_id,
  category,
  status,
  count(*) as subscription_count,
  sum(monthly_amount) as monthly_total,
  sum(yearly_amount) as yearly_total
from subscription_normalized
group by user_id, category, status;

alter view dashboard_category_burn set (security_invoker = true);
