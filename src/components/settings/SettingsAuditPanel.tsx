import { useQuery } from '@tanstack/react-query';
import { Clock3, FileClock, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getHistoricoConfiguracoesUsuario } from '@/api/supabase/documentos';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

interface SettingsAuditPanelProps {
  targetUserId?: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  update_company_settings: 'Empresa',
  upsert_company_settings: 'Empresa',
  save_template_draft: 'Rascunho',
  save_document_template_draft: 'Rascunho',
  publish_template: 'Publicação',
  publish_document_template: 'Publicação',
  restore_template_default: 'Restaurado',
  restore_default_document_template: 'Restaurado',
  save_theme: 'Tema',
  create_document_theme: 'Tema',
  update_document_theme: 'Tema',
  toggle_theme: 'Tema',
  activate_document_theme: 'Tema',
  deactivate_document_theme: 'Tema',
};

export function SettingsAuditPanel({ targetUserId }: SettingsAuditPanelProps) {
  const query = useQuery({
    queryKey: ['settings', 'audit', targetUserId ?? 'current'],
    queryFn: () => getHistoricoConfiguracoesUsuario({ idUsuarios: targetUserId ?? null, limit: 60 }),
    enabled: IS_REAL_AUTH,
    staleTime: 30_000,
  });

  if (!IS_REAL_AUTH) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Histórico de configurações depende do Supabase em modo real.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileClock className="h-5 w-5" />
          Histórico
        </CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando histórico...
          </div>
        ) : (query.data ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
            Nenhuma alteração registrada.
          </div>
        ) : (
          <div className="space-y-3">
            {(query.data ?? []).map((entry) => (
              <div key={entry.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{ACTION_LABELS[entry.action] ?? entry.action}</Badge>
                    <span className="text-sm font-semibold">{entry.entityType}</span>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    {new Date(entry.createdAt).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
                  <AuditPreview label="Antes" value={entry.before} />
                  <AuditPreview label="Depois" value={entry.after} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AuditPreview({ label, value }: { label: string; value: Record<string, unknown> | null }) {
  const keys = value ? Object.keys(value).slice(0, 5) : [];
  return (
    <div className="rounded-lg bg-muted/35 p-3">
      <p className="font-semibold text-muted-foreground">{label}</p>
      {keys.length === 0 ? (
        <p className="mt-1 text-muted-foreground">Sem registro.</p>
      ) : (
        <dl className="mt-2 space-y-1">
          {keys.map((key) => (
            <div key={key} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
              <dt className="truncate font-medium">{key}</dt>
              <dd className="truncate text-muted-foreground">{formatAuditValue(value?.[key])}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function formatAuditValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return 'objeto';
  return String(value);
}
