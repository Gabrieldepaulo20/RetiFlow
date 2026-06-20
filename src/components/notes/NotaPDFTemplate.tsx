import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import type { NotaServicoDetalhes, NotaServicoDetalhesItem } from '@/api/supabase/notas';
import type { OsTemplateMode } from '@/api/supabase/modelos';
import type { ResolvedDocumentCustomization, TemplateVariableKey } from '@/services/domain/documentCustomization';
import {
  getDocumentAccentColor,
  normalizeDocumentCompanyName,
  normalizeServiceOrderText,
  renderTemplateText,
} from '@/services/domain/documentCustomization';
import {
  formatNotaClientPrintName,
  NOTA_PRINT_LONG_MAX_ROWS,
  NOTA_PRINT_MAX_ROWS,
  NOTA_PRINT_OBSERVATIONS,
} from '@/components/notes/notaPrintLayout';
import { getNotaItemDetailLines } from '@/components/notes/notaItemDetails';
import { formatCepForDisplay, formatDocumentForDisplay } from '@/services/domain/customers';

const MAX_ROWS = NOTA_PRINT_MAX_ROWS;
const LONG_MAX_ROWS = NOTA_PRINT_LONG_MAX_ROWS;

// @react-pdf aceita estilos falsy (cond && estilo) em runtime, mas o tipo Style[] não.
// Helper filtra os falsy preservando o tipo do estilo, sem `any`.
function sx(...styles: Array<Style | false | null | undefined>): Style[] {
  return styles.filter(Boolean) as Style[];
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    color: '#111111',
    fontFamily: 'Helvetica',
    fontSize: 8,
    padding: 0,
  },
  notaContainer: {
    flexDirection: 'row',
    width: '100%',
    height: '100%',
  },
  nota: {
    width: '50%',
    height: '100%',
    padding: 20,
    flexDirection: 'column',
    boxSizing: 'border-box',
  },
  notaFullPage: {
    width: '100%',
    padding: 28,
  },
  divider: {
    width: 1,
    marginVertical: 20,
    borderLeftWidth: 1,
    borderLeftColor: '#cccccc',
    borderLeftStyle: 'dashed',
  },
  notaHeader: {
    backgroundColor: '#f1f1f1',
    borderWidth: 1,
    borderColor: '#dddddd',
    borderStyle: 'solid',
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 78,
  },
  headerSide: {
    width: '48%',
    padding: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    width: '52%',
    borderLeftWidth: 1,
    borderLeftColor: '#cfcfcf',
    borderLeftStyle: 'solid',
  },
  headerTitle: {
    fontSize: 14.5,
    marginTop: 5,
    marginBottom: 2,
    fontWeight: 700,
  },
  headerTitleFull: {
    fontSize: 22,
  },
  headerSubtitle: {
    fontSize: 8.5,
    color: '#333333',
    marginBottom: 2,
  },
  headerSubtitleFull: {
    fontSize: 13,
  },
  headerEyebrow: {
    fontSize: 6.3,
    color: '#666666',
    marginBottom: 5,
    textAlign: 'center',
    fontWeight: 700,
    letterSpacing: 1.4,
  },
  headerInfo: {
    fontSize: 8.2,
    color: '#333333',
    marginBottom: 3.5,
    textAlign: 'center',
  },
  headerInfoStrong: {
    fontSize: 8.4,
    fontWeight: 700,
  },
  clienteBox: {
    position: 'relative',
    borderWidth: 1,
    borderColor: '#dddddd',
    borderStyle: 'solid',
    paddingTop: 36,
    paddingRight: 10,
    paddingBottom: 6,
    paddingLeft: 10,
    marginTop: 15,
    gap: 5,
  },
  clienteBoxFull: {
    marginTop: 18,
    paddingTop: 52,
    paddingRight: 14,
    paddingBottom: 10,
    paddingLeft: 14,
  },
  notaInfos: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#dcdcdc',
    color: '#333333',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  infoGroup: {
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 8,
    marginBottom: 2,
  },
  infoValue: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cccccc',
    borderStyle: 'solid',
    borderRadius: 20,
    width: 90,
    paddingVertical: 3,
    paddingHorizontal: 8,
    textAlign: 'center',
    fontSize: 8,
  },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 3,
    columnGap: 7,
    rowGap: 3,
  },
  fieldText: {
    fontSize: 8.1,
    lineHeight: 1.25,
  },
  tableWrapper: {
    flexGrow: 1,
    marginVertical: 15,
  },
  table: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#dddddd',
    borderStyle: 'solid',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#efefef',
  },
  th: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderStyle: 'solid',
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 7.8,
    textAlign: 'center',
    fontWeight: 700,
  },
  row: {
    flexDirection: 'row',
  },
  td: {
    borderWidth: 1,
    borderColor: '#dddddd',
    borderStyle: 'solid',
    paddingVertical: 3,
    paddingHorizontal: 4,
    minHeight: 21,
    fontSize: 8.3,
    justifyContent: 'center',
  },
  descCell: {
    justifyContent: 'flex-start',
  },
  mainDescription: {
    fontSize: 8.3,
    lineHeight: 1.25,
  },
  informationalDescription: {
    fontSize: 9.2,
    lineHeight: 1.3,
    fontWeight: 600,
  },
  detailLine: {
    marginTop: 2,
    marginLeft: 9,
    paddingLeft: 5,
    borderLeftWidth: 1,
    borderLeftColor: '#d2d8de',
    borderLeftStyle: 'solid',
    color: '#555555',
    fontSize: 7.4,
    lineHeight: 1.25,
  },
  informationalDetailLine: {
    fontSize: 8.3,
    lineHeight: 1.3,
  },
  emptyRow: {
    color: '#ffffff',
  },
  qtyCol: {
    width: '10%',
    textAlign: 'center',
  },
  descCol: {
    width: '52%',
    textAlign: 'left',
  },
  unitCol: {
    width: '19%',
    textAlign: 'right',
  },
  totalCol: {
    width: '19%',
    textAlign: 'right',
  },
  tableFooter: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderTopWidth: 1,
    borderTopColor: '#dddddd',
    borderTopStyle: 'solid',
  },
  totalLabel: {
    width: '81%',
    paddingVertical: 4,
    paddingHorizontal: 10,
    textAlign: 'right',
    fontSize: 8.8,
    fontWeight: 700,
  },
  totalValueCell: {
    width: '19%',
    paddingVertical: 4,
    paddingHorizontal: 4,
    textAlign: 'center',
    fontSize: 8.6,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderStyle: 'solid',
    backgroundColor: '#efefef',
    borderRadius: 4,
    fontWeight: 700,
  },
  observacoes: {
    backgroundColor: '#efefef',
    borderWidth: 1,
    borderColor: '#dddddd',
    borderStyle: 'solid',
    padding: 10,
    fontSize: 7,
    color: '#333333',
    marginBottom: 15,
  },
  observacoesTitle: {
    fontSize: 7,
    marginBottom: 4,
  },
  observacaoLinha: {
    fontSize: 7,
    marginBottom: 5,
    color: '#333333',
  },
  assinaturas: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingTop: 10,
    gap: 20,
  },
  assinaturaBloco: {
    width: 250,
    alignItems: 'center',
  },
  assinaturaLinha: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: '#000000',
    borderTopStyle: 'solid',
    marginBottom: 5,
  },
  assinaturaLabel: {
    fontSize: 8,
  },
  labelStrong: {
    fontWeight: 700,
  },
});

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const isInformationalItem = (item: Pick<NotaServicoDetalhesItem, 'preco_unitario' | 'subtotal_item'>) =>
  item.preco_unitario <= 0 && item.subtotal_item <= 0;

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const chunkItems = <T,>(items: T[], size: number) => {
  if (items.length === 0) return [[]];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

function FieldValue({
  label,
  value,
  fallback = '—',
}: {
  label: string;
  value: string | null | undefined;
  fallback?: string;
}) {
  return (
    <Text style={styles.fieldText}>
      <Text style={styles.labelStrong}>{label}: </Text>
      {value?.trim() ? value : fallback}
    </Text>
  );
}

function Via({
  dados,
  itens,
  maxRows = MAX_ROWS,
  fullPage = false,
  copyLabel,
  accentColor = '#1a7a8a',
  documentSettings,
}: {
  dados: NotaServicoDetalhes;
  itens: NotaServicoDetalhesItem[];
  maxRows?: number;
  fullPage?: boolean;
  copyLabel?: string;
  accentColor?: string;
  documentSettings?: ResolvedDocumentCustomization | null;
}) {
  const { cabecalho, financeiro_servicos } = dados;
  const paddingRows = Math.max(0, maxRows - itens.length);
  const resolvedConfig = documentSettings?.resolvedConfig;
  const company = documentSettings?.company;
  const effectiveAccent = getDocumentAccentColor(documentSettings, accentColor);
  const documentTitle = normalizeServiceOrderText(resolvedConfig?.title, 'ORDEM DE SERVIÇO');
  const companyName = normalizeDocumentCompanyName(company?.nomeFantasia);
  const companySubtitle = normalizeServiceOrderText(resolvedConfig?.subtitle, 'RETÍFICA DE CABEÇOTE');
  const companyAddress = [company?.endereco, company?.cidade && company?.estado ? `${company.cidade}/${company.estado}` : company?.cidade]
    .filter(Boolean)
    .join(' · ');
  const contactLine = [
    company?.cep ? `CEP ${company.cep}` : '',
    company?.telefone || company?.whatsapp || '',
    company?.email || '',
  ].filter(Boolean).join(' · ');
  const templateVariables: Partial<Record<TemplateVariableKey, string | number | null | undefined>> = {
    company_name: companyName,
    company_phone: company?.telefone,
    company_whatsapp: company?.whatsapp,
    customer_name: cabecalho.cliente.nome,
    vehicle_plate: cabecalho.veiculo.placa,
    service_order_number: cabecalho.os_numero,
    entry_note_number: cabecalho.os_numero,
    current_date: formatDate(new Date().toISOString()),
    total_amount: `R$ ${formatCurrency(financeiro_servicos.total_liquido)}`,
  };
  const configuredObservation = [
    resolvedConfig?.defaultObservation,
    company?.observacaoDocumentos,
    resolvedConfig?.termsText,
  ]
    .map((value) => value?.trim() ?? '')
    .filter((value): value is string => value.length > 0)
    .map((value) => renderTemplateText(value, templateVariables));
  const observationLines = configuredObservation.length > 0 ? configuredObservation : NOTA_PRINT_OBSERVATIONS;
  const footerText = resolvedConfig?.showFooter === false
    ? ''
    : renderTemplateText(resolvedConfig?.footerText || '', templateVariables);

  return (
    <View style={sx(styles.nota, fullPage && styles.notaFullPage)}>
      <View style={sx(styles.notaHeader, fullPage && { minHeight: 116 })}>
        <View style={styles.headerSide}>
          <Text style={sx(styles.headerTitle, fullPage && styles.headerTitleFull, { color: effectiveAccent })}>{companyName}</Text>
          <Text style={sx(styles.headerSubtitle, fullPage && styles.headerSubtitleFull)}>{companySubtitle}</Text>
        </View>
        <View style={[styles.headerSide, styles.headerRight, { borderLeftColor: effectiveAccent }]}>
          <Text style={[styles.headerEyebrow, { color: effectiveAccent }]}>{documentTitle.toUpperCase()}</Text>
          {copyLabel && <Text style={[styles.headerInfo, styles.headerInfoStrong]}>{copyLabel.toUpperCase()}</Text>}
          {resolvedConfig?.showCompanyData !== false && (
            <>
              <Text style={[styles.headerInfo, styles.headerInfoStrong]}>{companyAddress || 'Av. Fioravante Magro, 1059'}</Text>
              <Text style={styles.headerInfo}>{contactLine || 'Jardim Boa Vista · Sertãozinho/SP'}</Text>
              {company?.site && <Text style={styles.headerInfo}>{company.site}</Text>}
            </>
          )}
        </View>
      </View>

      <View style={sx(styles.clienteBox, fullPage && styles.clienteBoxFull)}>
        <View style={styles.notaInfos}>
          <View style={styles.infoGroup}>
            <Text style={styles.infoLabel}>O.S:</Text>
            <Text style={styles.infoValue}>{cabecalho.os_numero}</Text>
          </View>
          <View style={styles.infoGroup}>
            <Text style={styles.infoLabel}>Data:</Text>
            <Text style={styles.infoValue}>{formatDate(cabecalho.data_criacao)}</Text>
          </View>
          <View style={styles.infoGroup}>
            <Text style={styles.infoLabel}>Prazo:</Text>
            <Text style={styles.infoValue}>{formatDate(cabecalho.prazo)}</Text>
          </View>
        </View>

        <View style={styles.line}>
          <FieldValue label="Cliente" value={formatNotaClientPrintName(cabecalho.cliente.nome)} />
        </View>

        <View style={styles.line}>
          <FieldValue label="Documento" value={formatDocumentForDisplay(cabecalho.cliente.documento)} />
          <FieldValue label="Endereço" value={cabecalho.cliente.endereco} />
        </View>

        <View style={styles.line}>
          <FieldValue label="CEP" value={formatCepForDisplay(cabecalho.cliente.cep)} />
          <FieldValue label="Cidade" value={cabecalho.cliente.cidade} />
          <FieldValue label="Placa" value={cabecalho.veiculo.placa || 'Não informada'} />
          <FieldValue label="Veículo" value={cabecalho.veiculo.modelo} />
        </View>

        <View style={styles.line}>
          <FieldValue label="Email" value={cabecalho.cliente.email} fallback="" />
          <FieldValue label="Telefone" value={cabecalho.cliente.telefone} />
          <FieldValue label="Contato" value={cabecalho.contato_nome} />
        </View>
      </View>

      <View style={styles.tableWrapper}>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.qtyCol]}>QTD.</Text>
            <Text style={[styles.th, styles.descCol]}>DESCRIÇÃO DOS PRODUTOS</Text>
            <Text style={[styles.th, styles.unitCol]}>VALOR UNI.</Text>
            <Text style={[styles.th, styles.totalCol]}>TOTAL</Text>
          </View>

          {itens.map((item) => {
            const detailLines = getNotaItemDetailLines(item);
            const informational = isInformationalItem(item);

            return (
              <View key={item.id_rel} style={styles.row}>
                <Text style={[styles.td, styles.qtyCol]}>{informational ? '' : item.quantidade}</Text>
                <View style={[styles.td, styles.descCol, styles.descCell]}>
                  <Text style={sx(styles.mainDescription, informational && styles.informationalDescription)}>
                    {item.descricao}
                  </Text>
                  {detailLines.map((line, index) => (
                    <Text
                      key={`${item.id_rel}-detail-${index}`}
                      style={sx(styles.detailLine, informational && styles.informationalDetailLine)}
                    >
                      {line}
                    </Text>
                  ))}
                </View>
                <Text style={[styles.td, styles.unitCol]}>{informational ? '' : `R$ ${formatCurrency(item.preco_unitario)}`}</Text>
                <Text style={[styles.td, styles.totalCol]}>{informational ? '' : `R$ ${formatCurrency(item.subtotal_item)}`}</Text>
              </View>
            );
          })}

          {Array.from({ length: paddingRows }).map((_, index) => (
            <View key={`empty-${index}`} style={styles.row}>
              <Text style={[styles.td, styles.qtyCol, styles.emptyRow]}>.</Text>
              <Text style={[styles.td, styles.descCol, styles.emptyRow]}>.</Text>
              <Text style={[styles.td, styles.unitCol, styles.emptyRow]}>.</Text>
              <Text style={[styles.td, styles.totalCol, styles.emptyRow]}>.</Text>
            </View>
          ))}

          <View style={styles.tableFooter}>
            <Text style={styles.totalLabel}>TOTAL GERAL</Text>
            <Text style={styles.totalValueCell}>R$ {formatCurrency(financeiro_servicos.total_liquido)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.observacoes}>
        <Text style={styles.observacoesTitle}>OBSERVAÇÕES:</Text>
        {observationLines.map((linha, index) => (
          <Text key={`${linha}-${index}`} style={styles.observacaoLinha}>
            {linha}
          </Text>
        ))}
        {footerText && (
          <Text style={styles.observacaoLinha}>
            {footerText}
          </Text>
        )}
      </View>

      <View style={styles.assinaturas}>
        <View style={styles.assinaturaBloco}>
          <View style={styles.assinaturaLinha} />
          <Text style={styles.assinaturaLabel}>Assinatura Vendedor</Text>
        </View>
        <View style={styles.assinaturaBloco}>
          <View style={styles.assinaturaLinha} />
          <Text style={styles.assinaturaLabel}>Assinatura Comprador</Text>
        </View>
      </View>
    </View>
  );
}

interface Props {
  dados: NotaServicoDetalhes;
  accentColor?: string;
  templateMode?: OsTemplateMode;
  documentSettings?: ResolvedDocumentCustomization | null;
}

export function NotaPDFTemplate({
  dados,
  accentColor = '#1a7a8a',
  templateMode = 'auto',
  documentSettings,
}: Props) {
  const effectiveAccent = getDocumentAccentColor(documentSettings, accentColor);
  const usePortraitLayout = templateMode === 'a4_vertical' || (templateMode === 'auto' && dados.itens_servico.length > MAX_ROWS);
  const itemPages = chunkItems(dados.itens_servico, usePortraitLayout ? LONG_MAX_ROWS : MAX_ROWS);
  const portraitPages = itemPages.flatMap((itens, index) => [
    { itens, copyLabel: 'Via cliente', key: `cliente-${index}` },
    { itens, copyLabel: 'Via retífica', key: `retifica-${index}` },
  ]);

  return (
    <Document title={`O.S. ${dados.cabecalho.os_numero} — ${dados.cabecalho.cliente.nome}`}>
      {(usePortraitLayout ? portraitPages : itemPages.map((itens, index) => ({ itens, copyLabel: null, key: `landscape-${index}` }))).map((page) => (
        <Page
          key={`${dados.cabecalho.id_nota}-${page.key}`}
          size="A4"
          orientation={usePortraitLayout ? 'portrait' : 'landscape'}
          style={styles.page}
        >
          {usePortraitLayout ? (
            <View style={styles.notaContainer}>
              <Via
                dados={dados}
                itens={page.itens}
                maxRows={LONG_MAX_ROWS}
                fullPage
                copyLabel={page.copyLabel ?? undefined}
                accentColor={effectiveAccent}
                documentSettings={documentSettings}
              />
            </View>
          ) : (
            <View style={styles.notaContainer}>
              <Via dados={dados} itens={page.itens} accentColor={effectiveAccent} documentSettings={documentSettings} />
              <View style={styles.divider} />
              <Via dados={dados} itens={page.itens} accentColor={effectiveAccent} documentSettings={documentSettings} />
            </View>
          )}
        </Page>
      ))}
    </Document>
  );
}
