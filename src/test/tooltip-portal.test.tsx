import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

describe('tooltip em portal', () => {
  it('renderiza o conteúdo fora do contêiner que pode recortá-lo', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <div data-testid="clipping-card" className="overflow-hidden">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">Ajuda</button>
            </TooltipTrigger>
            <TooltipContent>Explicação completa do KPI</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>,
    );

    fireEvent.focus(screen.getByRole('button', { name: 'Ajuda' }));

    const tooltip = await waitFor(() => screen.getByRole('tooltip'));
    expect(tooltip).toHaveTextContent('Explicação completa do KPI');

    expect(screen.getByTestId('clipping-card')).not.toContainElement(tooltip);
  });
});
