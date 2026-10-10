// Text the tenant's owner phones (tenants.config.owner_alert_phones) via Twilio.
// INTERNAL alerts only (quote opened / approved / changes) — never a customer.
// Oct 10 2026: Doug wants quote responses to reach his phone, not just email.
export async function textOwners(cfg: Record<string, any>, text: string): Promise<void> {
  const sid = Deno.env.get("TWILIO_SID") ?? "";
  const tok = Deno.env.get("TWILIO_TOKEN") ?? "";
  const from = Deno.env.get("TWILIO_FROM_NUMBER") ?? "";
  const phones: string[] = (cfg && cfg.owner_alert_phones) || [];
  if (!sid || !tok || !from || !phones.length) return;
  for (const to of phones) {
    try {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: { "Authorization": "Basic " + btoa(`${sid}:${tok}`), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: from, Body: text.slice(0, 600) }).toString(),
      });
      if (!r.ok) console.error("textOwners failed", to, r.status, (await r.text()).slice(0, 300));
    } catch (e) { console.error("textOwners error", e); }
  }
}
