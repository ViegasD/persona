---
tipo: log
atualizado: 2026-04-03
tags: [log, progresso]
---

# Log de Progresso

> Registro cronológico do que foi feito. Atualizado a cada sessão.

---

## 2026-04-03 - Auditoria consolidada da V2 live

### Concluido
- [x] Conferida a auditoria externa workflow por workflow contra o estado real da `V2` live
- [x] Confirmado que varios pontos da auditoria eram falso positivo ou estado antigo:
  - `Victor - AI Agent` ja possui `systemMessage`
  - `R4 - Luiza - AI Agent` ja possui `systemMessage`
  - `Formatar Obs Contexto` ja retorna `[{ json: ... }]`
  - `Exec - Tickets Esquecidos` esta conectado; o cron de 30 minutos e que segue desativado por escolha operacional
  - `Polling - Reinjeta na Entrada` aponta para `http://localhost:5678/webhook/vip-online`, que e o alvo correto para reinjecao local
- [x] Removido do orquestrador V2 o node tecnico solto `OPA Validation Sink`
- [x] Aplicado hardening real nas chamadas HTTP que ainda estavam sem retry:
  - `OPA Flow - Buscar Atendimento Protocolo`
  - `OPA Flow - Buscar Mensagens Atendimento`
  - `ID - IXC Buscar Cliente`
  - `ID - IXC Buscar Contratos`
  - `R4 - IXC Buscar Cliente`
  - `R5 - IXC Buscar Cliente`
  - `IXC - Buscar Cliente`
  - `OPA - Buscar Mensagens Recentes`
  - `OPA - Buscar Atendimento Polling`
  - `Polling - Reinjeta na Entrada`
- [x] Atualizado `Cron - Polling Mensagens` para `typeVersion 1.3`
- [x] Adicionado `onError = continueRegularOutput` no `Webhook - VIP Online`

### Observacoes
- os erros restantes do validador MCP continuam concentrados em falso positivo de `Code` node e heuristica ruim de `AI Agent`
- a regra de producao segue:
  - leitura IXC = `GET + ixcsoft: listar`
  - acao IXC que gera/cria recurso = `POST`
- o hardening aplicado foi cirurgico e nao mexeu na regra de negocio

---

## 2026-04-03 - Estabilizacao de runtime da V2

### Concluido
- [x] Removido do orquestrador V2 o caminho antigo de reprompt financeiro herdado do monolito
- [x] Removido o node morto `Financeiro - IF Multiplos Contratos` da V2 live
- [x] Normalizados os nodes `Execute Workflow` da V2 para o formato de `workflowId` esperado pelo n8n
- [x] Conferidas novamente as leituras de cliente no IXC em `Financeiro`, `Contexto` e `Diagnostico` no padrao `GET + ixcsoft: listar`
- [x] Polling da V2 recuperado apos os hotfixes de runtime
- [x] Smoke local do webhook da V2 confirmado com `200 Workflow was started`

### Observacoes
- os erros restantes de validacao continuam concentrados em `Code` nodes
- nao restaram erros estruturais de conexao no orquestrador V2
- a trilha principal do projeto segue sendo somente a V2; o unificado permanece como rollback

---

## 2026-04-03 - Cutover para V2

### Concluido
- [x] Revisada a diferenca entre o workflow unificado live e o orquestrador V2
- [x] Migradas para a V2 as mudancas provadas no canal real:
  - resolucao por `protocolo`
  - sessao por `CPF/CNPJ`
  - triagem `Victor`
  - financeiro `Luiza`
  - envio de resposta operacional no OPA
  - polling fallback reinjetando na entrada canonica
- [x] Leituras IXC da V2 alinhadas para `GET + ixcsoft: listar`
- [x] Backups de pre-cutover e post-cutover salvos em `N8N_Workflows/migration_v2_cutover/`
- [x] Workflow unificado desativado e renomeado para `VIP Online — Automacoes Unificadas (Legacy Rollback)` (`GVwVVWXZfHUvRL4T`)
- [x] Orquestrador V2 ativado como workflow principal: `VIP Online — Automacoes V2` (`bolaJ6TSCXF6azpy`)
- [x] Sub-workflows V2 publicados para o orquestrador funcionar:
  - `ptofsXSH4Xi8vhql`
  - `Nv0vNoQaXtWj4h5k`
  - `FjlkV8lWeT80fmIC`
  - `V0nKFCzNZ4R7gRwP`
  - `Ujv8Um3733XRSemG`
  - `FTqIP1Ajc7byGEdm`

### Observacoes
- a validacao MCP da V2 continua com ruido concentrado em `Code` nodes
- topologia e conexoes da V2 ficaram validas
- `Polling Fallback v2` permanece com `valid = true`
- smoke local do corte confirmou:
  - webhook da V2 saudavel
  - polling da V2 saudavel
  - erro no OPA apenas com `customerServiceId` ficticio em teste local
- o proximo trabalho agora e teste funcional, nao mais manutencao do monolito

### Proximo passo
- [ ] rodar teste real de atendimento na V2 ativa
- [ ] validar lookup de `CPF/CNPJ`
- [ ] validar escolha de contrato quando houver mais de um contrato ativo
- [ ] validar segunda via e diagnostico ponta a ponta

---

## 2026-04-03 - Corte do unificado para a V2

### Concluido
- [x] Reaplicados os artefatos `ready` da migracao da `V2` diretamente na instancia real do n8n
- [x] Confirmado que a `V2` recebeu os comportamentos ja provados no unificado para:
  - triagem do Victor
  - identificacao por `CPF/CNPJ`
  - lookup de cliente e contratos
  - multiplo contrato no financeiro
  - persistencia de contrato pendente no orquestrador
- [x] Publicados os sub-workflows necessarios da `V2`
- [x] Workflow unificado desativado como rollback legado:
  - `GVwVVWXZfHUvRL4T`
  - nome atual: `VIP Online — Automacoes Unificadas (Legacy Rollback)`
- [x] Workflow `V2` ativado como novo live:
  - `bolaJ6TSCXF6azpy`
  - nome atual: `VIP Online — Automacoes V2`
- [x] Backups de pre-corte salvos em `N8N_Workflows/migration_v2_cutover/`

### Observacoes
- O validador MCP continua apontando ruido concentrado em `Code` nodes da `V2`
- O principal bloqueio estrutural real foi resolvido: o estado de contrato pendente saiu do sub-workflow financeiro e foi para o orquestrador
- A partir deste ponto, a homologacao guiada deve seguir somente na `V2`

---

## 2026-04-03 - Handoff resumido para IAs

### Concluido
- [x] Criada a nota `00_Governanca/Resumo Atual para IAs.md` como handoff rapido para onboarding de outras IAs
- [x] `Bem-vindo.md` atualizado para apontar para o resumo rapido
- [x] `Padrao do Vault e LLMs.md` atualizado para instruir outras IAs a lerem o resumo primeiro quando precisarem de contexto rapido
- [x] Naquele momento, o estado real do workflow live foi explicitado no vault para evitar erro de memoria

### Objetivo
- reduzir dependencia da memoria da conversa
- acelerar onboarding tecnico de Claude, Gemini e outros agentes
- centralizar o estado atual do projeto em uma pagina curta e confiavel

### Nota posterior
- este registro foi superado no mesmo dia pelo cutover para a `V2`
- o estado atual correto do projeto agora e:
  - `VIP Online - Automacoes V2` como workflow live
  - `VIP Online - Automacoes Unificadas (Legacy Rollback)` como rollback inativo

---

## 2026-03-31 - Auditoria dos fluxos ja criados

### Concluido
- [x] Registrada a regra de engenharia `producao primeiro`: homologacao deve seguir o mesmo caminho estrutural de producao
- [x] Definida e documentada a `Arquitetura Final Ideal` como recomendacao oficial de engenharia
- [x] Revisao tecnica do workflow live `VIP Online — Automacoes Unificadas`
- [x] Validacao cruzada entre instancia n8n, scripts geradores e documentacao
- [x] Achados criticos registrados em `05_Log/Revisao dos Fluxos - 2026-03-31.md`
- [x] Criada a nota-mae `Sistema de Atendimento - Definicao Mestra.md`
- [x] Definida a arquitetura oficial com orquestrador + especialistas por dominio
- [x] Definida a recomendacao de engenharia: reaproveitar o workflow atual e refatorar a camada de entrada
- [x] Criado o blueprint tecnico da nova entrada hibrida `webhook + polling + dedupe`
- [x] Workflow live refatorado com normalizacao de webhook e deduplicacao antes do roteamento
- [x] Fallback de polling scaffolded no workflow live e deixado desativado por seguranca
- [x] Snapshot do workflow live salvo em `N8N_Workflows/Workflow_Unificado_live_hybrid_2026-03-31.json`
- [x] Hotfix do ramo 4 aplicado no workflow live para respeitar a janela financeira de 10 dias
- [x] Hotfix do ramo 5 aplicado no workflow live para abrir OS com `ixcsoft: incluir`
- [x] Builders `_add_ramo4.py` e `_add_ramo5.py` alinhados com os hotfixes do workflow live
- [x] Snapshot do workflow live pos-hotfix salvo em `N8N_Workflows/Workflow_Unificado_live_hotfix_r4_r5_2026-03-31.json`
- [x] Leituras IXC do workflow live alinhadas para `GET` com `ixcsoft: listar`
- [x] Ramo 4 refeito para selecionar fatura elegivel a partir do conjunto de contratos ativos
- [x] Builders `_create_unified.py`, `_add_ramo4.py` e `_add_ramo5.py` alinhados com o padrao IXC `GET` para leitura
- [x] Snapshot do workflow live pos-IXC GET salvo em `N8N_Workflows/Workflow_Unificado_live_ixc_get_r4_selection_2026-03-31.json`
- [x] JSON real da Assistente Luiza decodificado e destrinchado no vault
- [x] Ramo 4 atualizado para desambiguar contrato: `1` ativo segue, `>1` pergunta ao cliente, `0` responde com seguranca
- [x] Workflow live atualizado com desambiguacao stateful de contrato (total: `89` nos)
- [x] Snapshot do workflow live com desambiguacao salvo em `N8N_Workflows/Workflow_Unificado_live_r4_contract_choice_2026-03-31.json`
- [x] Snapshot do workflow live com retomada stateful salvo em `N8N_Workflows/Workflow_Unificado_live_r4_contract_choice_stateful_2026-03-31.json`
- [x] Skills de n8n instaladas no Codex e MCPs `n8n-mcp` + `n8n-instance` configurados
- [x] Revisao adicional executada com `n8n-instance` e `n8n-mcp`
- [x] Validador MCP confirmou workflow live estruturalmente invalido por IDs de node duplicados
- [x] Hardening estrutural aplicado no workflow live e nos builders
- [x] IDs duplicados eliminados do workflow live e dos exports principais
- [x] `IXC - Registrar CRM` alinhado para criacao com `ixcsoft: incluir`
- [x] Segredos reais removidos dos scripts geradores e trocados por variaveis de ambiente
- [x] Headers `Authorization` de OPA e IXC convertidos para `{{$env.OPA_TOKEN}}` e `{{$env.IXC_AUTH}}`
- [x] HTTP Request nodes endurecidos com schema atual e expressoes sanitizadas
- [x] Snapshot hardened salvo em `N8N_Workflows/Workflow_Unificado_live_hardened_2026-03-31.json`
- [x] Backup pre-hardening salvo em `N8N_Workflows/backups/`
- [x] Validacao MCP melhorou de `70` erros / `168` warnings para `29` erros / `95` warnings
- [x] Suite modular `v2 draft` criada no n8n sem alterar o baseline
- [x] Sub-workflows por dominio criados: alerta, CTA, contexto, financeiro, diagnostico e polling
- [x] Orquestrador `VIP Online — Automacoes Unificadas v2 Draft` criado e mantido inativo
- [x] Batch update aplicado na V2 para endurecer HTTP GET com retry leve
- [x] Expressoes HTTP com template literal corrigidas na V2 onde o n8n realmente sinalizou erro
- [x] Exports da V2 salvos em `N8N_Workflows/modular_v2/`
- [x] Nota `Arquitetura Modular V2.md` criada no vault
- [x] Suite `v2 draft` organizada visualmente no n8n com sticky notes e tags por dominio
- [x] Exports organizados da V2 gerados em `N8N_Workflows/modular_v2/organized/`
- [x] Script reaplicavel criado em `N8N_Workflows/_organize_modular_v2_exports.py`
- [x] Auditoria node-by-node da `v2 draft` executada com foco em comunicacao entre orquestrador e sub-workflows
- [x] Hardening seguro aplicado na V2: retry leve e timeout nos HTTPs de saida e reinjecao
- [x] Utilitario `_workflow_utils.py` atualizado para reaplicar esse hardening em futuros rebuilds
- [x] Nota `Auditoria V2 Draft - 2026-03-31.md` criada no vault
- [x] `Diagnostico v2` reordenado para abrir OS antes de avisar o cliente
- [x] `Financeiro v2` ganhou fallback explicito para cliente nao encontrado
- [x] `Diagnostico v2` ganhou fallback explicito para cliente nao encontrado
- [x] `Contexto v2` agora registra observacao interna quando o lookup falha
- [x] `Polling Fallback v2 Draft` validado estruturalmente como workflow valido
- [x] Camada de teste externo seguro montada com `webhook guard` local na porta `8787`
- [x] Guard configurado para encaminhar ao `webhook-test/vip-online`, evitando ativacao prematura do webhook de producao
- [x] Quick tunnel `TryCloudflare` redirecionado para o guard, em vez de expor o n8n inteiro
- [x] Validado localmente o comportamento do guard: `403` sem segredo e encaminhamento com segredo
- [x] Nota `Migracao N8N para Proxmox.md` criada com recomendacao de VM Linux + Docker Compose + Postgres + reverse proxy proprio
- [x] Token do OPA validado com sucesso em chamada de leitura de `canal-comunicacao`
- [x] Token do IXC validado com sucesso em chamada segura de leitura do recurso `cliente`
- [x] Nota `03_Webhooks/Eventos OPA.md` reescrita com a configuracao de homologacao do webhook

### Alertas identificados
- Workflow live ainda inativo e sem execucoes
- Ramo 4 ainda precisa de teste real para validar a retomada stateful da escolha de contrato
- Role atual do token do OPA bloqueia leitura de mensagens para polling (`403 Bad role`)
- Restam warnings e erros de validacao concentrados em Code nodes e boas praticas operacionais
- Ainda existe tradeoff aberto na ordem `OPA Escolher Contrato -> Marcar Contrato Pendente` do `Financeiro v2`
- Polling ainda descarta silenciosamente mensagens sem `opaClienteId`
- A V2 draft ainda precisa de teste controlado antes de qualquer ativacao
- `TryCloudflare` continua sendo apenas solucao de teste; nao e base de producao

---

## 2026-03-30 - Sessao de organizacao do vault

### Concluido
- [x] Criado o padrao oficial do vault em `Padrao do Vault e LLMs.md`
- [x] Criado o indice de APIs em `02_API/Indice APIs.md`
- [x] Reorganizado o `Bem-vindo.md` como porta de entrada do segundo cerebro
- [x] Atualizado o indice de workflows para ficar navegavel
- [x] Expandida a nota `OPA Suite Endpoints.md` com inventario completo e payloads
- [x] Mantido o `IXC Provedor API.md` como referencia tecnica principal para a integracao IXC

### Proximo passo
- [ ] Rever se os outros documentos herdados devem ser normalizados para o novo padrao
- [ ] Confirmar se algum workflow precisa de refresh de doc depois da reorganizacao
- [ ] Reusar a nota de acesso ao N8N quando a VM do Proxmox entrar no ar

## 2026-03-28 — Sessão 3 (Ramo 4 + documentação completa)

### Concluído
- [x] Ramo 4: Segunda via financeira construído e injetado no workflow unificado
  - 20 novos nós adicionados (total: 48 nós no workflow)
  - Fluxo: telefone → IXC cliente → contratos → fatura → PIX → boleto → OPA
  - PIX: envia texto (copia e cola) + QR code como imagem
  - Boleto: envia linha digitável (texto) + PDF base64 como arquivo
  - Fallback: se sem fatura no mês, envia aviso ao cliente
  - Regra dos 10 dias aplicada via filtro de mês atual no grid_param
- [x] `IXC Provedor API.md` reescrito completamente
  - Todos os endpoints confirmados com exemplos reais
  - Algoritmo de formatação de telefone documentado
  - Campos confusos mapeados (armadilhas documentadas)
  - Cadeia N8N vs Luiza comparada
- [x] `Workflow Unificado.md` atualizado (Ramo 4, 48 nós)

### Próximos passos
- [ ] Resolver acesso externo ao N8N (Cloudflare Tunnel ou ngrok) — prioridade
- [ ] Ativar o workflow no N8N (clicar "Active") — Ramo 1 funciona já
- [ ] Configurar Card HTTP no Victor (OPA) — ativa ramo 3
- [ ] Configurar Card HTTP na Luiza ou fluxo (OPA) — ativa ramo 4
- [ ] Mapear payload real do webhook OPA — ativa ramos 2
- [ ] Testar ramo 4 com atendimento real (validar resposta PIX e boleto)
- [ ] Inativar bot "Victor antigo" (0 atendimentos, ainda ativo)
- [ ] Workflow 05: Disparo proativo de cobrança

---

## 2026-03-28 — Sessão 2 (financeiro + workflow unificado)

### Concluído
- [x] Credenciais IXC e Gemini obtidas e salvas em `opa_suite_credenciais.md`
- [x] N8N API Key gerada e salva
- [x] Workflow 03 (Contexto) criado como JSON em `N8N_Workflows/`
- [x] 3 workflows individuais criados no N8N via API
- [x] Consolidado em 1 workflow unificado (id: `GVwVVWXZfHUvRL4T`)
  - Ramo 1: Alerta tickets esquecidos (Cron)
  - Ramo 2: Detecção CTA/Lead (Webhook)
  - Ramo 3: Enriquecimento de contexto (Webhook)
- [x] Assistente Luiza analisado completamente
  - 13 ferramentas mapeadas
  - Regras invioláveis documentadas
  - Regra dos 10 dias identificada
- [x] Fluxos PIX, BOLETO e Desbloqueio analisados
  - Endpoints `/get_pix` e `/get_boleto` descobertos
  - Cadeia completa de lookup documentada
- [x] Correções aplicadas no workflow:
  - `qtype` com prefixo de tabela (`cliente_contrato.id_cliente`)
  - `grid_param` das faturas corrigido (liberado=S, status!=C, status!=R)
  - Resposta IXC corrigida para `data.registros` / `data.total`
  - Campo do plano: `contrato` (não `descricao_aux_plano_venda`)
  - `rp` dos contratos: 1 → 20
  - POST confirmado como método correto (GET testado e falhou)
- [x] Vault Obsidian reestruturado como segundo cérebro

---

## 2026-03-27 — Sessão 1 (diagnóstico + limpeza)

### Concluído
- [x] Snapshot completo: 14 usuários ativos, 6 departamentos, ~2.600 atend/mês
- [x] Mapeamento real de atendentes por setor (via 500 atendimentos)
- [x] Inativação de 6 departamentos: "teste" + 5 geográficos (via PUT status=I)
- [x] Timeout de inatividade corrigido em todos os setores (estava 30 dias)
- [x] IXC Provedor API mapeada e testada (13.810 clientes confirmados)
- [x] Gemini API Key testada e validada
- [x] Workflows 01 (CTA) e 02 (Alerta) construídos

### Alertas identificados
- ⚠️ **Nadja** = ponto único de falha (único generalista com volume real)
- ⚠️ **Victor antigo** = bot ainda ativo com 0 atendimentos
- ⚠️ 10 usuários ativos sem nenhum atendimento no período

---

## 2026-03-25 — Sessão 0 (setup inicial)

### Concluído
- [x] Mapeamento completo da API OPA Suite (38 endpoints)
- [x] Decisão arquitetural definida: abordagem híbrida OPA + N8N
- [x] Estrutura do vault Obsidian criada
- [x] Casos de uso priorizados (foco em automação)

---

## Pendências abertas (backlog)

| Prioridade | Item | Observação |
|-----------|------|-----------|
| ✅ Feito | Ramo 4: Segunda via automática | Construído — aguarda ativação |
| 🔴 Alta | Acesso externo N8N | Sem isso webhooks não funcionam |
| 🟡 Média | Card HTTP no Victor | Ativa ramo 3 |
| 🟡 Média | Workflow 05: Cobrança proativa | IXC inadimplentes → template |
| 🟡 Média | Inativar Victor antigo | Limpeza de bots |
| 🟢 Baixa | Transcriação de áudio com Gemini | Melhoria futura |
| 🟢 Baixa | Etiquetagem automática com Gemini | Melhoria futura |
