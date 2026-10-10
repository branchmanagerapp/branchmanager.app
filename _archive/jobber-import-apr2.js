// ============================================================
// JOBBER DATA IMPORT — April 2, 2026
// Run this in Branch Manager's browser console
// New data pulled from Jobber API by Claude
// ============================================================

(function() {

  function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }
  function bmGet(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch(e) { return []; } }
  function bmSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function addIfNew(key, newRecords, matchFn) {
    var existing = bmGet(key);
    var added = 0;
    newRecords.forEach(function(rec) {
      var dup = existing.find(function(e) { return matchFn(e, rec); });
      if (!dup) {
        rec.id = rec.id || uid();
        rec.createdAt = rec.createdAt || new Date().toISOString();
        rec.updatedAt = new Date().toISOString();
        existing.unshift(rec);
        added++;
      }
    });
    bmSet(key, existing);
    return added;
  }

  // ── NEW CLIENTS (7) ──────────────────────────────────────
  var newClients = [
    { name:'James Shaughnessy', firstName:'James', lastName:'Shaughnessy', email:'jamesshaughnessy@shaughnessysoftware.com', phone:'(516) 816-8983', address:'2989 Grant Avenue', city:'Mohegan Lake', state:'New York', zip:'10547', status:'active', source:'Online/Search', jobberCreated:'2026-03-06' },
    { name:'David Hartigan', firstName:'David', lastName:'Hartigan', email:'dhartigan07@gmail.com', phone:'(646) 645-6597', address:'6 Manor Place', city:'White Plains', state:'New York', zip:'10605', status:'active', source:'Online/Search', jobberCreated:'2026-03-15' },
    { name:'Cynthia Ferral', firstName:'Cynthia', lastName:'Ferral', email:'cynthiaferral@gmail.com', phone:'(347) 776-1419', address:'11 Piping Brook Lane', city:'Bedford', state:'New York', zip:'10506', status:'active', source:'Online/Search', jobberCreated:'2026-03-17' },
    { name:'Tim Baron', firstName:'Tim', lastName:'Baron', email:'timbaronelectric@aol.com', phone:'(914) 490-5619', address:'54 Steuben Road', city:'Philipstown', state:'New York', zip:'10524', status:'active', source:'Referral', jobberCreated:'2026-03-23' },
    { name:'Pam Acevedo', firstName:'Pam', lastName:'Acevedo', email:'', phone:'(914) 424-2290', address:'24 Oriole Street', city:'Putnam Valley', state:'New York', zip:'10579', status:'active', source:'Referral', jobberCreated:'2026-03-23' },
    { name:'Chloe', firstName:'Chloe', lastName:'', email:'', phone:'', address:'251 Oscawana Lake Road', city:'Putnam Valley', state:'New York', zip:'10579', status:'lead', source:'', jobberCreated:'2026-03-31' },
    { name:'Paulette Young', firstName:'Paulette', lastName:'Young', email:'paulette_young@hotmail.com', phone:'(212) 920-1116', address:'1344 Howard Street', city:'Peekskill', state:'New York', zip:'10566', status:'active', source:'Online/Search', jobberCreated:'2026-04-01' }
  ];

  var clientsAdded = addIfNew('bm-clients', newClients, function(e, n) {
    return e.name && n.name && e.name.toLowerCase() === n.name.toLowerCase();
  });

  // ── NEW REQUESTS (7) ─────────────────────────────────────
  var newRequests = [
    { clientName:'Paulette Young', address:'1344 Howard Street, Peekskill, NY 10566', status:'new', source:'Internal', notes:'', jobberDate:'2026-04-01' },
    { clientName:'Brian Heermance', address:'7 Lynwood Court, Cortlandt Manor, NY 10567', status:'new', source:'Online/Search', notes:'', email:'bpwh1@outlook.com', phone:'(646) 228-4455', jobberDate:'2026-03-19' },
    { clientName:'James Shaughnessy', address:'2989 Grant Avenue, Mohegan Lake, NY 10547', status:'new', source:'Online/Search', notes:'Clear trees for new construction', jobberDate:'2026-03-06' },
    { clientName:'Cynthia Ferral', address:'11 Piping Brook Lane, Bedford, NY 10506', status:'converted', source:'Online/Search', notes:'', jobberDate:'2026-03-17' },
    { clientName:'Michael Pfeifer', address:'2 Boulder Drive, Cortlandt, NY', status:'converted', source:'Online/Search', notes:'', email:'pfeife91@aol.com', phone:'(516) 770-5836', jobberDate:'2026-03-21' },
    { clientName:'Pam Acevedo', address:'24 Oriole Street, Putnam Valley, NY 10579', status:'converted', source:'Referral', notes:'', jobberDate:'2026-03-23' },
    { clientName:'Tim Baron', address:'54 Steuben Road, Philipstown, NY 10524', status:'converted', source:'Referral', notes:'', jobberDate:'2026-03-23' }
  ];

  var requestsAdded = addIfNew('bm-requests', newRequests, function(e, n) {
    return e.clientName && n.clientName && e.clientName.toLowerCase() === n.clientName.toLowerCase() &&
           e.address && n.address && e.address.substring(0,10) === n.address.substring(0,10);
  });

  // ── NEW QUOTES (6) ───────────────────────────────────────
  var newQuotes = [
    {
      clientName:'David Hartigan', address:'6 Manor Place, White Plains, NY 10605',
      status:'sent', total:7261.13, jobberDate:'2026-03-15',
      lineItems:[
        {name:'Tree Pruning', qty:1, unitPrice:2800, total:2800},
        {name:'Cabling', qty:1, unitPrice:1500, total:1500},
        {name:'Tree Pruning', qty:1, unitPrice:2400, total:2400}
      ]
    },
    {
      clientName:'Scott Carey', address:'',
      status:'sent', total:1517.25, jobberDate:'2026-03-14',
      lineItems:[
        {name:'Tree Removal', qty:1, unitPrice:1400, total:1400},
        {name:'Tree Removal', qty:1, unitPrice:2000, total:2000}  // discount applied
      ]
    },
    {
      clientName:'Tim Baron', address:'54 Steuben Road, Philipstown, NY 10524',
      status:'sent', total:1246.31, jobberDate:'2026-03-23',
      lineItems:[{name:'Tree Removal', qty:1, unitPrice:1150, total:1150}]
    },
    {
      clientName:'Pam Acevedo', address:'24 Oriole Street, Putnam Valley, NY 10579',
      status:'sent', total:2384.25, jobberDate:'2026-03-23',
      lineItems:[{name:'Remove Maple over House', qty:1, unitPrice:2200, total:2200}]
    },
    {
      clientName:'Michael Pfeifer', address:'2 Boulder Drive, Cortlandt, NY',
      status:'sent', total:541.88, jobberDate:'2026-03-25',
      lineItems:[{name:'Tree Pruning', qty:1, unitPrice:500, total:500}]
    },
    {
      clientName:'Cynthia Ferral', address:'11 Piping Brook Lane, Bedford, NY 10506',
      status:'changes_requested', total:1950.75, jobberDate:'2026-03-25',
      lineItems:[{name:'Haul Debris', qty:1, unitPrice:1800, total:1800}]
    }
  ];

  var quotesAdded = addIfNew('bm-quotes', newQuotes, function(e, n) {
    return e.clientName && n.clientName && e.clientName.toLowerCase() === n.clientName.toLowerCase() &&
           Math.abs((e.total||0) - (n.total||0)) < 1;
  });

  // ── UPDATE REBECCA GRABOWSKI QUOTE → APPROVED ────────────
  var quotes = bmGet('bm-quotes');
  var rebeccaUpdated = false;
  quotes.forEach(function(q) {
    if (q.clientName && q.clientName.toLowerCase().includes('grabowski') && (q.status === 'sent' || q.status === 'draft' || q.status === 'awaiting_response')) {
      q.status = 'approved';
      q.approvedAt = '2026-04-02T00:00:00Z';
      q.updatedAt = new Date().toISOString();
      q.total = q.total || 4660.13;
      // Add line items if not present
      if (!q.lineItems || q.lineItems.length === 0) {
        q.lineItems = [
          {name:'Tree Pruning', qty:1, unitPrice:3800, total:3800},
          {name:'Tree Removal', qty:1, unitPrice:500, total:500}
        ];
      }
      rebeccaUpdated = true;
    }
  });
  // If Rebecca not found, add her as a new approved quote
  if (!rebeccaUpdated) {
    quotes.unshift({
      id: uid(), clientName:'Rebecca Grabowski',
      address:'26 Park Trail, Croton-on-Hudson, NY 10520',
      status:'approved', total:4660.13,
      createdAt:'2025-03-23T00:00:00Z', approvedAt:'2026-04-02T00:00:00Z',
      updatedAt:new Date().toISOString(),
      lineItems:[
        {name:'Tree Pruning', qty:1, unitPrice:3800, total:3800},
        {name:'Tree Removal', qty:1, unitPrice:500, total:500}
      ]
    });
    rebeccaUpdated = true;
  }
  bmSet('bm-quotes', quotes);

  // ── NEW JOBS (3) ─────────────────────────────────────────
  var newJobs = [
    { clientName:'John Hyland', jobNumber:311, address:'3 Robin Lane, Croton-on-Hudson, NY 10520', status:'complete', total:1400, title:'Tree Work', jobberDate:'2026-03-12' },
    { clientName:'Christina Eckhart', jobNumber:312, address:'7 East Willow Street, Beacon, NY', status:'active', total:2500, title:'Tree Work', jobberDate:'2026-03-14' },
    { clientName:'Christina Eckhart', jobNumber:313, address:'7 East Willow Street, Beacon, NY', status:'complete', total:2500, title:'Tree Work', jobberDate:'2026-03-21' }
  ];

  var jobsAdded = addIfNew('bm-jobs', newJobs, function(e, n) {
    return (e.jobNumber && n.jobNumber && e.jobNumber == n.jobNumber) ||
           (e.clientName && n.clientName && e.clientName.toLowerCase() === n.clientName.toLowerCase() && Math.abs((e.total||0)-(n.total||0)) < 1);
  });

  // ── NEW INVOICES (3) ─────────────────────────────────────
  var newInvoices = [
    { clientName:'John Hyland', invoiceNumber:375, status:'paid', total:1517.25, subject:'For Services Rendered', jobberDate:'2026-03-12' },
    { clientName:'Ken Phillips', invoiceNumber:376, status:'paid', total:216.75, subject:'For Services Rendered', jobberDate:'2026-03-13' },
    { clientName:'Christina Eckhart', invoiceNumber:377, status:'overdue', total:2709.38, subject:'For Services Rendered', dueDate:'2026-04-20', jobberDate:'2026-03-21' }
  ];

  var invoicesAdded = addIfNew('bm-invoices', newInvoices, function(e, n) {
    return (e.invoiceNumber && n.invoiceNumber && e.invoiceNumber == n.invoiceNumber) ||
           (e.clientName && n.clientName && e.clientName.toLowerCase() === n.clientName.toLowerCase() && Math.abs((e.total||0)-(n.total||0)) < 1 && e.subject === n.subject);
  });

  // ── ALSO ADD REBECCA AS CLIENT IF MISSING ────────────────
  var existingClients = bmGet('bm-clients');
  var rebeccaExists = existingClients.find(function(c){ return c.name && c.name.toLowerCase().includes('grabowski'); });
  if (!rebeccaExists) {
    existingClients.unshift({
      id: uid(), name:'Rebecca Grabowski', firstName:'Rebecca', lastName:'Grabowski',
      email:'rgrabowski219@gmail.com', phone:'(914) 618-0389',
      address:'26 Park Trail', city:'Croton-on-Hudson', state:'NY', zip:'10520',
      status:'active', source:'Online/Search',
      createdAt:'2025-03-23T00:00:00Z', updatedAt:new Date().toISOString()
    });
    bmSet('bm-clients', existingClients);
    clientsAdded++;
  }

  console.log('✅ JOBBER IMPORT COMPLETE');
  console.log('  Clients added: ' + clientsAdded);
  console.log('  Requests added: ' + requestsAdded);
  console.log('  Quotes added: ' + quotesAdded);
  console.log('  Jobs added: ' + jobsAdded);
  console.log('  Invoices added: ' + invoicesAdded);
  console.log('  Rebecca Grabowski quote: ' + (rebeccaUpdated ? 'APPROVED ✓' : 'not found'));
  console.log('  —');
  console.log('  Reload Branch Manager to see all changes.');

  alert('✅ Import complete!\n\n' +
    '  +' + clientsAdded + ' clients\n' +
    '  +' + requestsAdded + ' requests\n' +
    '  +' + quotesAdded + ' quotes\n' +
    '  +' + jobsAdded + ' jobs\n' +
    '  +' + invoicesAdded + ' invoices\n' +
    '  Rebecca Grabowski: APPROVED ✓\n\n' +
    'Reload Branch Manager now.');

})();
