/**
 * Branch Manager — SaaS Subscription Module
 *
 * Tracks the BM-tenant's billing tier (Solo/Crew/Pro), trial status, and
 * exposes feature-gating helpers for the rest of the app.
 *
 * Data shape (stored on tenants.config.subscription, mirrored to localStorage
 * 'bm-subscription' for sync access):
 *
 *   {
 *     tier: 'solo' | 'crew' | 'pro',
 *     status: 'trial' | 'active' | 'past_due' | 'canceled',
 *     trial_started_at: ISO8601,
 *     trial_ends_at: ISO8601,
 *     stripe_customer_id?: string,    // populated after first Checkout
 *     stripe_subscription_id?: string,
 *     current_period_end?: ISO8601,
 *   }
 *
 * Authoritative state lives in Supabase. localStorage is a sync-read cache
 * refreshed via Subscription.refreshFromCloud() on boot + after upgrades.
 */
var Subscription = (function() {
  var TIERS = {
    solo: {
      key: 'solo',
      name: 'Solo',
      price_monthly: 39,
      users: 1,
      tagline: 'Run your business solo',
      features: [
        'crm', 'schedule', 'dispatch', 'customer_portal',
        'marketing_site', 'llm_info', 'invoices', 'quotes'
      ]
    },
    crew: {
      key: 'crew',
      name: 'Crew',
      price_monthly: 89,
      users: 5,
      tagline: 'Add a team — communicate + automate',
      features: [
        'crm', 'schedule', 'dispatch', 'customer_portal',
        'marketing_site', 'llm_info', 'invoices', 'quotes',
        'two_way_sms', 'automation', 'pipeline',
        'email_per_tenant', 'quote_followups'
      ]
    },
    pro: {
      key: 'pro',
      name: 'Pro',
      price_monthly: 149,
      users: 10,
      tagline: 'Full ops — fleet, equipment, advanced reporting',
      features: [
        'crm', 'schedule', 'dispatch', 'customer_portal',
        'marketing_site', 'llm_info', 'invoices', 'quotes',
        'two_way_sms', 'automation', 'pipeline',
        'email_per_tenant', 'quote_followups',
        'gps_fleet', 'pre_trip', 'equipment',
        'advanced_reports', 'multi_truck_dispatch'
      ]
    }
  };
  var TRIAL_DAYS = 14;
  var LS_KEY = 'bm-subscription';

  function _read() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); }
    catch(e) { return null; }
  }
  function _write(sub) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(sub)); } catch(e) {}
  }
  function _defaultTrial() {
    var now = new Date();
    var endsAt = new Date(now.getTime() + TRIAL_DAYS * 86400000);
    return {
      tier: 'solo',
      status: 'trial',
      trial_started_at: now.toISOString(),
      trial_ends_at: endsAt.toISOString()
    };
  }

  // ── Read-only public API (sync) ─────────────────────────────────────
  function getState() { return _read(); }
  function getTier() { var s = _read(); return (s && s.tier) || 'solo'; }
  function getStatus() { var s = _read(); return (s && s.status) || 'trial'; }
  function getPlan() { return TIERS[getTier()] || TIERS.solo; }
  function getAllTiers() { return TIERS; }
  function isTrial() { return getStatus() === 'trial'; }
  function isActive() {
    var s = getStatus();
    return s === 'trial' || s === 'active';
  }
  function trialEndsAt() {
    var s = _read();
    return s && s.trial_ends_at ? new Date(s.trial_ends_at) : null;
  }
  function daysLeftInTrial() {
    var end = trialEndsAt();
    if (!end) return null;
    var ms = end.getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  }
  function isTrialExpired() {
    if (!isTrial()) return false;
    var d = daysLeftInTrial();
    return d !== null && d <= 0;
  }
  function canUseFeature(featureKey) {
    if (!isActive()) return false;
    var plan = getPlan();
    return plan.features.indexOf(featureKey) >= 0;
  }
  function tierIncludesFeature(tierKey, featureKey) {
    var t = TIERS[tierKey];
    return !!(t && t.features.indexOf(featureKey) >= 0);
  }
  // Returns the cheapest tier that includes a given feature — useful for upsell prompts.
  function tierThatUnlocks(featureKey) {
    var order = ['solo', 'crew', 'pro'];
    for (var i = 0; i < order.length; i++) {
      if (tierIncludesFeature(order[i], featureKey)) return order[i];
    }
    return null;
  }

  // ── Cloud sync (async) ──────────────────────────────────────────────
  // Reads subscription from tenants.config.subscription. If the tenant has
  // no subscription block yet (legacy or just-provisioned), seeds a default
  // 14-day Solo trial locally so the rest of the app has something to read.
  // Persistence to cloud is the provision-tenant edge fn's job; this just
  // mirrors what's there.
  function refreshFromCloud() {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    var tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    if (!sb || !tid) return Promise.resolve(null);
    return sb.from('tenants').select('config').eq('id', tid).single().then(function(r) {
      if (r.error || !r.data) {
        // Fallback: keep whatever's cached, or seed default trial
        if (!_read()) _write(_defaultTrial());
        return _read();
      }
      var cfg = r.data.config || {};
      var sub = cfg.subscription;
      if (!sub) {
        // No subscription block in cloud — assume fresh trial. Don't write
        // back to cloud here (provision-tenant handles that); just cache.
        sub = _defaultTrial();
      }
      _write(sub);
      return sub;
    }).catch(function() {
      if (!_read()) _write(_defaultTrial());
      return _read();
    });
  }

  // Push a local override to cloud (used post-Stripe-webhook signal,
  // or by Settings UI for testing/manual override).
  function setStateLocal(sub) {
    if (sub && typeof sub === 'object') _write(sub);
    return _read();
  }

  return {
    TIERS: TIERS,
    TRIAL_DAYS: TRIAL_DAYS,
    getState: getState,
    getTier: getTier,
    getStatus: getStatus,
    getPlan: getPlan,
    getAllTiers: getAllTiers,
    isTrial: isTrial,
    isActive: isActive,
    isTrialExpired: isTrialExpired,
    trialEndsAt: trialEndsAt,
    daysLeftInTrial: daysLeftInTrial,
    canUseFeature: canUseFeature,
    tierIncludesFeature: tierIncludesFeature,
    tierThatUnlocks: tierThatUnlocks,
    refreshFromCloud: refreshFromCloud,
    setStateLocal: setStateLocal
  };
})();
