-- Fecha privilegios diretos das helpers internas usadas pelo trigger.

revoke execute on function "RetificaPremium".has_active_support_session_for_target(uuid) from public, anon, authenticated;
revoke execute on function "RetificaPremium".enforce_payable_owner() from public, anon, authenticated;
grant execute on function "RetificaPremium".has_active_support_session_for_target(uuid) to service_role;
grant execute on function "RetificaPremium".enforce_payable_owner() to service_role;
