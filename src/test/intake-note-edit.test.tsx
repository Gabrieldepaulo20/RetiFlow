import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import NoteFormCore from '@/components/notes/NoteFormCore';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';

vi.mock('@/contexts/DataContext', () => ({
  useData: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

const mockedUseData = vi.mocked(useData);
const mockedUseAuth = vi.mocked(useAuth);

describe('Note edit flow', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      authMode: 'development',
      user: {
        id: 'user-1',
        name: 'Admin Master',
        email: 'admin@retifica.com',
        role: 'ADMIN',
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      session: null,
      isAuthLoading: false,
      profileError: null,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      retryAuth: vi.fn(),
      can: vi.fn(),
      canAccessModule: vi.fn(() => true),
      isAdmin: true,
    });
  });

  it('updates an existing service note without runtime errors', async () => {
    const updateNote = vi.fn();
    const replaceServicesForNote = vi.fn();
    const replaceProductsForNote = vi.fn();
    const onSuccess = vi.fn();

    const editingNote = {
      id: 'note-1',
      number: 'OS-123',
      clientId: 'client-1',
      createdAt: '2026-03-20T10:00:00.000Z',
      updatedAt: '2026-03-21T10:00:00.000Z',
      createdByUserId: 'user-1',
      status: 'EM_ANALISE' as const,
      type: 'SERVICO' as const,
      engineType: 'Cabeçote',
      vehicleModel: 'Gol 1.0',
      plate: 'ABC-1234',
      km: 12345,
      complaint: 'Batendo válvula',
      observations: 'Observação antiga',
      totalServices: 350,
      totalProducts: 0,
      totalAmount: 350,
    };

    mockedUseData.mockReturnValue({
      customers: [
        {
          id: 'client-1',
          name: 'Cliente Teste',
          docType: 'CPF',
          docNumber: '123.456.789-00',
          phone: '(11) 99999-0000',
          email: 'cliente@teste.com',
          address: 'Rua Um',
          addressNumber: '10',
          district: 'Centro',
          city: 'São Paulo',
          state: 'SP',
          cep: '01000-000',
          notes: '',
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      clients: [
        {
          id: 'client-1',
          name: 'Cliente Teste',
          docType: 'CPF',
          docNumber: '123.456.789-00',
          phone: '(11) 99999-0000',
          email: 'cliente@teste.com',
          address: 'Rua Um',
          addressNumber: '10',
          district: 'Centro',
          city: 'São Paulo',
          state: 'SP',
          cep: '01000-000',
          notes: '',
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      notes: [editingNote],
      services: [],
      products: [],
      attachments: [],
      invoices: [],
      activities: [],
      noteCounter: 10,
      dataVersion: 1,
      addClient: vi.fn(),
      updateClient: vi.fn(),
      getClient: vi.fn(),
      addNote: vi.fn(),
      updateNote,
      getNote: vi.fn(),
      updateNoteStatus: vi.fn(),
      createPurchaseNote: vi.fn(),
      getChildNotes: vi.fn(() => []),
      getServicesForNote: vi.fn(() => [
        {
          id: 'service-1',
          noteId: 'note-1',
          name: 'Plaina',
          description: 'Plaina',
          price: 350,
          quantity: 1,
          subtotal: 350,
        },
      ]),
      addService: vi.fn(),
      replaceServicesForNote,
      removeService: vi.fn(),
      getProductsForNote: vi.fn(() => []),
      addProduct: vi.fn(),
      replaceProductsForNote,
      removeProduct: vi.fn(),
      getAttachmentsForNote: vi.fn(() => []),
      addAttachment: vi.fn(),
      addInvoice: vi.fn(),
      updateInvoice: vi.fn(),
      addActivity: vi.fn(),
      payables: [],
      payableCategories: [],
      payableSuppliers: [],
      payableAttachments: [],
      payableHistory: [],
      addPayable: vi.fn(),
      updatePayable: vi.fn(),
      getPayable: vi.fn(),
      addPayableAttachment: vi.fn(),
      addPayableHistoryEntry: vi.fn(),
      getAttachmentsForPayable: vi.fn(() => []),
      getHistoryForPayable: vi.fn(() => []),
      getInstallmentSiblings: vi.fn(() => []),
      emailSuggestions: [],
      acceptEmailSuggestion: vi.fn(),
      dismissEmailSuggestion: vi.fn(),
    });

    render(
      <NoteFormCore
        editingNote={editingNote}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />,
    );

    await screen.findByDisplayValue('Gol 1.0');

    fireEvent.change(screen.getByDisplayValue('Gol 1.0'), {
      target: { value: 'Gol 1.6 atualizado' },
    });

    fireEvent.change(screen.getAllByDisplayValue('Plaina')[0], {
      target: { value: 'Plaina completa' },
    });

    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(updateNote).toHaveBeenCalledWith(
        'note-1',
        expect.objectContaining({
          vehicleModel: 'Gol 1.6 atualizado',
          complaint: 'Plaina completa',
          totalAmount: 350,
        }),
        expect.any(Array),
      );
    });

    expect(replaceServicesForNote).toHaveBeenCalledWith(
      'note-1',
      expect.arrayContaining([
        expect.objectContaining({
          noteId: 'note-1',
          name: 'Plaina completa',
          price: 350,
          quantity: 1,
        }),
      ]),
    );
    expect(replaceProductsForNote).toHaveBeenCalledWith('note-1', []);
    expect(onSuccess).toHaveBeenCalledWith(editingNote);
  });
});
