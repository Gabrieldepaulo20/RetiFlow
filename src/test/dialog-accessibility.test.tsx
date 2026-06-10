import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

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

  it('adds a hidden title when sheet content does not provide one', () => {
    render(
      <Sheet open>
        <SheetContent>
          <p>Conteudo do painel</p>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole('heading', { name: 'Painel lateral' })).toBeInTheDocument();
  });

  it('keeps explicit sheet titles as the accessible title', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Menu proprio</SheetTitle>
          <p>Conteudo do painel</p>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole('heading', { name: 'Menu proprio' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Painel lateral' })).not.toBeInTheDocument();
  });
});
