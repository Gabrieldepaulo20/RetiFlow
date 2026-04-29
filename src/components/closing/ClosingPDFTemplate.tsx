import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { FechamentoDadosJson } from '@/api/supabase/fechamentos';

const MAX_ITEMS_PER_OS_BLOCK = 12;

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const rgba = (hex: string, alpha: number) => {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : '0f7f95';
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const chunkItems = <T,>(items: T[], size: number) => {
  if (items.length === 0) return [[]];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: '#152033', padding: '12mm', backgroundColor: '#f8fafc' },

  // Header
  headerCard: { backgroundColor: '#0f7f95', borderRadius: 10, padding: 14, marginBottom: 10, color: '#ffffff' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  company: { fontSize: 16, fontWeight: 700, letterSpacing: 0.5 },
  subtitle: { fontSize: 8.5, color: '#dff7fb', marginTop: 3 },
  headerRight: { alignItems: 'flex-end' },
  headerMeta: { fontSize: 8, color: '#e8fbff', marginTop: 2 },
  summaryStrip: { flexDirection: 'row', gap: 8, marginTop: 12 },
  summaryPill: { backgroundColor: '#ffffff', color: '#0f6172', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 9 },
  summaryLabel: { fontSize: 7, color: '#5c7680', textTransform: 'uppercase', letterSpacing: 0.7 },
  summaryValue: { fontSize: 11, fontWeight: 700, marginTop: 2 },

  // OS block
  osBlock: { marginBottom: 8, borderWidth: 1, borderColor: '#d6e3e8', borderRadius: 8, overflow: 'hidden', backgroundColor: '#ffffff' },
  osHeader: { backgroundColor: '#e9f7fa', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#cae3ea' },
  osNumber: { fontSize: 10.5, fontWeight: 700, color: '#0f6172' },
  osVehicle: { fontSize: 8, color: '#52657a', marginTop: 1 },
  osPlate: { fontSize: 8, fontWeight: 600, color: '#0f6172' },
  continuation: { fontSize: 7, color: '#60758a', marginTop: 2 },

  // Items table
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#d7e3e8', paddingVertical: 4, paddingHorizontal: 10, backgroundColor: '#f4f8fa' },
  tableRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: '#e5edf0' },
  tableRowAlt: { backgroundColor: '#fbfdfe' },
  colDesc: { flex: 1, fontSize: 8 },
  colNum: { width: 36, textAlign: 'center', fontSize: 8 },
  colVal: { width: 54, textAlign: 'right', fontSize: 8 },
  thText: { fontSize: 7, fontWeight: 600, color: '#60758a', textTransform: 'uppercase' },

  // OS footer
  osFoot: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#f5f9fb' },
  footLabel: { fontSize: 8, color: '#60758a' },
  footValue: { fontSize: 8, fontWeight: 600, color: '#152033' },
  footTotal: { fontSize: 9.5, fontWeight: 700, color: '#0f6172' },
  footGroup: { flexDirection: 'row', marginLeft: 16 },
  footGroupFirst: { flexDirection: 'row' },
  continuesFoot: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#f5f9fb', color: '#60758a', fontSize: 8 },

  // Grand total
  totalSection: { marginTop: 8, borderRadius: 10, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', backgroundColor: '#e9f7fa', borderWidth: 1, borderColor: '#cae3ea' },
  totalLabel: { fontSize: 10, fontWeight: 700, color: '#0f6172' },
  totalValue: { fontSize: 16, fontWeight: 700, color: '#0f6172' },

  // Footer
  pageFooter: { position: 'absolute', bottom: '7mm', left: '12mm', right: '12mm', flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#cbd5df', paddingTop: 4 },
  footerText: { fontSize: 7, color: '#6b7d90' },
});

interface Props {
  dados: FechamentoDadosJson;
  geradoEm: string;
  accentColor?: string;
}

export function ClosingPDFTemplate({ dados, geradoEm, accentColor = '#0f7f95' }: Props) {
  const dataFormatada = new Date(geradoEm).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const notaSections = dados.notas.flatMap((nota) => {
    const chunks = chunkItems(nota.itens, MAX_ITEMS_PER_OS_BLOCK);
    return chunks.map((itens, chunkIndex) => ({
      nota,
      itens,
      chunkIndex,
      chunksTotal: chunks.length,
    }));
  });

  return (
    <Document title={`Fechamento ${dados.periodo} — ${dados.cliente.nome}`}>
      <Page size="A4" orientation="portrait" style={s.page}>
        {/* Header */}
        <View style={{ ...s.headerCard, backgroundColor: accentColor }} fixed>
          <View style={s.headerRow}>
            <View>
              <Text style={s.company}>RETÍFICA PREMIUM</Text>
              <Text style={s.subtitle}>Fechamento mensal de serviços</Text>
            </View>
            <View style={s.headerRight}>
              <Text style={{ ...s.headerMeta, fontWeight: 600 }}>{dados.cliente.nome}</Text>
              <Text style={s.headerMeta}>Período: {dados.periodo}</Text>
              <Text style={s.headerMeta}>Emitido em: {dataFormatada}</Text>
            </View>
          </View>
          <View style={s.summaryStrip}>
            <View style={s.summaryPill}>
              <Text style={s.summaryLabel}>Ordens</Text>
              <Text style={{ ...s.summaryValue, color: accentColor }}>{dados.notas.length} O.S.</Text>
            </View>
            <View style={s.summaryPill}>
              <Text style={s.summaryLabel}>Subtotal</Text>
              <Text style={{ ...s.summaryValue, color: accentColor }}>R$ {brl(dados.total_original)}</Text>
            </View>
            <View style={s.summaryPill}>
              <Text style={s.summaryLabel}>Total</Text>
              <Text style={{ ...s.summaryValue, color: accentColor }}>R$ {brl(dados.total_com_desconto)}</Text>
            </View>
          </View>
        </View>

        {/* OS blocks */}
        {notaSections.map(({ nota, itens, chunkIndex, chunksTotal }) => {
          const temDesconto = nota.desconto_nota > 0;
          const isContinuation = chunkIndex > 0;
          const isLastChunk = chunkIndex === chunksTotal - 1;
          return (
            <View key={`${nota.id}-${chunkIndex}`} style={s.osBlock} wrap={false}>
              {/* OS header */}
              <View style={{ ...s.osHeader, backgroundColor: rgba(accentColor, 0.09), borderBottomColor: rgba(accentColor, 0.2) }}>
                <View>
                  <Text style={{ ...s.osNumber, color: accentColor }}>{nota.os}{isContinuation ? ' · continuação' : ''}</Text>
                  <Text style={s.osVehicle}>{nota.veiculo}</Text>
                  {chunksTotal > 1 && (
                    <Text style={s.continuation}>Parte {chunkIndex + 1} de {chunksTotal}</Text>
                  )}
                </View>
                <Text style={{ ...s.osPlate, color: accentColor }}>{nota.placa || '—'}</Text>
              </View>

              {/* Items table header */}
              <View style={s.tableHeader}>
                <Text style={{ ...s.colDesc, ...s.thText }}>Descrição</Text>
                <Text style={{ ...s.colNum, ...s.thText }}>Qtd</Text>
                <Text style={{ ...s.colVal, ...s.thText }}>Unit.</Text>
                <Text style={{ ...s.colVal, ...s.thText }}>Desc.%</Text>
                <Text style={{ ...s.colVal, ...s.thText }}>Total</Text>
              </View>

              {/* Items */}
              {itens.map((item, i) => (
                <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                  <Text style={s.colDesc}>{item.descricao}</Text>
                  <Text style={s.colNum}>{item.quantidade}</Text>
                  <Text style={s.colVal}>R$ {brl(item.preco_unitario)}</Text>
                  <Text style={s.colNum}>{item.desconto_porcentagem > 0 ? `${item.desconto_porcentagem}%` : '—'}</Text>
                  <Text style={s.colVal}>R$ {brl(item.subtotal)}</Text>
                </View>
              ))}

              {/* OS totals */}
              {isLastChunk ? (
                <View style={s.osFoot}>
                  {temDesconto && (
                    <>
                      <View style={s.footGroupFirst}>
                        <Text style={s.footLabel}>Subtotal:</Text>
                        <Text style={s.footValue}>R$ {brl(nota.total_original)}</Text>
                      </View>
                      <View style={s.footGroup}>
                        <Text style={s.footLabel}>Desconto ({nota.desconto_nota}%):</Text>
                        <Text style={s.footValue}>−R$ {brl(nota.total_original * nota.desconto_nota / 100)}</Text>
                      </View>
                    </>
                  )}
                  <View style={temDesconto ? s.footGroup : s.footGroupFirst}>
                    <Text style={{ ...s.footLabel, fontWeight: 700 }}>Total {nota.os}:</Text>
                    <Text style={{ ...s.footTotal, color: accentColor }}>R$ {brl(nota.total_com_desconto)}</Text>
                  </View>
                </View>
              ) : (
                <Text style={s.continuesFoot}>Continua na próxima seção...</Text>
              )}
            </View>
          );
        })}

        {/* Grand total */}
        <View style={{ ...s.totalSection, backgroundColor: rgba(accentColor, 0.08), borderColor: rgba(accentColor, 0.2) }}>
          <View>
            <Text style={{ fontSize: 8, color: '#555' }}>
              {dados.notas.length} ordem{dados.notas.length !== 1 ? 's' : ''} de serviço · Período: {dados.periodo}
            </Text>
            {dados.total_original !== dados.total_com_desconto && (
              <Text style={{ fontSize: 8, color: '#555', marginTop: 2 }}>
                Subtotal: R$ {brl(dados.total_original)} · Descontos: −R$ {brl(dados.total_original - dados.total_com_desconto)}
              </Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 8, color: '#555' }}>TOTAL GERAL</Text>
            <Text style={{ ...s.totalValue, color: accentColor }}>R$ {brl(dados.total_com_desconto)}</Text>
          </View>
        </View>

        {/* Page footer */}
        <View style={s.pageFooter} fixed>
          <Text style={s.footerText}>Retífica Premium · Fechamento Mensal</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
