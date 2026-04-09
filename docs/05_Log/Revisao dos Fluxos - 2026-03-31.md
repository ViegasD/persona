---
tipo: revisao
sistema: n8n
status: concluido
atualizado: 2026-03-31
tags: [n8n, revisao, auditoria]
---

# Revisao dos Fluxos - 2026-03-31

> Auditoria tecnica dos fluxos ja criados, cruzando instancia live do n8n, scripts geradores e documentacao do vault.
> Estado historico: esta nota registra a situacao de 2026-03-31, quando o workflow live ainda era o unificado. Nao use esta nota como fonte do estado atual sem cruzar com [[Resumo Atual para IAs]] e [[Arquitetura Modular V2]].

## Escopo revisado

- Workflow live no n8n: `VIP Online — Automacoes Unificadas`
- ID do workflow: `GVwVVWXZfHUvRL4T`
- Fonte complementar: `N8N_Workflows/_create_unified.py`
- Fonte complementar: `N8N_Workflows/_add_ramo4.py`
- Fonte complementar: `N8N_Workflows/_add_ramo5.py`

## Atualizacao apos hotfix em 2026-03-31

- O workflow live recebeu hotfix da janela financeira no ramo 4.
- O workflow live recebeu hotfix de criacao de OS no ramo 5.
- Os builders `N8N_Workflows/_add_ramo4.py` e `N8N_Workflows/_add_ramo5.py` foram alinhados para evitar regressao na proxima regeneracao.
- O workflow continua inativo, entao as correcoes foram validadas estruturalmente no n8n, mas ainda nao em execucao real.

## Atualizacao apos alinhamento IXC em 2026-03-31

- O workflow live foi alinhado para `GET` nas leituras IXC, seguindo o padrao observado no OPA e na colecao oficial do IXC.
- O ramo 4 deixou de depender de `ativos[0]` e passou a selecionar a fatura elegivel mais proxima a partir do conjunto de contratos ativos.
- A validacao continua estrutural. Ainda nao houve teste real de execucao contra o IXC neste ambiente.

## Achados criticos

### 1. Workflow live ainda esta inativo

- Na instancia local revisada em 2026-03-31, o workflow `GVwVVWXZfHUvRL4T` estava com `active = false`, `triggerCount = 0` e sem execucoes registradas.
- Impacto: webhook e rotina agendada nao estao operando de fato nesta instancia.
- Referencia de contexto: [[Workflow Unificado]] informa ativacao manual em [Workflow Unificado.md](C:/Users/thiag/OPA_SUITE/Obsidian/n8n_opa/04_Workflows/Workflow%20Unificado.md#L55).

### 2. Abertura automatica de OS usava header de leitura

- O helper `hdr_ixc()` fixa `ixcsoft: listar` para todas as chamadas IXC em [N8N_Workflows/_add_ramo5.py](C:/Users/thiag/OPA_SUITE/N8N_Workflows/_add_ramo5.py#L35).
- O node `R5 - IXC Abrir OS` reutiliza esse helper em [N8N_Workflows/_add_ramo5.py](C:/Users/thiag/OPA_SUITE/N8N_Workflows/_add_ramo5.py#L384).
- Pela regra documentada do proprio projeto, `listar` e leitura e `incluir` e insercao em [Decisoes.md](C:/Users/thiag/OPA_SUITE/Obsidian/n8n_opa/01_Arquitetura/Decisoes.md#L21).
- Impacto: o fluxo promete ao cliente que abriu chamado tecnico, mas a requisicao esta configurada como consulta, nao como criacao.
- Estado atual: corrigido estruturalmente no workflow live e no builder do ramo 5.

### 3. Regra financeira dos 10 dias nao estava sendo aplicada

- O ramo 4 calcula `diasAteVenc`, mas nao usa esse valor para bloquear ou trocar a resposta em [N8N_Workflows/_add_ramo4.py](C:/Users/thiag/OPA_SUITE/N8N_Workflows/_add_ramo4.py#L138).
- Depois desse calculo, a mensagem segue direto para envio em PIX e QR Code no workflow live.
- A regra formal do projeto diz para nunca enviar fatura com vencimento acima de 10 dias em [Assistente Luiza.md](C:/Users/thiag/OPA_SUITE/Obsidian/n8n_opa/02_API/Assistente%20Luiza.md#L64).
- Impacto: o fluxo atual pode enviar PIX ou boleto quando deveria responder que a fatura ainda nao esta disponivel.
- Estado atual: corrigido estruturalmente no workflow live e no builder do ramo 4.

### 4. O filtro de fatura estava preso ao mes atual e ao primeiro contrato ativo

- O ramo 4 escolhe somente `ativos[0]` em [N8N_Workflows/_add_ramo4.py](C:/Users/thiag/OPA_SUITE/N8N_Workflows/_add_ramo4.py#L89).
- A busca de fatura filtra apenas do primeiro ao ultimo dia do mes atual em [N8N_Workflows/_add_ramo4.py](C:/Users/thiag/OPA_SUITE/N8N_Workflows/_add_ramo4.py#L97).
- Impacto: cliente com mais de um contrato ou com fatura valida em outro contrato pode receber falso negativo.
- Impacto: no fim do mes, uma fatura do mes seguinte que ja deveria estar disponivel pelo criterio operacional pode nao ser encontrada.
- Estado atual: corrigido estruturalmente no workflow live e no builder do ramo 4. Ainda falta teste controlado em execucao real.

### 5. Segredos continuam hardcoded em scripts e workflows

- O script principal carrega `N8N_KEY`, `OPA_TOKEN` e `IXC_AUTH` inline em [N8N_Workflows/_create_unified.py](C:/Users/thiag/OPA_SUITE/N8N_Workflows/_create_unified.py#L7).
- O mesmo padrao reaparece nos builders auxiliares e nos JSONs exportados.
- Impacto: risco de vazamento, dificuldade para rotacionar token e impossibilidade de separar ambiente local, teste e producao com seguranca.

## Observacoes importantes

### Possivel segundo efeito do header `listar`

- O node `IXC - Registrar CRM` tambem usa `hdr_ixc()` em [N8N_Workflows/_create_unified.py](C:/Users/thiag/OPA_SUITE/N8N_Workflows/_create_unified.py#L418).
- Como ele envia dados para `crm_candidatos`, vale validar se esse endpoint aceita criacao com `listar` ou se tambem deveria usar `incluir`.

### Drift de documentacao sobre a regra dos 10 dias

- O log atual afirma que a regra foi aplicada via filtro de mes atual em [Progresso.md](C:/Users/thiag/OPA_SUITE/Obsidian/n8n_opa/05_Log/Progresso.md#L30).
- A nota do workflow tambem trata essa limitacao como suficiente em [Workflow Unificado.md](C:/Users/thiag/OPA_SUITE/Obsidian/n8n_opa/04_Workflows/Workflow%20Unificado.md#L163).
- Isso conflita com a regra formal da Luiza, que fala em nao enviar antes da janela de 10 dias.

## Prioridade sugerida

1. Revisar `IXC - Registrar CRM` para confirmar se tambem precisa de `ixcsoft: incluir`.
2. Tirar segredos dos nodes e scripts, movendo para credenciais/variaveis.
3. Validar em execucao real a nova heuristica de escolha de fatura para clientes com multiplos contratos ativos.
4. Ativar o workflow so depois de validar os ramos 4 e 5 em teste controlado.

## Atualizacao apos validacao com MCP e skills n8n em 2026-03-31

- O workflow live foi validado com `n8n-instance` e `n8n-mcp`.
- Resultado da validacao estrutural: `valid = false`, `89` nodes, `70` erros e `168` warnings.
- Os achados abaixo sao mais fortes que os warnings genericos, porque afetam validade estrutural ou readiness operacional.

### 6. Workflow exportado/live contem IDs de node duplicados

- O mesmo ID `be3ae9f5-8884-4e0a-bccd-dfd0ee4be7dd` aparece em `R4 - OPA Sem Fatura`, `R4 - OPA Escolher Contrato`, `R4 - OPA Sem Contrato` e `Financeiro - OPA Repetir Escolha Contrato` no snapshot live em [Workflow_Unificado_live_r4_contract_choice_stateful_2026-03-31.json](C:/Users/thiag/OPA_SUITE/N8N_Workflows/Workflow_Unificado_live_r4_contract_choice_stateful_2026-03-31.json#L1482), [Workflow_Unificado_live_r4_contract_choice_stateful_2026-03-31.json](C:/Users/thiag/OPA_SUITE/N8N_Workflows/Workflow_Unificado_live_r4_contract_choice_stateful_2026-03-31.json#L2550), [Workflow_Unificado_live_r4_contract_choice_stateful_2026-03-31.json](C:/Users/thiag/OPA_SUITE/N8N_Workflows/Workflow_Unificado_live_r4_contract_choice_stateful_2026-03-31.json#L2595) e [Workflow_Unificado_live_r4_contract_choice_stateful_2026-03-31.json](C:/Users/thiag/OPA_SUITE/N8N_Workflows/Workflow_Unificado_live_r4_contract_choice_stateful_2026-03-31.json#L2721).
- Impacto: a estrutura fica invalida para tooling e aumenta o risco de comportamento imprevisivel em futuras atualizacoes/parciais.

### 7. O fallback hibrido existe, mas ainda nao esta operacional

- O workflow continua `active = false` em [Workflow_Unificado_live_r4_contract_choice_stateful_2026-03-31.json](C:/Users/thiag/OPA_SUITE/N8N_Workflows/Workflow_Unificado_live_r4_contract_choice_stateful_2026-03-31.json#L7).
- O trigger `Cron - Polling Mensagens` permanece `disabled = true` em [Workflow_Unificado_live_r4_contract_choice_stateful_2026-03-31.json](C:/Users/thiag/OPA_SUITE/N8N_Workflows/Workflow_Unificado_live_r4_contract_choice_stateful_2026-03-31.json#L2126) e [Workflow_Unificado_live_r4_contract_choice_stateful_2026-03-31.json](C:/Users/thiag/OPA_SUITE/N8N_Workflows/Workflow_Unificado_live_r4_contract_choice_stateful_2026-03-31.json#L2133).
- Impacto: a arquitetura hibrida esta desenhada, mas hoje nao ha resiliencia real via polling.

### 8. Expressoes n8n ainda usam optional chaining em IFs

- O IF principal de entrada usa `body?.event` em [Workflow_Unificado_live_r4_contract_choice_stateful_2026-03-31.json](C:/Users/thiag/OPA_SUITE/N8N_Workflows/Workflow_Unificado_live_r4_contract_choice_stateful_2026-03-31.json#L220).
- A validacao do MCP marcou esse padrao como nao suportado no parser de expressoes do n8n.
- Impacto: esse tipo de expressao pode falhar silenciosamente ou quebrar de forma intermitente dependendo do campo avaliado.

## Atualizacao apos hardening estrutural em 2026-03-31

- Foi criado um utilitario compartilhado em `N8N_Workflows/_workflow_utils.py` para padronizar saneamento de expressoes, upgrade de nodes HTTP e regeneracao segura de IDs.
- Os scripts `N8N_Workflows/_create_unified.py`, `N8N_Workflows/_add_ramo4.py`, `N8N_Workflows/_add_ramo5.py` e `N8N_Workflows/_patch_r4_contract_disambiguation.py` passaram a usar variaveis de ambiente em vez de segredos hardcoded.
- O workflow live recebeu hardening automatico via `N8N_Workflows/_patch_workflow_hardening.py`.
- Todos os exports principais em `N8N_Workflows/*.json` foram saneados via `N8N_Workflows/_sanitize_workflow_exports.py`.

## Estado atual apos as correcoes

- IDs de node duplicados: corrigido.
- `IXC - Registrar CRM` usando semantica de criacao: corrigido.
- Segredos reais hardcoded em scripts e snapshot live: corrigido.
- Leituras IXC em `GET` com `ixcsoft: listar`: mantido.
- Workflow live segue inativo por seguranca operacional: mantido.

## Resultado da validacao apos as correcoes

- Snapshot hardened: [Workflow_Unificado_live_hardened_2026-03-31.json](C:/Users/thiag/OPA_SUITE/N8N_Workflows/Workflow_Unificado_live_hardened_2026-03-31.json)
- Validacao MCP apos hardening: `29` erros e `95` warnings
- Validacao MCP antes do hardening: `70` erros e `168` warnings

## Leitura tecnica do restante da validacao

- O grosso dos erros remanescentes esta concentrado em Code nodes.
- Ha forte indicio de falso positivo do validador ao interpretar JS interno de Code nodes como se fosse expressao `{{ ... }}` do n8n.
- Os warnings remanescentes sao majoritariamente de boas praticas: tratamento de erro em HTTP Request, polling desativado e observacoes genericas sobre Code nodes.

## Recomendacao operacional

1. Testar o ramo financeiro de ponta a ponta com um atendimento controlado.
2. Testar o ramo de diagnostico ate a borda do handoff humano.
3. Se os testes passarem, ativar o workflow live.
4. So depois decidir se vale a pena refatorar Code nodes apenas para reduzir ruido do validador.
