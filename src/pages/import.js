/**
 * Branch Manager — CSV Import Page
 * Reads legacy export CSVs and imports into Supabase
 */
var ImportPage = {
  render: function() {
    var connected = SupabaseDB.ready;
    var html = '<div class="section-header"><h2>Import Data</h2>'
      + '<p style="color:var(--text-light);margin-top:4px;">Upload your CSV exports to migrate all data into Branch Manager.</p></div>';

    // Connection status
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<h3 style="font-size:15px;margin-bottom:12px;">Supabase Connection</h3>';
    if (connected) {
      html += '<div style="display:flex;align-items:center;gap:8px;"><span style="width:10px;height:10px;border-radius:50%;background:#4caf50;display:inline-block;"></span><strong style="color:#4caf50;">Connected</strong></div>';
    } else {
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><span style="width:10px;height:10px;border-radius:50%;background:#f44336;display:inline-block;"></span><strong style="color:#f44336;">Not Connected</strong></div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">'
        + '<input type="text" id="sb-url" placeholder="Supabase URL (https://xxx.supabase.co)" style="padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;" value="https://ltpivkqahvplapyagljt.supabase.co">'
        + '<input type="text" id="sb-key" placeholder="Supabase Anon Key (eyJ...)" style="padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
        + '</div>'
        + '<button onclick="ImportPage.connectSupabase()" style="background:var(--green-dark);color:#fff;border:none;padding:10px 24px;border-radius:8px;font-weight:700;cursor:pointer;">Connect</button>';
    }
    html += '</div>';

    // Import sections
    var imports = [
      { key: 'clients', label: 'Clients', icon: '👤', desc: '533 clients — name, address, phone, email, status, tags' },
      { key: 'quotes', label: 'Quotes', icon: '📝', desc: '433 quotes — client, property, amount, status, line items' },
      { key: 'jobs', label: 'Jobs', icon: '🌳', desc: '258 jobs — client, scheduled date, status, total, description' },
      { key: 'invoices', label: 'Invoices', icon: '💰', desc: '347 invoices — client, amount, payments, status' },
      { key: 'requests', label: 'Requests', icon: '📥', desc: '249 requests — source, client, property, notes' }
    ];

    imports.forEach(function(imp) {
      html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:12px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;">'
        + '<div><span style="font-size:20px;margin-right:8px;">' + imp.icon + '</span><strong style="font-size:15px;">' + imp.label + '</strong>'
        + '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">' + imp.desc + '</div></div>'
        + '<div style="display:flex;align-items:center;gap:8px;">'
        + '<span id="import-status-' + imp.key + '" style="font-size:13px;color:var(--text-light);"></span>'
        + '<label style="background:var(--green-dark);color:#fff;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;">'
        + 'Upload CSV<input type="file" accept=".csv" onchange="ImportPage.handleFile(event, \'' + imp.key + '\')" style="display:none;">'
        + '</label></div></div>'
        + '<div id="import-preview-' + imp.key + '" style="margin-top:12px;display:none;"></div>'
        + '</div>';
    });

    // Quick import from URL (for legacy system email links)
    html += '<div style="background:#f0f8e8;border-radius:12px;padding:20px;border:1px solid #c8e6c9;margin-top:16px;">'
      + '<h3 style="font-size:15px;margin-bottom:8px;">💡 Tip: Your old system emails exports</h3>'
      + '<p style="font-size:13px;color:var(--text-light);margin:0;">Check <strong>' + UI.esc(CompanyInfo.get('email')) + '</strong> for export emails with CSV attachments. Download each one, then upload it above.</p>'
      + '</div>';

    return html;
  },

  connectSupabase: function() {
    var url = document.getElementById('sb-url').value.trim();
    var key = document.getElementById('sb-key').value.trim();
    if (!url || !key) { UI.toast('Enter both URL and key', 'error'); return; }
    localStorage.setItem('bm-supabase-url', url);
    localStorage.setItem('bm-supabase-key', key);
    SupabaseDB.init();
    setTimeout(function() {
      if (SupabaseDB.ready) {
        UI.toast('Connected to Supabase!');
        loadPage('import');
      } else {
        UI.toast('Connection failed — check URL and key', 'error');
      }
    }, 2000);
  },

  handleFile: function(event, type) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      var csv = e.target.result;
      var rows = ImportPage.parseCSV(csv);
      if (rows.length < 2) { UI.toast('Empty CSV', 'error'); return; }

      var headers = rows[0];
      var data = rows.slice(1).map(function(row) {
        var obj = {};
        headers.forEach(function(h, i) { obj[h] = row[i] || ''; });
        return obj;
      });

      // Show preview
      var previewEl = document.getElementById('import-preview-' + type);
      previewEl.style.display = 'block';
      previewEl.innerHTML = '<div style="font-size:13px;margin-bottom:8px;"><strong>' + data.length + ' rows found</strong> — Columns: ' + headers.slice(0, 8).join(', ') + (headers.length > 8 ? '...' : '') + '</div>'
        + '<button onclick="ImportPage.doImport(\'' + type + '\')" style="background:#1565c0;color:#fff;border:none;padding:8px 20px;border-radius:8px;font-weight:600;cursor:pointer;">Import ' + data.length + ' ' + type + '</button>';

      // Store parsed data temporarily
      ImportPage._pendingData = ImportPage._pendingData || {};
      ImportPage._pendingData[type] = data;

      document.getElementById('import-status-' + type).textContent = data.length + ' rows ready';
    };
    reader.readAsText(file);
  },

  doImport: function(type) {
    var data = (ImportPage._pendingData || {})[type];
    if (!data || !data.length) { UI.toast('No data to import', 'error'); return; }

    var statusEl = document.getElementById('import-status-' + type);
    statusEl.textContent = 'Importing...';
    statusEl.style.color = '#1565c0';

    var mapped = data.map(function(row) { return ImportPage.mapRow(type, row); }).filter(Boolean);

    if (SupabaseDB.ready) {
      // Batch insert to Supabase in chunks of 50
      var sb = SupabaseDB.client;
      var tableName = type === 'timeEntries' ? 'time_entries' : type;
      var imported = 0;
      var chunks = [];
      for (var i = 0; i < mapped.length; i += 50) {
        chunks.push(mapped.slice(i, i + 50));
      }

      function processChunk(idx) {
        if (idx >= chunks.length) {
          statusEl.textContent = '✅ ' + imported + ' imported';
          statusEl.style.color = '#4caf50';
          UI.toast(imported + ' ' + type + ' imported to Supabase!');
          return;
        }
        var chunk = chunks[idx];
        sb.from(tableName).upsert(chunk, { onConflict: 'id', ignoreDuplicates: true })
          .then(function(result) {
            var error = result.error;
            if (error) {
              console.warn('Import chunk error:', error);
            } else {
              imported += chunk.length;
              statusEl.textContent = 'Imported ' + imported + '/' + mapped.length + '...';
            }
            processChunk(idx + 1);
          })
          .catch(function(e) {
            statusEl.textContent = '❌ Error';
            statusEl.style.color = '#f44336';
            UI.toast('Import failed: ' + e.message, 'error');
            console.error('Import error:', e);
          });
      }

      processChunk(0);
    } else {
      // Local storage fallback — convert snake_case keys to camelCase so DB reads work
      try {
        mapped.forEach(function(row) { DB[type].create(ImportPage._toCamel(row)); });
        statusEl.textContent = '✅ ' + mapped.length + ' imported (local)';
        statusEl.style.color = '#4caf50';
        UI.toast(mapped.length + ' ' + type + ' imported locally');
      } catch (e) {
        statusEl.textContent = '❌ Error';
        statusEl.style.color = '#f44336';
        UI.toast('Import failed: ' + e.message, 'error');
        console.error('Import error:', e);
      }
    }
  },

  // Map CSV columns to Branch Manager schema
  mapRow: function(type, row) {
    switch (type) {
      case 'clients':
        return {
          id: ImportPage._uuid(),
          name: (row['First name'] || '') + ' ' + (row['Last name'] || ''),
          first_name: row['First name'] || '',
          last_name: row['Last name'] || '',
          company: row['Company name'] || '',
          email: row['Email'] || row['Email address'] || '',
          phone: row['Phone number'] || row['Mobile phone'] || row['Main phone'] || '',
          address: [row['Street 1'] || row['Street address'] || '', row['Street 2'] || ''].filter(Boolean).join(', '),
          city: row['City'] || '',
          state: row['State/Province'] || row['Province'] || 'NY',
          zip: row['Zip/Postal code'] || row['Postal code'] || '',
          status: (row['Status'] || 'active').toLowerCase(),
          tags: row['Tags'] || '',
          notes: row['Notes'] || '',
          lead_source: row['Lead source'] || '',
          created_at: row['Created'] || row['Created date'] || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

      case 'quotes':
        return {
          id: ImportPage._uuid(),
          quote_number: parseInt(row['Quote #'] || row['Quote number'] || '0'),
          client_name: row['Client name'] || row['Client'] || '',
          client_email: row['Client email'] || '',
          client_phone: row['Client phone'] || '',
          property: row['Property'] || row['Property address'] || '',
          status: (row['Status'] || 'draft').toLowerCase().replace(/\s+/g, '_'),
          total: parseFloat((row['Total'] || row['Quote total'] || '0').replace(/[$,]/g, '')) || 0,
          description: row['Title'] || row['Quote title'] || row['Line items'] || '',
          lead_source: row['Lead source'] || '',
          created_at: row['Created'] || row['Created date'] || row['Drafted'] || new Date().toISOString(),
          sent_at: row['Sent'] || row['Sent date'] || null,
          approved_at: row['Approved'] || row['Approved date'] || null,
          updated_at: new Date().toISOString()
        };

      case 'jobs':
        return {
          id: ImportPage._uuid(),
          job_number: parseInt(row['Job #'] || row['Job number'] || '0'),
          client_name: row['Client name'] || row['Client'] || '',
          client_email: row['Client email'] || '',
          client_phone: row['Client phone'] || '',
          property: row['Billing street 1'] || row['Property'] || row['Property address'] || '',
          status: (row['Status'] || 'active').toLowerCase(),
          total: parseFloat((row['Total'] || row['Job total'] || '0').replace(/[$,]/g, '')) || 0,
          description: row['Title'] || row['Job title'] || row['Line items'] || '',
          lead_source: row['Lead source'] || '',
          scheduled_date: row['Starts'] || row['Start date'] || row['Visit scheduled'] || null,
          completed_date: row['Ends'] || row['End date'] || row['Completed'] || null,
          created_at: row['Created'] || row['Created date'] || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

      case 'invoices':
        return {
          id: ImportPage._uuid(),
          invoice_number: parseInt(row['Invoice #'] || row['Invoice number'] || '0'),
          client_name: row['Client name'] || row['Client'] || '',
          client_email: row['Client email'] || '',
          client_phone: row['Client phone'] || '',
          status: (row['Status'] || 'draft').toLowerCase().replace(/\s+/g, '_'),
          total: parseFloat((row['Total'] || row['Invoice total'] || '0').replace(/[$,]/g, '')) || 0,
          amount_paid: parseFloat((row['Payments'] || row['Amount paid'] || '0').replace(/[$,]/g, '')) || 0,
          balance: parseFloat((row['Balance'] || row['Amount owing'] || '0').replace(/[$,]/g, '')) || 0,
          subject: row['Subject'] || row['Title'] || '',
          lead_source: row['Lead source'] || '',
          due_date: row['Due date'] || row['Due'] || null,
          issued_date: row['Issued date'] || row['Issued'] || null,
          created_at: row['Created'] || row['Created date'] || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

      case 'requests':
        return {
          id: ImportPage._uuid(),
          client_name: row['Client name'] || row['Client'] || '',
          client_email: row['Client email'] || '',
          client_phone: row['Client phone'] || '',
          property: row['Property'] || row['Property address'] || '',
          source: row['Form name'] || row['Source'] || row['Lead source'] || '',
          status: (row['Status'] || 'new').toLowerCase(),
          notes: row['Details'] || row['Notes'] || row['Description'] || '',
          created_at: row['Requested on date'] || row['Created'] || row['Created date'] || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

      default:
        return null;
    }
  },

  parseCSV: function(text) {
    var rows = [];
    var current = [];
    var field = '';
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      var next = text[i + 1];

      if (inQuotes) {
        if (c === '"' && next === '"') {
          field += '"';
          i++;
        } else if (c === '"') {
          inQuotes = false;
        } else {
          field += c;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
        } else if (c === ',') {
          current.push(field.trim());
          field = '';
        } else if (c === '\n' || (c === '\r' && next === '\n')) {
          current.push(field.trim());
          if (current.length > 1 || current[0] !== '') rows.push(current);
          current = [];
          field = '';
          if (c === '\r') i++;
        } else {
          field += c;
        }
      }
    }
    if (field || current.length) {
      current.push(field.trim());
      if (current.length > 1 || current[0] !== '') rows.push(current);
    }
    return rows;
  },

  _toCamel: function(obj) {
    var n = {};
    Object.keys(obj).forEach(function(k) {
      var camel = k.replace(/_([a-z])/g, function(m, p) { return p.toUpperCase(); });
      n[camel] = obj[k];
    });
    return n;
  },

  _uuid: function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
};
