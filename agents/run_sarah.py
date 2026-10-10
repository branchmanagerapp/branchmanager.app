"""
Glue between the OpenJarvis runtime and Sarah's data tool.

When Jarvis routes a contact to Sarah and she finishes the locked script, the
runtime calls `handle_intake(captured)` with the fields she gathered. This loads
config, signs Sarah in (RLS), and creates the Lead.

CLI:
  python run_sarah.py --selftest     # offline: exercises mapping/dedupe logic, no network
  python run_sarah.py --demo         # signs in + runs one fake lead in dry_run (needs config.toml + SDKs)
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shared.leads_tool import Capture, create_lead  # noqa: E402


def load_config(path: str = None) -> dict:
    try:
        import tomllib as toml          # py3.11+
    except ModuleNotFoundError:         # pragma: no cover
        import tomli as toml            # py3.10 (pip install tomli)
    path = path or os.path.join(os.path.dirname(__file__), "config.toml")
    with open(path, "rb") as f:
        return toml.load(f)


def handle_intake(captured: dict, *, config_path: str = None) -> "object":
    """
    Entry point the OpenJarvis runtime calls after Sarah's script completes.
    `captured` keys: name, phone, email, address, service, source,
    preferred_time, job_detail, channel.
    """
    from shared.supabase_client import sign_in_agent  # lazy (needs the SDK)

    cfg = load_config(config_path)
    session = sign_in_agent(
        supabase_url=cfg["supabase"]["url"],
        anon_key=cfg["supabase"]["anon_key"],
        email=cfg["agent_user"]["email"],
        password=cfg["agent_user"]["password"],
    )
    cap = Capture(**{k: captured.get(k, "") for k in (
        "name", "phone", "email", "address", "service",
        "source", "preferred_time", "job_detail", "channel")})
    return create_lead(
        session,
        cap,
        twilio_account_sid=cfg["twilio"]["account_sid"],
        twilio_auth_token=cfg["twilio"]["auth_token"],
        sms_from_number=cfg["twilio"]["from_number"],
        dry_run=bool(cfg.get("runtime", {}).get("dry_run", True)),
    )


# ── Offline self-test — no network, no SDKs. Validates the pure logic. ───────
class _FakeTable:
    def __init__(self, rows): self._rows = rows
    def select(self, *a, **k): return self
    def in_(self, *a, **k): return self
    def eq(self, *a, **k): return self
    def order(self, *a, **k): return self
    def limit(self, *a, **k): return self
    def execute(self):
        class R: data = self._rows
        return R()


class _FakeClient:
    """Returns canned rows so dedupe runs without a real DB."""
    def __init__(self, clients=None, requests=None, config=None):
        self._tables = {
            "clients": clients or [],
            "requests": requests or [],
            "tenants": [{"config": config or {}}],
        }
    def table(self, name): return _FakeTable(self._tables.get(name, []))


def _selftest() -> int:
    from shared.supabase_client import TenantSession
    from shared import leads_tool as LT

    fails = 0

    def check(label, cond):
        nonlocal fails
        print(("  ok  " if cond else " FAIL ") + label)
        if not cond: fails += 1

    # normalize service: exact match wins, unknown → blank
    check("service exact match", LT._normalize_service("tree removal") == "Tree Removal")
    check("service unknown → blank", LT._normalize_service("chop my oak") == "")
    # source: web form default; phone keeps mapped value
    check("web_form source default", LT._normalize_source("", "web_form") == "Website form")
    check("source exact match", LT._normalize_source("nextdoor", "phone") == "Nextdoor")
    # town parsing
    check("town from address", LT._town_from_address("14 Oak St, Peekskill, NY 10566") == "Peekskill")
    # notes composition carries preferred time + unclear-service words
    cap = Capture(name="Jane", phone="(914) 555-0100", address="14 Oak St, Peekskill, NY 10566",
                  service="chop my oak", source="Nextdoor", preferred_time="Tuesday afternoon",
                  job_detail="big oak leaning toward the house", channel="phone")
    notes = LT._compose_notes(cap, service_was_unclear=True)
    check("notes has preferred time", "Preferred time: Tuesday afternoon." in notes)
    check("notes has unclear service words", "chop my oak" in notes)

    # full dry-run create_lead with a fake session — no DB write, builds the row
    session = TenantSession(client=_FakeClient(config={"owner_alert_phones": ["914-555-1111", "914-555-2222"]}),
                            user_id="u", tenant_id="93af4348-8bba-4045-ac3e-5e71ec1cc8c5")
    res = create_lead(session, cap, twilio_account_sid="x", twilio_auth_token="y",
                      sms_from_number="+19145550000", dry_run=True)
    check("dry_run action", res.action == "dry_run")
    check("row status new", res.row.get("status") == "new")
    check("row tenant stamped", res.row.get("tenant_id") == "93af4348-8bba-4045-ac3e-5e71ec1cc8c5")
    check("both phone columns written", res.row.get("phone") and res.row.get("client_phone"))
    check("title falls back when service unclear", res.row.get("title") == "Phone inquiry")
    check("handoff resolved 2 recipients", len(res.sms_sent_to) == 2)

    # dedupe attach path: an open request already exists for this phone
    session2 = TenantSession(client=_FakeClient(requests=[{
        "id": "req-1", "client_phone": "9145550100", "phone": None, "email": None,
        "notes": "first call", "status": "new"}]), user_id="u", tenant_id="t")
    res2 = create_lead(session2, cap, twilio_account_sid="x", twilio_auth_token="y",
                       sms_from_number="+19145550000", dry_run=True)
    check("dedupe attaches to open request", res2.matched_request_id == "req-1")

    print(("\nALL PASS" if not fails else f"\n{fails} FAILED"))
    return 1 if fails else 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(_selftest())
    if "--demo" in sys.argv:
        demo = dict(name="Jane Smith", phone="(914) 555-0100",
                    address="14 Oak St, Peekskill, NY 10566", service="Tree Removal",
                    source="Nextdoor", preferred_time="Tuesday afternoon",
                    job_detail="large oak leaning toward the house", channel="phone")
        print(handle_intake(demo))
        sys.exit(0)
    print(__doc__)
