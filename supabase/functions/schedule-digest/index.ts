// Branch Manager — Doug's schedule digest (v1074, Jul 28 2026)
// Emails info@peekskilltree.com ONLY: next 7 days of schedule with addresses,
// TBD flags, quotes awaiting approval, and unpaid invoice totals.
// Requested by Doug: every 6 hours (pg_cron 0 4,10,16,22 UTC = 12a/6a/12p/6p ET).
// HARD SCOPE: recipient is the owner. This never emails customers or staff.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TENANT = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5';
const TO = 'info@peekskilltree.com';
const H = { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY };

async function q(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
  return r.ok ? await r.json() : [];
}
const money = (n: number) => '$' + (+n).toLocaleString('en-US', { minimumFractionDigits: 2 });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const d0 = et.toISOString().slice(0, 10);
  const d7 = new Date(et.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const events = await q(`calendar_events?tenant_id=eq.${TENANT}&start_date=lte.${d7}&end_date=gte.${d0}&order=start_date&select=type,title,person,start_date,end_date,notes`);
  // v3 (Aug 3): real scheduled JOBS join the digest — the schedule is moving to
  // jobs-as-truth, so a job with a scheduled_date must show even without a
  // hand-made calendar note.
  const schedJobs = await q(`jobs?tenant_id=eq.${TENANT}&scheduled_date=gte.${d0}&scheduled_date=lte.${d7}&status=not.in.(completed,cancelled)&order=scheduled_date&select=job_number,client_name,property,description,scheduled_date`);
  for (const j of schedJobs) {
    events.push({
      type: 'job',
      title: `${j.client_name} — job #${j.job_number}${j.description ? ' — ' + String(j.description).slice(0, 80) : ''}`,
      person: '',
      start_date: j.scheduled_date,
      end_date: j.scheduled_date,
      notes: j.property || ''
    });
  }
  events.sort((a: any, b: any) => String(a.start_date).localeCompare(String(b.start_date)));
  const quotes = await q(`quotes?tenant_id=eq.${TENANT}&status=eq.sent&select=quote_number,client_name,total,sent_at&order=sent_at.desc&limit=15`);
  const invs   = await q(`invoices?tenant_id=eq.${TENANT}&status=in.(sent,past_due)&select=invoice_number,client_name,balance&order=balance.desc&limit=15`);
  const owed = invs.reduce((s: number, i: any) => s + (+i.balance || 0), 0);

  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const fmtDay = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return DAYS[d.getDay()] + ' ' + (d.getMonth()+1) + '/' + d.getDate(); };
  let sched = '';
  for (const ev of events) {
    const tbd = /TBD/i.test((ev.title||'') + (ev.notes||'')) ? '  ⚠️ TBD' : '';
    const icon = ev.type === 'time_off' ? '🌴' : ev.type === 'bill' ? '💸' : '🌳';
    sched += `${fmtDay(ev.start_date)}${ev.end_date !== ev.start_date ? '–' + fmtDay(ev.end_date) : ''}: ${icon} ${ev.title}${tbd}\n` + (ev.notes ? `    ${String(ev.notes).slice(0, 160)}\n` : '');
  }
  if (!sched) sched = '(nothing on the calendar for the next 7 days)\n';

  let qs = '';
  for (const x of quotes) qs += `  #${x.quote_number} ${x.client_name} — ${money(x.total)}\n`;
  let is_ = '';
  for (const x of invs) is_ += `  #${x.invoice_number} ${x.client_name} — ${money(x.balance)} open\n`;

  // ── Business status (v2, Doug 7/29): sales tax + payroll accrual + week revenue ──
  // NY sales-tax quarter: Jun 1 – Aug 31 (filed ~Sep 22). Tax OWED = tax collected
  // on invoices PAID in the quarter.
  const qStart = '2026-06-01';
  const paidQ = await q(`invoices?tenant_id=eq.${TENANT}&status=eq.paid&paid_date=gte.${qStart}&select=tax_amount,paid_date`);
  const taxOwed = paidQ.reduce((s2: number, i: any) => s2 + (+i.tax_amount || 0), 0);
  const wk = new Date(et.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const paidWk = await q(`invoices?tenant_id=eq.${TENANT}&status=eq.paid&paid_date=gte.${wk}&select=total`);
  const revWk = paidWk.reduce((s2: number, i: any) => s2 + (+i.total || 0), 0);
  const entries = await q(`time_entries?tenant_id=eq.${TENANT}&date=gte.${wk}&select=user_name,hours`);
  const team = await q(`team_members?tenant_id=eq.${TENANT}&select=name,rate`);
  const rateOf: Record<string, number> = {};
  for (const t of team) rateOf[String(t.name || '').toLowerCase()] = +t.rate || 0;
  const byPerson: Record<string, number> = {};
  for (const e of entries) byPerson[e.user_name] = (byPerson[e.user_name] || 0) + (+e.hours || 0);
  let wages = 0; let wageLines = '';
  for (const [n, h] of Object.entries(byPerson)) {
    const w = h * (rateOf[n.toLowerCase()] || 0); wages += w;
    wageLines += `  ${n}: ${h.toFixed(2)}h → ${money(w)}\n`;
  }

  // ── Social recap (v1091, Doug 8/4): what posted, what's due, what's stuck ──
  const yesterday = new Date(et.getTime() - 24 * 3600000).toISOString();
  const tomorrow = new Date(et.getTime() + 24 * 3600000).toISOString();
  const socPosted = await q(`social_posts?tenant_id=eq.${TENANT}&status=eq.posted&posted_at=gte.${yesterday}&select=caption,networks,posted_at&order=posted_at.desc`);
  const socDue = await q(`social_posts?tenant_id=eq.${TENANT}&status=eq.scheduled&scheduled_at=lte.${tomorrow}&select=caption,networks,scheduled_at&order=scheduled_at`);
  const socFailed = await q(`social_posts?tenant_id=eq.${TENANT}&status=eq.failed&updated_at=gte.${yesterday}&select=caption,results`);
  const capOf = (p: any) => `"${String(p.caption || '(no caption)').slice(0, 70)}" [${(p.networks || []).join(', ')}]`;
  let soc = '';
  if (socPosted.length || socDue.length || socFailed.length) {
    soc = '\nSOCIAL POSTS\n';
    for (const p of socPosted) soc += `  ✅ posted: ${capOf(p)}\n`;
    for (const p of socDue) soc += `  🕒 due next 24h: ${capOf(p)}\n`;
    for (const p of socFailed) soc += `  ❌ FAILED: ${capOf(p)} — ${String(p.results?.error || 'check webhook')}\n`;
    soc += '  Manage: https://branchmanager.app/#socialbranch\n';
  }

  const stamp = et.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const text = `SCHEDULE — next 7 days\n${sched}\nQUOTES OUT (awaiting approval): ${quotes.length}\n${qs}\nMONEY OWED TO YOU: ${money(owed)} across ${invs.length} open invoices\n${is_}${soc}\nBUSINESS STATUS\n  NY sales tax collected this quarter (owed at the ~Sep 22 filing): ${money(taxOwed)}\n  Collected in the last 7 days: ${money(revWk)}\n  Wages accrued last 7 days (hours × private rates):\n${wageLines || '  (no hours logged)\n'}  Accrued total: ${money(wages)}  — estimates from BM records, not a payroll filing\n\nOpen the app: https://branchmanager.app/#schedule\n\n— Branch Manager digest, ${stamp} ET (daily 6am; tell Claude to change or stop it)`;

  const r = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: TO, subject: `🌳 Schedule + money — ${stamp}`, text, from: 'Second Nature Tree <info@peekskilltree.com>' })
  });
  return new Response(JSON.stringify({ ok: r.ok, events: events.length, quotes: quotes.length, owed }), { headers: { 'Content-Type': 'application/json' } });
});
