-- BM SECURITY layer 1: custom access token hook (2026-05-16, hardened)
-- Injects tenant_id + role into every issued JWT so tenant_isolation_* and
-- role-scoped policies resolve. Source of truth = public.user_tenants.
--
-- CRITICAL SAFETY PROPERTY: this runs on EVERY token issuance. If it raises,
-- Supabase Auth fails closed and NOBODY can log in. Therefore it is wrapped
-- so that ANY error returns the original event unchanged — login always
-- succeeds; worst case is "claims not enriched", never "login blocked".
-- A user with no user_tenants row (e.g. the 285 portal customers) simply
-- gets the token back untouched — correct, they fall through to
-- client_self_* policies by email.

-- SECURITY DEFINER: the hook runs as supabase_auth_admin, but user_tenants
-- has RLS — an invoker-rights read returns nothing. DEFINER runs as the
-- function owner (bypasses RLS for the lookup). search_path pinned to prevent
-- search_path-injection (mandatory for SECURITY DEFINER).
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable
security definer set search_path = public, pg_temp as $$
declare
  claims jsonb;
  uid uuid;
  t_id uuid;
  t_role text;
begin
  claims := event->'claims';
  begin
    uid := (event->>'user_id')::uuid;
  exception when others then
    return event;            -- malformed event: never block login
  end;

  begin
    select tenant_id, role into t_id, t_role
    from public.user_tenants
    where user_id = uid
    order by created_at
    limit 1;
  exception when others then
    return event;            -- lookup failed: never block login
  end;

  if t_id is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(t_id::text));
    claims := jsonb_set(claims, '{user_role}', to_jsonb(coalesce(t_role,'crew_member')));
    return jsonb_set(event, '{claims}', claims);
  end if;

  return event;              -- no mapping: untouched, login still works
exception when others then
  return event;              -- belt-and-suspenders catch-all
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

-- Enable AFTER unit-test passes:
--   Dashboard → Authentication → Hooks → Custom Access Token →
--   public.custom_access_token_hook → Enable.
-- Rollback = same screen, Disable (instant, no data change).
