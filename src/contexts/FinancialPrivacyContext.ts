import { createContext, useContext } from 'react';

export const FINANCIAL_PRIVACY_STORAGE_KEY = 'retiflow.financial-values-hidden';

export type FinancialPrivacyContextValue = {
  financialValuesHidden: boolean;
  toggleFinancialValues: () => void;
};

export const FinancialPrivacyContext = createContext<FinancialPrivacyContextValue | null>(null);

export function readStoredFinancialPrivacyPreference() {
  if (typeof window === 'undefined') return true;

  try {
    const storedValue = window.localStorage.getItem(FINANCIAL_PRIVACY_STORAGE_KEY);
    return storedValue === null ? true : storedValue !== 'false';
  } catch {
    return true;
  }
}

export function useFinancialPrivacy() {
  const context = useContext(FinancialPrivacyContext);
  if (!context) {
    throw new Error('useFinancialPrivacy deve ser usado dentro de FinancialPrivacyProvider');
  }
  return context;
}
