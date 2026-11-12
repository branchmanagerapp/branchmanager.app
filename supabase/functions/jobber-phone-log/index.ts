// jobber-phone-log — copy every call, text and voicemail on the Twilio line into Jobber
// (Doug, Nov 12 2026: "make sure the Twilio calls go into Jobber … so we have redundancy").
//
// Runs every 5 minutes (pg_cron "jobber-phone-log-5min"). It takes no input: it works through
// communications rows that came through Twilio and haven't been copied yet ("outbox"), so a
// Jobber outage only delays the copy — nothing is lost, and Twilio calls never wait on Jobber.
//
//   Known Jobber client (matched by PHONE)  → a note on that client.
//   Unknown number, inbound                 → new Jobber client (name from BM if known) + a
//                                              "Phone: …" request with the details as a note.
//   Later contacts from that number match the new client and become notes.
// Skipped: Doug/Catherine's own phones, bulk/robo texts ("reply STOP"), and the call row of a
// call that went to voicemail (the voicemail row carries it, with the transcript).
// Nothing here ever texts, emails or calls a customer.
//
// TOKEN SAFETY: the rotating Jobber token is refreshed by jobber-mirror (hourly) and the daily
// match. Two refreshers racing killed the token on Oct 15, so this function NEVER refreshes:
// if the access token is expired it does nothing and the next run picks the rows up.
//
// Deploy: npx supabase functions deploy jobber-phone-log --no-verify-jwt --project-ref ltpivkqahvplapyagljt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GQL_VERSION  = Deno.env.get("JOBBER_GRAPHQL_VERSION") ?? "2026-07-27";
const GRAPHQL_URL  = "https://api.getjobber.com/api/graphql";
const SNT_TENANT   = "93af4348-8bba-4045-ac3e-5e71ec1cc8c5";
const START        = "2026-11-12T00:00:00Z";   // don't back-fill older history
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const fmt = (d: string) => d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d;
const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });

let TOKEN = "";
async function gql(query: string, variables: Record<string, unknown> = {}) {
  const r = await fetch(GRAPHQL_URL, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", "X-JOBBER-GRAPHQL-VERSION": GQL_VERSION }, body: JSON.stringify({ query, variables }) });
  if (r.status === 401) throw new Error("TOKEN_EXPIRED");
  const b = await r.json().catch(() => ({}));
  if (b.errors) throw new Error("Jobber: " + JSON.stringify(b.errors).slice(0, 300));
  return b.data;
}

async function findJobberClient(phone10: string) {
  const Q = `query($t:String!){ clients(searchTerm:$t, first:10){ nodes{ id name phones{number} jobberWebUri } } }`;
  for (const t of [fmt(phone10), phone10]) {
    const d = await gql(Q, { t });
    for (const c of d?.clients?.nodes ?? []) if ((c.phones ?? []).some((p: any) => digits(p.number) === phone10)) return c;
  }
  return null;
}

const isBulk = (s: string) => /\b(reply|text)\s+stop\b|\bstop to (end|opt|quit|unsub)|opt[- ]?out|unsubscribe/i.test(s);

Deno.serve(async (_req) => {
  const { data: t } = await sb.from("tenants").select("config").eq("id", SNT_TENANT).maybeSingle();
  const cfg = t?.config ?? {};
  const jb = cfg.jobber ?? {};
  if (!jb.access_token || !jb.expires_at || new Date(jb.expires_at).getTime() < Date.now() + 60_000)
    return json({ ok: true, waiting: "Jobber token expired or missing; jobber-mirror refreshes it" });
  TOKEN = jb.access_token;
  const own = new Set<string>([...(cfg.owner_alert_phones ?? []), ...((cfg.call_routing ?? {}).ring ?? [])].map(digits));

  const { data: rows } = await sb.from("communications")
    .select("id,date,channel,direction,from_number,to_number,status,body,client_id,metadata,source")
    .eq("tenant_id", SNT_TENANT).gte("date", START).in("channel", ["sms", "call", "voicemail"])
    .is("metadata->>jobber_logged", null)
    .or("source.eq.twilio,metadata->>provider.eq.twilio,metadata->>sent_via.eq.twilio-sms-send").order("date", { ascending: true }).limit(15);

  const out: unknown[] = [];
  for (const r of rows ?? []) {
    const m = r.metadata ?? {};
    const twilio = r.source === "twilio" || m.provider === "twilio" || m.sent_via === "twilio-sms-send";
    if (!twilio) { await mark(r, { skipped: "not twilio" }); continue; }
    const ageMin = (Date.now() - new Date(r.date).getTime()) / 60000;
    // Let a call finish, and give a voicemail transcript up to 10 minutes to arrive.
    if (r.channel === "call" && r.status === "ringing" && ageMin < 15) continue;
    if (r.channel === "voicemail" && !m.transcription_status && ageMin < 10) continue;
    if (r.channel === "call" && r.status === "voicemail") { await mark(r, { skipped: "voicemail row carries it" }); continue; }

    const other = digits(r.direction === "inbound" ? r.from_number : r.to_number);
    if (!other || own.has(other)) { await mark(r, { skipped: "own phone" }); continue; }
    if (r.channel === "sms" && r.direction === "inbound" && isBulk(r.body || "")) { await mark(r, { skipped: "bulk text" }); continue; }

    const when = new Date(r.date).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
    const what = r.channel === "voicemail" ? "Voicemail" : r.channel === "call" ? (r.status === "answered" ? "Call (answered)" : `Call (${r.status || "missed"})`) : r.direction === "inbound" ? "Text received" : "Text sent";
    const text = r.channel === "voicemail" ? (m.transcript ? `Transcript: ${m.transcript}` : "No transcript — listen in Branch Manager.") : (r.body || "");
    const msg = `📞 ${what} · ${when} · ${fmt(other)}\n${text}`.slice(0, 3500) + `\n(Copied automatically from the Branch Manager phone line)`;

    // Doug, Nov 12: the transcript must be visible without opening notes, so the start of the
    // transcript / text goes in the request title (shown in lists and notifications).
    const gist = (r.channel === "voicemail" ? (m.transcript || "") : r.channel === "sms" ? (r.body || "") : "").replace(/\s+/g, " ").trim();
    const reqTitle = (`Phone ${what.toLowerCase()}` + (gist ? `: "${gist.slice(0, 90)}${gist.length > 90 ? "…" : ""}"` : "")).slice(0, 120);
    try {
      let c = await findJobberClient(other);
      let requestUrl = "";
      if (!c) {
        if (r.direction !== "inbound") { await mark(r, { skipped: "outbound to number not in Jobber" }); continue; }
        let name = "";
        if (r.client_id) { const { data: bc } = await sb.from("clients").select("name").eq("id", r.client_id).maybeSingle(); name = String(bc?.name ?? "").trim(); }
        const [first, ...rest] = name ? name.split(/\s+/) : ["New caller", fmt(other)];
        const input: any = { firstName: first, lastName: rest.join(" ") || fmt(other), phones: [{ number: fmt(other), description: "MAIN", primary: true, smsAllowed: true }] };
        const M = `mutation($i:ClientCreateInput!){ clientCreate(input:$i){ client{ id name jobberWebUri } userErrors{ message } } }`;
        let o = await gql(M, { i: input });
        if ((o?.clientCreate?.userErrors ?? []).length && /sms/i.test(JSON.stringify(o.clientCreate.userErrors))) { input.phones[0].smsAllowed = false; o = await gql(M, { i: input }); }
        if (!o?.clientCreate?.client?.id) throw new Error("clientCreate: " + JSON.stringify(o?.clientCreate?.userErrors).slice(0, 200));
        c = o.clientCreate.client;
        const ro = await gql(`mutation($i:RequestCreateInput!){ requestCreate(input:$i){ request{ id jobberWebUri } userErrors{ message } } }`, { i: { clientId: c.id, title: reqTitle } });
        const rq = ro?.requestCreate?.request;
        if (rq?.id) {
          requestUrl = rq.jobberWebUri;
          await gql(`mutation($id:EncodedId!,$i:RequestCreateNoteInput!){ requestCreateNote(requestId:$id, input:$i){ userErrors{ message } } }`, { id: rq.id, i: { message: msg } });
        }
      }
      if (!requestUrl) {
        const n = await gql(`mutation($id:EncodedId!,$i:ClientCreateNoteInput!){ clientCreateNote(clientId:$id, input:$i){ clientNote{ id } userErrors{ message } } }`, { id: c.id, i: { message: msg } });
        if (!n?.clientCreateNote?.clientNote?.id) throw new Error("clientCreateNote: " + JSON.stringify(n?.clientCreateNote?.userErrors).slice(0, 200));
      }
      await mark(r, { at: new Date().toISOString(), client: c.name, client_url: c.jobberWebUri, request_url: requestUrl || null });
      out.push({ id: r.id, client: c.name, new_request: !!requestUrl });
    } catch (e) {
      const err = String((e as Error)?.message ?? e);
      if (err === "TOKEN_EXPIRED") break;              // retry next run
      console.error("jobber-phone-log", r.id, err);
      const tries = Number(m.jobber_tries ?? 0) + 1;    // give up after 5 tries so one bad row can't block the rest
      await sb.from("communications").update({ metadata: { ...m, jobber_tries: tries, jobber_error: err.slice(0, 300), ...(tries >= 5 ? { jobber_logged: { failed: err.slice(0, 200) } } : {}) } }).eq("id", r.id);
    }
  }
  return json({ ok: true, checked: rows?.length ?? 0, logged: out });
});

async function mark(r: any, info: Record<string, unknown>) {
  await sb.from("communications").update({ metadata: { ...(r.metadata ?? {}), jobber_logged: info } }).eq("id", r.id);
}
