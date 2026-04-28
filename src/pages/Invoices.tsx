import { AlertCircle, FileText, LockKeyhole } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export default function Invoices() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-2">
        <Badge variant="outline" className="gap-1.5 border-amber-200 bg-amber-50 text-amber-700">
          <LockKeyhole className="h-3.5 w-3.5" />
          Fora da v1/piloto
        </Badge>
        <h1 className="text-2xl font-display font-bold">Nota Fiscal indisponível</h1>
        <p className="text-sm text-muted-foreground">
          Este módulo ainda não possui integração fiscal real e não deve ser usado na primeira versão.
        </p>
      </div>

      <Alert className="border-amber-200 bg-amber-50/80 text-amber-900">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Módulo desativado intencionalmente</AlertTitle>
        <AlertDescription>
          As ações antigas de registrar, baixar PDF, imprimir, enviar ou cancelar nota fiscal eram apenas visuais.
          Para evitar falso positivo em produção, elas foram removidas até existir backend fiscal homologado.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="flex items-start gap-4 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <p className="font-semibold">O que continua válido na v1</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Clientes, O.S., Kanban, fechamento mensal e contas a pagar seguem como fluxos reais.
              Nota Fiscal fica bloqueada até ser tratada em uma fase própria, com API fiscal, regras tributárias
              e testes de emissão/cancelamento.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
