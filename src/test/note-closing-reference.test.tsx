import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteClosingReference } from '@/components/notes/NoteClosingReference';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  canAccessModule: vi.fn(() => true),
  useQuery: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ canAccessModule: mocks.canAccessModule }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mocks.useQuery(options),
}));

vi.mock('@/components/privacy/FinancialValue', () => ({
  FinancialValue: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('NoteClosingReference', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.canAccessModule.mockReturnValue(true);
    mocks.useQuery.mockReturnValue({
      data: {
        id_fechamentos: 'fechamento-1',
        dados_json: {
          notas: [{
            id: 'nota-1',
            itens: [{ quantidade: 1, preco_unitario: 560, subtotal: 532 }],
          }],
        },
      },
    });
  });

  it('mostra o desconto por item e abre o fechamento vinculado', () => {
    const beforeNavigate = vi.fn();
    render(
      <NoteClosingReference
        noteId="nota-1"
        closingId="fechamento-1"
        clientId="cliente-1"
        onBeforeNavigate={beforeNavigate}
      />,
    );

    expect(screen.getByText(/Desconto no fechamento:/)).toHaveTextContent('R$ 28,00');
    fireEvent.click(screen.getByRole('button', { name: /Abrir fechamento/i }));

    expect(beforeNavigate).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith('/fechamento?fechamento=fechamento-1');
  });

  it('não oferece navegação quando o usuário não possui o módulo', () => {
    mocks.canAccessModule.mockReturnValue(false);
    mocks.useQuery.mockReturnValue({ data: null });

    render(
      <NoteClosingReference noteId="nota-1" closingId="fechamento-1" clientId="cliente-1" />,
    );

    expect(screen.queryByRole('button', { name: /Abrir fechamento/i })).not.toBeInTheDocument();
    expect(screen.getByText('Fechamento vinculado')).toBeInTheDocument();
  });
});
