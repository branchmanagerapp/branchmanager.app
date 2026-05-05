/**
 * Branch Manager — Cloud Settings Sync
 * Stores per-tenant API keys + preferences in Supabase tenant_settings table
 * so every device that logs in gets the same keys automatically.
 *
 * Strategy:
 *   - On app boot (after Supabase ready), pull all tenant_settings rows for this
 *     tenant and write each into localStorage. Existing local values are
 *     overwritten ONLY if the cloud value is newer (basic last-write-wins).
 *   - Wrap localStorage.setItem so any write to a TRACKED key is mirrored to cloud.
 *   - Wrap localStorage.removeItem so deletions also propagate.
 */
var CloudKeys = {
  // Settings that should sync across devices
  TRACKED: [
    'bm-claude-key', 'bm-claude-server-managed',
    'bm-stripe-base-link', 'bm-dialpad-key',
    'bm-gusto-api-key', 'bm-plantnet-key', 'bm-tm-rates', 'bm-ai-enabled',
    'bm-dark-mode', 'bm-co-name', 'bm-co-phone', 'bm-co-email', 'bm-co-address',
    'bm-co-website', 'bm-tax-rate', 'bm-zip', 'bm-revenue-goals',
    'bm-receptionist-settings', 'bm-pwa-nav', 'bm-app-nav',
    // Passive tracking + time-tracking roadmap toggles
    'bm-passive-track', 'bm-passive-interval', 'bm-passive-dwell-radius', 'bm-passive-dwell-minutes',
    'bm-auto-clock-in', 'bm-break-tracking', 'bm-ot-shield', 'bm-ot-threshold', 'bm-who-on-clock-badge'
  ],

  ready: false,
  _wrapped: false,
  _suppressPush: false, // true while we're loading from cloud (don't echo back)

  init: async function() {
    if (!SupabaseDB || !SupabaseDB.ready) return;
    if (typeof DB === 'undefined' || !DB.getTenantId) return;
    var tid = DB.getTenantId();
    if (!tid) return;

    // Pull all tracked settings from cloud
    try {
      var { data, error } = await SupabaseDB.client
        .from('tenant_settings')
        .select('key, value, updated_at')
        .eq('tenant_id', tid);
      if (error) {
        // Table doesn't exist yet — log and stop, don't crash
        if (error.message && error.message.indexOf('tenant_settings') !== -1) {
          console.warn('CloudKeys: tenant_settings table missing — run the migration SQL');
        } else {
          console.warn('CloudKeys: pull failed:', error.message);
        }
        CloudKeys._wrap();
        return;
      }
      if (data && data.length) {
        CloudKeys._suppressPush = true;
        var imported = 0;
        data.forEach(function(row) {
          if (CloudKeys.TRACKED.indexOf(row.key) === -1) return;
          // Only overwrite local if cloud is newer or local is missing
          var local = localStorage.getItem(row.key);
          var localTs = parseInt(localStorage.getItem('_cks_' + row.key) || '0', 10);
          var cloudTs = row.updated_at ? new Date(row.updated_at).getTime() : 0;
          if (local === null || cloudTs > localTs) {
            localStorage.setItem(row.key, row.value || '');
            localStorage.setItem('_cks_' + row.key, String(cloudTs));
            imported++;
          }
        });
        CloudKeys._suppressPush = false;
        if (imported > 0) console.debug('[CloudKeys] pulled ' + imported + ' settings from cloud');
      }
    } catch (e) {
      console.warn('CloudKeys.init failed:', e);
    }

    CloudKeys._wrap();
    CloudKeys.ready = true;

    // After init, push any tracked keys that exist locally but not in cloud yet
    // (handles the "first device with keys" case)
    setTimeout(CloudKeys._pushUnsynced, 1500);

    // Live-sync: listen for other-device writes to tenant_settings and merge
    // into localStorage on the fly so (e.g.) a new AI key shows up on all
    // open tabs without a reload.
    CloudKeys._subscribeRealtime(tid);
  },

  _subscribeRealtime: function(tid) {
    if (!SupabaseDB || !SupabaseDB.client || !SupabaseDB.client.channel) return;
    if (CloudKeys._channel) return; // already subscribed
    try {
      CloudKeys._channel = SupabaseDB.client
        .channel('tenant_settings_' + tid)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'tenant_settings', filter: 'tenant_id=eq.' + tid },
          function(payload) {
            try {
              var row = payload.new || payload.old;
              if (!row || !row.key) return;
              if (CloudKeys.TRACKED.indexOf(row.key) === -1) return;
              CloudKeys._suppressPush = true;
              if (payload.eventType === 'DELETE') {
                localStorage.removeItem(row.key);
                localStorage.removeItem('_cks_' + row.key);
              } else {
                var cloudTs = row.updated_at ? new Date(row.updated_at).getTime() : Date.now();
                var localTs = parseInt(localStorage.getItem('_cks_' + row.key) || '0', 10);
                if (cloudTs > localTs) {
                  localStorage.setItem(row.key, row.value || '');
                  localStorage.setItem('_cks_' + row.key, String(cloudTs));
                  if (row.key === 'bm-claude-key' && typeof AI !== 'undefined') AI._apiKey = row.value || '';
                }
              }
              CloudKeys._suppressPush = false;
            } catch(e) { CloudKeys._suppressPush = false; console.warn('CloudKeys realtime handler:', e); }
          })
        .subscribe();
    } catch(e) { console.warn('CloudKeys realtime subscribe failed:', e); }
  },

  _wrap: function() {
    if (CloudKeys._wrapped) return;
    CloudKeys._wrapped = true;
    var origSet = localStorage.setItem.bind(localStorage);
    var origRemove = localStorage.removeItem.bind(localStorage);

    localStorage.setItem = function(key, value) {
      origSet(key, value);
      if (CloudKeys._suppressPush) return;
      if (CloudKeys.TRACKED.indexOf(key) === -1) return;
      origSet('_cks_' + key, String(Date.now()));
      CloudKeys._push(key, value);
    };

    localStorage.removeItem = function(key) {
      origRemove(key);
      if (CloudKeys._suppressPush) return;
      if (CloudKeys.TRACKED.indexOf(key) === -1) return;
      origRemove('_cks_' + key);
      CloudKeys._delete(key);
    };
  },

  _push: function(key, value) {
    if (!SupabaseDB || !SupabaseDB.ready) return;
    var tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    if (!tid) return;
    SupabaseDB.client
      .from('tenant_settings')
      .upsert({ tenant_id: tid, key: key, value: value || '', updated_at: new Date().toISOString() }, { onConflict: 'tenant_id,key' })
      .then(function(res) {
        if (res.error) console.warn('CloudKeys push failed (' + key + '):', res.error.message);
      });
  },

  _delete: function(key) {
    if (!SupabaseDB || !SupabaseDB.ready) return;
    var tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    if (!tid) return;
    SupabaseDB.client
      .from('tenant_settings')
      .delete()
      .eq('tenant_id', tid)
      .eq('key', key)
      .then(function(res) {
        if (res.error) console.warn('CloudKeys delete failed (' + key + '):', res.error.message);
      });
  },

  _pushUnsynced: function() {
    CloudKeys.TRACKED.forEach(function(k) {
      var local = localStorage.getItem(k);
      if (local === null || local === '') return;
      // If we never marked it synced, push it now
      if (!localStorage.getItem('_cks_' + k)) {
        localStorage.setItem('_cks_' + k, String(Date.now()));
        CloudKeys._push(k, local);
      }
    });
  },

  // Manual full re-sync (Settings button)
  refresh: async function() {
    UI.toast('Syncing settings from cloud...');
    CloudKeys._wrapped = false; // re-wrap fresh
    await CloudKeys.init();
    UI.toast('Settings synced ✓ — reloading');
    setTimeout(function() { location.reload(); }, 600);
  }
};

// Auto-init after Supabase + DB are ready
(function waitForReady(attempts) {
  if (typeof SupabaseDB !== 'undefined' && SupabaseDB.ready && typeof DB !== 'undefined' && DB.getTenantId) {
    setTimeout(function() { CloudKeys.init(); }, 2000); // let CloudSync finish first
  } else if (attempts > 0) {
    setTimeout(function() { waitForReady(attempts - 1); }, 1000);
  }
})(20);
