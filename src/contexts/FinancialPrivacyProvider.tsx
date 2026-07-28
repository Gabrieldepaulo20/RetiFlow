import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  FINANCIAL_PRIVACY_STORAGE_KEY,
  FinancialPrivacyContext,
  readStoredFinancialPrivacyPreference,
} from '@/contexts/FinancialPrivacyContext';

export function FinancialPrivacyProvider({ children }: { children: ReactNode }) {
  const [financialValuesHidden, setFinancialValuesHidden] = useState(readStoredFinancialPrivacyPreference);

  const toggleFinancialValues = useCallback(() => {
    setFinancialValuesHidden((currentValue) => {
      const nextValue = !currentValue;
      try {
        window.localStorage.setItem(FINANCIAL_PRIVACY_STORAGE_KEY, String(nextValue));
      } catch {
        // A preferência continua válida nesta sessão mesmo se o navegador bloquear o storage.
      }
      return nextValue;
    });
  }, []);

  const value = useMemo(() => ({
    financialValuesHidden,
    toggleFinancialValues,
  }), [financialValuesHidden, toggleFinancialValues]);

  return (
    <FinancialPrivacyContext.Provider value={value}>
      {children}
    </FinancialPrivacyContext.Provider>
  );
}
