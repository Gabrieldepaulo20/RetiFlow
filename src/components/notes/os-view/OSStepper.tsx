/**
 * Stepper do fluxo da O.S. — etapas concluídas em teal, etapa atual destacada em
 * laranja, futuras apagadas. Quando a O.S. terminou num final alternativo
 * (Recusada/Sem Conserto/Excluída), ele entra como etapa extra em vermelho.
 *
 * A faixa tem rolagem horizontal própria (`overflow-x-auto`) para não empurrar
 * largura na página — a trava de responsividade do projeto proíbe rolagem
 * horizontal no corpo.
 */

import { STATUS_DESCRIPTIONS, STATUS_LABELS, type IntakeNote } from '@/types';
import { cn } from '@/lib/utils';
import { osStatusIcon } from './osStatusVisuals';
import { OS_STEP_HINT, buildOSStepperModel, type OSStepState } from './osViewModel';

/** Trecho de trilha à esquerda de uma etapa: pinta a aresta que chegou nela. */
function trackInto(state: OSStepState): string {
  if (state === 'CURRENT') return 'bg-os-accent';
  if (state === 'DONE') return 'bg-os-done';
  return 'bg-os-line';
}

/**
 * Trecho à direita: teal quando a etapa seguinte também já passou, e a
 * transição teal → laranja no trecho que desemboca na etapa atual.
 */
function trackOut(state: OSStepState, nextState?: OSStepState): string {
  if (state === 'DONE' && nextState === 'CURRENT') {
    return 'bg-[linear-gradient(90deg,#0F766E,#E2600B)]';
  }
  if (state === 'DONE') return 'bg-os-done';
  return 'bg-os-line';
}

interface OSStepperProps {
  note: IntakeNote;
  className?: string;
}

export function OSStepper({ note, className }: OSStepperProps) {
  const { steps, altFinal } = buildOSStepperModel(note);
  const AltIcon = altFinal ? osStatusIcon(altFinal) : null;

  return (
    <div className={cn('min-w-0 flex-none border-b border-os-line bg-os-surface', className)}>
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 sm:px-8">
        <p className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-os-stone">
          Progresso
        </p>
        <p className="truncate text-right text-[11.5px] text-os-stone">
          {STATUS_DESCRIPTIONS[note.status]}
        </p>
      </div>

      <div className="min-w-0 overflow-x-auto pb-[22px] scrollbar-thin">
        <div className="flex min-w-[680px] items-start px-4 pt-4 sm:px-8">
          {steps.map((step, index) => {
            const StepIcon = osStatusIcon(step.status);
            const isLast = index === steps.length - 1 && !altFinal;
            const nextState = steps[index + 1]?.state ?? (altFinal ? 'PENDING' : undefined);
            const hint = OS_STEP_HINT[step.status];

            return (
              <div key={step.status} className="flex min-w-0 flex-1 flex-col items-center gap-[9px]">
                <div className="flex w-full items-center">
                  {/* Trecho à esquerda: herda o estado da etapa anterior */}
                  <div
                    className={cn(
                      'h-[3px] flex-1 rounded-sm',
                      index === 0 ? 'bg-transparent' : trackInto(step.state),
                    )}
                  />
                  <div
                    className={cn(
                      'flex flex-none items-center justify-center rounded-full',
                      step.state === 'CURRENT'
                        ? 'h-[52px] w-[52px] -my-1 border-[3px] border-os-surface bg-os-accent text-white shadow-[0_0_0_4px_rgba(226,96,11,0.24),0_6px_16px_-4px_rgba(226,96,11,0.6)]'
                        : step.state === 'DONE'
                          ? 'h-11 w-11 border-2 border-os-done bg-os-done text-white'
                          : 'h-11 w-11 border-2 border-os-line bg-os-muted text-os-fog',
                    )}
                  >
                    <StepIcon className={step.state === 'CURRENT' ? 'h-[25px] w-[25px]' : 'h-[21px] w-[21px]'} />
                  </div>
                  <div
                    className={cn(
                      'h-[3px] flex-1 rounded-sm',
                      isLast ? 'bg-transparent' : trackOut(step.state, nextState),
                    )}
                  />
                </div>

                <div className="flex flex-col items-center gap-0.5 px-1">
                  <span
                    className={cn(
                      'text-center leading-tight',
                      step.state === 'CURRENT'
                        ? 'text-[13px] font-bold text-os-accent-hover'
                        : step.state === 'DONE'
                          ? 'text-[12.5px] font-semibold text-os-done'
                          : 'text-[12.5px] font-medium text-os-fog',
                    )}
                  >
                    {STATUS_LABELS[step.status]}
                  </span>
                  {hint ? (
                    <span
                      className={cn(
                        'text-center text-[10.5px] leading-tight',
                        step.state === 'CURRENT' ? 'font-semibold text-os-accent/80' : 'text-os-fog',
                      )}
                    >
                      {hint}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}

          {altFinal && AltIcon ? (
            <div className="flex min-w-0 flex-1 flex-col items-center gap-[9px]">
              <div className="flex w-full items-center">
                <div className="h-[3px] flex-1 rounded-sm bg-os-danger-line" />
                <div className="flex h-[52px] w-[52px] -my-1 flex-none items-center justify-center rounded-full border-[3px] border-os-surface bg-os-danger text-white shadow-[0_0_0_4px_rgba(179,34,34,0.2)]">
                  <AltIcon className="h-[25px] w-[25px]" />
                </div>
                <div className="h-[3px] flex-1 bg-transparent" />
              </div>
              <span className="text-center text-[13px] font-bold leading-tight text-os-danger">
                {STATUS_LABELS[altFinal]}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default OSStepper;
