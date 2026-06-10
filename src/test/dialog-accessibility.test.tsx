import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

describe('Dialog accessibility defaults', () => {
  it('adds a hidden title when content does not provide one', () => {
    render(
      <Dialog open>
        <DialogContent>
          <p>Conteudo do modal</p>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('heading', { name: 'Janela de dialogo' })).toBeInTheDocument();
  });

  it('keeps explicit dialog titles as the accessible title', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Titulo proprio</DialogTitle>
          <p>Conteudo do modal</p>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('heading', { name: 'Titulo proprio' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Janela de dialogo' })).not.toBeInTheDocument();
  });
});
