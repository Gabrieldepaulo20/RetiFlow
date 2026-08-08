-- Índices de FKs usados nos módulos mais acessados. A base atual é pequena
-- Versao registrada na producao: 20260808154323.
-- (aprox. 1,2 mil O.S.), portanto o custo de criação e lock é baixo; ainda
-- assim, a aplicação em produção deve ocorrer fora do pico.

create index if not exists idx_notas_servico_fk_clientes
  on "RetificaPremium"."Notas_de_Servico" (fk_clientes);
create index if not exists idx_notas_servico_fk_fechamentos
  on "RetificaPremium"."Notas_de_Servico" (fk_fechamentos);
create index if not exists idx_notas_servico_fk_status
  on "RetificaPremium"."Notas_de_Servico" (fk_status);
create index if not exists idx_notas_servico_fk_veiculos
  on "RetificaPremium"."Notas_de_Servico" (fk_veiculos);

create index if not exists idx_fechamentos_fk_clientes
  on "RetificaPremium"."Fechamentos" (fk_clientes);
create index if not exists idx_fechamento_logs_fk_fechamentos
  on "RetificaPremium"."Fechamento_Logs" (fk_fechamentos);
create index if not exists idx_fechamento_logs_fk_usuarios
  on "RetificaPremium"."Fechamento_Logs" (fk_usuarios);

create index if not exists idx_contas_pagar_fk_categorias
  on "RetificaPremium"."Contas_Pagar" (fk_categorias);
create index if not exists idx_contas_pagar_fk_conta_pai
  on "RetificaPremium"."Contas_Pagar" (fk_conta_pai);
create index if not exists idx_contas_pagar_fk_fornecedores
  on "RetificaPremium"."Contas_Pagar" (fk_fornecedores);
create index if not exists idx_contas_pagar_anexos_fk_contas_pagar
  on "RetificaPremium"."Contas_Pagar_Anexos" (fk_contas_pagar);
create index if not exists idx_contas_pagar_historico_fk_contas_pagar
  on "RetificaPremium"."Contas_Pagar_Historico" (fk_contas_pagar);

create index if not exists idx_enderecos_fk_clientes
  on "RetificaPremium"."Enderecos" (fk_clientes);
create index if not exists idx_notas_compra_fk_notas_servico
  on "RetificaPremium"."Notas_de_Compra" (fk_notas_servico);
create index if not exists idx_notas_compra_fk_fechamentos
  on "RetificaPremium"."Notas_de_Compra" (fk_fechamentos);

-- Rollback individual: DROP INDEX "RetificaPremium".<nome>. Os índices não
-- alteram dados nem contratos; removê-los apenas devolve o plano anterior.
