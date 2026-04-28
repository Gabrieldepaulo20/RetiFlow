import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Kanban from '@/pages/Kanban';
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

vi.mock('@/components/notes/NoteDetailModal', () => ({
  default: ({ noteId }: { noteId: string | null }) => (noteId ? <div>note-detail-{noteId}</div> : null),
}));

vi.mock('@hello-pangea/dnd', () => {
  type DragChildArgs = {
    innerRef: () => void;
    draggableProps: Record<string, never>;
    dragHandleProps: Record<string, never>;
  };

  type DropChildArgs = {
    innerRef: () => void;
    droppableProps: Record<string, never>;
    placeholder: null;
  };

  return {
    DragDropContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Droppable: ({
      children,
    }: {
      children: (provided: DropChildArgs, snapshot: { isDraggingOver: boolean }) => React.ReactNode;
    }) => (
      <div>
        {children(
          {
            innerRef: () => undefined,
            droppableProps: {},
            placeholder: null,
          },
          { isDraggingOver: false },
        )}
      </div>
    ),
    Draggable: ({
      children,
    }: {
      children: (provided: DragChildArgs, snapshot: { isDragging: boolean }) => React.ReactNode;
    }) => (
      <div>
        {children(
          {
            innerRef: () => undefined,
            draggableProps: {},
            dragHandleProps: {},
          },
          { isDragging: false },
        )}
      </div>
    ),
  };
});

const mockedUseData = vi.mocked(useData);
const mockedUseAuth = vi.mocked(useAuth);

describe('Kanban', () => {
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
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      can: vi.fn(),
      canAccessModule: vi.fn(() => true),
      isAdmin: true,
    });

    mockedUseData.mockReturnValue({
      customers: [
        {
          id: 'c1',
          name: 'Cliente Teste',
          docType: 'CNPJ',
          docNumber: '00.000.000/0001-00',
          phone: '(11) 99999-9999',
          email: 'cliente@teste.com',
          address: 'Rua 1',
          city: 'Sao Paulo',
          state: 'SP',
          notes: '',
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      clients: [
        {
          id: 'c1',
          name: 'Cliente Teste',
          docType: 'CNPJ',
          docNumber: '00.000.000/0001-00',
          phone: '(11) 99999-9999',
          email: 'cliente@teste.com',
          address: 'Rua 1',
          city: 'Sao Paulo',
          state: 'SP',
          notes: '',
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      notes: [
        {
          id: 'n1',
          number: 'OS-1',
          clientId: 'c1',
          createdAt: '2026-03-01T00:00:00.000Z',
          createdByUserId: 'user-1',
          status: 'EM_EXECUCAO',
          type: 'SERVICO',
          engineType: 'Cabeçote',
          vehicleModel: 'Gol',
          complaint: 'Teste',
          observations: '',
          totalServices: 100,
          totalProducts: 0,
          totalAmount: 100,
          updatedAt: '2026-03-02T00:00:00.000Z',
        },
      ],
      services: [],
      products: [],
      attachments: [],
      invoices: [],
      activities: [],
      noteCounter: 1,
      dataVersion: 1,
      addClient: vi.fn(),
      updateClient: vi.fn(),
      getClient: vi.fn(),
      addNote: vi.fn(),
      updateNote: vi.fn(),
      getNote: vi.fn(),
      updateNoteStatus: vi.fn(),
      createPurchaseNote: vi.fn(),
      getChildNotes: vi.fn(() => []),
      getServicesForNote: vi.fn(() => []),
      addService: vi.fn(),
      removeService: vi.fn(),
      getProductsForNote: vi.fn(() => []),
      addProduct: vi.fn(),
      removeProduct: vi.fn(),
      getAttachmentsForNote: vi.fn(() => []),
      addAttachment: vi.fn(),
      addInvoice: vi.fn(),
      updateInvoice: vi.fn(),
      addActivity: vi.fn(),
    });
  });

  it('opens the note detail modal from the card without runtime errors', async () => {
    render(
      <MemoryRouter
        initialEntries={['/kanban']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Kanban />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('OS-1'));

    expect(await screen.findByText('note-detail-n1')).toBeInTheDocument();
  });
});
