create index if not exists idx_marketing_offline_conversions_attribution
  on "RetificaPremium"."Marketing_Offline_Conversions"(fk_marketing_client_attributions);

create index if not exists idx_marketing_offline_conversions_lead
  on "RetificaPremium"."Marketing_Offline_Conversions"(fk_marketing_leads)
  where fk_marketing_leads is not null;
