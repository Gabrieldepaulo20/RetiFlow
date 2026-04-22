import { Document, Page, Text, View, Font } from '@react-pdf/renderer';
import type { NotaServicoDetalhes } from '@/api/supabase/notas';

Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hiA.woff2', fontWeight: 600 },
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYAZ9hiA.woff2', fontWeight: 700 },
  ],
});

const ACCENT = '#1e6fa5';
const ACCENT_LIGHT = '#e8f2fb';

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

// ─── Via ─────────────────────────────────────────────────────────────────────

interface ViaProps {
  dados: NotaServicoDetalhes;
  maxRows: number;
  isPortrait?: boolean;
}

function Via({ dados, maxRows, isPortrait = false }: ViaProps) {
  const cab = dados.cabecalho;
  const cl = cab.cliente;
  const v = cab.veiculo;
  const items = dados.itens_servico;
  const padding = Math.max(0, maxRows - items.length);
  const fs = isPortrait ? 8 : 7.5;
  const fsSmall = isPortrait ? 7.5 : 7;
  const pad = isPortrait ? 16 : 12;

  const enderecoFormatado = [cl.endereco, cl.cidade, cl.cep]
    .filter(Boolean)
    .join(' • ');

  return (
    <View style={{ flex: 1, padding: pad, flexDirection: 'column' }}>

      {/* ── Company header ── */}
      <View style={{ alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ fontFamily: 'Inter', fontSize: isPortrait ? 15 : 13, fontWeight: 700, color: ACCENT, letterSpacing: 0.5 }}>
          RETÍFICA PREMIUM
        </Text>
        <Text style={{ fontFamily: 'Inter', fontSize: fsSmall, color: '#555', marginTop: 1 }}>
          RETÍFICA DE CABEÇOTE
        </Text>
        <Text style={{ fontFamily: 'Inter', fontSize: isPortrait ? 7 : 6.5, color: '#666', marginTop: 3, textAlign: 'center' }}>
          Av. Fioravante Magro, 1059 — Jardim Boa Vista — Sertãozinho/SP — CEP 14177-578
        </Text>
        <Text style={{ fontFamily: 'Inter', fontSize: isPortrait ? 7 : 6.5, color: '#666', marginTop: 1 }}>
          Tel: (16) 3524-4661
        </Text>
      </View>

      {/* Blue separator */}
      <View style={{ height: 1.5, backgroundColor: ACCENT, marginBottom: 6 }} />

      {/* ── OS / Data / Prazo row ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
        <Text style={{ fontFamily: 'Inter', fontSize: isPortrait ? 10 : 9, fontWeight: 700, color: ACCENT }}>
          O.S. {cab.os_numero}
        </Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: 'Inter', fontSize: fsSmall }}>
            <Text style={{ fontWeight: 700 }}>Data: </Text>{fmtDate(cab.data_criacao)}
          </Text>
          {cab.prazo && (
            <Text style={{ fontFamily: 'Inter', fontSize: fsSmall, marginTop: 1 }}>
              <Text style={{ fontWeight: 700 }}>Prazo: </Text>{fmtDate(cab.prazo)}
            </Text>
          )}
        </View>
      </View>

      {/* ── Client section ── */}
      <View style={{ borderWidth: 1, borderColor: '#ccc', borderStyle: 'solid', marginBottom: 5 }}>
        {/* Section label */}
        <View style={{ backgroundColor: ACCENT_LIGHT, paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#ccc', borderBottomStyle: 'solid' }}>
          <Text style={{ fontFamily: 'Inter', fontSize: 6.5, fontWeight: 700, color: ACCENT, letterSpacing: 0.4 }}>
            DADOS DO CLIENTE
          </Text>
        </View>

        <View style={{ padding: 6 }}>
          {/* Nome | Doc */}
          <View style={{ flexDirection: 'row', marginBottom: 2.5 }}>
            <Text style={{ fontFamily: 'Inter', flex: 1, fontSize: fs }}>
              <Text style={{ fontWeight: 700 }}>Nome: </Text>{cl.nome}
            </Text>
            <Text style={{ fontFamily: 'Inter', fontSize: fs, marginLeft: 8 }}>
              <Text style={{ fontWeight: 700 }}>Doc: </Text>{cl.documento ?? '—'}
            </Text>
          </View>

          {/* Endereço | Cidade */}
          {(cl.endereco || cl.cidade) && (
            <View style={{ flexDirection: 'row', marginBottom: 2.5 }}>
              <Text style={{ fontFamily: 'Inter', flex: 1, fontSize: fs }}>
                <Text style={{ fontWeight: 700 }}>Endereço: </Text>{enderecoFormatado || '—'}
              </Text>
              {cl.cidade && (
                <Text style={{ fontFamily: 'Inter', fontSize: fs, marginLeft: 8 }}>
                  <Text style={{ fontWeight: 700 }}>Cidade: </Text>{cl.cidade}
                </Text>
              )}
            </View>
          )}

          {/* Tel | Email */}
          {(cl.telefone || cl.email) && (
            <View style={{ flexDirection: 'row', marginBottom: 2.5 }}>
              <Text style={{ fontFamily: 'Inter', flex: 1, fontSize: fs }}>
                <Text style={{ fontWeight: 700 }}>Tel: </Text>{cl.telefone ?? '—'}
              </Text>
              {cl.email && (
                <Text style={{ fontFamily: 'Inter', flex: 1, fontSize: fs }}>
                  <Text style={{ fontWeight: 700 }}>Email: </Text>{cl.email}
                </Text>
              )}
            </View>
          )}

          {/* Placa | Veículo */}
          <View style={{ flexDirection: 'row', marginBottom: cab.defeito ? 2.5 : 0 }}>
            <Text style={{ fontFamily: 'Inter', flex: 1, fontSize: fs }}>
              <Text style={{ fontWeight: 700 }}>Placa: </Text>{v.placa || '—'}
            </Text>
            <Text style={{ fontFamily: 'Inter', flex: 1, fontSize: fs }}>
              <Text style={{ fontWeight: 700 }}>Veículo: </Text>{v.modelo}
            </Text>
          </View>

          {/* Defeito */}
          {cab.defeito && (
            <Text style={{ fontFamily: 'Inter', fontSize: fs }}>
              <Text style={{ fontWeight: 700 }}>Defeito: </Text>{cab.defeito}
            </Text>
          )}
        </View>
      </View>

      {/* ── Items table ── */}
      <View style={{ borderWidth: 1, borderColor: '#ccc', borderStyle: 'solid', marginBottom: 5 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', backgroundColor: ACCENT, paddingVertical: 3.5, paddingHorizontal: 5 }}>
          <Text style={{ fontFamily: 'Inter', width: '10%', fontSize: 6.5, fontWeight: 700, color: '#fff', textAlign: 'center' }}>QTD</Text>
          <Text style={{ fontFamily: 'Inter', flex: 1, fontSize: 6.5, fontWeight: 700, color: '#fff' }}>DESCRIÇÃO DOS PRODUTOS</Text>
          <Text style={{ fontFamily: 'Inter', width: '20%', fontSize: 6.5, fontWeight: 700, color: '#fff', textAlign: 'right' }}>VALOR UNI.</Text>
          <Text style={{ fontFamily: 'Inter', width: '18%', fontSize: 6.5, fontWeight: 700, color: '#fff', textAlign: 'right' }}>TOTAL</Text>
        </View>

        {/* Rows */}
        {items.map((item, i) => (
          <View
            key={item.id_rel}
            style={{
              flexDirection: 'row',
              paddingVertical: 3,
              paddingHorizontal: 5,
              backgroundColor: i % 2 === 1 ? '#f9f9f9' : '#fff',
              borderTopWidth: 0.5,
              borderTopColor: '#e5e5e5',
              borderTopStyle: 'solid',
              minHeight: 18,
            }}
          >
            <Text style={{ fontFamily: 'Inter', width: '10%', fontSize: fs, textAlign: 'center' }}>{item.quantidade}</Text>
            <Text style={{ fontFamily: 'Inter', flex: 1, fontSize: fs }}>
              {item.descricao}{item.detalhes ? `\n${item.detalhes}` : ''}
            </Text>
            <Text style={{ fontFamily: 'Inter', width: '20%', fontSize: fs, textAlign: 'right' }}>R$ {brl(item.preco_unitario)}</Text>
            <Text style={{ fontFamily: 'Inter', width: '18%', fontSize: fs, fontWeight: 700, textAlign: 'right' }}>R$ {brl(item.subtotal_item)}</Text>
          </View>
        ))}

        {/* Padding rows */}
        {Array.from({ length: padding }).map((_, i) => (
          <View
            key={`pad-${i}`}
            style={{
              height: 18,
              borderTopWidth: 0.5,
              borderTopColor: '#eee',
              borderTopStyle: 'solid',
            }}
          />
        ))}
      </View>

      {/* ── Total ── */}
      <View style={{
        borderWidth: 1.5,
        borderColor: ACCENT,
        borderStyle: 'solid',
        paddingVertical: 5,
        paddingHorizontal: 10,
        alignItems: 'center',
        marginBottom: 6,
      }}>
        <Text style={{ fontFamily: 'Inter', fontSize: isPortrait ? 11 : 9.5, fontWeight: 700, color: ACCENT }}>
          TOTAL GERAL: R$ {brl(dados.financeiro_servicos.total_liquido)}
        </Text>
      </View>

      {/* ── Observations ── */}
      <View style={{ marginBottom: 8 }}>
        <Text style={{ fontFamily: 'Inter', fontSize: fsSmall, fontWeight: 700, marginBottom: 2 }}>Observações:</Text>
        {cab.observacoes ? (
          <Text style={{ fontFamily: 'Inter', fontSize: isPortrait ? 7 : 6.5, color: '#444' }}>{cab.observacoes}</Text>
        ) : (
          <>
            <Text style={{ fontFamily: 'Inter', fontSize: isPortrait ? 7 : 6.5, color: '#444', marginBottom: 1 }}>
              1. O prazo de entrega poderá ser alterado caso seja necessário serviço adicional não previsto.
            </Text>
            <Text style={{ fontFamily: 'Inter', fontSize: isPortrait ? 7 : 6.5, color: '#444', marginBottom: 1 }}>
              2. Peças substituídas ficam à disposição do cliente por até 30 dias após a retirada.
            </Text>
            <Text style={{ fontFamily: 'Inter', fontSize: isPortrait ? 7 : 6.5, color: '#444' }}>
              3. Garantia de 6 meses para os serviços executados conforme contrato.
            </Text>
          </>
        )}
      </View>

      {/* ── Signatures ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ borderTopWidth: 1, borderTopColor: '#111', borderTopStyle: 'solid', width: 110, marginBottom: 3 }} />
          <Text style={{ fontFamily: 'Inter', fontSize: fsSmall }}>Assinatura Vendedor</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <View style={{ borderTopWidth: 1, borderTopColor: '#111', borderTopStyle: 'solid', width: 110, marginBottom: 3 }} />
          <Text style={{ fontFamily: 'Inter', fontSize: fsSmall }}>Assinatura Comprador</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface Props { dados: NotaServicoDetalhes }

const MAX_A5_ROWS = 5;

export function NotaPDFTemplate({ dados }: Props) {
  const total = dados.itens_servico.length;
  const useLandscape = total <= MAX_A5_ROWS;

  if (useLandscape) {
    return (
      <Document title={`O.S. ${dados.cabecalho.os_numero} — ${dados.cabecalho.cliente.nome}`}>
        <Page
          size="A4"
          orientation="landscape"
          style={{ fontFamily: 'Inter', fontSize: 8, color: '#111', backgroundColor: '#fff', flexDirection: 'row' }}
        >
          <Via dados={dados} maxRows={MAX_A5_ROWS} />
          {/* Dashed vertical divider */}
          <View style={{ width: 1, borderLeftWidth: 1, borderLeftColor: '#bbb', borderLeftStyle: 'dashed' }} />
          <Via dados={dados} maxRows={MAX_A5_ROWS} />
        </Page>
      </Document>
    );
  }

  return (
    <Document title={`O.S. ${dados.cabecalho.os_numero} — ${dados.cabecalho.cliente.nome}`}>
      <Page
        size="A4"
        orientation="portrait"
        style={{ fontFamily: 'Inter', fontSize: 8, color: '#111', backgroundColor: '#fff' }}
      >
        <Via dados={dados} maxRows={total} isPortrait />
      </Page>
    </Document>
  );
}
