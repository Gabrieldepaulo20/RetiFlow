import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { NotaServicoDetalhes, NotaServicoDetalhesItem } from '@/api/supabase/notas';
import { NOTA_PRINT_MAX_ROWS, NOTA_PRINT_OBSERVATIONS } from '@/components/notes/notaPrintLayout';

const MAX_ROWS = NOTA_PRINT_MAX_ROWS;

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
  divider: {
    width: 1,
    marginVertical: 20,
    borderLeftWidth: 1,
    borderLeftColor: '#cccccc',
    borderLeftStyle: 'dashed',
  },
  notaHeader: {
    backgroundColor: '#e6e6e6',
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: 5,
  },
  headerSide: {
    width: '50%',
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    borderLeftWidth: 1,
    borderLeftColor: '#cfcfcf',
    borderLeftStyle: 'solid',
  },
  logoSpacer: {
    height: 28,
    marginBottom: 5,
  },
  headerTitle: {
    fontSize: 14.5,
    marginBottom: 2,
    fontWeight: 700,
  },
  headerSubtitle: {
    fontSize: 8.5,
    color: '#333333',
    marginBottom: 2,
  },
  headerAddress: {
    fontSize: 8,
    color: '#333333',
    marginBottom: 4,
    textAlign: 'center',
  },
  headerInfo: {
    fontSize: 8.5,
    color: '#333333',
    marginBottom: 4,
    textAlign: 'center',
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
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <Text style={styles.fieldText}>
      <Text style={styles.labelStrong}>{label}: </Text>
      {value?.trim() ? value : '—'}
    </Text>
  );
}

function Via({
  dados,
  itens,
}: {
  dados: NotaServicoDetalhes;
  itens: NotaServicoDetalhesItem[];
}) {
  const { cabecalho, financeiro_servicos } = dados;
  const paddingRows = Math.max(0, MAX_ROWS - itens.length);

  return (
    <View style={styles.nota}>
      <View style={styles.notaHeader}>
        <View style={styles.headerSide}>
          <View style={styles.logoSpacer} />
          <Text style={styles.headerTitle}>PREMIUM</Text>
          <Text style={styles.headerSubtitle}>RETÍFICA DE CABEÇOTE</Text>
        </View>
        <View style={[styles.headerSide, styles.headerRight]}>
          <Text style={styles.headerInfo}>Av: Fioravante Magro, 1059 – Jardim Boa Vista</Text>
          <Text style={styles.headerInfo}>Sertãozinho - SP, 14177-578</Text>
          <Text style={styles.headerInfo}>Contato: (16) 3524-4661</Text>
        </View>
      </View>

      <View style={styles.clienteBox}>
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
          <FieldValue label="Cliente" value={cabecalho.cliente.nome} />
        </View>

        <View style={styles.line}>
          <FieldValue label="Documento" value={cabecalho.cliente.documento} />
          <FieldValue label="Endereço" value={cabecalho.cliente.endereco} />
        </View>

        <View style={styles.line}>
          <FieldValue label="CEP" value={cabecalho.cliente.cep} />
          <FieldValue label="Cidade" value={cabecalho.cliente.cidade} />
          <FieldValue label="Placa" value={cabecalho.veiculo.placa} />
          <FieldValue label="Veículo" value={cabecalho.veiculo.modelo} />
        </View>

        <View style={styles.line}>
          <FieldValue label="Email" value={cabecalho.cliente.email} />
          <FieldValue label="Telefone" value={cabecalho.cliente.telefone} />
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

          {itens.map((item) => (
            <View key={item.id_rel} style={styles.row}>
              <Text style={[styles.td, styles.qtyCol]}>{item.quantidade}</Text>
              <Text style={[styles.td, styles.descCol]}>
                {item.descricao}
                {item.detalhes ? `\n${item.detalhes}` : ''}
              </Text>
              <Text style={[styles.td, styles.unitCol]}>R$ {formatCurrency(item.preco_unitario)}</Text>
              <Text style={[styles.td, styles.totalCol]}>R$ {formatCurrency(item.subtotal_item)}</Text>
            </View>
          ))}

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
        {NOTA_PRINT_OBSERVATIONS.map((linha, index) => (
          <Text key={`${linha}-${index}`} style={styles.observacaoLinha}>
            {linha}
          </Text>
        ))}
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
}

export function NotaPDFTemplate({ dados }: Props) {
  const paginas = chunkItems(dados.itens_servico, MAX_ROWS);

  return (
    <Document title={`O.S. ${dados.cabecalho.os_numero} — ${dados.cabecalho.cliente.nome}`}>
      {paginas.map((itens, index) => (
        <Page
          key={`${dados.cabecalho.id_nota}-${index}`}
          size="A4"
          orientation="landscape"
          style={styles.page}
        >
          <View style={styles.notaContainer}>
            <Via dados={dados} itens={itens} />
            <View style={styles.divider} />
            <Via dados={dados} itens={itens} />
          </View>
        </Page>
      ))}
    </Document>
  );
}
