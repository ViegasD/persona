---
tipo: governanca
status: ativo
atualizado: 2026-04-03
tags: [handoff, resumo, llm, onboarding]
---

# Resumo Atual para IAs

> Leia esta nota primeiro se voce precisar entender rapidamente o estado do projeto sem depender do historico da conversa.

## Objetivo do projeto

- OPA como canal de atendimento
- n8n como orquestrador principal
- Gemini dentro do n8n como camada de inteligencia
- `Victor` como triagem
- `Luiza` como financeiro
- IXC como base principal para cliente, contrato e financeiro

## Arquitetura correta

- OPA nao e o cerebro do atendimento
- OPA recebe e envia mensagens
- n8n decide a logica do atendimento
- Gemini vive dentro do n8n
- `CPF/CNPJ` e a chave principal de identificacao
- telefone e apenas contexto auxiliar

## Regra operacional mais importante

- `producao primeiro`
- tudo o que for testado deve seguir a mesma estrutura de producao
- se algo funcionar em homologacao, nao deve exigir refatoracao estrutural para ir a producao

## Decisoes fechadas

- se o cliente nao informar a intencao, a triagem deve ser humana, gentil e dinamica
- se a intencao exigir consulta na base, o fluxo pede `CPF/CNPJ`
- se houver `1` contrato ativo, segue direto
- se houver `mais de 1` contrato ativo, pergunta qual contrato e lista as opcoes
- suporte vai so ate L1
- financeiro opera por contrato, nao no escuro
- leituras IXC devem seguir o padrao `GET + ixcsoft: listar`

## O que ja foi provado

- n8n local funcionando na porta `5678`
- MCP do n8n funcionando
- OPA consegue chamar o n8n por HTTP
- n8n consegue responder no atendimento do OPA via API
- Gemini foi encaixado no n8n para triagem e financeiro
- o lookup por `CPF/CNPJ` existe e o CPF `716.909.711-77` foi confirmado como existente no IXC

## Correcao mais recente aplicada

- as mudancas provadas no workflow unificado foram migradas para a V2 ativa:
  - resolucao por `protocolo`
  - sessao por `CPF/CNPJ`
  - triagem `Victor`
  - financeiro `Luiza`
  - polling fallback reinjetando na entrada canonica
  - envio de resposta operacional no OPA
- leituras do IXC na V2 foram alinhadas para `GET + ixcsoft: listar`
- o workflow unificado foi desativado e preservado como rollback
- a V2 recebeu hotfixes de corte para:
  - alinhar o `Webhook - VIP Online` ao formato estavel do unificado
  - publicar os sub-workflows especialistas
  - adicionar `Execute Workflow Trigger` nos sub-workflows
  - corrigir a chamada `Execute Sub-workflow` do orquestrador
  - reaproveitar os headers OPA/IXC que ja estavam funcionando no live
  - remover o path morto de reprompt financeiro herdado do monolito
  - normalizar `Execute Workflow` para evitar falha de chamada entre orquestrador e sub-workflows
  - recuperar o polling da V2 para execucao bem-sucedida

## Como uma IA deve se orientar

### Ler nesta ordem

1. `[[Resumo Atual para IAs]]`
2. `[[Padrao do Vault e LLMs]]`
3. `[[Decisoes]]`
4. `[[Arquitetura Modular V2]]`
5. `[[Progresso]]`

### Se precisar aprofundar

- comportamento de triagem: `[[Assistente Victor]]`
- comportamento financeiro: `[[Assistente Luiza]]`
- integracao IXC: `[[IXC Provedor API]]`
- integracao OPA: `[[OPA Suite Endpoints]]`
- webhooks/eventos: `[[Eventos OPA]]`

## Estado atual resumido

- workflow live em uso: `VIP Online — Automacoes V2`
- workflow id live: `bolaJ6TSCXF6azpy`
- status live: ativo
- sub-workflow CTA da V2: `VIP Online - Sub - CTA Lead v2` â€” `FTqIP1Ajc7byGEdm`
- sub-workflows V2 publicados:
  - `VIP Online - Sub - Tickets Esquecidos v2` — `ptofsXSH4Xi8vhql`
  - `VIP Online - Sub - Contexto Transferencia v2` — `Nv0vNoQaXtWj4h5k`
  - `VIP Online - Sub - Financeiro Segunda Via v2` — `FjlkV8lWeT80fmIC`
  - `VIP Online - Sub - Diagnostico L1 v2` — `V0nKFCzNZ4R7gRwP`
  - `VIP Online - Sub - Polling Fallback v2` — `Ujv8Um3733XRSemG`
- workflow legado para rollback:
  - `VIP Online — Automacoes Unificadas (Legacy Rollback)`
  - id `GVwVVWXZfHUvRL4T`
  - status: inativo

## O que ainda precisa de atencao

- validar no fluxo real do atendimento a V2 ja ativa:
  - saudacao dinamica
  - pedido de `CPF/CNPJ`
  - localizacao do cliente
  - contrato unico vs multiplos contratos
  - segunda via e diagnostico
- no smoke local da V2:
  - webhook ficou saudavel
  - polling ficou saudavel
  - o envio ao OPA falhou apenas quando usamos `customerServiceId` ficticio no teste local
- continuar refinando o tom do Victor para manter o padrao humano desejado
- tratar o ruido do validador MCP sobre `Code` nodes como ruido de ferramenta, nao como topologia quebrada

## Regra de ouro para qualquer outra IA

- se houver conflito entre memoria da conversa e execucao real, vale a execucao real
- nunca assumir que um CPF ou contrato nao existe sem validar a consulta no backend certo
- antes de mexer em arquitetura, checar se o problema nao esta em:
  - payload real
  - metodo HTTP real
  - parse da resposta
  - ownership do atendimento
