"""
Twilio SMS handoff helper. One provider. Recipient numbers are config values
read from the tenant (tenants.config.owner_alert_phones) — never hardcoded.

Mirrors the normalization the BM web-form notifier already uses
(supabase/functions/request-notify): coerce to E.164, dedupe, drop empties and
any number equal to the send-from line (carriers silently drop same-number SMS).
"""

from __future__ import annotations

from typing import Iterable


def normalize_e164(raw: str) -> str:
    """US-centric E.164 coercion, matching request-notify's logic."""
    d = "".join(ch for ch in str(raw or "") if ch.isdigit())
    if len(d) == 10:
        return "+1" + d
    if len(d) == 11 and d[0] == "1":
        return "+" + d
    return ("+" + d) if d else ""


def resolve_recipients(config_phones: Iterable, from_number: str) -> list[str]:
    """
    Turn tenants.config.owner_alert_phones (array or comma/newline string) into a
    clean E.164 recipient list. Drops blanks, dupes, and the from-number itself.
    """
    raw: list[str] = []
    if isinstance(config_phones, str):
        raw = [p for p in config_phones.replace("\n", ",").split(",")]
    elif config_phones:
        raw = [str(p) for p in config_phones]

    from_digits = "".join(ch for ch in str(from_number or "") if ch.isdigit())

    seen, out = set(), []
    for p in raw:
        e = normalize_e164(p)
        if not e:
            continue
        digits = "".join(ch for ch in e if ch.isdigit())
        if from_digits and digits == from_digits:
            continue  # carriers drop same-number SMS
        if e in seen:
            continue
        seen.add(e)
        out.append(e)
    return out


def send_handoff(
    *,
    account_sid: str,
    auth_token: str,
    from_number: str,
    recipients: list[str],
    body: str,
    dry_run: bool = False,
) -> list[str]:
    """
    Text `body` to each recipient. Returns the list actually messaged.
    In dry_run, logs the intended sends and returns them without calling Twilio.
    """
    if not recipients:
        print("[sms] no eligible recipients — handoff skipped "
              "(set tenants.config.owner_alert_phones in BM Settings).")
        return []

    if dry_run:
        for to in recipients:
            print(f"[sms:dry_run] would text {to}: {body!r}")
        return recipients

    from twilio.rest import Client as TwilioClient  # lazy: only when actually sending

    twilio = TwilioClient(account_sid, auth_token)
    sent: list[str] = []
    for to in recipients:
        try:
            twilio.messages.create(to=to, from_=from_number, body=body)
            sent.append(to)
        except Exception as e:  # one bad number must not block the others
            print(f"[sms] send failed for {to}: {e}")
    print(f"[sms] handoff sent to {len(sent)} recipient(s): {','.join(sent)}")
    return sent
