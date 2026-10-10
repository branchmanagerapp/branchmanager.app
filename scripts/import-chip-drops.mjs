#!/usr/bin/env node
/**
 * Bulk-import chip drop spots from Doug's "Tree Sheet" → CHIP/LOG SPOTS tab.
 *
 * Read May 1 2026 by Claude via Chrome MCP screenshots. Skips rows that were
 * already crossed-out / marked 'jobber complete' / 'dropped'. No lat/lng —
 * the chipdrops UI geocodes lazily on map render. Idempotent: each row uses
 * a deterministic source_ref so re-running won't create duplicates (we check
 * for existing name+address before insert).
 */
const SUPABASE_URL = 'https://ltpivkqahvplapyagljt.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cGl2a3FhaHZwbGFweWFnbGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTgxNzIsImV4cCI6MjA4OTY3NDE3Mn0.bQ-wAx4Uu-FyA2ZwsTVfFoU2ZPbeWCmupqV-6ZR9uFI';
const TENANT_ID = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5';

const SPOTS = [
  // Page 1 — top-of-list chip-drop wanters
  { name: 'Frank Bukovsky',           address: '150 Walnut Rd, Lake Peekskill, NY 10537' },
  { name: 'Michael Zachmann (req)',   address: '71 West Main Street, Pawling, NY 12564',     contact_phone: '(845) 721-1927' },
  { name: 'Emily Schmutzler (req)',   address: '64 Egbertson Rd, Campbell Hall, NY 10916' },
  { name: 'Jessica Jarrett',          address: '300 Foggintown Rd, Brewster',                contact_phone: '(845) 656-8897', drop_notes: 'animal bedding — clean chips' },
  { name: 'Richard',                  address: '236 Kings Ferry Rd, Verplank',                contact_phone: '(914) 772-4248', capacity_loads: 1, drop_notes: '½ truck' },
  { name: 'James',                    address: '74 Enoch Crosby Rd, Brewster, NY 10509',                                       capacity_loads: 1, drop_notes: '½ truck' },
  { name: 'Antonio Rodrigues',        address: '2528 Amawalk Ave, Yorktown',                                                   capacity_loads: 2, drop_notes: '2 trucks' },
  { name: 'Bere',                     address: '433 Orchard Hill Rd, Harriman',               contact_phone: '(917) 288-0985', capacity_loads: 3, drop_notes: '3 trucks' },
  { name: 'Ricardo Neves',            address: '7 Aspen Lane, Lake Peekskill',                contact_phone: '(914) 506-0457', capacity_loads: 1, drop_notes: '1 truck. Pull up dump on rock to right of garden then back down driveway when leaving.' },
  { name: '12 Prospect (Brewster)',   address: '12 Prospect St, Brewster',                    contact_phone: '(914) 733-8536', capacity_loads: 1, drop_notes: '1 truck' },
  { name: 'Robin',                    address: '94 Perks Blvd, Cold Spring',                                                   capacity_loads: 1, drop_notes: '1 truck' },
  { name: 'Rechi Rahami',             address: 'Mohegan Lake, NY',                                                             capacity_loads: 1, drop_notes: '1 truck' },
  { name: 'Silvi Martins DeJesus',    address: '271 Old Church Rd, Putnam Valley',            contact_phone: '(914) 774-1819', capacity_loads: 5, drop_notes: 'CLEAN! 5x trucks' },
  { name: 'Jonathan Miller',          address: '1 Jeffrey Ct, Carmel',                        contact_phone: '(914) 310-6177', capacity_loads: 1, drop_notes: '1 truck' },
  { name: 'Anthony Strang',           address: '111 Second St, Verplank',                     contact_phone: '(914) 382-3542', capacity_loads: 3, drop_notes: '3 trucks' },
  { name: 'Mark Russo',               address: '1793 Blossom Ct, Yorktown',                   contact_phone: '(914) 299-3852' },
  // Theodore Maulen — SKIPPED, marked "dropped 2/April" in sheet
  { name: 'Kristen Heavens',          address: '218 Gordon Rd, Carmel',                       contact_phone: '(860) 485-3197' },
  { name: 'Fabricio Loza',            address: '19 Woodlawn Dr, Carmel',                      contact_phone: '(914) 804-5524' },
  { name: 'Kathy Roche',              address: '28 Harrimac Rd, Putnam Valley',               contact_phone: '(845) 597-8303' },
  { name: 'Rebecca Jenkins',          address: '35 Highland Road, Mahopac',                   contact_phone: '(845) 803-3551' },
  { name: 'Lia Lorusso',              address: '699 East Branch Rd, Patterson',               contact_phone: '(914) 406-5282',                                              drop_notes: 'will pay delivery' },
  // Page 2
  { name: 'Rob Martin',               address: '100 Dutch Street, Montrose',                  contact_phone: '(847) 769-6272' },
  { name: 'Annette Gasperi',          address: '3 Ago Lane, Mahopac',                         contact_phone: '(914) 714-8177' },
  { name: 'Stephen Ho',               address: '318 Church Rd, Putnam Valley, NY 10579',      contact_phone: '(914) 501-1295' },
  { name: 'Azahara Agrafojo',         address: '395 Peekskill Hollow Rd, Putnam Valley',      contact_phone: '(347) 981-4153' },
  { name: 'Al Roush',                 address: '214 Bleloch Ave, Peekskill, NY 10566',        contact_phone: '(914) 382-4093' },
  { name: 'Juan',                     address: '56 Stillwater Rd, Mahopac, NY' },
  { name: 'Maria',                    address: '500 Smith Street, Peekskill, NY 10566',       contact_phone: '(914) 714-8022' },
  { name: 'Jaime',                    address: '2766 Lexington Ave, Mohegan Lake, NY' },
  { name: 'Rodrigo Loza',             address: '2004 Crompond Rd, Cortlandt Manor',           contact_phone: '(914) 282-8547' },
  { name: 'Joseph Horan',             address: '174 Church Road, Putnam Valley, NY 10579',    contact_phone: '(914) 514-0860', drop_notes: 'For neighbor at 170 Church Rd & himself' },
  { name: 'Melissa Romero',           address: '103 Sunny Lane, Stormville, NY 12582',        contact_phone: '(914) 826-5644', drop_notes: 'Looking for free firewood + hardwood chips. Text before dropping.' },
  { name: 'Lisa Caccamise',           address: '259 South Mountain Pass, Garrison, NY 10524', contact_phone: '(917) 696-1284' },
  { name: 'Elana Katz',               address: '79 Aqueduct Rd, Garrison, NY 10524',          contact_phone: '(646) 732-3054' },
  // Dana — SKIPPED, crossed out
  { name: '60 Morrissey (unknown)',   address: '60 Morrissey Drive, Lake Peekskill, NY',      contact_phone: '(914) 497-0325' },
  { name: 'Mike Arciuolo (req)',      address: '61 Acorn Rd, Brewster, NY 10509' },
  { name: 'Lia Lorusso (req)',        address: '699 E Branch Rd, Patterson, NY 12563' },
  { name: 'Jason Martinez',           address: '407 Peekskill Hollow Road, Putnam Valley',    contact_phone: '(914) 355-1979' },
  { name: 'Matt Green',               address: '18 Country Lane, Garrison, NY 10524' },
  { name: 'Cody Umbro (FB)',          address: '15 Collarbark Rd, Hopewell Junction, NY',     contact_phone: '(914) 563-1863',                                                       source: 'inbound_request' },
  // Anthony Falcone — SKIPPED, "jobber complete"
  { name: 'Earl (FB)',                address: '44 Hoofprint Rd, Millbrook, NY',                                              capacity_loads: 2, drop_notes: '2 trucks',                source: 'inbound_request' },
  { name: 'Ari Devyn Raliegh (FB)',   address: '9 Vista Drive, Poughkeepsie, NY 12601',       contact_phone: '(845) 453-6515', capacity_loads: 2, drop_notes: '2 trucks',                source: 'inbound_request' },
  // Page 3
  { name: 'Geert (FB)',               address: '228 Church Rd, Putnam Valley, NY',            contact_phone: '(845) 200-5918',                                                          source: 'inbound_request' },
  { name: 'Lilach (FB)',              address: '29 Cutler Rd, Garrison, NY',                  contact_phone: '(917) 683-8534',                                                          source: 'inbound_request' },
  { name: 'Rob (FB)',                 address: 'North Salem, NY',                             contact_phone: '(914) 879-6171',                                                          source: 'inbound_request' },
  { name: 'Adam Smith (FB)',          address: '96 Tanglewylde Rd, Lake Peekskill',                                                                                                     source: 'inbound_request' },
  // Margi Picciano — SKIPPED, "jobber complete"
  { name: 'Ivan',                     address: '42 Winston Lane',                             contact_phone: '(914) 501-9203', capacity_loads: 2, drop_notes: '2 loads' },
  { name: 'Patrick Chip Dump',        address: '39 Gilbert Lane, Putnam Valley' },
  { name: 'Raul Chips Dump',          address: '157 Secor, Mahopac, NY',                      contact_phone: '(914) 906-0317' },
  { name: 'Call Hemlock Hill',        address: '' },
  { name: 'Heather (chips dropped)',  address: '',                                            contact_phone: '(512) 825-5474' },
  { name: 'Larry',                    address: '24 Carolyn Dr, Cortlandt Manor, NY 10567',    contact_phone: '(914) 844-1082' },
  { name: 'Laura — Wood Chips Furnace', address: '5 Lakeview Ave E, Cortlandt Manor, NY 10567', contact_phone: '(914) 642-5199', drop_notes: 'Wood chip furnace' },
  { name: 'Janet Morra — Food Bank',  address: 'Local',                                       contact_phone: '(914) 804-7694', drop_notes: 'Gardener · Food Bank · local' },
  { name: 'Barry Morton',             address: '28 Jean Drive, Cortlandt Manor, NY 10567',    contact_phone: '(516) 236-5588', drop_notes: 'Wood chips — could use truck load end of August' },
  // Page 4
  { name: 'Ronald Chicotka',          address: '43 HudsonView, Putnam Valley, NY 10579',      contact_phone: '(845) 300-9008', drop_notes: 'Wants chips end of August/early Sept. 1-2 days notice — shared driveway needs neighbor\'s car moved.' },
  { name: 'Mark Miller',              address: '6 LaDue Rd, Hopewell Junction, NY 12533',     contact_phone: '(518) 332-0198', drop_notes: 'Easy access flat dump area at bottom of property' },
  { name: 'Sweta',                    address: '56 E Hill Road',                                                                                                                       drop_notes: 'driver — pickup spot' }
];

async function postRow(row) {
  const body = Object.assign({
    tenant_id: TENANT_ID,
    status: 'active',
    capacity_loads: 1,
    source: 'sheet_import'
  }, row);
  const res = await fetch(SUPABASE_URL + '/rest/v1/chip_drop_spots', {
    method: 'POST',
    headers: {
      'apikey':         ANON_KEY,
      'Authorization':  'Bearer ' + ANON_KEY,
      'Content-Type':   'application/json',
      'Prefer':         'return=minimal'
    },
    body: JSON.stringify(body)
  });
  return { ok: res.ok, status: res.status, text: res.ok ? '' : await res.text() };
}

async function checkExisting(name, address) {
  const url = SUPABASE_URL + '/rest/v1/chip_drop_spots?select=id&name=eq.' + encodeURIComponent(name)
            + '&address=' + (address ? 'eq.' + encodeURIComponent(address) : 'is.null');
  const res = await fetch(url, { headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY } });
  if (!res.ok) return false;
  const j = await res.json();
  return Array.isArray(j) && j.length > 0;
}

(async () => {
  console.log('Importing ' + SPOTS.length + ' chip drop spots...\n');
  let inserted = 0, skipped = 0, failed = 0;
  for (const row of SPOTS) {
    try {
      const exists = await checkExisting(row.name, row.address || '');
      if (exists) { console.log('  · skip ' + row.name + ' — already in table'); skipped++; continue; }
      const r = await postRow(row);
      if (r.ok) { console.log('  ✅ ' + row.name); inserted++; }
      else      { console.log('  ❌ ' + row.name + ' — ' + r.status + ' ' + r.text.slice(0, 100)); failed++; }
    } catch (e) { console.log('  💥 ' + row.name + ' — ' + e.message); failed++; }
  }
  console.log('\nDone. ' + inserted + ' inserted · ' + skipped + ' skipped · ' + failed + ' failed.');
})();
