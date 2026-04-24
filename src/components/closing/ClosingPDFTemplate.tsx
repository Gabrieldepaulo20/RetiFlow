import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { FechamentoDadosJson } from '@/api/supabase/fechamentos';

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: '#111', padding: '14mm 12mm 12mm 12mm', backgroundColor: '#fff' },

  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 2, borderBottomColor: '#111', paddingBottom: 8, marginBottom: 10 },
  company: { fontSize: 14, fontWeight: 700, letterSpacing: 0.5 },
  subtitle: { fontSize: 8, color: '#555', marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  headerMeta: { fontSize: 8, color: '#333', marginTop: 1 },

  // OS block
  osBlock: { marginBottom: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 3, overflow: 'hidden' },
  osHeader: { backgroundColor: '#f3f4f6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#ccc' },
  osNumber: { fontSize: 10, fontWeight: 700 },
  osVehicle: { fontSize: 8, color: '#444' },
  osPlate: { fontSize: 8, fontWeight: 600 },

  // Items table
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ccc', paddingVertical: 3, paddingHorizontal: 8, backgroundColor: '#f9fafb' },
  tableRow: { flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  tableRowAlt: { backgroundColor: '#fafafa' },
  colDesc: { flex: 1, fontSize: 8 },
  colNum: { width: 36, textAlign: 'center', fontSize: 8 },
  colVal: { width: 54, textAlign: 'right', fontSize: 8 },
  thText: { fontSize: 7, fontWeight: 600, color: '#555', textTransform: 'uppercase' },

  // OS footer
  osFoot: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 5, paddingHorizontal: 8, backgroundColor: '#f9fafb' },
  footLabel: { fontSize: 8, color: '#555' },
  footValue: { fontSize: 8, fontWeight: 600 },
  footTotal: { fontSize: 9, fontWeight: 700 },
  footGroup: { flexDirection: 'row', marginLeft: 16 },
  footGroupFirst: { flexDirection: 'row' },

  // Grand total
  totalSection: { marginTop: 8, borderTopWidth: 2, borderTopColor: '#111', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  totalLabel: { fontSize: 11, fontWeight: 700 },
  totalValue: { fontSize: 14, fontWeight: 700 },

  // Footer
  pageFooter: { position: 'absolute', bottom: '8mm', left: '12mm', right: '12mm', flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#ccc', paddingTop: 4 },
  footerText: { fontSize: 7, color: '#888' },
});

interface Props {
  dados: FechamentoDadosJson;
  geradoEm: string;
}

export function ClosingPDFTemplate({ dados, geradoEm }: Props) {
  const dataFormatada = new Date(geradoEm).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <Document title={`Fechamento ${dados.periodo} — ${dados.cliente.nome}`}>
      <Page size="A4" orientation="portrait" style={s.page}>
        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.company}>RETÍFICA PREMIUM</Text>
            <Text style={s.subtitle}>Fechamento Mensal de Serviços</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={{ ...s.headerMeta, fontWeight: 600 }}>{dados.cliente.nome}</Text>
            <Text style={s.headerMeta}>Período: {dados.periodo}</Text>
            <Text style={s.headerMeta}>Emitido em: {dataFormatada}</Text>
          </View>
        </View>

        {/* OS blocks */}
        {dados.notas.map((nota, idx) => {
          const temDesconto = nota.desconto_nota > 0;
          return (
            <View key={nota.id} style={s.osBlock} wrap={false}>
              {/* OS header */}
              <View style={s.osHeader}>
                <View>
                  <Text style={s.osNumber}>{nota.os}</Text>
                  <Text style={s.osVehicle}>{nota.veiculo}</Text>
                </View>
                <Text style={s.osPlate}>{nota.placa || '—'}</Text>
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
              {nota.itens.map((item, i) => (
                <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                  <Text style={s.colDesc}>{item.descricao}</Text>
                  <Text style={s.colNum}>{item.quantidade}</Text>
                  <Text style={s.colVal}>R$ {brl(item.preco_unitario)}</Text>
                  <Text style={s.colNum}>{item.desconto_porcentagem > 0 ? `${item.desconto_porcentagem}%` : '—'}</Text>
                  <Text style={s.colVal}>R$ {brl(item.subtotal)}</Text>
                </View>
              ))}

              {/* OS totals */}
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
                  <Text style={s.footTotal}>R$ {brl(nota.total_com_desconto)}</Text>
                </View>
              </View>
            </View>
          );
        })}

        {/* Grand total */}
        <View style={s.totalSection}>
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
            <Text style={s.totalValue}>R$ {brl(dados.total_com_desconto)}</Text>
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
