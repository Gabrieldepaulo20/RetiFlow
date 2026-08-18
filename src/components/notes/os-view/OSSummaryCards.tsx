/**
 * Blocos de dados da O.S.: cliente/peça, datas e prazo, queixa e observação.
 *
 * Todo campo aqui é opcional em `IntakeNote`. Quando não vem preenchido, o campo
 * cai para "—" ou o bloco inteiro não renderiza — nenhuma tela finge dado.
 */

import { CalendarDays, Clock, FileWarning, NotebookPen, Phone, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Client, IntakeNote } from '@/types';
import { cn } from '@/lib/utils';
import { OSCard, OSCardTitle, OSDivider, OSField } from './OSCard';
import {
  buildOSDeadlineModel,
  formatOSDate,
  formatOSTime,
  osDaysInStage,
  type OSDeadlineTone,
} from './osViewModel';

const DEADLINE_TONE_CLASS: Record<OSDeadlineTone, string> = {
  OK: 'border-os-done/30 bg-os-done-soft text-os-done-ink',
  NEAR: 'border-os-warn-line bg-os-warn-soft text-os-warn-ink',
  LATE: 'border-os-danger-line bg-os-danger-soft text-os-danger-ink',
};

const DEADLINE_BAR_CLASS: Record<OSDeadlineTone, string> = {
  OK: 'bg-os-done',
  NEAR: 'bg-[linear-gradient(90deg,#E2600B,#F0A21F)]',
  LATE: 'bg-os-danger',
};

interface OSClientCardProps {
  note: IntakeNote;
  client?: Client | null;
  className?: string;
}

/** Cliente, contato e identificação da peça (motor, modelo, placa, km). */
export function OSClientCard({ note, client, className }: OSClientCardProps) {
  return (
    <OSCard className={cn('p-5 sm:px-6', className)}>
      <OSCardTitle icon={User} className="mb-[18px]">
        Cliente &amp; peça
      </OSCardTitle>

      <div className="grid gap-x-5 gap-y-[18px] [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        <OSField label="Cliente">{client?.name ?? '—'}</OSField>
        <OSField label="Telefone" mono>
          {client?.phone || '—'}
        </OSField>
        {client?.docNumber ? (
          <OSField label="Documento" mono>
            {client.docNumber}
          </OSField>
        ) : null}
        {note.contatoNome ? (
          <OSField
            label="Contato responsável"
            hint={
              note.contatoTelefone ? (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3 shrink-0" />
                  <span className="font-os-mono">{note.contatoTelefone}</span>
                </span>
              ) : null
            }
          >
            {note.contatoNome}
          </OSField>
        ) : null}
      </div>

      <OSDivider className="my-5" />

      <div className="grid gap-x-5 gap-y-[18px] [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
        <OSField label="Motor">{note.engineType || '—'}</OSField>
        <OSField label="Modelo">{note.vehicleModel || '—'}</OSField>
        <OSField label="Placa" mono>
          {note.plate || '—'}
        </OSField>
        <OSField label="Quilometragem" mono>
          {note.km ? `${note.km.toLocaleString('pt-BR')} km` : '—'}
        </OSField>
      </div>
    </OSCard>
  );
}

interface OSScheduleCardProps {
  note: IntakeNote;
  className?: string;
}

/** Abertura, prazo, entrega, barra de progresso do prazo e tempo na etapa. */
export function OSScheduleCard({ note, className }: OSScheduleCardProps) {
  const deadline = buildOSDeadlineModel(note);
  const daysInStage = osDaysInStage(note);
  const openedTime = formatOSTime(note.createdAt);

  return (
    <OSCard className={cn('flex flex-col p-5 sm:px-6', className)}>
      <OSCardTitle icon={CalendarDays} className="mb-[18px]">
        Data e prazo
      </OSCardTitle>

      <div className="grid gap-x-5 gap-y-[18px] [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        <OSField label="Abertura da O.S." mono hint={openedTime}>
          {formatOSDate(note.createdAt)}
        </OSField>
        <OSField label="Prazo previsto" mono>
          {formatOSDate(note.deadline)}
        </OSField>
        <OSField label="Entrega" mono>
          {formatOSDate(note.finalizedAt)}
        </OSField>
      </div>

      <div className="mt-auto flex flex-col gap-2.5 pt-5">
        {deadline ? (
          <>
            <div
              className={cn(
                'flex items-center gap-2.5 rounded-[10px] border px-3.5 py-3',
                DEADLINE_TONE_CLASS[deadline.tone],
              )}
            >
              <Clock className="h-[19px] w-[19px] shrink-0" />
              <span className="text-[13.5px] font-semibold">{deadline.message}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-os-muted">
              <div
                className={cn('h-full rounded', DEADLINE_BAR_CLASS[deadline.tone])}
                style={{ width: `${deadline.percent}%` }}
              />
            </div>
          </>
        ) : note.deadline ? null : (
          <p className="rounded-[10px] border border-dashed border-os-line bg-os-subtle px-3.5 py-3 text-[12.5px] text-os-stone">
            Sem prazo definido para esta O.S.
          </p>
        )}

        <div
          className={cn(
            'flex items-center gap-2.5 rounded-[10px] px-3.5 py-2.5',
            daysInStage >= 7
              ? 'bg-os-danger-soft text-os-danger-ink'
              : daysInStage >= 4
                ? 'bg-os-warn-soft text-os-warn-ink'
                : 'bg-os-muted text-os-slate',
          )}
        >
          <Clock className="h-[15px] w-[15px] shrink-0 opacity-70" />
          <span className="text-[13px] font-medium">
            {daysInStage === 0
              ? 'Atualizada hoje'
              : `${daysInStage} dia${daysInStage === 1 ? '' : 's'} nesta etapa`}
          </span>
          {daysInStage >= 7 ? (
            <span className="ml-auto text-[10.5px] font-bold uppercase tracking-[0.08em] opacity-80">
              Atenção
            </span>
          ) : null}
        </div>
      </div>
    </OSCard>
  );
}

interface OSTextCardProps {
  icon: LucideIcon;
  title: string;
  text?: string | null;
  className?: string;
}

function OSTextCard({ icon, title, text, className }: OSTextCardProps) {
  if (!text) return null;

  return (
    <OSCard className={cn('p-5 sm:px-6', className)}>
      <OSCardTitle icon={icon} className="mb-3">
        {title}
      </OSCardTitle>
      <p className="whitespace-pre-line text-sm leading-relaxed text-os-slate">{text}</p>
    </OSCard>
  );
}

/** Queixa / defeito relatado pelo cliente. */
export function OSComplaintCard({ note, className }: { note: IntakeNote; className?: string }) {
  return (
    <OSTextCard
      icon={FileWarning}
      title="Queixa / defeito relatado"
      text={note.complaint}
      className={className}
    />
  );
}

/** Observação interna da oficina. */
export function OSObservationsCard({ note, className }: { note: IntakeNote; className?: string }) {
  return (
    <OSTextCard
      icon={NotebookPen}
      title="Observação interna"
      text={note.observations}
      className={className}
    />
  );
}
