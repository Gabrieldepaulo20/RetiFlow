import type { MarketingCustomerType, MarketingOrigin } from '@/types';

export const MARKETING_ORIGIN_OPTIONS: Array<{
  value: MarketingOrigin;
  label: string;
}> = [
  { value: 'GOOGLE_ADS_CALL', label: 'Google Ads — ligou e foi atendido' },
  { value: 'GOOGLE_ADS_ROUTE', label: 'Google Ads — pediu rota e chegou' },
  { value: 'GOOGLE_ADS_WHATSAPP', label: 'Google Ads — chamou no WhatsApp' },
  { value: 'GOOGLE_ADS_FORM', label: 'Google Ads — enviou o formulário' },
  { value: 'GOOGLE_ADS_SITE', label: 'Google Ads — veio pelo site' },
];

export const MARKETING_CUSTOMER_TYPE_OPTIONS: Array<{
  value: MarketingCustomerType;
  label: string;
}> = [
  { value: 'NEW', label: 'Novo cliente' },
  { value: 'EXISTING', label: 'Já era cliente' },
  { value: 'UNKNOWN', label: 'Não sei informar' },
];
