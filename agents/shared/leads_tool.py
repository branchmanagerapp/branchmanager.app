"""
The data tool Sarah calls at the end of a call (or on a web-form submission).

One responsibility: turn captured intake into a BM **Lead** safely.
  1. Dedupe against existing Clients AND Leads (requests) by phone/email.
  2. Write a `requests` row at status='new' — through the agent's RLS session.
  3. SMS the handoff to Doug + Catherine (config numbers).

It NEVER creates a Client, Quote, or Job, never invents pricing, and never uses
the service-role key. The `tenant_id` it writes comes from the signed-in agent's
membership; RLS's WITH CHECK is the real guard.

`dry_run=True` runs the whole path — dedupe, the exact row that would be written,
the SMS body — without writing or texting. Use it to validate the mapping live
before flipping Sarah on (the analog of request-notify's SMOKE_MARKER).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .supabase_client import TenantSession
from . import sms


# Authoritative option lists — source of truth is src/pages/requests.js.
# Kept here so the tool can normalize/validate what the model produced.
SERVICE_OPTIONS = [
    "Tree Removal", "Tree Pruning", "Stump Grinding", "Emergency Tree Work",
    "Tree Assessment", "Cabling & Bracing", "Chipping / Brush Removal",
    "Lot Clearing", "Firewood", "Gutter Cleaning", "Spring Clean Up",
    "Snow Removal", "Other",
]
SOURCE_OPTIONS = [
    "Google Search", "Facebook", "Instagram", "Nextdoor", "Friend / Referral",
    "Yelp", "Angi", "Thumbtack", "Drive-by", "Repeat Client", "Other",
]
OPEN_REQUEST_STATUSES = ["new", "assessment_scheduled"]


@dataclass
class Capture:
    """What Sarah captured on the call / form. Only name+phone are guaranteed."""
    name: str = ""
    phone: str = ""
    email: str = ""
    address: str = ""
    service: str = ""          # already mapped to a SERVICE_OPTIONS value, or ""
    source: str = ""           # a SOURCE_OPTIONS value, or "Website form", or ""
    preferred_time: str = ""
    job_detail: str = ""
    channel: str = "phone"     # "phone" | "web_form"


@dataclass
class LeadResult:
    action: str                # "created" | "attached" | "dry_run"
    request_id: Optional[str] = None
    matched_client_id: Optional[str] = None
    matched_request_id: Optional[str] = None
    sms_sent_to: list = field(default_factory=list)
    row: dict = field(default_factory=dict)


def _digits(s: str) -> str:
    return "".join(ch for ch in str(s or "") if ch.isdigit())


def _normalize_service(s: str) -> str:
    """Exact match against the dropdown; otherwise blank (note carries the words)."""
    s = (s or "").strip()
    for opt in SERVICE_OPTIONS:
        if s.lower() == opt.lower():
            return opt
    return ""  # unclear → leave blank, the caller's words live in notes


def _normalize_source(s: str, channel: str) -> str:
    s = (s or "").strip()
    if channel == "web_form" and not s:
        return "Website form"
    for opt in SOURCE_OPTIONS:
        if s.lower() == opt.lower():
            return opt
    return s  # keep their words if it doesn't match; source is free-text in BM


def _compose_notes(cap: Capture, service_was_unclear: bool) -> str:
    parts = []
    if cap.preferred_time:
        parts.append(f"Preferred time: {cap.preferred_time}.")
    if cap.job_detail:
        parts.append(cap.job_detail.strip())
    if service_was_unclear and cap.service:
        parts.append(f"Service (caller's words): {cap.service.strip()}")
    return " ".join(parts).strip()


def _town_from_address(address: str) -> str:
    """Best-effort town for the handoff SMS: the 'City' chunk of a US address."""
    if not address:
        return ""
    bits = [b.strip() for b in address.split(",") if b.strip()]
    if len(bits) >= 2:
        return bits[1]          # "Street, City, State ZIP" → City
    return bits[0] if bits else ""


def _find_open_request(session: TenantSession, phone_d: str, email: str) -> Optional[dict]:
    """An already-open lead for this contact → attach instead of duplicating."""
    q = (
        session.client.table("requests")
        .select("id, client_name, client_phone, phone, email, notes, status")
        .in_("status", OPEN_REQUEST_STATUSES)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    for r in q.data or []:
        if phone_d and (_digits(r.get("client_phone")) == phone_d or _digits(r.get("phone")) == phone_d):
            return r
        if email and (r.get("email") or "").strip().lower() == email.strip().lower():
            return r
    return None


def _find_client(session: TenantSession, phone_d: str, email: str) -> Optional[dict]:
    """Existing client by phone/email → link the lead to them (set client_id)."""
    q = (
        session.client.table("clients")
        .select("id, name, phone, email")
        .limit(500)
        .execute()
    )
    for c in q.data or []:
        if phone_d and _digits(c.get("phone")) == phone_d:
            return c
        if email and (c.get("email") or "").strip().lower() == email.strip().lower():
            return c
    return None


def create_lead(
    session: TenantSession,
    cap: Capture,
    *,
    twilio_account_sid: str,
    twilio_auth_token: str,
    sms_from_number: str,
    recipients_config_key: str = "owner_alert_phones",
    dry_run: bool = False,
) -> LeadResult:
    """
    Dedupe → write `requests` lead (status='new', RLS-scoped) → SMS handoff.
    """
    phone_d = _digits(cap.phone)
    email = (cap.email or "").strip()

    # ── 1. Dedupe ────────────────────────────────────────────────────────────
    open_req = _find_open_request(session, phone_d, email)
    matched_client = None if open_req else _find_client(session, phone_d, email)

    service = _normalize_service(cap.service)
    service_was_unclear = bool(cap.service) and not service
    source = _normalize_source(cap.source, cap.channel)
    notes = _compose_notes(cap, service_was_unclear)

    # Attach path: an open lead already exists → append to its notes, no new row.
    if open_req:
        appended = (open_req.get("notes") or "").strip()
        stamp = f"[callback] {notes}".strip() if notes else "[callback] caller followed up"
        appended = (appended + "\n" + stamp).strip() if appended else stamp
        if dry_run:
            print(f"[lead:dry_run] would ATTACH to open request {open_req['id']}: {stamp!r}")
            return LeadResult(action="dry_run", matched_request_id=open_req["id"],
                              row={"notes": appended})
        session.client.table("requests").update({"notes": appended}).eq("id", open_req["id"]).execute()
        result = LeadResult(action="attached", request_id=open_req["id"],
                            matched_request_id=open_req["id"], row={"notes": appended})
        # still hand off — a callback is worth a ping
        result.sms_sent_to = _handoff(session, cap, service, recipients_config_key,
                                      twilio_account_sid, twilio_auth_token,
                                      sms_from_number, dry_run)
        return result

    # ── 2. Build the lead row (the verified `requests` shape) ────────────────
    row = {
        "tenant_id": session.tenant_id,     # RLS WITH CHECK verifies this == membership
        "client_name": cap.name or "Unknown",
        "client_phone": cap.phone or None,  # BM populates BOTH phone columns
        "phone": cap.phone or None,
        "email": email or None,             # blank if not given
        "property": cap.address or None,    # street, city, state, ZIP
        # NOTE: live `requests` has NO `service` column — the service value goes
        # in `title` (verified against the live schema 2026-06-07). The app's
        # `service` field is localStorage-only.
        "title": service or "Phone inquiry",
        "source": source or None,
        "notes": notes or None,
        "status": "new",
    }
    if matched_client:
        row["client_id"] = matched_client["id"]   # attach to the existing client
        if not cap.name:
            row["client_name"] = matched_client.get("name") or row["client_name"]

    if dry_run:
        print("[lead:dry_run] would INSERT requests row:")
        for k, v in row.items():
            print(f"    {k}: {v!r}")
        sent = _handoff(session, cap, service, recipients_config_key,
                        twilio_account_sid, twilio_auth_token, sms_from_number, dry_run=True)
        return LeadResult(action="dry_run",
                          matched_client_id=matched_client["id"] if matched_client else None,
                          sms_sent_to=sent, row=row)

    # ── 3. Write (RLS-scoped) ────────────────────────────────────────────────
    ins = session.client.table("requests").insert(row).execute()
    request_id = (ins.data or [{}])[0].get("id")

    # ── 4. Handoff ───────────────────────────────────────────────────────────
    sent = _handoff(session, cap, service, recipients_config_key,
                    twilio_account_sid, twilio_auth_token, sms_from_number, dry_run=False)

    return LeadResult(
        action="created",
        request_id=request_id,
        matched_client_id=matched_client["id"] if matched_client else None,
        sms_sent_to=sent,
        row=row,
    )


def _handoff(session, cap, service, recipients_config_key,
             account_sid, auth_token, from_number, dry_run) -> list:
    """Read recipient numbers from the tenant config (RLS read) and text them."""
    cfg = (
        session.client.table("tenants")
        .select("config")
        .eq("id", session.tenant_id)
        .limit(1)
        .execute()
    )
    config = (cfg.data or [{}])[0].get("config") or {}
    recipients = sms.resolve_recipients(config.get(recipients_config_key), from_number)

    town = _town_from_address(cap.address)
    body = f"🌳 New lead — {cap.name or '—'} · {service or 'Tree service'} · {town or '—'}"
    return sms.send_handoff(
        account_sid=account_sid,
        auth_token=auth_token,
        from_number=from_number,
        recipients=recipients,
        body=body,
        dry_run=dry_run,
    )
