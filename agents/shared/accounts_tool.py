"""
Cash / account-balance tracking tool. Reads every bank account's balance
(RLS-scoped to the tenant, same auth as Sarah — never service-role) and reports
per-account cash, total cash, credit-card debt, and progress toward a target
reserve (e.g. the ~$30k no-income-winter cushion).

Balances come from bank_accounts.balance_current. That field is populated by:
  • Plaid sync (plaid-sync-transactions) once a bank is Link-connected, OR
  • manual entry in BM (Books → accounts) for non-Plaid accounts (M&T today).
This tool reads whatever is there — it does not move money and cannot.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from .supabase_client import TenantSession


# Account subtypes we treat as spendable cash vs. debt.
CASH_TYPES = ("checking", "savings", "depository", "money market")
DEBT_TYPES = ("credit", "credit card", "loan", "line of credit")


@dataclass
class AccountSnapshot:
    name: str
    bank: str
    kind: str
    balance: float
    as_of: str
    is_cash: bool


@dataclass
class CashReport:
    accounts: list = field(default_factory=list)
    total_cash: float = 0.0
    total_debt: float = 0.0
    net: float = 0.0
    reserve_target: float = 0.0
    reserve_pct: float = 0.0
    stale: list = field(default_factory=list)   # accounts with no/old balance


def read_accounts(session: TenantSession) -> list:
    """Every active account this tenant has, with its last-known balance."""
    q = (
        session.client.table("bank_accounts")
        .select("name, bank_name, account_type, last_4, balance_current, balance_as_of, active")
        .eq("active", True)
        .execute()
    )
    out = []
    for a in (q.data or []):
        kind = (a.get("account_type") or "").lower()
        out.append(AccountSnapshot(
            name=a.get("name") or "(unnamed)",
            bank=a.get("bank_name") or "",
            kind=kind,
            balance=float(a.get("balance_current") or 0.0),
            as_of=a.get("balance_as_of") or "",
            is_cash=any(t in kind for t in CASH_TYPES),
        ))
    return out


def cash_report(session: TenantSession, reserve_target: float = 29700.0) -> CashReport:
    """
    Per-account + total cash, debt, net, and progress toward the winter reserve.
    `reserve_target` defaults to the ~$30k no-income-winter cushion from the
    Year Plan (business nut ~$14.7k + owner pay ~$15k).
    """
    accts = read_accounts(session)
    r = CashReport(accounts=accts, reserve_target=reserve_target)
    for a in accts:
        if a.is_cash:
            r.total_cash += a.balance
        elif any(t in a.kind for t in DEBT_TYPES):
            r.total_debt += abs(a.balance)
        if not a.as_of or a.balance == 0.0:
            r.stale.append(a.name)
    r.net = r.total_cash - r.total_debt
    r.reserve_pct = (r.total_cash / reserve_target * 100.0) if reserve_target else 0.0
    return r


def format_report(r: CashReport) -> str:
    """A short human-readable summary the agent can speak/send."""
    lines = ["💰 Cash position:"]
    for a in r.accounts:
        tag = "cash" if a.is_cash else "debt/other"
        bal = f"${a.balance:,.0f}" if a.as_of else "— (no balance set)"
        lines.append(f"  {a.name} ({a.bank}, {a.kind or '?'}): {bal}"
                     + (f"  as of {a.as_of}" if a.as_of else ""))
    lines.append(f"\n  Total cash: ${r.total_cash:,.0f}")
    if r.total_debt:
        lines.append(f"  Credit/debt: ${r.total_debt:,.0f}   ->  Net: ${r.net:,.0f}")
    lines.append(f"  Winter reserve: ${r.total_cash:,.0f} / ${r.reserve_target:,.0f}  "
                 f"({r.reserve_pct:.0f}% of the no-income-winter cushion)")
    if r.stale:
        lines.append(f"  ⚠️ No live balance for: {', '.join(r.stale)} — connect Plaid or "
                     f"enter it manually so tracking is real.")
    return "\n".join(lines)
