import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import NoteFormCore from '@/components/notes/NoteFormCore';
import { IntakeNote } from '@/types';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

/**
 * Full-page wrapper around NoteFormCore.
 * Route: /notas-entrada/nova  and  /notas-entrada/:id/editar
 */
export default function IntakeNoteForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { getNote } = useData();
  const navigate = useNavigate();

  const editingNote = id ? getNote(id) : undefined;

  if (id && !editingNote) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 text-xl font-display font-bold">Nota não encontrada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A edição só pode ser aberta para uma O.S. existente. Verifique se ela ainda está disponível.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Button variant="outline" onClick={() => navigate('/notas-entrada')}>
              Voltar para notas
            </Button>
            <Button onClick={() => navigate(-1)}>
              Fechar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleSuccess = (note: IntakeNote) => {
    navigate(`/notas-entrada/${note.id}`);
  };

  return (
    <NoteFormCore
      editingNote={editingNote}
      preClientId={params.get('clientId') ?? undefined}
      preParentId={params.get('parentId') ?? undefined}
      onSuccess={handleSuccess}
      onCancel={() => navigate(-1)}
    />
  );
}
