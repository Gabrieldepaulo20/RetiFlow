import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { FinancialPrivacyToggle } from '@/components/privacy/FinancialPrivacyToggle';
import { FinancialValue } from '@/components/privacy/FinancialValue';
import {
  FINANCIAL_PRIVACY_STORAGE_KEY,
} from '@/contexts/FinancialPrivacyContext';
import { FinancialPrivacyProvider } from '@/contexts/FinancialPrivacyProvider';
import { TooltipProvider } from '@/components/ui/tooltip';

function renderPrivacyControls() {
  return render(
    <TooltipProvider>
      <FinancialPrivacyProvider>
        <FinancialPrivacyToggle />
        <p>
          Faturamento: <FinancialValue>R$ 123.456,78</FinancialValue>
        </p>
      </FinancialPrivacyProvider>
    </TooltipProvider>,
  );
}

describe('privacidade de valores financeiros', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('começa oculto e revela o valor somente após uma ação explícita', () => {
    renderPrivacyControls();

    expect(screen.queryByText('R$ 123.456,78')).not.toBeInTheDocument();
    expect(screen.getByText('R$ ••••••')).toHaveAccessibleName('Valor financeiro oculto');

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar valores financeiros' }));

    expect(screen.getByText('R$ 123.456,78')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ocultar valores financeiros' })).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem(FINANCIAL_PRIVACY_STORAGE_KEY)).toBe('false');
  });

  it('respeita a preferência visível salva no navegador', () => {
    window.localStorage.setItem(FINANCIAL_PRIVACY_STORAGE_KEY, 'false');

    renderPrivacyControls();

    expect(screen.getByText('R$ 123.456,78')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ocultar valores financeiros' })).toBeInTheDocument();
  });
});
