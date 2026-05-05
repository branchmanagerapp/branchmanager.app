/**
 * Branch Manager — SocialBranch
 * Native social-media suite. Replaces SocialPilot.
 *
 * Backends (auto-selected per account):
 *   • Zapier/Make webhook (works today, any plan)
 *   • Direct network APIs (GMB OAuth, Meta Graph — wired as OAuth completes)
 *
 * Data:
 *   localStorage 'bm-social-posts' (array of post objects)
 *   Post: { id, caption, media, networks, scheduledAt, status, postedAt, results, createdAt }
 */
var SocialBranch = {
  _tab: 'dashboard',
  STATUS: { DRAFT: 'draft', SCHEDULED: 'scheduled', POSTING: 'posting', POSTED: 'posted', FAILED: 'failed' },
  // accepts: 'image' | 'video' | 'both'. icon = Lucide icon name rendered via <i data-lucide="...">.
  NETWORKS: [
    { id: 'gmb',       name: 'Google Business', icon: 'store',     color: '#4285F4', accepts: 'image' },
    { id: 'facebook',  name: 'Facebook',        icon: 'facebook',  color: '#1877F2', accepts: 'both'  },
    { id: 'instagram', name: 'Instagram',       icon: 'instagram', color: '#E4405F', accepts: 'both'  },
    { id: 'youtube',   name: 'YouTube',         icon: 'youtube',   color: '#FF0000', accepts: 'video' },
    { id: 'linkedin',  name: 'LinkedIn',        icon: 'linkedin',  color: '#0A66C2', accepts: 'both'  },
    { id: 'tiktok',    name: 'TikTok',          icon: 'music',     color: '#000000', accepts: 'video' },
    { id: 'x',         name: 'X (Twitter)',     icon: 'twitter',   color: '#000000', accepts: 'both'  }
  ],

  // Helper: render a network icon (inline svg via Lucide)
  _netIcon: function(name, size) {
    size = size || 14;
    return '<i data-lucide="' + name + '" style="width:' + size + 'px;height:' + size + 'px;display:inline-block;vertical-align:middle;"></i>';
  },

  // Detect media type from a data URL or http URL extension
  _detectMediaType: function(src) {
    if (!src) return 'none';
    if (/^data:video\//i.test(src)) return 'video';
    if (/^data:image\//i.test(src)) return 'image';
    if (/\.(mp4|mov|webm|m4v)($|\?)/i.test(src)) return 'video';
    if (/\.(jpe?g|png|webp|gif|heic)($|\?)/i.test(src)) return 'image';
    return 'image'; // default
  },
  _detectBatchMediaType: function(list) {
    if (!list || !list.length) return 'none';
    var types = list.map(SocialBranch._detectMediaType);
    if (types.some(function(t){ return t === 'video'; })) return 'video';
    return 'image';
  },

  render: function() {
    var self = SocialBranch;
    // Auto-import SocialPilot history. Previous versions (v363) could set the
    // flag without actually importing, so we self-heal: if the flag is set but
    // we have zero SP-tagged posts, clear the flag and retry.
    var hasSpPosts = SocialBranch._getPosts().some(function(p){ return p.import_source === 'socialpilot-html-scrape'; });
    if (localStorage.getItem('bm-sb-sp-imported') && !hasSpPosts) {
      localStorage.removeItem('bm-sb-sp-imported');
    }
    if (!localStorage.getItem('bm-sb-sp-imported')) {
      setTimeout(function() { SocialBranch.importFromSocialPilot(true); }, 800);
    }
    var tab = self._tab || 'dashboard';
    var html = '';

    // Header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px;">'
      +   '<div><h2 style="margin:0;font-size:24px;font-weight:800;">SocialBranch</h2>'
      +   '<div style="font-size:13px;color:var(--text-light);margin-top:2px;">Post to every network from Branch Manager</div></div>'
      +   '<button onclick="SocialBranch._goTab(\'compose\')" class="btn btn-primary" style="font-size:14px;">New Post</button>'
      + '</div>';

    // Tabs
    var tabs = [
      { id:'dashboard', label:'Dashboard',  icon:'layout-dashboard' },
      { id:'compose',   label:'Compose',    icon:'pencil' },
      { id:'bulk',      label:'Bulk',       icon:'upload' },
      { id:'calendar',  label:'Calendar',   icon:'calendar' },
      { id:'library',   label:'Media',      icon:'camera' },
      { id:'accounts',  label:'Accounts',   icon:'link' },
      { id:'analytics', label:'Analytics',  icon:'bar-chart-3' },
      { id:'competitors', label:'Competitors', icon:'binoculars' }, // v428: SocialPilot-style competitor tracking
      { id:'inbox',     label:'Inbox',      icon:'inbox' },
      // v384: Marketing-area pages folded in as tabs
      { id:'campaigns', label:'Campaigns',    icon:'megaphone' },
      { id:'reviews',   label:'Reviews',      icon:'star' },
      { id:'referrals', label:'Referrals',    icon:'users-round' },
      { id:'leads',     label:'Lead Sources', icon:'pie-chart' }
    ];
    html += '<div style="display:flex;gap:4px;border-bottom:2px solid var(--border);margin-bottom:18px;overflow-x:auto;white-space:nowrap;">';
    tabs.forEach(function(t) {
      var active = tab === t.id;
      html += '<button onclick="SocialBranch._goTab(\'' + t.id + '\')" style="background:none;border:none;padding:10px 16px;font-size:13px;font-weight:' + (active ? '700' : '500') + ';color:' + (active ? 'var(--green-dark)' : 'var(--text-light)') + ';cursor:pointer;border-bottom:3px solid ' + (active ? 'var(--green-dark)' : 'transparent') + ';margin-bottom:-2px;transition:color .15s;display:inline-flex;align-items:center;gap:6px;">' + SocialBranch._netIcon(t.icon) + t.label + '</button>';
    });
    html += '</div>';

    // Tab body
    switch (tab) {
      case 'compose':   html += self._renderCompose();   break;
      case 'bulk':      html += self._renderBulk();      break;
      case 'calendar':  html += self._renderCalendar();  break;
      case 'library':   html += (typeof MediaCenter !== 'undefined' ? MediaCenter.render() : '<div style="padding:40px;text-align:center;color:var(--text-light);">Media library unavailable.</div>'); break;
      case 'accounts':  html += self._renderAccounts();  break;
      case 'analytics': html += self._renderAnalytics(); break;
      case 'competitors': html += self._renderCompetitors(); break;
      case 'inbox':     html += self._renderInbox();     break;
      // v384: Marketing-area tabs delegate to their existing page modules.
      case 'campaigns': html += (typeof Campaigns       !== 'undefined' ? Campaigns.render()       : '<div style="padding:40px;text-align:center;color:var(--text-light);">Campaigns module unavailable.</div>'); break;
      case 'reviews':   html += (typeof ReviewsPage     !== 'undefined' ? ReviewsPage.render()     : '<div style="padding:40px;text-align:center;color:var(--text-light);">Reviews module unavailable.</div>')
                              + (typeof ReviewTools     !== 'undefined' ? ReviewTools.render()     : ''); break;
      case 'referrals': html += (typeof Referrals       !== 'undefined' ? Referrals.render()       : '<div style="padding:40px;text-align:center;color:var(--text-light);">Referrals module unavailable.</div>'); break;
      case 'leads':     html += (typeof MarketingPage   !== 'undefined' ? MarketingPage.render()   : '<div style="padding:40px;text-align:center;color:var(--text-light);">Lead-source analytics unavailable.</div>'); break;
      default:          html += self._renderDashboard();
    }

    // Post-render hooks (Lucide + DnD) — fire after DOM paints.
    setTimeout(function() {
      if (typeof lucide !== 'undefined') lucide.createIcons();
      if (self._tab === 'calendar') self._initCalendarDnD();
    }, 80);

    return html;
  },

  _goTab: function(id) {
    SocialBranch._tab = id;
    loadPage('socialbranch');
    setTimeout(function() {
      if (typeof lucide !== 'undefined') lucide.createIcons();
      // Wire drag-to-reschedule after calendar renders
      if (id === 'calendar' && SocialBranch._initCalendarDnD) SocialBranch._initCalendarDnD();
    }, 80);
  },

  // ─────────────────────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────────────────────
  _renderDashboard: function() {
    var posts = SocialBranch._getPosts();
    var now = Date.now();
    var scheduled = posts.filter(function(p){ return p.status === 'scheduled'; }).sort(function(a,b){ return new Date(a.scheduledAt) - new Date(b.scheduledAt); });
    var recent = posts.filter(function(p){ return p.status === 'posted' || p.status === 'failed'; }).sort(function(a,b){ return new Date(b.postedAt || b.createdAt) - new Date(a.postedAt || a.createdAt); }).slice(0, 8);
    var connected = SocialBranch._getConnectedNetworks();

    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-bottom:20px;">';
    html += SocialBranch._statCard('Scheduled',  scheduled.length,                'calendar', 'var(--accent)');
    html += SocialBranch._statCard('Posted (all-time)', posts.filter(function(p){return p.status==='posted';}).length, 'check-circle', 'var(--green-dark)');
    html += SocialBranch._statCard('Drafts',     posts.filter(function(p){return p.status==='draft';}).length,   'file-text', 'var(--text-light)');
    html += SocialBranch._statCard('Connected',  connected.length + ' networks',  'link', '#8b5cf6');
    html += '</div>';

    // Upcoming queue
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<h3 style="margin:0;font-size:16px;">Upcoming Queue</h3>'
      + '<button onclick="SocialBranch._goTab(\'calendar\')" style="background:none;border:none;color:var(--accent);font-size:12px;cursor:pointer;">View calendar →</button>'
      + '</div>';
    if (scheduled.length === 0) {
      html += '<div style="padding:20px;text-align:center;color:var(--text-light);font-size:14px;">No scheduled posts. <a href="#" onclick="SocialBranch._goTab(\'compose\');return false;" style="color:var(--accent);">Create your first</a> →</div>';
    } else {
      scheduled.slice(0, 5).forEach(function(p) { html += SocialBranch._postRow(p); });
    }
    html += '</div>';

    // Recent activity
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;">'
      + '<h3 style="margin:0 0 12px;font-size:16px;">Recent Activity</h3>';
    if (recent.length === 0) {
      html += '<div style="padding:20px;text-align:center;color:var(--text-light);font-size:14px;">Nothing posted yet.</div>';
    } else {
      recent.forEach(function(p) { html += SocialBranch._postRow(p); });
    }
    html += '</div>';

    return html;
  },

  _statCard: function(label, value, icon, color) {
    return '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px;">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">'
      + '<div style="width:32px;height:32px;border-radius:8px;background:' + color + '20;color:' + color + ';display:flex;align-items:center;justify-content:center;"><i data-lucide="' + icon + '" style="width:16px;height:16px;"></i></div>'
      + '<div style="font-size:12px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;">' + label + '</div>'
      + '</div>'
      + '<div style="font-size:24px;font-weight:800;color:var(--text);">' + value + '</div>'
      + '</div>';
  },

  _postRow: function(p) {
    var when = p.status === 'scheduled'
      ? 'Scheduled ' + SocialBranch._formatWhen(p.scheduledAt)
      : (p.postedAt ? 'Posted ' + SocialBranch._formatWhen(p.postedAt) : 'Draft');
    var statusBadge = SocialBranch._statusBadge(p.status);
    var nets = (p.networks || []).map(function(n) {
      var net = SocialBranch.NETWORKS.find(function(x){ return x.id === n; });
      return net ? '<span title="' + net.name + '" style="margin-right:4px;color:' + net.color + ';">' + SocialBranch._netIcon(net.icon, 12) + '</span>' : '';
    }).join('');
    var preview = (p.caption || '').substring(0, 80) + ((p.caption || '').length > 80 ? '…' : '');
    var thumb = (p.media && p.media[0]) ? '<img src="' + UI.esc(p.media[0]) + '" style="width:42px;height:42px;border-radius:6px;object-fit:cover;">' : '<div style="width:42px;height:42px;border-radius:6px;background:var(--bg);display:flex;align-items:center;justify-content:center;color:var(--text-light);"><i data-lucide="file-text" style="width:18px;height:18px;"></i></div>';
    return '<div onclick="SocialBranch._editPost(\'' + p.id + '\')" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--border);cursor:pointer;">'
      + thumb
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(preview || '(no caption)') + '</div>'
      + '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">' + when + '</div>'
      + '</div>'
      + '<div style="font-size:14px;">' + nets + '</div>'
      + statusBadge
      + '</div>';
  },

  _statusBadge: function(status) {
    var map = {
      draft:     { bg:'#f3f4f6', color:'#6b7280', label:'Draft' },
      scheduled: { bg:'#dbeafe', color:'#1e40af', label:'Queued' },
      posting:   { bg:'#fef3c7', color:'#92400e', label:'Posting…' },
      posted:    { bg:'#dcfce7', color:'#166534', label:'Posted' },
      failed:    { bg:'#fee2e2', color:'#991b1b', label:'Failed' }
    };
    var s = map[status] || map.draft;
    return '<span style="background:' + s.bg + ';color:' + s.color + ';font-size:10px;font-weight:700;padding:3px 8px;border-radius:10px;text-transform:uppercase;letter-spacing:.3px;">' + s.label + '</span>';
  },

  _formatWhen: function(iso) {
    if (!iso) return '';
    var d = new Date(iso), now = new Date();
    var diffMin = Math.round((d - now) / 60000);
    if (Math.abs(diffMin) < 60) return (diffMin < 0 ? Math.abs(diffMin) + 'm ago' : 'in ' + diffMin + 'm');
    var sameDay = d.toDateString() === now.toDateString();
    var opts = sameDay ? { hour:'numeric', minute:'2-digit' } : { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' };
    return d.toLocaleString('en-US', opts);
  },

  // ─────────────────────────────────────────────────────────
  // COMPOSE
  // ─────────────────────────────────────────────────────────
  _renderCompose: function() {
    var draft = SocialBranch._editingPost || { id:'', caption:'', media:[], networks:[], scheduledAt:'', status:'draft' };
    var html = '<div style="display:grid;grid-template-columns:1fr 320px;gap:16px;" class="sb-compose-grid">';

    // Left — editor
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;">';

    html += '<label style="display:block;font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">Caption</label>'
      + '<textarea id="sb-caption" rows="6" placeholder="What\'s happening at your tree service?" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;resize:vertical;box-sizing:border-box;">' + UI.esc(draft.caption || '') + '</textarea>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;font-size:11px;color:var(--text-light);">'
      +   '<span>Tip: #treeservice #peekskill go a long way on GMB + IG</span>'
      +   '<span id="sb-charcount">0 / 2200</span>'
      + '</div>';

    html += '<div style="margin-top:16px;"><label style="display:block;font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">Media</label>'
      + '<div id="sb-media-preview" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:60px;"></div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      +   '<button type="button" onclick="SocialBranch._pickFromMediaCenter()" style="background:var(--bg);border:1px dashed var(--border);padding:10px 14px;border-radius:8px;font-size:13px;cursor:pointer;">Pick from Media Center</button>'
      +   '<label style="background:var(--bg);border:1px dashed var(--border);padding:10px 14px;border-radius:8px;font-size:13px;cursor:pointer;display:inline-block;">Upload<input type="file" accept="image/*,video/*" multiple onchange="SocialBranch._uploadMedia(event)" style="display:none;"></label>'
      + '</div></div>';

    html += '<div style="margin-top:16px;"><label style="display:block;font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">Post to networks</label>'
      + '<div style="display:flex;flex-wrap:wrap;gap:8px;" id="sb-networks">';
    var connected = SocialBranch._getConnectedNetworks();
    var draftMediaType = SocialBranch._detectBatchMediaType(draft.media || []);
    SocialBranch.NETWORKS.forEach(function(n) {
      var isConnected = connected.indexOf(n.id) >= 0;
      var checked = (draft.networks || []).indexOf(n.id) >= 0;
      // Media compatibility gate: hide network if it can't accept the attached media type
      var compat = n.accepts === 'both' || draftMediaType === 'none' || n.accepts === draftMediaType;
      var disabled = !isConnected || !compat;
      var reason = !isConnected ? '(not connected)' : (!compat ? (n.accepts === 'video' ? '(needs video)' : '(photo only)') : '');
      html += '<label data-net="' + n.id + '" data-accepts="' + n.accepts + '" style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:20px;border:2px solid ' + (checked ? n.color : 'var(--border)') + ';background:' + (checked ? n.color + '14' : (disabled ? '#f9fafb' : 'var(--white)')) + ';cursor:' + (disabled ? 'not-allowed' : 'pointer') + ';opacity:' + (disabled ? 0.45 : 1) + ';font-size:13px;font-weight:600;">'
        + '<input type="checkbox" value="' + n.id + '" ' + (checked && !disabled ? 'checked' : '') + ' ' + (disabled ? 'disabled' : '') + ' style="margin:0;">'
        + n.icon + ' ' + n.name
        + (reason ? ' <span style="font-size:10px;color:var(--text-light);">' + reason + '</span>' : '')
        + '</label>';
    });
    html += '</div>'
      + '<div id="sb-media-type-hint" style="font-size:11px;color:var(--text-light);margin-top:6px;">' + (draftMediaType === 'video' ? 'Video detected — GMB excluded (no video support).' : draftMediaType === 'image' ? 'Photo detected — YouTube/TikTok hidden.' : 'Attach media to enable more networks.') + '</div>'
      + '</div>';

    html += '<div style="margin-top:16px;"><label style="display:block;font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">Schedule (optional)</label>'
      + '<input type="datetime-local" id="sb-schedule" value="' + (draft.scheduledAt ? new Date(draft.scheduledAt).toISOString().slice(0,16) : '') + '" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;">'
      + '<div style="font-size:11px;color:var(--text-light);margin-top:4px;">Leave empty to publish immediately.</div>'
      + '</div>';

    // Hashtag groups + AI + library row
    var hgroups = SocialBranch._getHashtagGroups();
    html += '<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
      + '<button id="sb-ai-btn" type="button" onclick="SocialBranch._aiCaption()" style="background:var(--white);border:1px solid var(--border);padding:8px 14px;border-radius:8px;font-size:13px;cursor:pointer;">AI Caption</button>'
      + '<button type="button" onclick="SocialBranch._saveToContentLib()" style="background:var(--white);border:1px solid var(--border);padding:8px 14px;border-radius:8px;font-size:13px;cursor:pointer;">Save to Library</button>'
      + '<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">'
      +   '<span style="font-size:11px;color:var(--text-light);">Hashtags:</span>'
      +   (hgroups.length
            ? hgroups.map(function(g){ return '<button type="button" onclick="SocialBranch._insertHashtagGroup(\'' + g.id + '\')" title="Insert ' + UI.esc(g.tags) + '" style="background:var(--bg);border:1px solid var(--border);padding:4px 10px;border-radius:14px;font-size:11px;cursor:pointer;">' + UI.esc(g.name) + '</button>'; }).join('')
            : '<span style="font-size:11px;color:var(--text-light);">none yet</span>')
      +   '<button type="button" onclick="SocialBranch._createHashtagGroup()" style="background:none;border:1px dashed var(--border);padding:4px 10px;border-radius:14px;font-size:11px;cursor:pointer;color:var(--text-light);">+ New</button>'
      + '</div>'
      + '</div>';

    html += '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button onclick="SocialBranch._savePost(\'post\')" class="btn btn-primary" style="font-size:14px;">Publish / Schedule</button>'
      + '<button onclick="SocialBranch._savePost(\'draft\')" style="background:var(--white);border:1px solid var(--border);padding:10px 16px;border-radius:8px;font-size:14px;cursor:pointer;">Save draft</button>'
      + '<button onclick="SocialBranch._clearDraft()" style="background:none;border:none;color:var(--text-light);padding:10px;cursor:pointer;font-size:13px;">Cancel</button>'
      + '</div>';

    html += '</div>';

    // Right — preview
    html += '<div>'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px;position:sticky;top:12px;">'
      +   '<div style="font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px;">Live Preview</div>'
      +   '<div id="sb-preview" style="background:var(--bg);border-radius:8px;padding:14px;font-size:13px;color:var(--text);min-height:120px;white-space:pre-wrap;word-break:break-word;">' + UI.esc(draft.caption || '(your caption will appear here)') + '</div>'
      +   '<div style="margin-top:12px;font-size:11px;color:var(--text-light);line-height:1.5;">Each network shortens differently. X caps at 280, GMB recommends 150, IG auto-shows 125 before "more".</div>'
      + '</div></div>';

    html += '</div>';

    // Restore media previews after render
    setTimeout(function() {
      var ta = document.getElementById('sb-caption');
      var cc = document.getElementById('sb-charcount');
      var pv = document.getElementById('sb-preview');
      if (ta) {
        var upd = function() {
          if (cc) cc.textContent = (ta.value.length) + ' / 2200';
          if (pv) pv.textContent = ta.value || '(your caption will appear here)';
        };
        ta.addEventListener('input', upd); upd();
      }
      SocialBranch._renderMediaPreview(draft.media || []);
    }, 50);

    return html;
  },

  _renderMediaPreview: function(media) {
    var host = document.getElementById('sb-media-preview');
    if (!host) return;
    SocialBranch._draftMedia = media.slice();
    if (media.length === 0) { host.innerHTML = '<div style="color:var(--text-light);font-size:12px;padding:12px;">No media attached yet.</div>'; return; }
    host.innerHTML = media.map(function(src, i) {
      var type = SocialBranch._detectMediaType(src);
      var preview = type === 'video'
        ? '<video src="' + UI.esc(src) + '" style="width:100%;height:100%;object-fit:cover;" muted playsinline></video><div style="position:absolute;left:4px;bottom:4px;background:rgba(0,0,0,.7);color:#fff;font-size:10px;padding:1px 5px;border-radius:3px;letter-spacing:.5px;font-weight:700;">VIDEO</div>'
        : '<img src="' + UI.esc(src) + '" style="width:100%;height:100%;object-fit:cover;">';
      return '<div style="position:relative;width:84px;height:84px;border-radius:6px;overflow:hidden;background:var(--bg);">'
        + preview
        + '<button onclick="SocialBranch._removeMedia(' + i + ')" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.6);color:#fff;border:none;width:20px;height:20px;border-radius:50%;cursor:pointer;font-size:12px;line-height:1;">×</button>'
        + '</div>';
    }).join('');
    // Update network compat in place (don't full-page-reload or we lose caption scroll/cursor)
    if (document.getElementById('sb-networks') && SocialBranch._tab === 'compose') {
      var mediaType = SocialBranch._detectBatchMediaType(media);
      document.querySelectorAll('#sb-networks label[data-net]').forEach(function(lbl) {
        var accepts = lbl.getAttribute('data-accepts') || 'both';
        var compat = accepts === 'both' || mediaType === 'none' || accepts === mediaType;
        var cb = lbl.querySelector('input[type="checkbox"]');
        var isConnected = SocialBranch._getConnectedNetworks().indexOf(lbl.getAttribute('data-net')) >= 0;
        var disabled = !isConnected || !compat;
        if (cb) { cb.disabled = disabled; if (disabled) cb.checked = false; }
        lbl.style.opacity = disabled ? 0.45 : 1;
        lbl.style.cursor = disabled ? 'not-allowed' : 'pointer';
      });
      var hint = document.getElementById('sb-media-type-hint');
      if (hint) hint.textContent = mediaType === 'video' ? 'Video detected — GMB excluded (no video support).' : mediaType === 'image' ? 'Photo detected — YouTube/TikTok hidden.' : 'Attach media to enable more networks.';
    }
  },

  _removeMedia: function(i) {
    SocialBranch._draftMedia.splice(i, 1);
    SocialBranch._renderMediaPreview(SocialBranch._draftMedia);
  },

  _uploadMedia: function(e) {
    var files = e.target.files; if (!files || !files.length) return;
    var existing = SocialBranch._draftMedia || [];
    Array.prototype.forEach.call(files, function(f) {
      var reader = new FileReader();
      reader.onload = function(evt) {
        existing.push(evt.target.result);
        SocialBranch._renderMediaPreview(existing);
      };
      reader.readAsDataURL(f);
    });
  },

  _pickFromMediaCenter: function() {
    // Pull from Media Center's stored photos
    var photos = [];
    try { photos = JSON.parse(localStorage.getItem('bm-media-library') || '[]'); } catch(e) {}
    if (photos.length === 0) { UI.toast('Media Center is empty — upload photos there first', 'warn'); return; }
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    var box = document.createElement('div');
    box.style.cssText = 'background:var(--white);border-radius:12px;max-width:640px;width:100%;max-height:80vh;overflow:auto;padding:20px;';
    var grid = photos.map(function(p, i) {
      var src = p.url || p.data || p;
      return '<div onclick="SocialBranch._addMediaFromLib(' + i + ');event.currentTarget.style.outline=\'3px solid var(--green-dark)\';" style="cursor:pointer;aspect-ratio:1;border-radius:6px;overflow:hidden;background:var(--bg);"><img src="' + UI.esc(src) + '" style="width:100%;height:100%;object-fit:cover;"></div>';
    }).join('');
    box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><h3 style="margin:0;">Pick photos</h3><button onclick="this.closest(\'.sb-modal\').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;">×</button></div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;">' + grid + '</div>'
      + '<div style="margin-top:14px;text-align:right;"><button onclick="this.closest(\'.sb-modal\').remove()" class="btn btn-primary">Done</button></div>';
    overlay.className = 'sb-modal';
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    SocialBranch._libPhotos = photos;
  },

  _addMediaFromLib: function(i) {
    var p = (SocialBranch._libPhotos || [])[i]; if (!p) return;
    var src = p.url || p.data || p;
    var existing = SocialBranch._draftMedia || [];
    if (existing.indexOf(src) < 0) existing.push(src);
    SocialBranch._renderMediaPreview(existing);
  },

  _savePost: function(action) {
    var caption = (document.getElementById('sb-caption') || {}).value || '';
    var schedule = (document.getElementById('sb-schedule') || {}).value || '';
    var networkInputs = document.querySelectorAll('#sb-networks input[type="checkbox"]:checked');
    var networks = Array.prototype.map.call(networkInputs, function(i) { return i.value; });

    if (action === 'post' && !networks.length) { UI.toast('Pick at least one network', 'error'); return; }
    if (action === 'post' && !caption && !(SocialBranch._draftMedia || []).length) { UI.toast('Add a caption or media', 'error'); return; }

    var post = SocialBranch._editingPost || {};
    post.id = post.id || ('sbp_' + Date.now() + '_' + Math.random().toString(36).slice(2,8));
    post.caption = caption;
    post.media = (SocialBranch._draftMedia || []).slice();
    post.networks = networks;
    post.scheduledAt = schedule ? new Date(schedule).toISOString() : '';
    post.createdAt = post.createdAt || new Date().toISOString();

    if (action === 'draft') {
      post.status = 'draft';
    } else if (schedule) {
      post.status = 'scheduled';
    } else {
      post.status = 'posting';
    }

    SocialBranch._upsertPost(post);
    SocialBranch._editingPost = null;
    SocialBranch._draftMedia = [];

    if (post.status === 'posting') {
      SocialBranch._publishNow(post);
    } else {
      UI.toast(post.status === 'scheduled' ? 'Scheduled.' : 'Draft saved.');
      SocialBranch._goTab('dashboard');
    }
  },

  _clearDraft: function() {
    SocialBranch._editingPost = null;
    SocialBranch._draftMedia = [];
    SocialBranch._goTab('dashboard');
  },

  _editPost: function(id) {
    var p = SocialBranch._getPosts().find(function(x){ return x.id === id; });
    if (!p) return;
    SocialBranch._editingPost = Object.assign({}, p);
    SocialBranch._draftMedia = (p.media || []).slice();
    SocialBranch._goTab('compose');
  },

  // ─────────────────────────────────────────────────────────
  // PUBLISH — routes per network to the right backend
  // ─────────────────────────────────────────────────────────
  _publishNow: function(post) {
    var webhook = localStorage.getItem('bm-socialpilot-webhook') || '';

    // Instagram/GMB/Meta APIs require PUBLIC image URLs, not base64. Upload any
    // data-URL media to Supabase Storage → public URL → send that to webhook.
    SocialBranch._uploadMediaToPublicUrls(post.media || []).then(function(publicMedia) {
      var mediaType = SocialBranch._detectBatchMediaType(publicMedia);
      var payload = {
        id: post.id,
        caption: post.caption,
        imageUrl: mediaType === 'image' ? (publicMedia[0] || '') : '',
        videoUrl: mediaType === 'video' ? (publicMedia[0] || '') : '',
        mediaUrl: publicMedia[0] || '',
        mediaType: mediaType,
        media: publicMedia,
        platforms: post.networks,
        scheduledAt: post.scheduledAt || '',
        // YouTube-specific: first 100 chars of caption as title
        youtubeTitle: (post.caption || '').substring(0, 100)
      };

      if (webhook) {
        fetch(webhook, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
          .then(function(r) {
            post.status = r.ok ? 'posted' : 'failed';
            post.postedAt = new Date().toISOString();
            post.results = { httpStatus: r.status, backend: 'webhook', publicMedia: publicMedia };
            SocialBranch._upsertPost(post);
            UI.toast(r.ok ? 'Post sent.' : 'Post failed — check webhook.', r.ok ? 'success' : 'error');
            SocialBranch._goTab('dashboard');
          })
          .catch(function(e) {
            post.status = 'failed';
            post.results = { error: String(e.message || e), backend: 'webhook' };
            SocialBranch._upsertPost(post);
            UI.toast('Network error.', 'error');
            SocialBranch._goTab('dashboard');
          });
        return;
      }

      // No webhook, no direct APIs yet — save as draft
      post.status = 'draft';
      post.results = { note: 'No backend configured. Connect a webhook in Accounts or wait for direct APIs.' };
      SocialBranch._upsertPost(post);
      UI.toast('Saved as draft — connect a backend in Accounts tab.', 'warn');
      SocialBranch._goTab('accounts');
    }).catch(function(err) {
      post.status = 'failed';
      post.results = { error: 'Media upload failed: ' + String(err.message || err) };
      SocialBranch._upsertPost(post);
      UI.toast('Couldn\'t upload media: ' + String(err.message || err), 'error');
      SocialBranch._goTab('dashboard');
    });
  },

  // Upload any base64/data-URL media to Supabase Storage and return an array
  // of public URLs. If an item is already a public URL, pass it through.
  _uploadMediaToPublicUrls: function(media) {
    if (!media || !media.length) return Promise.resolve([]);
    var url = localStorage.getItem('bm-supabase-url') || '';
    var key = localStorage.getItem('bm-supabase-key') || '';
    if (!url || !key) return Promise.reject(new Error('Supabase not configured'));
    var bucket = 'social-media';
    return Promise.all(media.map(function(src, i) {
      // Already a public URL? pass through.
      if (/^https?:\/\//i.test(src)) return Promise.resolve(src);
      if (!/^data:/.test(src)) return Promise.reject(new Error('Unsupported media source at index ' + i));
      // Parse data URL
      var match = /^data:([^;]+);base64,(.+)$/.exec(src);
      if (!match) return Promise.reject(new Error('Bad data URL at index ' + i));
      var contentType = match[1];
      var b64 = match[2];
      var ext = (contentType.split('/')[1] || 'bin').replace(/\+.+$/, '');
      var filename = 'sb_' + Date.now() + '_' + Math.random().toString(36).slice(2,8) + '.' + ext;
      // Decode base64 to Blob
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
      var blob = new Blob([bytes], { type: contentType });
      var uploadUrl = url.replace(/\/$/, '') + '/storage/v1/object/' + bucket + '/' + filename;
      return fetch(uploadUrl, {
        method: 'POST',
        headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': contentType, 'x-upsert': 'true' },
        body: blob
      }).then(function(r) {
        if (!r.ok) return r.text().then(function(t) { throw new Error('Upload ' + r.status + ': ' + t.slice(0,120)); });
        return url.replace(/\/$/, '') + '/storage/v1/object/public/' + bucket + '/' + filename;
      });
    }));
  },

  // ─────────────────────────────────────────────────────────
  // CALENDAR
  // ─────────────────────────────────────────────────────────
  _calView: 'month',   // 'month' | 'week' | 'day'
  _calOffset: 0,       // months (if month view), weeks (if week), days (if day)

  _renderCalendar: function() {
    var allPosts = SocialBranch._getPosts();
    var posts = allPosts.filter(function(p) { return p.status === 'scheduled' || p.status === 'posted'; });
    // Unscheduled = drafts + scheduled-with-no-date + SP imports with no date
    var unscheduled = allPosts.filter(function(p) {
      if (p.status === 'draft') return true;
      if (p.status === 'scheduled' && !p.scheduledAt) return true;
      return false;
    });
    var view = SocialBranch._calView || 'month';
    var now = new Date();
    var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    // Stacked layout (v382): Unscheduled tray on top + calendar below.
    // Was 2-column (260px | 1fr) — too narrow for the tray, ate calendar width.
    var html = '<div style="display:flex;flex-direction:column;gap:12px;" class="sb-cal-grid">';

    // TOP — Unscheduled tray (draggable chips, horizontal scroll if many)
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      +   '<h3 style="margin:0;font-size:14px;">Unscheduled (' + unscheduled.length + ')</h3>'
      +   '<button onclick="SocialBranch._goTab(\'compose\')" style="background:none;border:1px solid var(--border);padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer;">+ New</button>'
      + '</div>'
      + '<p style="font-size:11px;color:var(--text-light);margin:0 0 10px;">Drag any of these onto a date to schedule.</p>'
      + '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;">';
    if (unscheduled.length === 0) {
      html += '<div style="padding:20px;text-align:center;color:var(--text-light);font-size:12px;">All caught up — no unscheduled posts.</div>';
    } else {
      unscheduled.forEach(function(p) {
        var nets = (p.networks || []).slice(0, 4).map(function(nId) {
          var n = SocialBranch.NETWORKS.find(function(x){ return x.id === nId; });
          return n ? '<span style="color:' + n.color + ';">' + SocialBranch._netIcon(n.icon, 10) + '</span>' : '';
        }).join('');
        var caption = UI.esc((p.caption || '(no caption)').substring(0, 90));
        var thumb = (p.media && p.media[0] && /^https?:|^data:image/.test(p.media[0]))
          ? '<img src="' + UI.esc(p.media[0]) + '" style="width:34px;height:34px;border-radius:4px;object-fit:cover;flex-shrink:0;">'
          : '';
        // Horizontal card (v382): min-width keeps each chip readable in the strip.
        html += '<div data-post-id="' + UI.esc(p.id) + '" draggable="true" onclick="SocialBranch._editPost(\'' + p.id + '\')" style="display:flex;gap:8px;align-items:flex-start;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;cursor:grab;font-size:12px;line-height:1.3;min-width:220px;max-width:260px;flex-shrink:0;">'
          + thumb
          + '<div style="flex:1;min-width:0;">'
          +   '<div style="display:flex;gap:4px;margin-bottom:2px;">' + nets + '</div>'
          +   '<div style="overflow:hidden;text-overflow:ellipsis;">' + caption + '</div>'
          + '</div>'
          + '</div>';
      });
    }
    html += '</div></div>'; // close horizontal-strip + tray

    // BELOW — calendar proper
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">';
    html += '<div style="display:flex;align-items:center;gap:8px;">'
      +   '<button onclick="SocialBranch._calOffset--;loadPage(\'socialbranch\');" style="background:var(--white);border:1px solid var(--border);width:32px;height:32px;border-radius:6px;cursor:pointer;">&larr;</button>'
      +   '<button onclick="SocialBranch._calOffset=0;loadPage(\'socialbranch\');" style="background:var(--white);border:1px solid var(--border);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;">Today</button>'
      +   '<button onclick="SocialBranch._calOffset++;loadPage(\'socialbranch\');" style="background:var(--white);border:1px solid var(--border);width:32px;height:32px;border-radius:6px;cursor:pointer;">&rarr;</button>'
      + '</div>';
    // View toggle
    html += '<div style="display:flex;gap:0;border:1px solid var(--border);border-radius:6px;overflow:hidden;">'
      +   ['day','week','month'].map(function(v) {
            var active = view === v;
            return '<button onclick="SocialBranch._calView=\'' + v + '\';SocialBranch._calOffset=0;loadPage(\'socialbranch\');" style="background:' + (active ? 'var(--green-dark)' : 'var(--white)') + ';color:' + (active ? '#fff' : 'var(--text)') + ';border:none;padding:6px 14px;font-size:12px;font-weight:' + (active ? '700' : '500') + ';cursor:pointer;text-transform:capitalize;">' + v + '</button>';
          }).join('')
      + '</div>';
    html += '</div>'; // close toolbar row

    function dayPostsFor(dateObj) {
      var key = dateObj.toISOString().slice(0, 10);
      return posts.filter(function(p) {
        var when = p.scheduledAt || p.postedAt;
        return when && when.slice(0, 10) === key;
      });
    }
    function renderDayCellContent(dayPosts) {
      var out = '';
      dayPosts.slice(0, 6).forEach(function(p) {
        var nets = (p.networks || []).slice(0, 4).map(function(nId) {
          var n = SocialBranch.NETWORKS.find(function(x){ return x.id === nId; });
          return n ? '<span style="color:' + n.color + ';">' + SocialBranch._netIcon(n.icon, 10) + '</span>' : '';
        }).join('');
        var draggable = p.status === 'scheduled' ? ' data-post-id="' + UI.esc(p.id) + '" style="cursor:grab;' : ' style="cursor:pointer;';
        out += '<div onclick="SocialBranch._editPost(\'' + p.id + '\')"' + draggable + 'background:var(--bg);border-radius:4px;padding:3px 5px;margin-bottom:2px;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;gap:4px;align-items:center;" title="' + (p.status === 'scheduled' ? 'Drag to reschedule, or click to edit' : 'Click to view') + '">' + nets + '<span>' + UI.esc((p.caption || '').substring(0, 22)) + '</span></div>';
      });
      if (dayPosts.length > 6) out += '<div style="font-size:10px;color:var(--text-light);">+' + (dayPosts.length - 6) + ' more</div>';
      return out;
    }

    if (view === 'month') {
      var year = now.getFullYear(), month = now.getMonth() + SocialBranch._calOffset;
      var first = new Date(year, month, 1);
      var daysInMonth = new Date(year, month+1, 0).getDate();
      var startDay = first.getDay();
      var title = first.toLocaleString('en-US', { month:'long', year:'numeric' });
      html += '<h3 style="margin:0 0 10px;font-size:18px;">' + title + '</h3>';
      html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;margin-bottom:6px;">'
        + dayNames.map(function(d){ return '<div style="text-align:center;padding:6px 0;">'+d+'</div>'; }).join('')
        + '</div>';
      html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">';
      for (var i = 0; i < startDay; i++) html += '<div></div>';
      for (var d = 1; d <= daysInMonth; d++) {
        var dayDate = new Date(first.getFullYear(), first.getMonth(), d);
        var isToday = dayDate.toDateString() === now.toDateString();
        var dayKey = dayDate.toISOString().slice(0,10);
        html += '<div data-day-key="' + dayKey + '" style="min-height:80px;padding:6px;border:1px solid ' + (isToday ? 'var(--green-dark)' : 'var(--border)') + ';border-radius:6px;background:' + (isToday ? 'var(--green-bg)' : 'var(--white)') + ';">'
          + '<div style="font-size:11px;font-weight:700;color:' + (isToday ? 'var(--green-dark)' : 'var(--text-light)') + ';margin-bottom:4px;">' + d + '</div>'
          + renderDayCellContent(dayPostsFor(dayDate))
          + '</div>';
      }
      html += '</div>';
    } else if (view === 'week') {
      // Find Sunday of the target week
      var base = new Date(now.getTime() + SocialBranch._calOffset * 7 * 86400000);
      var weekStart = new Date(base); weekStart.setDate(base.getDate() - base.getDay()); weekStart.setHours(0,0,0,0);
      var weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
      var title = weekStart.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' – ' + weekEnd.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      html += '<h3 style="margin:0 0 10px;font-size:18px;">Week of ' + title + '</h3>';
      html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;">';
      for (var wd = 0; wd < 7; wd++) {
        var dayDate = new Date(weekStart); dayDate.setDate(weekStart.getDate() + wd);
        var isToday = dayDate.toDateString() === now.toDateString();
        var dayKey = dayDate.toISOString().slice(0,10);
        html += '<div data-day-key="' + dayKey + '" style="min-height:260px;padding:8px;border:1px solid ' + (isToday ? 'var(--green-dark)' : 'var(--border)') + ';border-radius:8px;background:' + (isToday ? 'var(--green-bg)' : 'var(--white)') + ';">'
          + '<div style="font-size:11px;font-weight:700;color:' + (isToday ? 'var(--green-dark)' : 'var(--text-light)') + ';text-transform:uppercase;margin-bottom:4px;">' + dayNames[dayDate.getDay()] + ' ' + dayDate.getDate() + '</div>'
          + renderDayCellContent(dayPostsFor(dayDate))
          + '</div>';
      }
      html += '</div>';
    } else { // day
      var dayDate = new Date(now.getTime() + SocialBranch._calOffset * 86400000);
      var title = dayDate.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
      html += '<h3 style="margin:0 0 10px;font-size:18px;">' + title + '</h3>';
      var dp = dayPostsFor(dayDate);
      if (dp.length === 0) {
        html += '<div style="padding:40px;text-align:center;color:var(--text-light);font-size:14px;">No posts scheduled or published on this day.</div>';
      } else {
        dp.forEach(function(p) {
          var t = p.scheduledAt || p.postedAt;
          var timeLabel = t ? new Date(t).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '';
          var nets = (p.networks || []).map(function(nId) {
            var n = SocialBranch.NETWORKS.find(function(x){ return x.id === nId; });
            return n ? '<span title="' + n.name + '" style="color:' + n.color + ';margin-right:6px;">' + SocialBranch._netIcon(n.icon, 14) + '</span>' : '';
          }).join('');
          html += '<div onclick="SocialBranch._editPost(\'' + p.id + '\')" style="display:flex;gap:12px;padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;cursor:pointer;">'
            +   '<div style="font-weight:700;color:var(--text-light);min-width:80px;">' + timeLabel + '</div>'
            +   '<div style="flex:1;">'
            +     '<div style="margin-bottom:4px;">' + nets + '</div>'
            +     '<div style="font-size:13px;">' + UI.esc((p.caption || '(no caption)').substring(0, 200)) + '</div>'
            +   '</div>'
            +   SocialBranch._statusBadge(p.status)
            + '</div>';
        });
      }
    }
    html += '</div>'; // close right column (calendar)
    html += '</div>'; // close two-column grid
    return html;
  },

  // ─────────────────────────────────────────────────────────
  // ACCOUNTS
  // ─────────────────────────────────────────────────────────
  _renderAccounts: function() {
    var connected = SocialBranch._getConnectedNetworks();
    var webhook = localStorage.getItem('bm-socialpilot-webhook') || '';
    var gmbToken = localStorage.getItem('bm-gmb-access-token') || '';

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:14px;">'
      + '<h3 style="margin:0 0 8px;font-size:16px;">Backends</h3>'
      + '<p style="color:var(--text-light);font-size:13px;margin:0 0 16px;">SocialBranch routes posts through the first configured backend. Webhook works today on any plan; direct APIs come online as you connect OAuth per network.</p>';

    // Webhook row
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:10px;">'
      + '<div><div style="font-weight:700;font-size:14px;">Zapier / Make Webhook</div>'
      + '<div style="font-size:12px;color:var(--text-light);">' + (webhook ? 'Configured: ' + webhook.substring(0, 50) + '…' : 'Not set') + '</div></div>'
      + '<button onclick="loadPage(\'settings\')" style="background:var(--white);border:1px solid var(--border);padding:8px 14px;border-radius:6px;font-size:12px;cursor:pointer;">Configure</button>'
      + '</div>';

    // GMB row
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:10px;">'
      + '<div><div style="font-weight:700;font-size:14px;">Google Business Profile</div>'
      + '<div style="font-size:12px;color:var(--text-light);">' + (gmbToken ? 'Connected' : 'Not connected') + '</div></div>'
      + '<button onclick="loadPage(\'settings\')" style="background:var(--white);border:1px solid var(--border);padding:8px 14px;border-radius:6px;font-size:12px;cursor:pointer;">Configure</button>'
      + '</div>';

    html += '</div>';

    // SocialPilot Import + Content Library panel
    var allPosts = SocialBranch._getPosts();
    var spImported = allPosts.filter(function(p){ return p.import_source === 'socialpilot-html-scrape'; }).length;
    var libItems = SocialBranch._getContentLib();
    var hGroups = SocialBranch._getHashtagGroups();
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:14px;">'
      + '<h3 style="margin:0 0 12px;font-size:16px;">Tools</h3>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">'
      // SP Import
      +   '<div style="padding:12px;border:1px solid var(--border);border-radius:8px;">'
      +     '<div style="font-weight:700;font-size:14px;margin-bottom:4px;">Import SocialPilot History</div>'
      +     '<div style="font-size:12px;color:var(--text-light);margin-bottom:8px;">57 posts scraped Apr 23. ' + (spImported > 0 ? spImported + ' already imported.' : 'Not imported yet.') + '</div>'
      +     '<button id="sb-sp-import-btn" onclick="SocialBranch.importFromSocialPilot()" ' + (spImported > 0 ? 'disabled' : '') + ' class="btn btn-outline" style="font-size:12px;">' + (spImported > 0 ? 'Already imported' : 'Import now') + '</button>'
      +   '</div>'
      // Content Library summary
      +   '<div style="padding:12px;border:1px solid var(--border);border-radius:8px;">'
      +     '<div style="font-weight:700;font-size:14px;margin-bottom:4px;">Content Library</div>'
      +     '<div style="font-size:12px;color:var(--text-light);margin-bottom:8px;">' + libItems.length + ' saved caption' + (libItems.length === 1 ? '' : 's') + '. Use "Save to Library" in Compose to add.</div>'
      +     (libItems.length ? '<div style="max-height:140px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:4px;">' + libItems.map(function(it) { return '<div style="display:flex;gap:6px;align-items:center;padding:4px 6px;font-size:12px;"><button onclick="SocialBranch._insertFromContentLib(\'' + it.id + '\')" style="flex:1;text-align:left;background:none;border:none;cursor:pointer;font-size:12px;">' + UI.esc(it.label) + '</button><button onclick="SocialBranch._deleteFromContentLib(\'' + it.id + '\')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:11px;">remove</button></div>'; }).join('') + '</div>' : '')
      +   '</div>'
      // Hashtag Groups summary
      +   '<div style="padding:12px;border:1px solid var(--border);border-radius:8px;">'
      +     '<div style="font-weight:700;font-size:14px;margin-bottom:4px;">Hashtag Groups</div>'
      +     '<div style="font-size:12px;color:var(--text-light);margin-bottom:8px;">' + hGroups.length + ' group' + (hGroups.length === 1 ? '' : 's') + '. Insert with one click from Compose.</div>'
      +     (hGroups.length ? '<div style="display:flex;flex-wrap:wrap;gap:4px;">' + hGroups.map(function(g){ return '<span style="display:inline-flex;gap:4px;align-items:center;background:var(--bg);border-radius:12px;padding:3px 8px;font-size:11px;">' + UI.esc(g.name) + '<button onclick="SocialBranch._deleteHashtagGroup(\'' + g.id + '\')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:11px;">×</button></span>'; }).join('') + '</div>' : '')
      +     '<button onclick="SocialBranch._createHashtagGroup()" style="margin-top:6px;background:none;border:1px dashed var(--border);padding:4px 10px;border-radius:14px;font-size:11px;cursor:pointer;color:var(--text-light);">+ New group</button>'
      +   '</div>'
      + '</div>'
      + '</div>';

    // Native compose URLs — open the platform's "new post" UI in a new tab.
    // Used by the manual-post fallback when no backend is configured. Where a
    // network has no public web composer (Instagram, TikTok app-only), we
    // provide the closest workable surface or skip the link.
    var COMPOSE_URLS = {
      'gmb':       'https://business.google.com/posts/',
      'facebook':  'https://www.facebook.com/?ref=composer',
      'instagram': 'https://www.instagram.com/',
      'youtube':   'https://www.youtube.com/upload',
      'linkedin':  'https://www.linkedin.com/feed/?shareActive=true&mini=true',
      'tiktok':    'https://www.tiktok.com/upload',
      'x':         'https://twitter.com/intent/tweet'
    };

    // Network map — honest about what's working
    var hasWebhook = !!webhook;
    var bannerColor = hasWebhook ? '#16a34a' : '#d97706';
    var bannerBg    = hasWebhook ? '#dcfce7' : '#fef3c7';
    var bannerMsg   = hasWebhook
      ? 'Webhook backend is configured — posts to checked networks route through Zapier/Make on schedule.'
      : 'No backend configured — scheduled posts will NOT publish anywhere. Either set a Zapier webhook above OR use the Copy & Post buttons below.';

    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:6px;">'
      +   '<h3 style="margin:0;font-size:16px;">Networks</h3>'
      +   '<span style="font-size:11px;color:var(--text-light);">Direct OAuth per network is on the roadmap. Today: Webhook OR Manual.</span>'
      + '</div>'
      + '<div style="background:' + bannerBg + ';border:1px solid ' + bannerColor + ';border-radius:8px;padding:10px 14px;font-size:12px;color:#444;margin-bottom:14px;">'
      +   '<strong style="color:' + bannerColor + ';">' + (hasWebhook ? 'Active' : 'Inactive') + '</strong> — ' + bannerMsg
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;">';
    SocialBranch.NETWORKS.forEach(function(n) {
      var isC = connected.indexOf(n.id) >= 0;
      var stateLabel, stateColor;
      if (isC) {
        stateLabel = '✓ Direct OAuth';
        stateColor = 'var(--green-dark)';
      } else if (hasWebhook) {
        stateLabel = 'Routes via Webhook';
        stateColor = '#16a34a';
      } else {
        stateLabel = 'Manual posting';
        stateColor = 'var(--text-light)';
      }
      var composeUrl = COMPOSE_URLS[n.id] || '';
      html += '<div style="padding:14px;border:1px solid var(--border);border-radius:10px;background:' + (isC ? n.color + '10' : 'var(--white)') + ';">'
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;"><span style="color:' + n.color + ';">' + SocialBranch._netIcon(n.icon, 20) + '</span><div style="font-weight:700;">' + n.name + '</div></div>'
        + '<div style="font-size:12px;color:' + stateColor + ';font-weight:600;margin-bottom:8px;">' + stateLabel + '</div>'
        + (composeUrl
            ? '<button onclick="SocialBranch._manualPost(\'' + n.id + '\',\'' + composeUrl + '\')" '
              +   'style="background:none;border:1px solid var(--border);padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer;color:var(--text);width:100%;" '
              +   'title="Copy your latest draft + open ' + n.name + ' compose">'
              + '📋 Copy & Open ' + n.name + ' →'
              + '</button>'
            : '<div style="font-size:11px;color:var(--text-light);font-style:italic;">No web composer — use the mobile app</div>')
        + '</div>';
    });
    html += '</div></div>';

    return html;
  },

  // v463: manual-post fallback — copy latest draft caption to clipboard then
  // open the network's native compose URL. For networks without OAuth or a
  // webhook configured, this is the realistic path: Doug copies the post,
  // pastes into Facebook/X/etc directly. Better than the old "Awaiting backend"
  // dead-end that left users not knowing posts wouldn't publish.
  _manualPost: function(networkId, composeUrl) {
    var posts = SocialBranch._getPosts();
    var draft = posts.filter(function(p) {
      return (p.status === 'draft' || p.status === 'scheduled') && p.caption;
    }).sort(function(a, b) {
      return new Date(b.scheduledAt || b.createdAt || 0) - new Date(a.scheduledAt || a.createdAt || 0);
    })[0];
    var caption = (draft && draft.caption) || '';
    if (caption && navigator.clipboard) {
      navigator.clipboard.writeText(caption).then(function() {
        UI.toast('📋 Copied latest draft to clipboard — paste into ' + networkId);
      }).catch(function() {
        UI.toast('Could not copy — opening compose blank');
      });
    } else if (!caption) {
      UI.toast('No draft caption found — opening blank compose');
    }
    setTimeout(function() { window.open(composeUrl, '_blank', 'noopener,noreferrer'); }, 250);
  },

  // ─────────────────────────────────────────────────────────
  // ANALYTICS (placeholder — real data once direct APIs connect)
  // ─────────────────────────────────────────────────────────
  _renderAnalytics: function() {
    var all = SocialBranch._getPosts();
    var posted = all.filter(function(p){ return p.status === 'posted'; });
    var scheduled = all.filter(function(p){ return p.status === 'scheduled'; });
    var failed = all.filter(function(p){ return p.status === 'failed'; });
    var drafts = all.filter(function(p){ return p.status === 'draft'; });
    var byNetwork = {};
    posted.forEach(function(p){ (p.networks||[]).forEach(function(n){ byNetwork[n]=(byNetwork[n]||0)+1; }); });

    // Day-of-week distribution for posted (when are you posting most?)
    var dayOfWeek = [0,0,0,0,0,0,0];
    posted.forEach(function(p) {
      var t = p.postedAt || p.scheduledAt; if (!t) return;
      dayOfWeek[new Date(t).getDay()]++;
    });
    var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var maxDay = Math.max.apply(null, dayOfWeek.concat([1]));

    // Hour of day distribution (clustered into 4-hr buckets)
    var buckets = [0,0,0,0,0,0];
    var bucketLabels = ['12a-4a','4a-8a','8a-12p','12p-4p','4p-8p','8p-12a'];
    posted.forEach(function(p) {
      var t = p.postedAt || p.scheduledAt; if (!t) return;
      buckets[Math.floor(new Date(t).getHours()/4)]++;
    });
    var maxBucket = Math.max.apply(null, buckets.concat([1]));

    var html = '';
    // Top KPI row
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:14px;">'
      + SocialBranch._statCard('Posted', posted.length, 'check-circle', 'var(--green-dark)')
      + SocialBranch._statCard('Scheduled', scheduled.length, 'calendar', 'var(--accent)')
      + SocialBranch._statCard('Drafts', drafts.length, 'file-text', 'var(--text-light)')
      + SocialBranch._statCard('Failed', failed.length, 'alert-triangle', 'var(--red)')
      + '</div>';

    // Per-network
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:14px;">'
      + '<h3 style="margin:0 0 12px;font-size:16px;">Posts per network</h3>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">';
    SocialBranch.NETWORKS.forEach(function(n) {
      var c = byNetwork[n.id] || 0;
      html += '<div style="padding:14px;border:1px solid var(--border);border-radius:10px;">'
        + '<div style="font-size:12px;color:var(--text-light);display:flex;align-items:center;gap:6px;"><span style="color:' + n.color + ';">' + SocialBranch._netIcon(n.icon, 14) + '</span>' + n.name + '</div>'
        + '<div style="font-size:22px;font-weight:700;color:' + n.color + ';">' + c + '</div></div>';
    });
    html += '</div></div>';

    // Day-of-week bar chart
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:14px;">'
      + '<h3 style="margin:0 0 12px;font-size:16px;">Posts by day of week</h3>'
      + '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;align-items:end;height:140px;">';
    dayOfWeek.forEach(function(n, i) {
      var h = Math.round((n / maxDay) * 100);
      html += '<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">'
        + '<div style="font-size:11px;font-weight:700;margin-bottom:4px;">' + n + '</div>'
        + '<div style="width:100%;background:var(--green-dark);height:' + h + '%;border-radius:4px 4px 0 0;min-height:2px;"></div>'
        + '<div style="font-size:11px;color:var(--text-light);margin-top:4px;">' + dayNames[i] + '</div>'
        + '</div>';
    });
    html += '</div></div>';

    // Hour-of-day bar chart
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:14px;">'
      + '<h3 style="margin:0 0 12px;font-size:16px;">Posts by time of day</h3>'
      + '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;align-items:end;height:120px;">';
    buckets.forEach(function(n, i) {
      var h = Math.round((n / maxBucket) * 100);
      html += '<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">'
        + '<div style="font-size:11px;font-weight:700;margin-bottom:4px;">' + n + '</div>'
        + '<div style="width:100%;background:var(--accent);height:' + h + '%;border-radius:4px 4px 0 0;min-height:2px;"></div>'
        + '<div style="font-size:10px;color:var(--text-light);margin-top:4px;">' + bucketLabels[i] + '</div>'
        + '</div>';
    });
    html += '</div></div>';

    html += '<div style="padding:12px;background:var(--bg);border-radius:8px;font-size:12px;color:var(--text-light);">Engagement metrics (likes, reach, clicks) require direct API access. They turn on once Meta + GMB API approvals complete (we already submitted GMB; Meta pending your sign-off on docs/meta-app-submission.md).</div>';
    return html;
  },

  // ─────────────────────────────────────────────────────────
  // COMPETITORS — v428: SocialPilot-style competitor tracking
  // Enter a company name + city; AI auto-suggests their socials; track posts/engagement.
  // ─────────────────────────────────────────────────────────
  _competitorsCache: null,
  _competitorsFetched: false,

  _renderCompetitors: function() {
    var self = SocialBranch;
    self._fetchCompetitors();
    var list = self._competitorsCache || [];

    var html = '';
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      +   '<h3 style="margin:0;font-size:16px;display:flex;align-items:center;gap:8px;">' + self._netIcon('binoculars', 16) + 'Competitors (' + list.length + ')</h3>'
      +   '<button onclick="SocialBranch._addCompetitor()" class="btn btn-primary" style="font-size:13px;">+ Add Competitor</button>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Just type the company name + city. AI auto-discovers their website, Facebook page, Instagram, Google Business, YouTube. Then you can see their post cadence + engagement, get content ideas from what works for them.</div>'
      + '</div>';

    if (!list.length) {
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:30px;text-align:center;">'
        + '<div style="font-size:36px;margin-bottom:8px;">🔭</div>'
        + '<div style="font-size:14px;font-weight:700;margin-bottom:4px;">No competitors tracked yet</div>'
        + '<div style="font-size:12px;color:var(--text-light);margin-bottom:14px;">Add a tree service in your area to start tracking their content strategy.</div>'
        + '<button onclick="SocialBranch._addCompetitor()" class="btn btn-primary" style="font-size:13px;">+ Add First Competitor</button>'
        + '</div>';
      return html;
    }

    list.forEach(function(c) {
      var lastCheck = c.last_checked_at ? UI.timeAgo(c.last_checked_at) : 'never checked';
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:10px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:8px;margin-bottom:10px;">'
        +   '<div><div style="font-weight:700;font-size:15px;">' + UI.esc(c.name) + (c.city ? ' <span style="font-size:12px;color:var(--text-light);font-weight:500;">· ' + UI.esc(c.city) + '</span>' : '') + '</div>'
        +   '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">Last check: ' + lastCheck + '</div></div>'
        +   '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
        +     '<button onclick="SocialBranch._refreshCompetitor(\'' + c.id + '\')" class="btn btn-outline" style="font-size:11px;padding:5px 10px;">↻ AI check</button>'
        +     '<button onclick="SocialBranch._editCompetitor(\'' + c.id + '\')" style="background:none;border:1px solid var(--border);font-size:11px;padding:5px 10px;border-radius:6px;cursor:pointer;">Edit</button>'
        +     '<button onclick="SocialBranch._removeCompetitor(\'' + c.id + '\')" style="background:none;border:none;color:var(--text-light);font-size:11px;cursor:pointer;">Remove</button>'
        +   '</div>'
        + '</div>'
        + '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
      var links = [
        ['website', c.website, '🌐 Website'],
        ['facebook', c.facebook_url, '📘 Facebook'],
        ['instagram', c.instagram_handle ? 'https://instagram.com/' + c.instagram_handle.replace(/^@/, '') : '', '📷 Instagram'],
        ['gmb', c.gmb_url, '📍 Google Business'],
        ['youtube', c.youtube_url, '🎥 YouTube'],
        ['tiktok', c.tiktok_handle ? 'https://tiktok.com/@' + c.tiktok_handle.replace(/^@/, '') : '', '🎵 TikTok']
      ];
      links.forEach(function(L) {
        if (!L[1]) return;
        html += '<a href="' + UI.esc(L[1]) + '" target="_blank" rel="noopener noreferrer" style="background:var(--bg);border:1px solid var(--border);padding:5px 10px;border-radius:6px;font-size:11px;text-decoration:none;color:var(--text);">' + L[2] + ' →</a>';
      });
      html += '</div>';
      if (c.last_check_summary) {
        html += '<div style="margin-top:10px;padding:10px 12px;background:var(--bg);border-radius:8px;font-size:12px;color:var(--text);"><strong>AI summary:</strong> ' + UI.esc(c.last_check_summary) + '</div>';
      }
      if (c.notes) {
        html += '<div style="margin-top:8px;font-size:12px;color:var(--text-light);">' + UI.esc(c.notes) + '</div>';
      }
      html += '</div>';
    });

    return html;
  },

  _fetchCompetitors: function() {
    if (SocialBranch._competitorsFetched) return;
    SocialBranch._competitorsFetched = true;
    if (!window.SB || !SB.from) return;
    SB.from('competitors').select('*').eq('active', true).order('name', { ascending: true }).then(function(r) {
      if (r.error) { console.warn('competitors fetch:', r.error.message); return; }
      SocialBranch._competitorsCache = r.data || [];
      if (SocialBranch._tab === 'competitors') loadPage('socialbranch');
    });
  },

  _addCompetitor: function() {
    UI.modal({
      title: 'Add Competitor',
      html: '<div style="display:grid;gap:10px;">'
        + '<label style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;">Company Name<input id="c-name" placeholder="e.g. Hudson Valley Tree Care" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-top:4px;"></label>'
        + '<label style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;">City / Region<input id="c-city" placeholder="e.g. Peekskill, NY" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-top:4px;"></label>'
        + '<div style="font-size:12px;color:var(--text-light);margin-top:4px;">After save, AI will auto-discover their website, FB, IG, GMB, YouTube. You can refine manually after.</div>'
        + '</div>',
      buttons: [
        { label: 'Cancel', action: 'close' },
        { label: 'Save & Auto-Discover', primary: true, action: 'SocialBranch._saveCompetitor()' }
      ]
    });
  },

  _saveCompetitor: function() {
    var name = document.getElementById('c-name').value.trim();
    var city = document.getElementById('c-city').value.trim();
    if (!name) { UI.toast('Name required', 'error'); return; }
    var row = {
      tenant_id: window.resolveTenantId(),
      name: name,
      city: city || null,
      active: true
    };
    SB.from('competitors').insert(row).select().single().then(function(r) {
      if (r.error) { UI.toast('Save failed: ' + r.error.message, 'error'); return; }
      UI.toast('Saved — AI is searching for their socials…');
      UI.closeModal();
      SocialBranch._refreshCompetitor(r.data.id, true);
    });
  },

  _refreshCompetitor: function(id, isFresh) {
    var c = (SocialBranch._competitorsCache || []).find(function(x){ return x.id === id; });
    var name = (c && c.name) || '';
    var city = (c && c.city) || '';
    if (!name && !isFresh) {
      // Fetch row first
      SB.from('competitors').select('*').eq('id', id).single().then(function(r) {
        if (!r.error && r.data) SocialBranch._refreshCompetitor(id, true);
      });
      return;
    }
    var prompt = 'Find the social media + web presence for this small business. Return ONLY a JSON object with these keys (use empty string if unknown): {"website":"","facebook_url":"","instagram_handle":"","gmb_url":"","youtube_url":"","tiktok_handle":"","summary":""}. The summary should be 1-2 sentences about their content strategy if you can tell. Business: ' + name + (city ? ' in ' + city : '') + '. Industry: tree service.';
    if (typeof callAI !== 'function' && (!window.AI || !AI.chat)) {
      UI.toast('AI not available — add socials manually via Edit', 'error');
      return;
    }
    UI.toast('AI is searching…');
    var ai = (typeof callAI === 'function') ? callAI(prompt) : AI.chat(prompt);
    Promise.resolve(ai).then(function(resp) {
      var text = typeof resp === 'string' ? resp : (resp && resp.text) || '';
      var m = text.match(/\{[\s\S]*\}/);
      if (!m) { UI.toast('AI returned unexpected format — try Edit manually', 'error'); return; }
      try {
        var data = JSON.parse(m[0]);
        var update = {
          website: data.website || null,
          facebook_url: data.facebook_url || null,
          instagram_handle: data.instagram_handle || null,
          gmb_url: data.gmb_url || null,
          youtube_url: data.youtube_url || null,
          tiktok_handle: data.tiktok_handle || null,
          last_check_summary: data.summary || null,
          last_checked_at: new Date().toISOString()
        };
        SB.from('competitors').update(update).eq('id', id).then(function(r) {
          if (r.error) { UI.toast('Update failed: ' + r.error.message, 'error'); return; }
          UI.toast('AI discovery complete');
          SocialBranch._competitorsFetched = false;
          SocialBranch._fetchCompetitors();
        });
      } catch (e) { UI.toast('AI parse error', 'error'); }
    }).catch(function(e) { UI.toast('AI error: ' + (e && e.message || ''), 'error'); });
  },

  _editCompetitor: function(id) {
    var c = (SocialBranch._competitorsCache || []).find(function(x){ return x.id === id; });
    if (!c) return;
    var fields = [
      ['name', 'Name', c.name],
      ['city', 'City', c.city || ''],
      ['website', 'Website URL', c.website || ''],
      ['facebook_url', 'Facebook URL', c.facebook_url || ''],
      ['instagram_handle', 'Instagram (handle, no @)', c.instagram_handle || ''],
      ['gmb_url', 'Google Business URL', c.gmb_url || ''],
      ['youtube_url', 'YouTube URL', c.youtube_url || ''],
      ['tiktok_handle', 'TikTok (handle, no @)', c.tiktok_handle || ''],
      ['notes', 'Notes', c.notes || '']
    ];
    var rows = fields.map(function(f) {
      return '<label style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;">' + f[1] + '<input id="c-edit-' + f[0] + '" value="' + UI.esc(f[2]) + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:13px;margin-top:4px;"></label>';
    }).join('');
    UI.modal({
      title: 'Edit ' + c.name,
      html: '<div style="display:grid;gap:8px;max-height:60vh;overflow:auto;">' + rows + '</div>',
      buttons: [
        { label: 'Cancel', action: 'close' },
        { label: 'Save', primary: true, action: 'SocialBranch._saveEditCompetitor(\'' + id + '\')' }
      ]
    });
  },

  _saveEditCompetitor: function(id) {
    var keys = ['name','city','website','facebook_url','instagram_handle','gmb_url','youtube_url','tiktok_handle','notes'];
    var update = {};
    keys.forEach(function(k) {
      var el = document.getElementById('c-edit-' + k);
      if (el) update[k] = el.value.trim() || null;
    });
    SB.from('competitors').update(update).eq('id', id).then(function(r) {
      if (r.error) { UI.toast('Save failed: ' + r.error.message, 'error'); return; }
      UI.toast('Saved');
      UI.closeModal();
      SocialBranch._competitorsFetched = false;
      SocialBranch._fetchCompetitors();
    });
  },

  _removeCompetitor: function(id) {
    if (!confirm('Stop tracking this competitor?')) return;
    SB.from('competitors').update({ active: false }).eq('id', id).then(function(r) {
      if (r.error) { UI.toast('Failed: ' + r.error.message, 'error'); return; }
      UI.toast('Removed');
      SocialBranch._competitorsFetched = false;
      SocialBranch._fetchCompetitors();
    });
  },

  // ─────────────────────────────────────────────────────────
  // INBOX (placeholder)
  // ─────────────────────────────────────────────────────────
  _renderInbox: function() {
    // Pulls GMB reviews from the OAuth token we already have. FB/IG DMs + comments
    // require separate Meta Graph webhook infrastructure — deferred until Meta app
    // review is approved.
    var gmbToken = localStorage.getItem('bm-gmb-access-token') || '';
    var html = '<div style="display:grid;gap:12px;">';
    // GMB reviews column
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      +   '<h3 style="margin:0;font-size:16px;">Google Business Profile — Reviews</h3>'
      +   '<button onclick="SocialBranch._refreshGmbReviews()" style="background:var(--white);border:1px solid var(--border);padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">Refresh</button>'
      + '</div>';
    if (!gmbToken) {
      html += '<div style="padding:20px;text-align:center;color:var(--text-light);font-size:13px;">GMB not connected. Go to Settings → Google Business Profile → Connect Google.</div>';
    } else {
      var cached = [];
      try { cached = JSON.parse(localStorage.getItem('bm-gmb-reviews-cache') || '[]'); } catch (e) {}
      if (!cached.length) {
        html += '<div style="padding:20px;text-align:center;color:var(--text-light);font-size:13px;">No reviews fetched yet. Click Refresh.</div>';
      } else {
        cached.slice(0, 20).forEach(function(r) {
          var stars = '\u2605'.repeat(r.rating || 0) + '\u2606'.repeat(5 - (r.rating || 0));
          html += '<div style="border-bottom:1px solid var(--border);padding:10px 0;">'
            + '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">'
            +   '<strong>' + UI.esc(r.reviewer || 'Anonymous') + '</strong>'
            +   '<span style="color:#f59e0b;">' + stars + '</span>'
            + '</div>'
            + '<div style="font-size:13px;color:var(--text);line-height:1.4;">' + UI.esc(r.comment || '(no text)') + '</div>'
            + '<div style="font-size:11px;color:var(--text-light);margin-top:4px;">' + UI.esc(r.updateTime || '') + '</div>'
            + '</div>';
        });
      }
    }
    html += '</div>';

    // FB/IG placeholder with honest status
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;">'
      + '<h3 style="margin:0 0 8px;font-size:16px;">Facebook + Instagram DMs &amp; Comments</h3>'
      + '<p style="color:var(--text-light);font-size:13px;margin:0;">Needs Meta Graph webhook infrastructure + App Review approval (~2 weeks after submission). Currently: reply in the native FB/IG apps.</p>'
      + '</div>';
    html += '</div>';
    return html;
  },

  _refreshGmbReviews: function() {
    var token = localStorage.getItem('bm-gmb-access-token') || '';
    if (!token) { UI.toast('Connect Google Business Profile first.', 'warn'); return; }
    UI.toast('Fetching reviews\u2026');
    // Try a known location lookup first. GMB v4 endpoint:
    // accounts/{accountId}/locations/{locationId}/reviews
    // Account + location IDs are stored after Connect flow succeeds. If missing, guide user.
    var accountId = localStorage.getItem('bm-gmb-account-id') || '';
    var locationId = localStorage.getItem('bm-gmb-location-id') || '';
    if (!accountId || !locationId) {
      UI.toast('GMB account/location IDs not stored. Use Settings → Connect Google to complete the OAuth flow.', 'warn');
      return;
    }
    fetch('https://mybusiness.googleapis.com/v4/accounts/' + accountId + '/locations/' + locationId + '/reviews', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.error) throw new Error(d.error.message || 'API error');
        var reviews = (d.reviews || []).map(function(r) {
          return {
            reviewer: (r.reviewer && r.reviewer.displayName) || '',
            rating: ['ZERO','ONE','TWO','THREE','FOUR','FIVE'].indexOf(r.starRating),
            comment: r.comment || '',
            updateTime: r.updateTime || ''
          };
        });
        localStorage.setItem('bm-gmb-reviews-cache', JSON.stringify(reviews));
        UI.toast('Loaded ' + reviews.length + ' reviews.');
        loadPage('socialbranch');
      })
      .catch(function(e) { UI.toast('Fetch failed: ' + String(e.message || e), 'error'); });
  },

  // ─────────────────────────────────────────────────────────
  // STORAGE
  // ─────────────────────────────────────────────────────────
  _getPosts: function() {
    try { return JSON.parse(localStorage.getItem('bm-social-posts') || '[]'); }
    catch (e) { return []; }
  },
  _setPosts: function(posts) {
    localStorage.setItem('bm-social-posts', JSON.stringify(posts));
  },
  _upsertPost: function(post) {
    var posts = SocialBranch._getPosts();
    var idx = posts.findIndex(function(p){ return p.id === post.id; });
    if (idx >= 0) posts[idx] = post; else posts.unshift(post);
    SocialBranch._setPosts(posts);
  },

  // ─────────────────────────────────────────────────────────
  // DRAG-TO-RESCHEDULE on calendar (week + month views)
  // Attach after render. Dragging a post chip onto a day cell
  // updates its scheduledAt to that day (same time-of-day preserved).
  // ─────────────────────────────────────────────────────────
  _initCalendarDnD: function() {
    var chips = document.querySelectorAll('[data-post-id]');
    var cells = document.querySelectorAll('[data-day-key]');
    chips.forEach(function(chip) {
      chip.draggable = true;
      chip.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', chip.getAttribute('data-post-id'));
        e.dataTransfer.effectAllowed = 'move';
        chip.style.opacity = '0.4';
      });
      chip.addEventListener('dragend', function() { chip.style.opacity = ''; });
    });
    cells.forEach(function(cell) {
      cell.addEventListener('dragover', function(e) { e.preventDefault(); cell.style.outline = '2px dashed var(--green-dark)'; });
      cell.addEventListener('dragleave', function() { cell.style.outline = ''; });
      cell.addEventListener('drop', function(e) {
        e.preventDefault(); cell.style.outline = '';
        var pid = e.dataTransfer.getData('text/plain'); if (!pid) return;
        var newDay = cell.getAttribute('data-day-key');
        if (!newDay) return;
        var posts = SocialBranch._getPosts();
        var p = posts.find(function(x){ return x.id === pid; });
        if (!p) return;
        var nd = new Date(newDay + 'T00:00:00');
        if (p.status === 'scheduled' && p.scheduledAt) {
          // Preserve existing time-of-day when rescheduling
          var oldDate = new Date(p.scheduledAt);
          nd.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0);
        } else {
          // Converting unscheduled → scheduled. Default 10am.
          nd.setHours(10, 0, 0, 0);
        }
        p.scheduledAt = nd.toISOString();
        p.status = 'scheduled';
        SocialBranch._upsertPost(p);
        UI.toast('Scheduled for ' + nd.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' at ' + nd.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}));
        loadPage('socialbranch');
      });
    });
  },

  // ─────────────────────────────────────────────────────────
  // SOCIALPILOT IMPORT — reads public/sp_scrape_initial.json
  // and merges into bm-social-posts with import_source tag.
  // ─────────────────────────────────────────────────────────
  importFromSocialPilot: function(silent) {
    if (!silent && !confirm('Import SocialPilot history into BM?\n\nThis will add any posts not already present (dedup by caption). Your existing posts are untouched.')) return;
    var btn = document.getElementById('sb-sp-import-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
    // Try app-root path first, fall back to /public path (legacy).
    var tryFetch = function(path) {
      return fetch(path, { cache: 'no-cache' }).then(function(r) {
        if (!r.ok) throw new Error('status ' + r.status);
        return r.json();
      });
    };
    // tryFetch already returns the parsed JSON; the previous .then double-parsed
    // and threw on every call. Removed v376.
    tryFetch('./sp_scrape_initial.json')
      .catch(function() { return tryFetch('./public/sp_scrape_initial.json'); })
      .then(function(data) {
        var existing = SocialBranch._getPosts();
        var existingCaptions = existing.map(function(p){ return (p.caption || '').trim().toLowerCase().slice(0,120); });
        var added = 0, skipped = 0;
        function parseDate(s) {
          if (!s) return '';
          var m = String(s).match(/([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)/);
          if (!m) return '';
          var months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
          var h = parseInt(m[4],10); if (m[6]==='PM' && h<12) h+=12; if (m[6]==='AM' && h===12) h=0;
          return new Date(parseInt(m[3],10), months[m[1]], parseInt(m[2],10), h, parseInt(m[5],10)).toISOString();
        }
        ['queued','delivered','drafts','failed'].forEach(function(bucket) {
          (data[bucket] || []).forEach(function(p) {
            var capKey = (p.caption || '').trim().toLowerCase().slice(0,120);
            if (!capKey) { skipped++; return; }
            if (existingCaptions.indexOf(capKey) >= 0) { skipped++; return; }
            var post = {
              id: 'sp_' + (p.id || Math.random().toString(36).slice(2,10)),
              caption: p.caption || '',
              media: p.media || [],
              networks: p.networks || ['gmb'],
              scheduledAt: parseDate(p.dateText) || '',
              status: p.status || 'draft',
              postedAt: p.status === 'posted' ? parseDate(p.dateText) : '',
              createdAt: new Date().toISOString(),
              import_source: 'socialpilot-html-scrape'
            };
            existing.unshift(post);
            existingCaptions.push(capKey);
            added++;
          });
        });
        SocialBranch._setPosts(existing);
        // Only set imported flag on success so future visits retry if something went wrong.
        localStorage.setItem('bm-sb-sp-imported', '1');
        UI.toast('Imported ' + added + ' posts from SocialPilot (' + skipped + ' duplicates skipped).');
        loadPage('socialbranch');
      })
      .catch(function(e) {
        UI.toast('Import failed: ' + String(e.message || e), 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Import from SocialPilot'; }
      });
  },

  // ─────────────────────────────────────────────────────────
  // HASHTAG GROUPS — saved bundles you can insert into captions
  // ─────────────────────────────────────────────────────────
  _getHashtagGroups: function() {
    try { return JSON.parse(localStorage.getItem('bm-sb-hashtags') || '[]'); } catch(e){ return []; }
  },
  _setHashtagGroups: function(groups) { localStorage.setItem('bm-sb-hashtags', JSON.stringify(groups)); },
  _createHashtagGroup: function() {
    var name = prompt('Hashtag group name (e.g. "Peekskill default"):'); if (!name) return;
    var tags = prompt('Paste hashtags (space or comma separated):\n\nExample: #treeservice #peekskill #arborist'); if (!tags) return;
    var groups = SocialBranch._getHashtagGroups();
    groups.push({ id: 'hg_' + Date.now(), name: name.trim(), tags: tags.trim() });
    SocialBranch._setHashtagGroups(groups);
    UI.toast('Hashtag group saved.');
    loadPage('socialbranch');
  },
  _deleteHashtagGroup: function(id) {
    if (!confirm('Delete this hashtag group?')) return;
    SocialBranch._setHashtagGroups(SocialBranch._getHashtagGroups().filter(function(g){ return g.id !== id; }));
    loadPage('socialbranch');
  },
  _insertHashtagGroup: function(id) {
    var g = SocialBranch._getHashtagGroups().find(function(x){ return x.id === id; });
    if (!g) return;
    var ta = document.getElementById('sb-caption'); if (!ta) return;
    ta.value = (ta.value ? ta.value.replace(/\s+$/, '') + '\n\n' : '') + g.tags;
    ta.dispatchEvent(new Event('input'));
    ta.focus();
  },

  // ─────────────────────────────────────────────────────────
  // CONTENT LIBRARY — saved captions for reuse
  // ─────────────────────────────────────────────────────────
  _getContentLib: function() {
    try { return JSON.parse(localStorage.getItem('bm-sb-content-lib') || '[]'); } catch(e){ return []; }
  },
  _setContentLib: function(items) { localStorage.setItem('bm-sb-content-lib', JSON.stringify(items)); },
  _saveToContentLib: function() {
    var cap = (document.getElementById('sb-caption') || {}).value || '';
    if (!cap.trim()) { UI.toast('Write a caption first.', 'warn'); return; }
    var label = prompt('Save caption as (short label):', cap.slice(0, 40)); if (!label) return;
    var items = SocialBranch._getContentLib();
    items.unshift({ id: 'cl_' + Date.now(), label: label.trim(), caption: cap, media: (SocialBranch._draftMedia || []).slice(), createdAt: new Date().toISOString() });
    SocialBranch._setContentLib(items);
    UI.toast('Saved to Content Library.');
  },
  _insertFromContentLib: function(id) {
    var it = SocialBranch._getContentLib().find(function(x){ return x.id === id; });
    if (!it) return;
    // Preserve any in-progress draft's id so we keep working on the same post
    // rather than spawning a new record on each library insert.
    var existing = SocialBranch._editingPost || {};
    SocialBranch._editingPost = Object.assign({}, existing, {
      id: existing.id || '',
      caption: it.caption,
      media: (it.media || []).slice()
    });
    SocialBranch._draftMedia = (it.media || []).slice();
    SocialBranch._goTab('compose');
  },
  _deleteFromContentLib: function(id) {
    if (!confirm('Delete this saved caption?')) return;
    SocialBranch._setContentLib(SocialBranch._getContentLib().filter(function(x){ return x.id !== id; }));
    loadPage('socialbranch');
  },

  // ─────────────────────────────────────────────────────────
  // BULK UPLOAD — drop a folder, AI captions everything,
  // review & schedule. Two-step wizard.
  // State lives on SocialBranch._bulk so it survives a re-render.
  // ─────────────────────────────────────────────────────────
  _bulk: { step: 1, files: [] },
  // file: { id, name, size, type ('image'|'video'), dataUrl, caption, captionLoading,
  //         captionError, networks, scheduledAt }

  _renderBulk: function() {
    var b = SocialBranch._bulk || (SocialBranch._bulk = { step: 1, files: [] });
    if (b.step === 2) return SocialBranch._renderBulkReview();
    return SocialBranch._renderBulkDrop();
  },

  _renderBulkDrop: function() {
    var b = SocialBranch._bulk;
    var has = b.files.length > 0;
    var html = '';

    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">'
      + '<div><h3 style="margin:0;font-size:16px;display:flex;align-items:center;gap:8px;">' + SocialBranch._netIcon('upload', 16) + 'Bulk Upload</h3>'
      + '<div style="font-size:12px;color:var(--text-light);margin-top:4px;">Drop a folder of images or videos. AI writes captions. Review and schedule across networks.</div></div>'
      + '<div style="font-size:12px;color:var(--text-light);">Step 1 of 2</div>'
      + '</div>';

    // Drop zone
    html += '<div id="sb-bulk-drop" '
      + 'ondragover="event.preventDefault();this.style.borderColor=\'var(--accent)\';this.style.background=\'#f0f9ff\';" '
      + 'ondragleave="this.style.borderColor=\'var(--border)\';this.style.background=\'var(--bg)\';" '
      + 'ondrop="event.preventDefault();this.style.borderColor=\'var(--border)\';this.style.background=\'var(--bg)\';SocialBranch._bulkOnDrop(event);" '
      + 'style="border:2px dashed var(--border);border-radius:12px;padding:40px;text-align:center;background:var(--bg);cursor:pointer;transition:all .15s;" '
      + 'onclick="document.getElementById(\'sb-bulk-input\').click()">'
      + '<div style="font-size:36px;margin-bottom:8px;color:var(--text-light);">' + SocialBranch._netIcon('upload-cloud', 36) + '</div>'
      + '<div style="font-size:15px;font-weight:600;margin-bottom:4px;">Drop a folder or files here</div>'
      + '<div style="font-size:12px;color:var(--text-light);">or click to browse · images and videos · up to 10MB each</div>'
      + '<input id="sb-bulk-input" type="file" multiple accept="image/*,video/*" webkitdirectory directory style="display:none;" onchange="SocialBranch._bulkOnPick(event)">'
      + '<input id="sb-bulk-input-files" type="file" multiple accept="image/*,video/*" style="display:none;" onchange="SocialBranch._bulkOnPick(event)">'
      + '<div style="margin-top:14px;font-size:12px;"><a href="#" onclick="event.stopPropagation();document.getElementById(\'sb-bulk-input-files\').click();return false;" style="color:var(--accent);">Pick individual files instead</a></div>'
      + '</div>';

    html += '</div>';

    // Thumbnail strip
    if (has) {
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:16px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
        + '<h3 style="margin:0;font-size:14px;">' + b.files.length + ' file' + (b.files.length === 1 ? '' : 's') + ' ready</h3>'
        + '<button onclick="SocialBranch._bulkClear()" style="background:none;border:none;color:var(--text-light);font-size:12px;cursor:pointer;">Clear all</button>'
        + '</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
      var visible = b.files.slice(0, 24);
      visible.forEach(function(f) {
        var thumb = f.type === 'video'
          ? '<div style="width:88px;height:88px;border-radius:8px;background:#000;display:flex;align-items:center;justify-content:center;color:#fff;">' + SocialBranch._netIcon('video', 28) + '</div>'
          : '<img src="' + UI.esc(f.dataUrl) + '" style="width:88px;height:88px;border-radius:8px;object-fit:cover;">';
        html += '<div style="position:relative;" title="' + UI.esc(f.name) + ' · ' + SocialBranch._fmtSize(f.size) + '">'
          + thumb
          + '<button onclick="SocialBranch._bulkRemove(\'' + f.id + '\')" style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;background:#dc2626;color:#fff;border:none;cursor:pointer;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;">×</button>'
          + '<div style="position:absolute;bottom:2px;left:2px;right:2px;font-size:10px;color:#fff;background:rgba(0,0,0,.6);padding:2px 4px;border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(f.name) + '</div>'
          + '</div>';
      });
      if (b.files.length > 24) {
        html += '<div style="width:88px;height:88px;border-radius:8px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--text-light);">+' + (b.files.length - 24) + '</div>';
      }
      html += '</div>';

      // v427: AI auto-runs on drop, no manual trigger needed. Single fallback button
      // for cases where the auto-fire didn't kick (e.g. mid-render edge case).
      html += '<div style="margin-top:18px;font-size:13px;color:var(--text-light);display:flex;align-items:center;gap:10px;">'
        + '<span style="display:inline-flex;align-items:center;gap:6px;">' + SocialBranch._netIcon('sparkles', 14) + 'AI is generating captions + scheduling…</span>'
        + '<button onclick="SocialBranch._bulkAiCaptionAll()" style="background:var(--white);border:1px solid var(--border);padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">Re-run AI</button>'
        + '</div>';
      html += '</div>';
    }

    return html;
  },

  _renderBulkReview: function() {
    var b = SocialBranch._bulk;
    var html = '';

    // Header + actions
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">'
      + '<div><h3 style="margin:0;font-size:16px;">Review &amp; schedule (' + b.files.length + ')</h3>'
      + '<div style="font-size:12px;color:var(--text-light);margin-top:4px;">Edit captions, pick networks, set times. Defaults: 1/day starting tomorrow 10am.</div></div>'
      + '<div style="font-size:12px;color:var(--text-light);">Step 2 of 2</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button onclick="SocialBranch._bulkScheduleAll()" class="btn btn-primary" style="font-size:13px;">Schedule all (' + b.files.length + ')</button>'
      + '<button onclick="SocialBranch._bulkSaveAllDrafts()" style="background:var(--white);border:1px solid var(--border);padding:8px 14px;border-radius:8px;font-size:13px;cursor:pointer;">Save all as drafts</button>'
      + '<button onclick="SocialBranch._bulkBack()" style="background:none;border:none;color:var(--text-light);font-size:13px;cursor:pointer;">← Back to step 1</button>'
      + '</div>'
      + '</div>';

    // Rows
    html += '<div style="display:flex;flex-direction:column;gap:10px;">';
    b.files.forEach(function(f) {
      html += SocialBranch._renderBulkRow(f);
    });
    html += '</div>';

    return html;
  },

  _renderBulkRow: function(f) {
    var thumb = f.type === 'video'
      ? '<div style="width:120px;height:120px;border-radius:8px;background:#000;display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;">' + SocialBranch._netIcon('video', 36) + '</div>'
      : '<img src="' + UI.esc(f.dataUrl) + '" style="width:120px;height:120px;border-radius:8px;object-fit:cover;flex-shrink:0;">';

    // Networks chip row — default to networks that accept this media type
    var netChips = SocialBranch.NETWORKS.filter(function(n) {
      if (f.type === 'video') return n.accepts === 'video' || n.accepts === 'both';
      return n.accepts === 'image' || n.accepts === 'both';
    }).map(function(n) {
      var on = (f.networks || []).indexOf(n.id) >= 0;
      return '<button type="button" onclick="SocialBranch._bulkToggleNet(\'' + f.id + '\',\'' + n.id + '\')" style="padding:5px 10px;border-radius:14px;border:1px solid ' + (on ? n.color : 'var(--border)') + ';background:' + (on ? n.color + '20' : 'var(--white)') + ';color:' + (on ? n.color : 'var(--text-light)') + ';font-size:11px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-weight:' + (on ? '700' : '500') + ';">' + SocialBranch._netIcon(n.icon, 11) + n.name + '</button>';
    }).join(' ');

    var dtVal = f.scheduledAt ? new Date(f.scheduledAt).toISOString().slice(0,16) : '';

    var captionArea;
    if (f.captionLoading) {
      captionArea = '<div style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--bg);border-radius:8px;font-size:12px;color:var(--text-light);">' + SocialBranch._netIcon('loader-2', 14) + 'Writing caption…</div>';
    } else {
      var placeholder = f.captionError ? 'AI failed — write manually' : 'Caption for this post…';
      captionArea = '<textarea oninput="SocialBranch._bulkSetCaption(\'' + f.id + '\',this.value)" placeholder="' + placeholder + '" style="width:100%;min-height:70px;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;">' + UI.esc(f.caption || '') + '</textarea>';
    }

    return '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;gap:14px;align-items:flex-start;">'
      + thumb
      + '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;">'
      +   '<div style="font-size:11px;color:var(--text-light);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(f.name) + ' · ' + SocialBranch._fmtSize(f.size) + '</div>'
      +   captionArea
      +   '<div style="display:flex;flex-wrap:wrap;gap:4px;">' + netChips + '</div>'
      +   '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
      +     '<label style="font-size:11px;color:var(--text-light);">When:</label>'
      +     '<input type="datetime-local" value="' + dtVal + '" onchange="SocialBranch._bulkSetWhen(\'' + f.id + '\',this.value)" style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;">'
      +     '<button onclick="SocialBranch._bulkRemove(\'' + f.id + '\')" style="margin-left:auto;background:none;border:none;color:#dc2626;font-size:12px;cursor:pointer;">Remove</button>'
      +   '</div>'
      + '</div>'
      + '</div>';
  },

  _fmtSize: function(b) {
    if (b < 1024) return b + 'B';
    if (b < 1024*1024) return (b/1024).toFixed(0) + 'KB';
    return (b/1024/1024).toFixed(1) + 'MB';
  },

  // ── Drop / pick handlers ────────────────────────────────
  _bulkOnDrop: function(ev) {
    var dt = ev.dataTransfer;
    var files = [];
    // Prefer items API if folders dropped
    if (dt.items && dt.items.length) {
      var entries = [];
      for (var i = 0; i < dt.items.length; i++) {
        var entry = dt.items[i].webkitGetAsEntry && dt.items[i].webkitGetAsEntry();
        if (entry) entries.push(entry);
      }
      if (entries.length) {
        SocialBranch._bulkWalkEntries(entries).then(function(fs) { SocialBranch._bulkAddFiles(fs); });
        return;
      }
    }
    if (dt.files) for (var j = 0; j < dt.files.length; j++) files.push(dt.files[j]);
    SocialBranch._bulkAddFiles(files);
  },

  _bulkWalkEntries: function(entries) {
    var collected = [];
    function walk(entry) {
      return new Promise(function(resolve) {
        if (entry.isFile) {
          entry.file(function(f) { collected.push(f); resolve(); }, function(){ resolve(); });
        } else if (entry.isDirectory) {
          var reader = entry.createReader();
          reader.readEntries(function(children) {
            Promise.all(children.map(walk)).then(function(){ resolve(); });
          }, function(){ resolve(); });
        } else { resolve(); }
      });
    }
    return Promise.all(entries.map(walk)).then(function(){ return collected; });
  },

  _bulkOnPick: function(ev) {
    var files = [];
    for (var i = 0; i < ev.target.files.length; i++) files.push(ev.target.files[i]);
    SocialBranch._bulkAddFiles(files);
    ev.target.value = '';
  },

  _bulkAddFiles: function(rawFiles) {
    if (!rawFiles || !rawFiles.length) return;
    // Filter to images/videos only, drop oversized
    var MAX = 10 * 1024 * 1024;
    var keep = rawFiles.filter(function(f) {
      if (!f.type) return false;
      if (!/^(image|video)\//.test(f.type)) return false;
      if (f.size > MAX) { UI.toast('Skipped (>10MB): ' + f.name, 'error'); return false; }
      return true;
    });
    if (!keep.length) { UI.toast('No usable files.', 'error'); return; }
    // Read each as data URL
    var b = SocialBranch._bulk;
    var promises = keep.map(function(f) {
      return new Promise(function(resolve) {
        var reader = new FileReader();
        reader.onload = function() {
          resolve({
            id: 'bf_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
            name: f.name,
            size: f.size,
            type: /^video\//.test(f.type) ? 'video' : 'image',
            dataUrl: reader.result,
            caption: '',
            captionLoading: false,
            captionError: false,
            networks: [],
            scheduledAt: null
          });
        };
        reader.onerror = function(){ resolve(null); };
        reader.readAsDataURL(f);
      });
    });
    Promise.all(promises).then(function(items) {
      items.filter(Boolean).forEach(function(it) { b.files.push(it); });
      UI.toast('Added ' + items.filter(Boolean).length + ' file' + (items.length === 1 ? '' : 's') + ' — AI is captioning…');
      // v427: AI takes over — straight to Step 2 review with auto-captions, defaults, and stagger.
      // No intermediate button click required. Doug just uploads + audits.
      SocialBranch._bulkAiCaptionAll();
    });
  },

  _bulkRemove: function(id) {
    var b = SocialBranch._bulk;
    b.files = b.files.filter(function(f){ return f.id !== id; });
    if (b.step === 2 && !b.files.length) b.step = 1;
    loadPage('socialbranch');
  },

  _bulkClear: function() {
    if (!confirm('Clear all files?')) return;
    SocialBranch._bulk = { step: 1, files: [] };
    loadPage('socialbranch');
  },

  _bulkBack: function() {
    SocialBranch._bulk.step = 1;
    loadPage('socialbranch');
  },

  // Default each file: tomorrow 10am + index*1day, networks = those that accept its type
  _bulkApplyDefaults: function() {
    var b = SocialBranch._bulk;
    var base = new Date();
    base.setDate(base.getDate() + 1);
    base.setHours(10, 0, 0, 0);
    b.files.forEach(function(f, i) {
      if (!f.scheduledAt) {
        var d = new Date(base.getTime());
        d.setDate(d.getDate() + i);
        f.scheduledAt = d.toISOString();
      }
      if (!f.networks || !f.networks.length) {
        f.networks = SocialBranch.NETWORKS.filter(function(n) {
          if (f.type === 'video') return n.accepts === 'video' || n.accepts === 'both';
          return n.accepts === 'image' || n.accepts === 'both';
        }).map(function(n){ return n.id; });
      }
    });
  },

  _bulkProceed: function(_skipAi) {
    if (!SocialBranch._bulk.files.length) { UI.toast('Add some files first.', 'error'); return; }
    SocialBranch._bulkApplyDefaults();
    SocialBranch._bulk.step = 2;
    loadPage('socialbranch');
  },

  // ── Per-row state setters ───────────────────────────────
  _bulkSetCaption: function(id, val) {
    var f = SocialBranch._bulk.files.find(function(x){ return x.id === id; });
    if (f) { f.caption = val; f.captionError = false; }
  },
  _bulkSetWhen: function(id, val) {
    var f = SocialBranch._bulk.files.find(function(x){ return x.id === id; });
    if (!f) return;
    if (!val) { f.scheduledAt = null; return; }
    var d = new Date(val);
    if (!isNaN(d.getTime())) f.scheduledAt = d.toISOString();
  },
  _bulkToggleNet: function(id, netId) {
    var f = SocialBranch._bulk.files.find(function(x){ return x.id === id; });
    if (!f) return;
    f.networks = f.networks || [];
    var i = f.networks.indexOf(netId);
    if (i >= 0) f.networks.splice(i, 1); else f.networks.push(netId);
    loadPage('socialbranch');
  },

  // ── AI captioning ───────────────────────────────────────
  _bulkAiCaptionAll: function() {
    var b = SocialBranch._bulk;
    if (!b.files.length) return;
    SocialBranch._bulkApplyDefaults();
    b.step = 2;
    // Mark all loading and render
    b.files.forEach(function(f){ if (!f.caption) f.captionLoading = true; });
    loadPage('socialbranch');
    // Run with concurrency cap of 5
    var queue = b.files.filter(function(f){ return f.captionLoading; }).slice();
    var active = 0;
    function next() {
      if (!queue.length) return;
      while (active < 5 && queue.length) {
        var f = queue.shift();
        active++;
        SocialBranch._bulkAiCaptionOne(f).finally(function() {
          active--;
          // Re-render incrementally so spinners clear
          loadPage('socialbranch');
          next();
        });
      }
    }
    next();
  },

  _bulkAiCaptionOne: function(f) {
    var hint = f.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ');
    var promptText = 'Write a short, friendly social caption for a tree-service company\'s Facebook/Instagram post showing "' + hint + '". Include 2-3 relevant hashtags. 100-180 chars. No emojis. Return JUST the caption text, no preamble.';
    var url = (localStorage.getItem('bm-supabase-url') || '') + '/functions/v1/ai-chat';
    var key = localStorage.getItem('bm-supabase-key') || '';
    return fetch(url, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: promptText, max_tokens: 220 })
    }).then(function(r){ return r.json(); }).then(function(d) {
      var text = d.text || d.response || d.completion || (d.content && d.content[0] && d.content[0].text) || '';
      if (!text) throw new Error('no text');
      f.caption = String(text).trim().replace(/^["']|["']$/g,'');
      f.captionLoading = false;
      f.captionError = false;
    }).catch(function() {
      f.captionLoading = false;
      f.captionError = true;
      f.caption = '';
    });
  },

  // ── Schedule / save ─────────────────────────────────────
  _bulkScheduleAll: function() {
    var b = SocialBranch._bulk;
    if (!b.files.length) return;
    // Validate: each file needs at least 1 network and a date
    var missing = b.files.filter(function(f){ return !f.networks || !f.networks.length || !f.scheduledAt; });
    if (missing.length) {
      if (!confirm(missing.length + ' post(s) are missing networks or a date. Continue and skip those?')) return;
    }
    var ready = b.files.filter(function(f){ return f.networks && f.networks.length && f.scheduledAt; });
    if (!ready.length) { UI.toast('Nothing to schedule.', 'error'); return; }
    SocialBranch._bulkProcess(ready, 'scheduled');
  },

  _bulkSaveAllDrafts: function() {
    var b = SocialBranch._bulk;
    if (!b.files.length) return;
    SocialBranch._bulkProcess(b.files.slice(), 'draft');
  },

  _bulkProcess: function(files, status) {
    UI.toast('Uploading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…');
    // Upload all media in parallel (already capped by Supabase API behavior)
    var uploads = files.map(function(f) {
      return SocialBranch._uploadMediaToPublicUrls([f.dataUrl]).then(function(urls) {
        return { f: f, url: urls[0] };
      });
    });
    Promise.all(uploads).then(function(results) {
      var posts = SocialBranch._getPosts();
      var added = 0;
      results.forEach(function(r) {
        var p = {
          id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
          caption: r.f.caption || '',
          media: [r.url],
          networks: r.f.networks || [],
          scheduledAt: r.f.scheduledAt || null,
          status: status,
          createdAt: new Date().toISOString()
        };
        posts.unshift(p);
        added++;
      });
      SocialBranch._setPosts(posts);
      UI.toast((status === 'scheduled' ? 'Scheduled ' : 'Saved ') + added + ' post' + (added === 1 ? '' : 's') + '.');
      // Reset + jump
      SocialBranch._bulk = { step: 1, files: [] };
      SocialBranch._tab = (status === 'scheduled' ? 'calendar' : 'dashboard');
      loadPage('socialbranch');
    }).catch(function(e) {
      UI.toast('Upload failed: ' + (e.message || e), 'error');
    });
  },

  // ─────────────────────────────────────────────────────────
  // AI CAPTION WRITER — uses existing AI integration
  // ─────────────────────────────────────────────────────────
  _aiCaption: function() {
    var ta = document.getElementById('sb-caption'); if (!ta) return;
    var seed = prompt('Describe the post in a few words (e.g. "80ft oak removal in Yorktown, crane, sunny day"):');
    if (!seed) return;
    var btn = document.getElementById('sb-ai-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Writing…'; }
    var prompt_ = 'Write a social-media caption for Second Nature Tree Service in Peekskill NY. The subject is: "' + seed + '". Tone: friendly, direct, local-pride. Under 200 words. End with: "Call for a free estimate: (914) 391-5233 · peekskilltree.com". No emojis. Two or three short paragraphs.';
    // Use bmAIKey helper (server-managed or local). Call AI provider via Supabase edge function if available, else direct.
    var edgeUrl = (localStorage.getItem('bm-supabase-url') || '') + '/functions/v1/ai-chat';
    var key = localStorage.getItem('bm-supabase-key') || '';
    fetch(edgeUrl, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt_, max_tokens: 400 })
    }).then(function(r) { return r.json(); })
      .then(function(d) {
        var text = d.text || d.response || d.completion || (d.content && d.content[0] && d.content[0].text) || '';
        if (!text) throw new Error('No text in response');
        ta.value = text.trim();
        ta.dispatchEvent(new Event('input'));
        UI.toast('Caption written. Edit as needed.');
      })
      .catch(function(e) { UI.toast('AI caption failed: ' + String(e.message || e), 'error'); })
      .finally(function() { if (btn) { btn.disabled = false; btn.textContent = 'AI Caption'; } });
  },

  // ─────────────────────────────────────────────────────────
  // EDIT scheduled post — _editPost already exists.
  // Add _rescheduleInline for quick time tweak without opening compose.
  // ─────────────────────────────────────────────────────────
  _rescheduleInline: function(postId) {
    var p = SocialBranch._getPosts().find(function(x){ return x.id === postId; });
    if (!p) return;
    var current = p.scheduledAt ? new Date(p.scheduledAt).toISOString().slice(0,16) : '';
    var v = prompt('New date/time (YYYY-MM-DDTHH:MM, 24h):\n\nExample: 2026-05-15T14:30', current);
    if (!v) return;
    var d = new Date(v);
    if (isNaN(d.getTime())) { UI.toast('Invalid date.', 'error'); return; }
    p.scheduledAt = d.toISOString();
    p.status = 'scheduled';
    SocialBranch._upsertPost(p);
    UI.toast('Rescheduled for ' + d.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}));
    loadPage('socialbranch');
  },

  _getConnectedNetworks: function() {
    var connected = [];
    var webhook = (localStorage.getItem('bm-socialpilot-webhook') || '').length > 10;
    var gmbToken = (localStorage.getItem('bm-gmb-access-token') || '').length > 20;
    // Webhook implicitly reaches every network you've wired in the Zap
    if (webhook) SocialBranch.NETWORKS.forEach(function(n) { connected.push(n.id); });
    if (gmbToken && connected.indexOf('gmb') < 0) connected.push('gmb');
    return connected;
  },

  // Fires scheduled posts that are due — call on app load
  runScheduler: function() {
    var posts = SocialBranch._getPosts();
    var now = Date.now();
    var due = posts.filter(function(p) {
      return p.status === 'scheduled' && p.scheduledAt && new Date(p.scheduledAt).getTime() <= now;
    });
    if (!due.length) return;
    due.forEach(function(p) {
      p.status = 'posting';
      SocialBranch._upsertPost(p);
      SocialBranch._publishNow(p);
    });
  }
};

// Kick the scheduler on app load + every 60s
if (typeof window !== 'undefined') {
  setTimeout(function() { try { SocialBranch.runScheduler(); } catch(e){} }, 5000);
  setInterval(function() { try { SocialBranch.runScheduler(); } catch(e){} }, 60000);
}
