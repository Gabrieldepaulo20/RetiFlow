import { SystemUser, Customer, IntakeNote, IntakeService, IntakeProduct, Attachment, Invoice, ActivityLog, NoteStatus } from '@/types';
import { formatNoteNumber } from '@/lib/noteNumbers';

const cd = (d: number, m: number) => new Date(2026, m - 1, d).toISOString();

export const users: SystemUser[] = [
  { id: 'user-1', name: 'Admin Master', email: 'admin@retifica.com', role: 'ADMIN', isActive: true, phone: '(11) 99999-0001', createdAt: cd(2, 1), lastLogin: cd(28, 3) },
  { id: 'user-2', name: 'Paula Martins', email: 'financeiro@retifica.com', role: 'FINANCEIRO', isActive: true, phone: '(11) 99999-0002', createdAt: cd(4, 1), lastLogin: cd(27, 3) },
  { id: 'user-3', name: 'João Silva', email: 'producao@retifica.com', role: 'PRODUCAO', isActive: true, phone: '(11) 99999-0003', createdAt: cd(6, 1), lastLogin: cd(29, 3) },
  { id: 'user-4', name: 'Maria Souza', email: 'recepcao@retifica.com', role: 'RECEPCAO', isActive: true, phone: '(11) 99999-0004', createdAt: cd(8, 1), lastLogin: cd(29, 3) },
];

export const customers: Customer[] = [
  { id: 'c1', name: 'Auto Peças Silva Ltda', docType: 'CNPJ', docNumber: '12.345.678/0001-90', phone: '(11) 3456-7890', email: 'contato@autopecassilva.com.br', address: 'Rua das Indústrias, 450', city: 'São Paulo', state: 'SP', notes: 'Cliente desde 2019', isActive: true, createdAt: cd(15,1) },
  { id: 'c2', name: 'José Carlos Mendes', docType: 'CPF', docNumber: '123.456.789-00', phone: '(19) 99876-5432', email: 'jose.mendes@email.com', address: 'Av. Brasil, 1200', city: 'Campinas', state: 'SP', notes: '', isActive: true, createdAt: cd(10,1) },
  { id: 'c3', name: 'Mecânica Santos & Filhos', docType: 'CNPJ', docNumber: '98.765.432/0001-10', phone: '(31) 3222-4455', email: 'mecanica.santos@email.com', address: 'Rua Minas Gerais, 88', city: 'Belo Horizonte', state: 'MG', notes: 'Desconto 5%', isActive: true, createdAt: cd(5,1) },
  { id: 'c4', name: 'Maria Fernanda Oliveira', docType: 'CPF', docNumber: '987.654.321-00', phone: '(21) 98765-1234', email: 'maria.oliveira@email.com', address: 'Rua Copacabana, 350', city: 'Rio de Janeiro', state: 'RJ', notes: '', isActive: true, createdAt: cd(8,1) },
  { id: 'c5', name: 'Retífica Modelo Ltda', docType: 'CNPJ', docNumber: '11.222.333/0001-44', phone: '(41) 3333-5555', email: 'contato@retificamodelo.com', address: 'Av. Paraná, 900', city: 'Curitiba', state: 'PR', notes: 'Parceiro', isActive: true, createdAt: cd(3,1) },
  { id: 'c6', name: 'Carlos Eduardo Souza', docType: 'CPF', docNumber: '456.789.123-00', phone: '(51) 99988-7766', email: 'carlos.souza@email.com', address: 'Rua Farroupilha, 200', city: 'Porto Alegre', state: 'RS', notes: '', isActive: true, createdAt: cd(12,1) },
  { id: 'c7', name: 'Oficina do Alemão Ltda', docType: 'CNPJ', docNumber: '55.666.777/0001-88', phone: '(47) 3444-6666', email: 'alemao@oficina.com', address: 'Rua XV de Novembro, 150', city: 'Joinville', state: 'SC', notes: '', isActive: true, createdAt: cd(18,1) },
  { id: 'c8', name: 'Pedro Henrique Lima', docType: 'CPF', docNumber: '321.654.987-00', phone: '(62) 98877-6655', email: 'pedro.lima@email.com', address: 'Av. Goiás, 500', city: 'Goiânia', state: 'GO', notes: '', isActive: true, createdAt: cd(20,1) },
  { id: 'c9', name: 'Auto Center Progresso', docType: 'CNPJ', docNumber: '33.444.555/0001-22', phone: '(61) 3211-4455', email: 'progresso@autocenter.com', address: 'SIA Trecho 3', city: 'Brasília', state: 'DF', notes: 'Frota grande', isActive: true, createdAt: cd(1,1) },
  { id: 'c10', name: 'Ana Paula Ferreira', docType: 'CPF', docNumber: '654.321.987-00', phone: '(71) 99123-4567', email: 'ana.ferreira@email.com', address: 'Rua Chile, 300', city: 'Salvador', state: 'BA', notes: '', isActive: true, createdAt: cd(22,1) },
  { id: 'c11', name: 'Irmãos Costa Retífica', docType: 'CNPJ', docNumber: '77.888.999/0001-55', phone: '(85) 3244-7788', email: 'irmaoscosta@retifica.com', address: 'Av. Bezerra de Menezes, 80', city: 'Fortaleza', state: 'CE', notes: '', isActive: true, createdAt: cd(25,1) },
  { id: 'c12', name: 'Roberto Almeida', docType: 'CPF', docNumber: '111.222.333-44', phone: '(92) 98765-3210', email: 'roberto@email.com', address: 'Rua Amazonas, 44', city: 'Manaus', state: 'AM', notes: '', isActive: true, createdAt: cd(2,1) },
  { id: 'c13', name: 'Multimarcas Auto Peças', docType: 'CNPJ', docNumber: '22.333.444/0001-66', phone: '(81) 3456-9876', email: 'multi@autopecas.com', address: 'Av. Recife, 1000', city: 'Recife', state: 'PE', notes: '', isActive: true, createdAt: cd(7,1) },
  { id: 'c14', name: 'Fernando Gomes da Silva', docType: 'CPF', docNumber: '444.555.666-77', phone: '(48) 99456-7890', email: 'fernando.gomes@email.com', address: 'Rua Bocaiúva, 22', city: 'Florianópolis', state: 'SC', notes: '', isActive: true, createdAt: cd(14,1) },
  { id: 'c15', name: 'Retífica Nova Era', docType: 'CNPJ', docNumber: '88.999.000/0001-11', phone: '(16) 3622-1144', email: 'novaera@retifica.com', address: 'Av. Caramuru, 600', city: 'Ribeirão Preto', state: 'SP', notes: 'Prazo 30d', isActive: true, createdAt: cd(9,1) },
  { id: 'c16', name: 'Luciana Barbosa', docType: 'CPF', docNumber: '777.888.999-00', phone: '(43) 99321-6543', email: 'luciana@email.com', address: 'Rua Sergipe, 77', city: 'Londrina', state: 'PR', notes: '', isActive: true, createdAt: cd(16,1) },
  { id: 'c17', name: 'Centro Automotivo Express', docType: 'CNPJ', docNumber: '44.555.666/0001-33', phone: '(27) 3355-6677', email: 'express@autocentro.com', address: 'Av. Vitória, 450', city: 'Vitória', state: 'ES', notes: '', isActive: true, createdAt: cd(11,1) },
  { id: 'c18', name: 'Marcos Vinícius Teixeira', docType: 'CPF', docNumber: '888.999.000-11', phone: '(91) 98123-4567', email: 'marcos.t@email.com', address: 'Tv. Padre Eutíquio, 33', city: 'Belém', state: 'PA', notes: '', isActive: true, createdAt: cd(19,1) },
  { id: 'c19', name: 'Oficina 3 Irmãos', docType: 'CNPJ', docNumber: '66.777.888/0001-99', phone: '(67) 3321-5544', email: '3irmaos@oficina.com', address: 'Av. Afonso Pena, 700', city: 'Campo Grande', state: 'MS', notes: '', isActive: false, createdAt: cd(4,1) },
  { id: 'c20', name: 'Tatiana Rocha', docType: 'CPF', docNumber: '999.000.111-22', phone: '(84) 99876-5432', email: 'tatiana@email.com', address: 'Av. Salgado Filho, 120', city: 'Natal', state: 'RN', notes: '', isActive: false, createdAt: cd(6,1) },
];

const statusDist: NoteStatus[] = [
  'ABERTO','ABERTO','ABERTO','ABERTO',
  'EM_ANALISE','EM_ANALISE','EM_ANALISE',
  'ORCAMENTO','ORCAMENTO','ORCAMENTO',
  'APROVADO','APROVADO','APROVADO',
  'EM_EXECUCAO','EM_EXECUCAO','EM_EXECUCAO','EM_EXECUCAO','EM_EXECUCAO','EM_EXECUCAO','EM_EXECUCAO','EM_EXECUCAO',
  'PRONTO','PRONTO','PRONTO',
  'ENTREGUE','ENTREGUE','ENTREGUE','ENTREGUE','ENTREGUE',
  'FINALIZADO','FINALIZADO','FINALIZADO','FINALIZADO','FINALIZADO','FINALIZADO','FINALIZADO',
  'CANCELADO','CANCELADO',
  'DESCARTADO',
  'SEM_CONSERTO',
];

const vehicles = ['Gol 1.0 8v','Civic 2.0 16v','Corolla 1.8','Uno Fire 1.4','HB20 1.6','Onix 1.0 Turbo','Celta 1.0','Palio 1.0','Fiesta 1.6','Focus 2.0','S10 2.8 Diesel','Hilux 2.8','Amarok 2.0','Clio 1.0','Punto 1.4'];
const engines = ['Cabeçote AP 1.6','Cabeçote Zetec Rocam','Cabeçote Fire 1.0','Cabeçote SOHC','Cabeçote DOHC 16v','Cabeçote Power 1.0','Bloco Motor AP'];
const complaints = [
  'Superaquecimento do motor, perda de potência',
  'Vazamento de óleo pelo cabeçote',
  'Consumo excessivo de água, fumaça branca',
  'Motor falhando em alta rotação',
  'Barulho metálico no cabeçote',
  'Junta do cabeçote queimada',
  'Empenamento do cabeçote após superaquecimento',
  'Trinca no cabeçote, perda de compressão',
];

export const notes: IntakeNote[] = statusDist.map((status, i) => {
  const cIdx = i % 20;
  const baseAmt = 650 + ((i * 137) % 2800);
  const svcAmt = Math.round(baseAmt * 0.7);
  const prdAmt = baseAmt - svcAmt;
  const day = Math.min(28, 1 + ((i * 3) % 28));
  const month = status === 'FINALIZADO' && i < 34 ? 2 : status === 'ABERTO' ? 2 : 1;
  const updatedAt = cd(Math.min(28, day + 2), month);
  const finalizedAt = status === 'FINALIZADO' ? updatedAt : undefined;
  return {
    id: `n${i + 1}`,
    number: formatNoteNumber(i + 1),
    clientId: customers[cIdx].id,
    createdAt: cd(day, month),
    createdByUserId: users[i % 4].id,
    status,
    type: 'SERVICO' as const,
    engineType: engines[i % engines.length],
    vehicleModel: vehicles[i % vehicles.length],
    plate: i % 3 === 0 ? `ABC-${1000 + i}D` : undefined,
    km: i % 2 === 0 ? 45000 + i * 2300 : undefined,
    complaint: complaints[i % complaints.length],
    observations: i % 4 === 0 ? 'Cliente solicita urgência na entrega.' : '',
    totalServices: svcAmt,
    totalProducts: prdAmt,
    totalAmount: baseAmt,
    pdfUrl: i % 2 === 0 ? `/mock/pdf/${formatNoteNumber(i + 1)}.pdf` : undefined,
    pdfFormat: baseAmt > 1800 ? 'A4' as const : 'A5' as const,
    finalizedAt,
    updatedAt,
  };
});

const svcNames: [string, number][] = [
  ['Retífica de cabeçote', 380],['Plaqueamento de superfície', 220],['Teste de pressão hidrostática', 160],
  ['Troca de guias de válvulas', 290],['Assentamento de válvulas', 190],['Usinagem de superfície', 340],
  ['Solda TIG em alumínio', 270],['Encamisamento de cilindro', 420],['Brunimento', 180],['Teste de estanqueidade', 150],
];

export const services: IntakeService[] = notes.flatMap((note, i) => {
  const count = 2 + (i % 4);
  return Array.from({ length: count }, (_, j) => {
    const [name, price] = svcNames[(i + j) % svcNames.length];
    const qty = 1 + (j % 2);
    return { id: `svc-${i}-${j}`, noteId: note.id, name, description: `${name} - ${note.vehicleModel}`, price, quantity: qty, subtotal: price * qty };
  });
});

const prdNames: [string, string, number][] = [
  ['Junta do cabeçote','JP-001',95],['Parafusos cabeçote (jogo)','PC-010',135],
  ['Retentor de válvula','RV-005',18],['Guia de válvula (un)','GV-003',28],
  ['Sede de válvula (un)','SV-002',38],['Adesivo vedante','AV-001',52],
  ['Anel de vedação','AV-008',22],['Tucho hidráulico','TH-004',85],
];

export const products: IntakeProduct[] = notes.flatMap((note, i) => {
  if (i % 3 === 0) return [];
  const count = 1 + (i % 3);
  return Array.from({ length: count }, (_, j) => {
    const [name, sku, unitPrice] = prdNames[(i + j) % prdNames.length];
    const qty = 1 + (j % 3);
    return { id: `prd-${i}-${j}`, noteId: note.id, name, sku, unitPrice, quantity: qty, subtotal: unitPrice * qty };
  });
});

export const attachments: Attachment[] = Array.from({ length: 10 }, (_, i): Attachment => ({
  id: `att-${i + 1}`, noteId: `n${i * 4 + 1}`, type: i % 2 === 0 ? 'PHOTO' : 'PDF',
  filename: i % 2 === 0 ? `foto_cabecote_${i + 1}.jpg` : `laudo_tecnico_${i + 1}.pdf`,
  url: `/mock/attachments/${i + 1}`, createdAt: cd(15 + (i % 10), 1),
}));

export const invoices: Invoice[] = Array.from({ length: 5 }, (_, i) => {
  const note = notes[28 + i];
  return {
    id: `inv-${i + 1}`, noteId: note.id, clientId: note.clientId,
    type: (['NFE','NFSE','RECIBO'] as const)[i % 3], number: `${2001 + i}`,
    accessKey: i % 3 === 0 ? `35260112345678900001550010000${i}0000000001` : undefined,
    issueDate: cd(5 + i, 2), amount: note.totalAmount,
    pdfUrl: `/mock/invoices/nf_${2001 + i}.pdf`, status: 'REGISTRADA' as const,
  };
});

export const activities: ActivityLog[] = [
  { id: 'a1', noteId: 'n15', message: `${formatNoteNumber(15)} movida para EM_EXECUCAO por João (Produção)`, userId: 'user-3', createdAt: cd(18,2) },
  { id: 'a2', noteId: 'n29', message: `${formatNoteNumber(29)} finalizada por Admin Master`, userId: 'user-1', createdAt: cd(17,2) },
  { id: 'a3', noteId: 'n3', message: `${formatNoteNumber(3)} - PDF gerado com sucesso`, userId: 'user-1', createdAt: cd(17,2) },
  { id: 'a4', noteId: 'n8', message: `${formatNoteNumber(8)} movida para EM_ANALISE por Maria (Recepção)`, userId: 'user-4', createdAt: cd(16,2) },
  { id: 'a5', noteId: 'n22', message: `${formatNoteNumber(22)} - Anexo adicionado: foto_cabecote.jpg`, userId: 'user-3', createdAt: cd(16,2) },
  { id: 'a6', message: 'Novo cliente cadastrado: Auto Center Progresso', userId: 'user-4', createdAt: cd(15,2) },
  { id: 'a7', noteId: 'n30', message: `${formatNoteNumber(30)} - Nota fiscal NFE registrada`, userId: 'user-2', createdAt: cd(15,2) },
  { id: 'a8', noteId: 'n1', message: `${formatNoteNumber(1)} criada por Maria (Recepção)`, userId: 'user-4', createdAt: cd(14,2) },
  { id: 'a9', noteId: 'n10', message: `${formatNoteNumber(10)} aprovada por Admin Master`, userId: 'user-1', createdAt: cd(14,2) },
  { id: 'a10', noteId: 'n35', message: 'Fechamento mensal Jan/2026 gerado por Paula (Financeiro)', userId: 'user-2', createdAt: cd(10,2) },
];

export const clients = customers;
