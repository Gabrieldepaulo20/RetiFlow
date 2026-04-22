import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { NotaServicoDetalhes } from '@/api/supabase/notas';

Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hiA.woff2', fontWeight: 600 },
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYAZ9hiA.woff2', fontWeight: 700 },
  ],
});

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmt = (d: string) =>
  new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

// ─── Styles shared ───────────────────────────────────────────────────────────

const base = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    backgroundColor: '#e6e6e6',
    marginBottom: 8,
  },
  headerLeft: { width: '50%', padding: 8, alignItems: 'center', justifyContent: 'center' },
  headerRight: {
    width: '50%', padding: 8, borderLeftWidth: 1, borderLeftColor: '#cfcfcf',
    alignItems: 'center', justifyContent: 'center',
  },
  company: { fontSize: 13, fontWeight: 700, letterSpacing: 0.5 },
  companySub: { fontSize: 7.5, color: '#333', marginTop: 2 },
  headerMeta: { fontSize: 7.5, color: '#333', marginTop: 2, textAlign: 'center' },

  infoBar: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    backgroundColor: '#dcdcdc', padding: '4 8', marginBottom: 6,
  },
  infoLabel: { fontSize: 7, color: '#555' },
  infoPill: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', borderRadius: 10,
    paddingVertical: 2, paddingHorizontal: 8, fontSize: 8, fontWeight: 700, color: '#222',
    minWidth: 60, textAlign: 'center', marginTop: 2,
  },

  clientBlock: { borderWidth: 1, borderColor: '#ddd', padding: '6 8', marginBottom: 6 },
  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 3 },
  fieldLabel: { fontSize: 7.5, fontWeight: 700 },
  fieldValue: { fontSize: 7.5, color: '#222' },

  tableHeader: {
    flexDirection: 'row', backgroundColor: '#efefef',
    borderWidth: 1, borderColor: '#ddd', paddingVertical: 3, paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1,
    borderBottomWidth: 1, borderColor: '#ddd', paddingVertical: 3, paddingHorizontal: 4,
    minHeight: 20,
  },
  tableRowAlt: { backgroundColor: '#fafafa' },
  tableEmpty: { minHeight: 20 },
  thText: { fontSize: 7, fontWeight: 700, color: '#333', textAlign: 'center' },
  tdText: { fontSize: 7.5, color: '#222' },

  colQtd:  { width: '10%', textAlign: 'center' },
  colDesc: { width: '57%', textAlign: 'left' },
  colUni:  { width: '18%', textAlign: 'right' },
  colTot:  { width: '15%', textAlign: 'right' },

  tfoot: {
    flexDirection: 'row', backgroundColor: '#f5f5f5',
    borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#ddd',
    paddingVertical: 4, paddingHorizontal: 4, alignItems: 'center',
  },
  tfootLabel: { fontSize: 8, fontWeight: 700, textAlign: 'right' },
  tfootValue: {
    fontSize: 9, fontWeight: 700, backgroundColor: '#efefef',
    borderWidth: 1, borderColor: '#d0d0d0', borderRadius: 3,
    paddingVertical: 2, paddingHorizontal: 6, textAlign: 'center',
  },

  obs: {
    backgroundColor: '#efefef', borderWidth: 1, borderColor: '#ddd',
    padding: '6 8', marginTop: 6,
  },
  obsText: { fontSize: 7, color: '#333', marginTop: 2 },

  sigs: { flexDirection: 'row', justifyContent: 'space-evenly', marginTop: 10 },
  sigLine: { borderTopWidth: 1, borderTopColor: '#000', width: 120, marginBottom: 3 },
  sigLabel: { fontSize: 7.5, textAlign: 'center' },

  divider: { borderLeftWidth: 1, borderLeftColor: '#ccc', borderLeftStyle: 'dashed' },
});

// ─── Via component ────────────────────────────────────────────────────────────

interface ViaProps {
  dados: NotaServicoDetalhes;
  maxLinhas: number;
  fontSize?: number;
}

function Via({ dados, maxLinhas }: ViaProps) {
  const { cabecalho, itens_servico } = dados;
  const c = cabecalho.cliente;
  const v = cabecalho.veiculo;

  const rows = [...itens_servico];
  const padding = Math.max(0, maxLinhas - rows.length);

  return (
    <View style={{ flex: 1, flexDirection: 'column', padding: 12 }}>
      {/* Header */}
      <View style={base.header}>
        <View style={base.headerLeft}>
          <Text style={base.company}>RETÍFICA PREMIUM</Text>
          <Text style={base.companySub}>RETÍFICA DE CABEÇOTE</Text>
        </View>
        <View style={base.headerRight}>
          <Text style={base.headerMeta}>Av. Fioravante Magro, 1059 – Jardim Boa Vista</Text>
          <Text style={base.headerMeta}>Sertãozinho - SP, 14177-578</Text>
          <Text style={base.headerMeta}>(16) 3524-4661</Text>
        </View>
      </View>

      {/* OS / Data / Prazo */}
      <View style={base.infoBar}>
        <View style={{ alignItems: 'center' }}>
          <Text style={base.infoLabel}>O.S.</Text>
          <Text style={base.infoPill}>{cabecalho.os_numero}</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={base.infoLabel}>Data</Text>
          <Text style={base.infoPill}>{fmt(cabecalho.data_criacao)}</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={base.infoLabel}>Prazo</Text>
          <Text style={base.infoPill}>{cabecalho.prazo ? fmt(cabecalho.prazo) : '—'}</Text>
        </View>
      </View>

      {/* Client block */}
      <View style={base.clientBlock}>
        <View style={base.fieldRow}>
          <Text style={base.fieldLabel}>Cliente:</Text>
          <Text style={base.fieldValue}>{c.nome}</Text>
        </View>
        <View style={base.fieldRow}>
          <Text style={base.fieldLabel}>Documento:</Text>
          <Text style={base.fieldValue}>{c.documento ?? '—'}</Text>
          {c.endereco && (
            <>
              <Text style={base.fieldLabel}>Endereço:</Text>
              <Text style={base.fieldValue}>{c.endereco}</Text>
            </>
          )}
        </View>
        <View style={base.fieldRow}>
          {c.cep && <><Text style={base.fieldLabel}>CEP:</Text><Text style={base.fieldValue}>{c.cep}</Text></>}
          {c.cidade && <><Text style={base.fieldLabel}>Cidade:</Text><Text style={base.fieldValue}>{c.cidade}</Text></>}
          <Text style={base.fieldLabel}>Placa:</Text>
          <Text style={base.fieldValue}>{v.placa || '—'}</Text>
          <Text style={base.fieldLabel}>Veículo:</Text>
          <Text style={base.fieldValue}>{v.modelo}</Text>
        </View>
        {(c.email || c.telefone) && (
          <View style={base.fieldRow}>
            {c.email && <><Text style={base.fieldLabel}>E-mail:</Text><Text style={base.fieldValue}>{c.email}</Text></>}
            {c.telefone && <><Text style={base.fieldLabel}>Telefone:</Text><Text style={base.fieldValue}>{c.telefone}</Text></>}
          </View>
        )}
        {cabecalho.defeito && (
          <View style={base.fieldRow}>
            <Text style={base.fieldLabel}>Defeito:</Text>
            <Text style={base.fieldValue}>{cabecalho.defeito}</Text>
          </View>
        )}
      </View>

      {/* Table */}
      <View style={base.tableHeader}>
        <Text style={[base.thText, base.colQtd]}>QTD.</Text>
        <Text style={[base.thText, base.colDesc]}>DESCRIÇÃO DOS SERVIÇOS</Text>
        <Text style={[base.thText, base.colUni]}>VALOR UNI.</Text>
        <Text style={[base.thText, base.colTot]}>TOTAL</Text>
      </View>

      {rows.map((item, i) => (
        <View key={item.id_rel} style={[base.tableRow, i % 2 === 1 ? base.tableRowAlt : {}]}>
          <Text style={[base.tdText, base.colQtd]}>{item.quantidade}</Text>
          <Text style={[base.tdText, base.colDesc]}>
            {item.descricao}{item.detalhes ? `\n${item.detalhes}` : ''}
          </Text>
          <Text style={[base.tdText, base.colUni]}>R$ {brl(item.preco_unitario)}</Text>
          <Text style={[base.tdText, base.colTot]}>R$ {brl(item.subtotal_item)}</Text>
        </View>
      ))}

      {Array.from({ length: padding }).map((_, i) => (
        <View key={`pad-${i}`} style={[base.tableRow, base.tableEmpty]} />
      ))}

      {/* Total */}
      <View style={base.tfoot}>
        <Text style={[base.tfootLabel, { flex: 1 }]}>TOTAL GERAL</Text>
        <Text style={base.tfootValue}>
          R$ {brl(dados.financeiro_servicos.total_liquido)}
        </Text>
      </View>

      {/* Observations */}
      <View style={base.obs}>
        <Text style={[base.fieldLabel, { fontSize: 7.5 }]}>OBSERVAÇÕES:</Text>
        {cabecalho.observacoes ? (
          <Text style={base.obsText}>{cabecalho.observacoes}</Text>
        ) : (
          <>
            <Text style={base.obsText}>1. Este orçamento é válido por 30 dias a partir da data de emissão.</Text>
            <Text style={base.obsText}>2. O prazo de entrega será combinado após aprovação.</Text>
            <Text style={base.obsText}>3. Em caso de desistência após início do serviço, será cobrado o valor proporcional.</Text>
          </>
        )}
      </View>

      {/* Signatures */}
      <View style={base.sigs}>
        <View style={{ alignItems: 'center' }}>
          <View style={base.sigLine} />
          <Text style={base.sigLabel}>Assinatura Vendedor</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <View style={base.sigLine} />
          <Text style={base.sigLabel}>Assinatura Comprador</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface Props {
  dados: NotaServicoDetalhes;
}

const MAX_LINHAS_A5 = 5;

export function NotaPDFTemplate({ dados }: Props) {
  const totalItens = dados.itens_servico.length;
  const usarLandscape = totalItens <= MAX_LINHAS_A5;

  if (usarLandscape) {
    // A4 landscape → 2 vias A5 lado a lado
    return (
      <Document title={`O.S. ${dados.cabecalho.os_numero} — ${dados.cabecalho.cliente.nome}`}>
        <Page size="A4" orientation="landscape" style={{ fontFamily: 'Inter', fontSize: 8, color: '#111', backgroundColor: '#fff', flexDirection: 'row' }}>
          <Via dados={dados} maxLinhas={MAX_LINHAS_A5} />
          <View style={base.divider} />
          <Via dados={dados} maxLinhas={MAX_LINHAS_A5} />
        </Page>
      </Document>
    );
  }

  // A4 portrait → 1 via com mais espaço vertical
  return (
    <Document title={`O.S. ${dados.cabecalho.os_numero} — ${dados.cabecalho.cliente.nome}`}>
      <Page size="A4" orientation="portrait" style={{ fontFamily: 'Inter', fontSize: 8, color: '#111', backgroundColor: '#fff' }}>
        <Via dados={dados} maxLinhas={totalItens} />
      </Page>
    </Document>
  );
}
