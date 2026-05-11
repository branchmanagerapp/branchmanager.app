/**
 * Branch Manager — Permit Research
 * AI-powered tree work permit lookup by address.
 * First supported jurisdiction: Village of Ossining, NY (CitySquared portal).
 *
 * Usage from other pages:
 *   PermitsPage._pendingAddress = '19 Donald Lane, Ossining NY';
 *   loadPage('permits');
 */
var PermitsPage = {
  _pendingAddress: '',
  _result: null,       // last lookup result
  _loading: false,

  // ── Known jurisdictions — high-confidence, no AI needed ──────────────
  // Westchester + Putnam County coverage. Each entry cites its source so
  // Doug can re-verify when ordinances change. `confidence` is:
  //   high   = official .gov page confirmed threshold + fee + contact
  //   medium = threshold + contact confirmed; fee from generic schedule
  //   low    = only some fields verified, rest needs phone call to confirm
  //
  // Key: lowercase normalized city/town/village name (matched by _extractCity).
  // For ambiguous names (Ossining village vs town), the village entry is
  // primary — falls back to AI lookup for the town if ZIP disambiguation
  // is ever needed.
  _knownJurisdictions: {
    // ─── WESTCHESTER ─────────────────────────────────────────────────────
    'ossining': {
      jurisdiction: 'Village of Ossining, NY',
      department: 'Building Department',
      permit_required: true,
      size_threshold: '10 inches DBH or larger (trunk diameter measured 4.5 ft from ground)',
      fee: '$75 for 1–2 trees · $10/tree additional · $115 maximum',
      processing_time: '10–15 business days (call to confirm)',
      phone: '(914) 941-3199',
      email: 'permits@villageofossining.org',
      portal_url: 'https://citysquared.com/#/app/OssiningVillageNY/landing',
      portal_name: 'CitySquared Online Portal',
      notes: 'Submit online only — in-person no longer accepted as of Sept 2023. Upload site sketch + replacement plan. Pruning that doesn\'t kill/remove the tree is exempt.',
      sources: ['https://www.villageofossining.org/'],
      confidence: 'high',
      last_verified: 'Apr 2026'
    },
    'peekskill': {
      jurisdiction: 'City of Peekskill, NY',
      department: 'Building Department',
      permit_required: true,
      size_threshold: '6 inches DBH or greater on private property (any species)',
      fee: 'Per consolidated fee schedule — call City Clerk to confirm current amount',
      processing_time: 'Per Building Inspector — call to confirm',
      phone: '(914) 734-4140',
      email: null,
      portal_url: 'https://www.cityofpeekskillny.gov/241/Permits-Forms',
      portal_name: 'Peekskill Permits Page',
      notes: 'Code Chapter 530 (Tree Preservation). Application is PDF download from city site — submit to Building Inspector.',
      sources: ['https://www.cityofpeekskillny.gov/241/Permits-Forms', 'https://ecode360.com/38211587'],
      confidence: 'medium',
      last_verified: 'May 2026'
    },
    'yorktown': {
      jurisdiction: 'Town of Yorktown, NY',
      department: 'Engineering & Sewer Department',
      permit_required: true,
      size_threshold: 'Regulated activity per Chapter 270 (administrative vs full review depending on scope)',
      fee: 'See Master Fee Schedule — payable to Town of Yorktown',
      processing_time: 'Administrative permits faster; full reviews scheduled with board',
      phone: '(914) 962-5722 x3',
      email: 'engineering@yorktownny.gov',
      portal_url: 'https://www.yorktownny.gov/engineeringandsewer/tree-permit-application',
      portal_name: 'Yorktown Engineering Dept',
      notes: 'Original signed application + Short or Full EAF + SWPPP-set if applicable + Tree Permit Worksheet (admin) or Tree Inventory Worksheet (non-admin). Submit at Town Hall, 363 Underhill Ave, Yorktown Heights.',
      sources: ['https://www.yorktownny.gov/engineeringandsewer/tree-permit-application'],
      confidence: 'medium',
      last_verified: 'May 2026'
    },
    'yorktown heights': { _alias: 'yorktown' },
    'cortlandt': {
      jurisdiction: 'Town of Cortlandt, NY',
      department: 'Department of Technical Services — Code Enforcement',
      permit_required: true,
      size_threshold: 'Per Town Code Chapter 283 (Trees) — regulated activity',
      fee: 'Tree permit fee bundled into building permit packet. Standard application fee $50 non-refundable (covers some scopes).',
      processing_time: 'Director of Technical Services reviews',
      phone: '(914) 734-1010',
      email: 'code@townofcortlandt.com',
      portal_url: 'https://www.townofcortlandtny.gov/cn/webpage.cfm?tpid=2513',
      portal_name: 'Cortlandt Code Enforcement',
      notes: 'Town Hall, 1 Heady Street, Cortlandt Manor. Director of Technical Services is the approving authority for regulated tree activities.',
      sources: ['https://www.townofcortlandtny.gov/cn/webpage.cfm?tpid=2513', 'https://ecode360.com/7695873'],
      confidence: 'low',
      last_verified: 'May 2026'
    },
    'cortlandt manor': { _alias: 'cortlandt' },
    'mount kisco': {
      jurisdiction: 'Town/Village of Mount Kisco, NY',
      department: 'Engineering Dept (reviewed by Tree Preservation Board)',
      permit_required: true,
      size_threshold: '4 inches DBH or greater — Mt Kisco protects all 4″+ trees per the ISA Westchester analysis. Steep slopes have additional Steep Slopes Permit overlay.',
      fee: '$15 per tree (Tree Removal/Alteration Permit, per ecode360 fee schedule)',
      processing_time: 'Board meets 2nd Wednesday monthly · apps due by NOON 1st Wednesday',
      phone: '(914) 241-0500',
      email: 'webmaster@mountkiscony.gov',
      portal_url: 'https://www.mountkiscony.gov/departments/engineering_department/tree_removal_alteration_permits.php',
      portal_name: 'Mount Kisco Engineering Dept',
      notes: 'Trees MUST be ribbon/tape/paint-marked before app deadline or app is rejected. Tree Preservation Board does site visits. 104 Main Street, Mount Kisco.',
      sources: ['https://www.mountkiscony.gov/departments/engineering_department/tree_removal_alteration_permits.php', 'https://ecode360.com/11765553', 'https://ecode360.com/10862576'],
      confidence: 'high',
      last_verified: 'May 2026'
    },
    'mt kisco': { _alias: 'mount kisco' },
    'irvington': {
      jurisdiction: 'Village of Irvington, NY',
      department: 'Village Clerk (Tree Commission reviews)',
      permit_required: true,
      size_threshold: '8 inches DBH or more (3 inches in wetlands / steep slopes)',
      fee: '$10 per tree',
      processing_time: '~2 weeks for well-documented cases',
      phone: '(914) 591-7070',
      email: null,
      portal_url: 'https://www.irvingtonny.gov/394/FAQs',
      portal_name: 'Irvington Tree Removal FAQ',
      notes: 'Certified arborist letter required (except obviously dead or healthy-by-choice). Property survey w/ tree locations. Mark trees clearly. 5+ trees = landscaping restoration plan. Permit sign must display on-site during work; contractor must carry permit. 85 Main Street.',
      sources: ['https://www.irvingtonny.gov/394/FAQs'],
      confidence: 'high',
      last_verified: 'May 2026'
    },
    'bedford': {
      jurisdiction: 'Town of Bedford, NY',
      department: 'Tree Advisory Board / Building Department',
      permit_required: true,
      size_threshold: '18″ DBH or greater (8″ within 150 ft of a scenic road). Properties ≤4 acres: permit only needed when removing >10 trees in a calendar year.',
      fee: '$50 base + $5 per tree (when removing more than 10 trees)',
      processing_time: 'Per Tree Advisory Board review',
      phone: null,
      email: 'treeadvisory@bedfordny.gov',
      portal_url: 'https://bedfordny.gov/755',
      portal_name: 'Bedford Online Permit Portal',
      notes: 'Printable form at bedfordny.gov/369. Scenic-road overlay reduces threshold to 8″. Smaller properties exempt unless bulk removal.',
      sources: ['https://bedfordny.gov/384/Understanding-the-Tree-Ordinance'],
      confidence: 'high',
      last_verified: 'May 2026'
    },
    'bedford hills': { _alias: 'bedford' },
    'katonah': { _alias: 'bedford' },
    'pound ridge': {
      jurisdiction: 'Town of Pound Ridge, NY',
      department: 'Building Inspector',
      permit_required: true,
      size_threshold: 'Per Town Code — comprehensive ordinance covering tree removal on private land. Performance bonds required for restoration on development projects.',
      fee: 'Contact Building Inspector',
      processing_time: 'Per Building Inspector review',
      phone: '(914) 764-5511',
      email: 'jperry@townofpoundridge.com',
      portal_url: 'https://www.townofpoundridge.com/building/tree-cutting-permit-application',
      portal_name: 'Pound Ridge Tree Cutting Permit',
      notes: 'Building Inspector James H. Perry. Town House contact. Ordinance has strong enforcement w/ performance bonds for development.',
      sources: ['https://www.townofpoundridge.com/building/tree-cutting-permit-application'],
      confidence: 'medium',
      last_verified: 'May 2026'
    },
    'scarsdale': {
      jurisdiction: 'Village of Scarsdale, NY',
      department: 'Village Engineer',
      permit_required: true,
      size_threshold: '6″ DBH or greater. Self-exempt: 2 trees per property per 12-month period between 6″ and 24″ DBH may be removed w/ written notification to Village Engineer (no formal permit).',
      fee: 'Per Village Engineer — not published in search results',
      processing_time: 'Per Village Engineer review',
      phone: null,
      email: null,
      portal_url: 'https://www.scarsdale.gov/675/Applications-for-Permits',
      portal_name: 'Scarsdale Permits',
      notes: 'NEW TREE SERVICE LICENSING LAW EFFECTIVE JAN 1, 2026 — read scarsdale.gov news flash before pulling permits. Violations: $250–$1,000/tree + mandatory replacement. Performance bond on development restoration.',
      sources: ['https://www.scarsdale.gov/675/Applications-for-Permits', 'https://www.scarsdale.gov/DocumentCenter/View/165/-Tree-Removal-Permit-Application-PDF', 'https://www.scarsdale.gov/m/newsflash/Home/Detail/862'],
      confidence: 'medium',
      last_verified: 'May 2026'
    },
    'lewisboro': {
      jurisdiction: 'Town of Lewisboro, NY',
      department: 'Building Department',
      permit_required: true,
      size_threshold: 'Restricted to lots over 5 acres (similar to Bedford). Below 5 acres typically no permit.',
      fee: 'Contact Building Department',
      processing_time: 'Per Town review',
      phone: null,
      email: null,
      portal_url: null,
      portal_name: null,
      notes: 'Per ISA Westchester analysis: Lewisboro ordinance scopes to large lots (>5 acres). Smaller residential parcels typically exempt for routine removal. Call to confirm before any commercial development project.',
      sources: ['https://auf.isa-arbor.com/content/22/6/270'],
      confidence: 'low',
      last_verified: 'May 2026'
    },
    'south salem': { _alias: 'lewisboro' },
    'cross river': { _alias: 'lewisboro' },
    'goldens bridge': { _alias: 'lewisboro' },
    'harrison': {
      jurisdiction: 'Town/Village of Harrison, NY',
      department: 'Building Department',
      permit_required: true,
      size_threshold: '4 inches diameter or more (includes dead and storm-damaged trees)',
      fee: 'Contact Building Department',
      processing_time: 'Per review',
      phone: null,
      email: null,
      portal_url: 'https://www.harrison-ny.gov/building-department/faq/do-i-need-a-permit-to-remove-a-tree',
      portal_name: 'Harrison Building Dept',
      notes: 'Application MUST be accompanied by a property survey marking the trees being removed. Dead/storm-damaged trees still require permit at 4″+.',
      sources: ['https://www.harrison-ny.gov/building-department/faq/do-i-need-a-permit-to-remove-a-tree'],
      confidence: 'high',
      last_verified: 'May 2026'
    },
    'greenburgh': {
      jurisdiction: 'Town of Greenburgh, NY',
      department: 'Department of Community Development and Conservation',
      permit_required: true,
      size_threshold: '6 inches DBH or greater (per ISA Westchester analysis)',
      fee: 'See application packet (Town Board TB-24-01)',
      processing_time: 'Per Community Development review',
      phone: '(914) 989-1536',
      email: 'treepermit@greenburghny.com',
      portal_url: 'https://www.greenburghny.com/626/Town-Tree-Ordinance',
      portal_name: 'Greenburgh Tree Ordinance',
      notes: '10-or-less-tree application form is shorter; larger removals use full packet.',
      sources: ['https://www.greenburghny.com/626/Town-Tree-Ordinance', 'https://www.greenburghny.com/DocumentCenter/View/7361/Tree-Removal-Permit-Application---10-or-less-trees-5-18-20', 'https://ecode360.com/6817633'],
      confidence: 'high',
      last_verified: 'May 2026'
    },
    'tarrytown': {
      jurisdiction: 'Village of Tarrytown, NY',
      department: 'Building Department',
      permit_required: true,
      size_threshold: '4 inches DBH or greater (per ISA Westchester analysis — Tarrytown one of strictest)',
      fee: 'Contact Building Dept',
      processing_time: 'Per review',
      phone: '(914) 631-3668',
      email: null,
      portal_url: 'https://www.tarrytownny.gov/about-tarrytown/pages/planning-a-project-building-tree-permits',
      portal_name: 'Tarrytown Building & Tree Permits',
      notes: 'Strictest threshold in the area (4″ — same tier as Harrison and Mt Kisco).',
      sources: ['https://www.tarrytownny.gov/about-tarrytown/pages/planning-a-project-building-tree-permits', 'https://auf.isa-arbor.com/content/22/6/270'],
      confidence: 'medium',
      last_verified: 'May 2026'
    },
    'sleepy hollow': {
      jurisdiction: 'Village of Sleepy Hollow, NY (historically "North Tarrytown")',
      department: 'Building Department',
      permit_required: true,
      size_threshold: '4 inches DBH or greater (per ISA Westchester — listed as "North Tarrytown" in the paper)',
      fee: 'Contact Building Department',
      processing_time: 'Per review',
      phone: null,
      email: null,
      portal_url: null,
      portal_name: null,
      notes: 'Same threshold tier as Tarrytown / Harrison / Mt Kisco. Village changed name from North Tarrytown to Sleepy Hollow in 1996.',
      sources: ['https://auf.isa-arbor.com/content/22/6/270'],
      confidence: 'low',
      last_verified: 'May 2026'
    },
    'north tarrytown': { _alias: 'sleepy hollow' },
    'north castle': {
      jurisdiction: 'Town of North Castle, NY',
      department: 'Building Department',
      permit_required: true,
      size_threshold: '6 inches DBH or greater (per ISA Westchester analysis)',
      fee: 'Contact Building Department',
      processing_time: 'Per review',
      phone: null,
      email: null,
      portal_url: null,
      portal_name: null,
      notes: 'Includes Armonk hamlet. Call before any tree work.',
      sources: ['https://auf.isa-arbor.com/content/22/6/270'],
      confidence: 'low',
      last_verified: 'May 2026'
    },
    'armonk': { _alias: 'north castle' },
    'rye brook': {
      jurisdiction: 'Village of Rye Brook, NY',
      department: 'Building Department',
      permit_required: true,
      size_threshold: 'Large diameter trees (per ISA Westchester — exact threshold needs phone confirmation)',
      fee: 'Contact Building Department',
      processing_time: 'Per review',
      phone: null,
      email: null,
      portal_url: null,
      portal_name: null,
      notes: 'Rye Brook protects "large diameter" trees per ISA analysis. Call before commercial work.',
      sources: ['https://auf.isa-arbor.com/content/22/6/270'],
      confidence: 'low',
      last_verified: 'May 2026'
    },
    'white plains': {
      jurisdiction: 'City of White Plains, NY',
      department: 'Building Department',
      permit_required: true,
      size_threshold: '12 inches diameter or greater AND crown ≥ 15 feet (protected-tree characteristics per Aptera summary)',
      fee: 'Contact Building Department',
      processing_time: 'Per review',
      phone: null,
      email: null,
      portal_url: null,
      portal_name: null,
      notes: 'Protected tree status depends on both size and species. Confirm before any 12″+ tree work.',
      sources: ['https://auf.isa-arbor.com/content/22/6/270'],
      confidence: 'low',
      last_verified: 'May 2026'
    },
    'new rochelle': {
      jurisdiction: 'City of New Rochelle, NY',
      department: 'Building Department',
      permit_required: true,
      size_threshold: 'Permit required on lots ≥ 1 acre. On smaller lots, permit only for >3 trees in 12 months on Unimproved Lot, or any specimen tree.',
      fee: 'Contact Building Department',
      processing_time: 'Per review',
      phone: null,
      email: null,
      portal_url: 'https://ecode360.com/6737926',
      portal_name: 'New Rochelle Tree Code',
      notes: 'Acre-threshold makes routine residential work on small lots typically exempt. Always confirm for unimproved lots and specimen trees.',
      sources: ['https://ecode360.com/6737926'],
      confidence: 'medium',
      last_verified: 'May 2026'
    },
    'yonkers': {
      jurisdiction: 'City of Yonkers, NY',
      department: 'Department of Public Works (Forestry)',
      permit_required: true,
      size_threshold: 'City ordinance applies to all trees — permit required for trimming or cutting per city tree ordinance.',
      fee: 'Contact DPW',
      processing_time: 'Per review',
      phone: null,
      email: null,
      portal_url: null,
      portal_name: null,
      notes: 'Yonkers ordinance is broad — applies to public-property trees absolutely; private property work should be confirmed in advance.',
      sources: ['https://www.gotreequotes.com/tree-removals/laws-permits/yonkers-ny/'],
      confidence: 'low',
      last_verified: 'May 2026'
    },
    'briarcliff manor': {
      jurisdiction: 'Village of Briarcliff Manor, NY',
      department: 'Building & Engineering Department',
      permit_required: true,
      size_threshold: '10 or more trees with DBH ≥ 7″ in any quarter-acre area within 12 months triggers permit',
      fee: 'Contact Building Dept',
      processing_time: 'Per review',
      phone: '(914) 944-2770',
      email: null,
      portal_url: 'https://www.briarcliffmanor.gov/308/Forms-Applications',
      portal_name: 'Briarcliff Manor Forms',
      notes: 'Routine 1–9 tree removals at standard sizes typically below threshold. Code Chapter 202 (Trees) is the governing ordinance.',
      sources: ['https://ecode360.com/7690650', 'https://www.briarcliffmanor.gov/308/Forms-Applications'],
      confidence: 'medium',
      last_verified: 'May 2026'
    },
    'croton-on-hudson': {
      jurisdiction: 'Village of Croton-on-Hudson, NY',
      department: 'Building Department',
      permit_required: true,
      size_threshold: 'More than 10 trees with DBH ≥ 4″ on a lot within 12 months triggers permit',
      fee: 'Contact Building Department',
      processing_time: 'Per review',
      phone: '(914) 271-4783',
      email: null,
      portal_url: 'https://ecode360.com/9144182',
      portal_name: 'Croton Tree Preservation Code',
      notes: 'Threshold is volume-based (10+ trees) not single-tree based. Routine single-tree removals typically exempt.',
      sources: ['https://ecode360.com/9144182', 'https://ecode360.com/9144160'],
      confidence: 'medium',
      last_verified: 'May 2026'
    },
    'croton on hudson': { _alias: 'croton-on-hudson' },
    'pleasantville': {
      jurisdiction: 'Village of Pleasantville, NY',
      department: 'Building Department',
      permit_required: null, // unknown — not in ISA paper, no specific ordinance found
      size_threshold: 'No specific tree ordinance found in research — call to confirm',
      fee: 'Call to confirm',
      processing_time: 'Call to confirm',
      phone: '(914) 769-1926',
      email: null,
      portal_url: null,
      portal_name: null,
      notes: 'Pleasantville does not appear in the Westchester County ISA tree-ordinance survey. Call Building Dept before any tree work to verify current status.',
      sources: [],
      confidence: 'low',
      last_verified: 'May 2026'
    },

    // ─── PUTNAM ──────────────────────────────────────────────────────────
    'putnam valley': {
      jurisdiction: 'Town of Putnam Valley, NY',
      department: 'Building Department',
      permit_required: true,
      size_threshold: 'Tree-cutting ordinance applies — up to 3 non-specimen trees per 12 months on a single owner\'s property allowed within the regulated zone. Specimen trees always require permit.',
      fee: 'See 2025 Building Dept fee schedule',
      processing_time: 'Per review',
      phone: '(845) 526-2377',
      email: null,
      portal_url: 'https://www.putnamvalley.gov/building-department-forms/',
      portal_name: 'Putnam Valley Building Forms',
      notes: 'Violations: fines based on diameter + count of trees unlawfully removed, possible building-permit denial, mandatory replacement planting. Don\'t cut without checking.',
      sources: ['https://ecode360.com/15019072', 'https://www.putnamvalley.gov/documents/Tree_Brochure.pdf'],
      confidence: 'medium',
      last_verified: 'May 2026'
    },
    'philipstown': {
      jurisdiction: 'Town of Philipstown, NY',
      department: 'Natural Resources Review Officer / Conservation Board',
      permit_required: true,
      size_threshold: 'Timber harvesting ordinance. Exempt: clearing ≤ 40,000 sq ft on single lot (or ≤ 2 contiguous acres across adjacent lots), OR ≤ 10,000 board feet or ≤ 20 cords per 12 months (whichever greater).',
      fee: 'Per Conservation Board',
      processing_time: 'Major operations need Conservation Board approval',
      phone: null,
      email: null,
      portal_url: 'https://ecode360.com/6318811',
      portal_name: 'Philipstown Timber Harvesting Code',
      notes: 'Routine residential single-tree work on a typical lot falls well within exemptions. Required for commercial timber operations and large clearing.',
      sources: ['https://ecode360.com/6318811'],
      confidence: 'medium',
      last_verified: 'May 2026'
    },
    'cold spring': { _alias: 'philipstown' },
    'garrison': { _alias: 'philipstown' },
    'nelsonville': {
      jurisdiction: 'Village of Nelsonville, NY (within Philipstown)',
      department: 'Village Building / Philipstown Conservation Board',
      permit_required: true,
      size_threshold: 'Inherits Philipstown timber-harvesting rules (Nelsonville is within Philipstown Town)',
      fee: 'See Philipstown',
      processing_time: 'See Philipstown',
      phone: null,
      email: null,
      portal_url: null,
      portal_name: null,
      notes: 'Small village (~600 residents) inside Philipstown — Philipstown Town code applies for tree work.',
      sources: ['https://ecode360.com/6318811'],
      confidence: 'low',
      last_verified: 'May 2026'
    },
    'carmel': {
      jurisdiction: 'Town of Carmel, NY',
      department: 'Building Department',
      permit_required: null, // unverified — no specific tree ordinance found
      size_threshold: 'No specific town-wide tree-removal ordinance found in research. Generally < 5″ DBH on private property exempt. Confirm with Building Dept before commercial work.',
      fee: 'Call to confirm',
      processing_time: 'Call to confirm',
      phone: null,
      email: null,
      portal_url: null,
      portal_name: null,
      notes: 'Includes Mahopac and Mahopac Falls hamlets. No comprehensive tree code located in public sources — verify before any > 5″ DBH commercial removal.',
      sources: [],
      confidence: 'low',
      last_verified: 'May 2026'
    },
    'mahopac': { _alias: 'carmel' },
    'mahopac falls': { _alias: 'carmel' },
    'brewster': {
      jurisdiction: 'Village of Brewster, NY (within Town of Southeast)',
      department: 'Village / Town Building Department',
      permit_required: null,
      size_threshold: 'No comprehensive tree ordinance located in public sources. Town of Southeast governs for outside-village.',
      fee: 'Call to confirm',
      processing_time: 'Call to confirm',
      phone: null,
      email: null,
      portal_url: 'https://www.southeast-ny.gov/172/Building-Permit-Forms',
      portal_name: 'Southeast Building Forms',
      notes: 'Brewster village is inside Town of Southeast. Tree work typically falls under building permit packet if part of construction; standalone tree-removal ordinance not located.',
      sources: ['https://www.southeast-ny.gov/171/Building-Department-Code-Enforcement'],
      confidence: 'low',
      last_verified: 'May 2026'
    },
    'southeast': {
      jurisdiction: 'Town of Southeast, NY',
      department: 'Building Department & Code Enforcement',
      permit_required: null,
      size_threshold: 'Building permit required for excavation, construction, demolition, occupancy change, most home improvements. No standalone tree-removal threshold located in public sources.',
      fee: 'Per Building permit packet',
      processing_time: 'Per review',
      phone: null,
      email: null,
      portal_url: 'https://www.southeast-ny.gov/171/Building-Department-Code-Enforcement',
      portal_name: 'Southeast Building Dept',
      notes: 'Tree work typically only requires permit if tied to a construction project. Standalone routine residential tree removal — call to confirm.',
      sources: ['https://www.southeast-ny.gov/171/Building-Department-Code-Enforcement'],
      confidence: 'low',
      last_verified: 'May 2026'
    },
    'kent': {
      jurisdiction: 'Town of Kent, NY',
      department: 'Building Department',
      permit_required: null,
      size_threshold: 'Building permit required for various activities — no standalone tree-removal ordinance located.',
      fee: 'Per Building permit packet',
      processing_time: 'Per review',
      phone: '(845) 306-5620',
      email: null,
      portal_url: 'https://www.townofkentny.gov/building-department',
      portal_name: 'Kent Building Dept',
      notes: '25 Sybil\'s Crossing, Kent Lakes, NY 10512. Hours 8am–4pm. No tree-specific code found.',
      sources: ['https://www.townofkentny.gov/building-department', 'https://www.townofkentny.gov/building-department/pages/when-is-a-permit-required'],
      confidence: 'low',
      last_verified: 'May 2026'
    },
    'kent lakes': { _alias: 'kent' },
    'patterson': {
      jurisdiction: 'Town of Patterson, NY',
      department: 'Building Department',
      permit_required: null,
      size_threshold: 'Town offers General Building Permit, Fill, Wetlands/Watercourse permits — no standalone tree permit form located.',
      fee: 'Call to confirm',
      processing_time: 'Call to confirm',
      phone: null,
      email: null,
      portal_url: 'https://www.pattersonny.org/Forms.php',
      portal_name: 'Patterson Forms',
      notes: 'Tree work in wetlands/watercourse buffers may fall under the wetlands permit. Call before any tree work in wet areas.',
      sources: ['https://www.pattersonny.org/Forms.php'],
      confidence: 'low',
      last_verified: 'May 2026'
    }
  },

  // Resolve an alias chain. Returns the final resolved entry or null.
  _resolveJurisdiction: function(key) {
    var seen = {};
    var cur = PermitsPage._knownJurisdictions[key];
    while (cur && cur._alias && !seen[cur._alias]) {
      seen[cur._alias] = true;
      cur = PermitsPage._knownJurisdictions[cur._alias];
    }
    return cur || null;
  },

  // ── Normalize city name for lookup ────────────────────────────────────
  _extractCity: function(address) {
    if (!address) return '';
    // Try to pull city from "123 Street, City ST zip" patterns
    var parts = address.split(',');
    for (var i = 1; i < parts.length; i++) {
      var part = parts[i].trim().toLowerCase().replace(/\s+\d{5}.*$/, '').replace(/\s+[a-z]{2}$/, '').trim();
      if (part.length > 1) return part;
    }
    // Last word fallback
    var words = address.trim().split(/\s+/);
    return words[words.length - 1].toLowerCase();
  },

  // ── AI lookup for unknown jurisdictions ───────────────────────────────
  _lookupViaAI: function(address, callback) {
    var apiKey = window.bmAIKey ? window.bmAIKey() : null;
    var edgeUrl = 'https://ltpivkqahvplapyagljt.supabase.co/functions/v1/ai-chat';

    var prompt = 'You are a permit research assistant for a tree service company operating in New York State.\n\n'
      + 'Research tree removal and trimming permit requirements for this address:\n'
      + address + '\n\n'
      + 'Return ONLY a valid JSON object — no prose, no markdown, no code fences — in this exact shape:\n'
      + '{\n'
      + '  "jurisdiction": "Full municipality name, NY",\n'
      + '  "department": "e.g. Building Department",\n'
      + '  "permit_required": true,\n'
      + '  "size_threshold": "e.g. Trees 6 inches DBH or larger",\n'
      + '  "fee": "e.g. $100 first tree, $50 each additional",\n'
      + '  "processing_time": "e.g. 10 business days",\n'
      + '  "phone": "(xxx) xxx-xxxx or null",\n'
      + '  "email": "email or null",\n'
      + '  "portal_url": "direct application URL or null",\n'
      + '  "portal_name": "portal name or Building Dept website",\n'
      + '  "notes": "key rules, exemptions, or warnings in 1-2 sentences",\n'
      + '  "confidence": "high|medium|low"\n'
      + '}\n\n'
      + 'If you are unsure of exact fees or thresholds, use your best estimate and set confidence to "low". '
      + 'Always return valid JSON.';

    fetch(edgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: apiKey,
        model: 'claude-haiku-4-5',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      var text = '';
      if (res.content && res.content[0] && res.content[0].text) {
        text = res.content[0].text.trim();
      } else if (res.choices && res.choices[0]) {
        text = (res.choices[0].message || res.choices[0]).content || '';
      } else if (typeof res === 'string') {
        text = res;
      }
      // Strip any accidental markdown fences
      text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      try {
        var result = JSON.parse(text);
        callback(null, result);
      } catch(e) {
        callback('Could not parse AI response. Raw: ' + text.substring(0, 200));
      }
    })
    .catch(function(err) {
      callback('AI lookup failed: ' + (err.message || err));
    });
  },

  // ── Main render ───────────────────────────────────────────────────────
  render: function() {
    var addr = PermitsPage._pendingAddress || '';

    var html = '<div style="max-width:820px;">';

    // Header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">'
      + '<h2 style="margin:0;">🏛️ Permit Research</h2>'
      + '<div style="font-size:12px;color:var(--text-light);">AI-powered tree work permit lookup</div>'
      + '</div>';

    // Search card
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px;">'
      + '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text-light);">JOB ADDRESS</label>'
      + '<div style="display:flex;gap:10px;align-items:stretch;">'
      + '<input id="permit-address" type="text" placeholder="e.g. 19 Donald Lane, Ossining NY" value="' + UI.esc(addr) + '" style="flex:1;padding:12px 14px;border:2px solid var(--border);border-radius:8px;font-size:15px;outline:none;transition:border-color .15s;" onfocus="this.style.borderColor=\'var(--green-dark)\'" onblur="this.style.borderColor=\'var(--border)\'" onkeydown="if(event.key===\'Enter\')PermitsPage._lookup()">'
      + '<button onclick="PermitsPage._lookup()" style="background:var(--green-dark);color:#fff;border:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;">🔍 Check Permits</button>'
      + '</div>'
      + '<div style="margin-top:8px;font-size:12px;color:var(--text-light);">Checks local tree removal / trimming permit requirements for the job address</div>'
      + '</div>';

    if (PermitsPage._loading) {
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:40px;text-align:center;">'
        + '<div style="font-size:28px;margin-bottom:12px;">⏳</div>'
        + '<div style="font-weight:600;margin-bottom:6px;">Researching permit requirements…</div>'
        + '<div style="font-size:13px;color:var(--text-light);">Checking jurisdiction rules for this address</div>'
        + '</div>';
    } else if (PermitsPage._result) {
      html += PermitsPage._renderResult(PermitsPage._result, PermitsPage._pendingAddress);
    } else {
      // Empty state / quick-start
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:32px;text-align:center;">'
        + '<div style="font-size:36px;margin-bottom:12px;">🌳</div>'
        + '<h3 style="margin:0 0 8px;">Know before you cut</h3>'
        + '<p style="color:var(--text-light);font-size:14px;max-width:420px;margin:0 auto 20px;">Enter the job address above to look up whether a permit is required, the fee, and a direct link to apply.</p>'
        + '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">'
        + '<button onclick="document.getElementById(\'permit-address\').value=\'19 Donald Lane, Ossining NY 10562\';PermitsPage._lookup()" style="background:var(--bg);border:1px solid var(--border);padding:8px 16px;border-radius:8px;font-size:13px;cursor:pointer;">Try: 19 Donald Lane, Ossining</button>'
        + '</div>'
        + '</div>';
    }

    html += '</div>';
    return html;
  },

  // ── Render result card ────────────────────────────────────────────────
  _renderResult: function(r, address) {
    var confColor = r.confidence === 'high' ? '#2e7d32' : r.confidence === 'medium' ? '#e65100' : '#c62828';
    var confLabel = r.confidence === 'high' ? '✓ Verified' : r.confidence === 'medium' ? '~ Estimated' : '⚠ Low confidence — verify with jurisdiction';

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;">';

    // Result header banner
    html += '<div style="background:' + (r.permit_required ? '#fff8e1' : '#e8f5e9') + ';border-bottom:1px solid var(--border);padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">'
      + '<div>'
      + '<div style="font-size:11px;color:var(--text-light);margin-bottom:2px;">' + UI.esc(address || '') + '</div>'
      + '<div style="font-size:18px;font-weight:700;">' + UI.esc(r.jurisdiction || 'Unknown jurisdiction') + '</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + '<span style="font-size:11px;color:' + confColor + ';font-weight:600;background:' + confColor + '20;padding:3px 10px;border-radius:20px;">' + confLabel + '</span>'
      + '<div style="font-size:22px;">' + (r.permit_required ? '📋' : '✅') + '</div>'
      + '<div style="font-weight:700;font-size:16px;color:' + (r.permit_required ? '#e65100' : '#2e7d32') + ';">'
      + (r.permit_required ? 'Permit Required' : 'No Permit Required') + '</div>'
      + '</div>'
      + '</div>';

    // Detail grid
    html += '<div style="padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:16px;" class="detail-grid">';

    var fields = [
      { label: 'Department', value: r.department },
      { label: 'Size Threshold', value: r.size_threshold },
      { label: 'Permit Fee', value: r.fee },
      { label: 'Processing Time', value: r.processing_time },
      { label: 'Phone', value: r.phone ? '<a href="tel:' + r.phone.replace(/\D/g,'') + '" style="color:var(--accent);">' + UI.esc(r.phone) + '</a>' : null, raw: true },
      { label: 'Email', value: r.email ? '<a href="mailto:' + UI.esc(r.email) + '" style="color:var(--accent);">' + UI.esc(r.email) + '</a>' : null, raw: true }
    ];

    fields.forEach(function(f) {
      if (!f.value) return;
      html += '<div>'
        + '<div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">' + f.label + '</div>'
        + '<div style="font-size:14px;">' + (f.raw ? f.value : UI.esc(f.value)) + '</div>'
        + '</div>';
    });

    html += '</div>';

    // Notes
    if (r.notes) {
      html += '<div style="margin:0 20px 16px;background:var(--bg);border-radius:8px;padding:12px 16px;font-size:13px;line-height:1.6;color:var(--text);">'
        + '<span style="font-weight:600;">📌 Notes: </span>' + UI.esc(r.notes) + '</div>';
    }

    // Action buttons
    html += '<div style="padding:16px 20px;border-top:1px solid var(--border);display:flex;gap:10px;flex-wrap:wrap;">';

    if (r.portal_url) {
      html += '<a href="' + UI.esc(r.portal_url) + '" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;background:var(--green-dark);color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">'
        + '🌐 Open ' + UI.esc(r.portal_name || 'Application Portal') + '</a>';
    }

    if (r.email) {
      html += '<a href="mailto:' + UI.esc(r.email) + '?subject=Tree%20Removal%20Permit%20Inquiry&body=Hello%2C%20I%20am%20a%20tree%20service%20contractor%20inquiring%20about%20a%20permit%20for%20work%20at%20' + encodeURIComponent(address || '') + '.%20Please%20advise%20on%20the%20application%20process.%20Thank%20you." style="display:inline-flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--border);color:var(--text);text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">'
        + '✉️ Email Dept</a>';
    }

    html += '<button onclick="PermitsPage._saveToJob(\'' + UI.esc(address || '') + '\')" style="background:var(--bg);border:1px solid var(--border);padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">'
      + '💾 Save to Job / Quote</button>';

    html += '<button onclick="PermitsPage._result=null;loadPage(\'permits\')" style="background:none;border:none;padding:10px 14px;border-radius:8px;font-size:13px;color:var(--text-light);cursor:pointer;">↩ New search</button>';

    html += '</div></div>';

    if (r.confidence !== 'high') {
      html += '<div style="margin-top:12px;padding:10px 14px;background:#fff3e0;border-radius:8px;font-size:12px;color:#e65100;">'
        + '⚠️ AI-generated estimate — always confirm fees and requirements directly with the ' + UI.esc(r.department || 'building department') + ' before filing.</div>';
    }

    return html;
  },

  // ── Run lookup ────────────────────────────────────────────────────────
  _lookup: function() {
    var input = document.getElementById('permit-address');
    var address = (input ? input.value : PermitsPage._pendingAddress || '').trim();
    if (!address) { UI.toast('Enter a job address first', 'error'); return; }

    PermitsPage._pendingAddress = address;
    PermitsPage._result = null;
    PermitsPage._loading = true;
    loadPage('permits');

    // Check known jurisdictions first (instant). _resolveJurisdiction
    // follows alias chains so "Bedford Hills" → Bedford, "Mahopac" →
    // Carmel, etc.
    var city = PermitsPage._extractCity(address);
    var known = PermitsPage._resolveJurisdiction(city);
    if (known) {
      PermitsPage._loading = false;
      PermitsPage._result = known;
      loadPage('permits');
      return;
    }

    // Fall back to AI
    PermitsPage._lookupViaAI(address, function(err, result) {
      PermitsPage._loading = false;
      if (err) {
        PermitsPage._result = {
          jurisdiction: 'Lookup failed',
          permit_required: true,
          notes: err,
          confidence: 'low',
          portal_url: null
        };
      } else {
        PermitsPage._result = result;
      }
      loadPage('permits');
    });
  },

  // ── Save permit info as a note on an existing job/quote ───────────────
  _saveToJob: function(address) {
    var r = PermitsPage._result;
    if (!r) return;

    var note = '🏛️ Permit Research (' + (new Date().toLocaleDateString()) + ')\n'
      + 'Address: ' + address + '\n'
      + 'Jurisdiction: ' + (r.jurisdiction || 'Unknown') + '\n'
      + 'Permit required: ' + (r.permit_required ? 'YES' : 'NO') + '\n'
      + (r.size_threshold ? 'Threshold: ' + r.size_threshold + '\n' : '')
      + (r.fee ? 'Fee: ' + r.fee + '\n' : '')
      + (r.processing_time ? 'Processing: ' + r.processing_time + '\n' : '')
      + (r.portal_url ? 'Portal: ' + r.portal_url + '\n' : '')
      + (r.notes ? 'Notes: ' + r.notes : '');

    // Find open jobs matching address
    var sb = (typeof SupabaseDB !== 'undefined') ? SupabaseDB.client : null;
    if (sb) {
      // Try to find a matching job by property address
      var addrKey = address.toLowerCase().replace(/[^a-z0-9]/g, '');
      sb.from('jobs').select('id, title, client_name, property').eq('status', 'scheduled')
        .then(function(res) {
          var jobs = (res.data || []).filter(function(j) {
            return j.property && j.property.toLowerCase().replace(/[^a-z0-9]/g, '').includes(addrKey.substring(0, 8));
          });
          if (jobs.length === 1) {
            // Auto-attach to the one matching job
            sb.from('jobs').update({ notes: note }).eq('id', jobs[0].id)
              .then(function() { UI.toast('Saved to job: ' + (jobs[0].title || jobs[0].client_name)); });
          } else if (jobs.length > 1) {
            // Let user pick
            var opts = jobs.map(function(j) { return { label: (j.client_name || '') + ' — ' + (j.title || ''), fn: 'PermitsPage._attachNote("' + j.id + '","' + encodeURIComponent(note) + '")' }; });
            opts.push({ label: 'Cancel', fn: 'UI.closeModal()' });
            UI.modal('Attach to which job?', '<p style="color:var(--text-light);font-size:13px;">Multiple open jobs found for this address.</p>', opts);
          } else {
            // No job found — copy to clipboard
            UI.toast('No matching job found — note copied to clipboard');
            try { navigator.clipboard.writeText(note); } catch(e) {}
          }
        });
    } else {
      // No Supabase — just copy
      try { navigator.clipboard.writeText(note); UI.toast('Permit info copied to clipboard'); } catch(e) { UI.toast('Copied to clipboard'); }
    }
  },

  _attachNote: function(jobId, encodedNote) {
    var note = decodeURIComponent(encodedNote);
    var sb = (typeof SupabaseDB !== 'undefined') ? SupabaseDB.client : null;
    UI.closeModal();
    if (!sb) return;
    sb.from('jobs').update({ notes: note }).eq('id', jobId)
      .then(function(res) {
        if (res.error) UI.toast('Failed to save', 'error');
        else UI.toast('Permit info saved to job');
      });
  }
};
