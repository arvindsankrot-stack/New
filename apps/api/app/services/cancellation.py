"""Action Center: resolves a subscription to a cancellation guide and
generates a ready-to-send cancellation email from the knowledge base template."""

from supabase import Client

_GENERIC_TEMPLATE_SUBJECT = "Cancellation Request"
_GENERIC_TEMPLATE_BODY = (
    "Hello {vendor} Support,\n\n"
    "Please cancel my subscription/membership associated with this account, effective "
    "immediately. I no longer wish to be billed going forward.\n\n"
    "Thank you,\n{user_name}"
)


def find_guide(client: Client, normalized_vendor: str) -> dict | None:
    result = (
        client.table("cancellation_guides")
        .select("*")
        .eq("normalized_vendor", normalized_vendor)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def generate_cancellation_email(
    guide: dict | None,
    vendor_name: str,
    user_name: str,
) -> tuple[str, str]:
    if guide and guide.get("email_template_subject") and guide.get("email_template_body"):
        subject = guide["email_template_subject"]
        body = guide["email_template_body"].replace("{{user_name}}", user_name)
    else:
        subject = _GENERIC_TEMPLATE_SUBJECT
        body = _GENERIC_TEMPLATE_BODY.format(vendor=vendor_name, user_name=user_name)
    return subject, body


def default_steps(vendor_name: str) -> list[str]:
    return [
        f"Search your email for a receipt from {vendor_name} to confirm the billing account.",
        f"Sign in to {vendor_name}'s website or app.",
        "Look under Account, Billing, or Subscription settings.",
        "Select \"Cancel\" or \"Manage plan\" and confirm cancellation.",
        "Save the cancellation confirmation email for your records.",
    ]
