"""
RLS-authenticated Supabase client factory for Branch Manager agents.

Every agent (Sarah now; Tom, Markus later) talks to BM's Supabase as a real,
signed-in *tenant user* — never with the service-role key. RLS keys off
`current_tenant_id()` = `SELECT tenant_id FROM user_tenants WHERE user_id =
auth.uid()`, so once the agent is signed in, every read and write is
automatically scoped to that one business. We do not, and cannot, bypass RLS.

Provision the agent user once with ../provisioning/sarah_agent_user.sql.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TenantSession:
    """A signed-in agent session, scoped by RLS to exactly one tenant."""
    client: Any          # supabase.Client (typed Any so this module imports without the SDK)
    user_id: str
    tenant_id: str


def sign_in_agent(
    supabase_url: str,
    anon_key: str,
    email: str,
    password: str,
) -> TenantSession:
    """
    Sign in as the agent's dedicated tenant user and return a session whose
    PostgREST calls carry the user's JWT. RLS does the rest.

    We use the ANON key (not service-role) and authenticate — exactly like a
    browser user. The returned client's tenant_id is read back from the live
    membership row, so the caller can stamp inserts with the value RLS expects
    (the `WITH CHECK (tenant_id = current_tenant_id())` policy will reject any
    mismatch — RLS is the enforcer, this is just a convenience).
    """
    from supabase import create_client  # lazy: only needed when actually signing in

    client = create_client(supabase_url, anon_key)

    auth = client.auth.sign_in_with_password({"email": email, "password": password})
    if not auth or not auth.user:
        raise RuntimeError(f"Agent sign-in failed for {email!r}")
    user_id = auth.user.id

    # Read this user's tenant via the membership table. This SELECT is itself
    # RLS-scoped, so it can only ever return the agent's own tenant.
    membership = (
        client.table("user_tenants")
        .select("tenant_id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = membership.data or []
    if not rows:
        raise RuntimeError(
            f"Agent user {email!r} has no row in user_tenants. "
            f"Run provisioning/sarah_agent_user.sql first."
        )
    tenant_id = rows[0]["tenant_id"]

    return TenantSession(client=client, user_id=user_id, tenant_id=tenant_id)
