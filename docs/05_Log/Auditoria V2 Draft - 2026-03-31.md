---
tipo: auditoria
sistema: n8n
status: em-revisao
atualizado: 2026-03-31
tags: [n8n, auditoria, v2, producao]
---

# Auditoria V2 Draft - 2026-03-31

> Revisao da suite `v2 draft` com foco em comunicacao entre orquestrador e sub-workflows, integridade de handoff e endurecimento seguro para producao.
> Estado historico: esta auditoria descreve a fase em que a V2 ainda era draft. Hoje a V2 ja e a base live do projeto.

Relacionado: [[Arquitetura Final Ideal]] | [[Arquitetura Modular V2]] | [[Workflow Unificado]]

---

## Escopo

- orquestrador `VIP Online - Automacoes Unificadas v2 Draft`
- sub-workflows `Alertas`, `CTA`, `Contexto`, `Financeiro`, `Diagnostico` e `Polling`
- foco em:
  - entrada e saida entre `Execute Workflow` e `Execute Workflow Trigger`
  - ramos silenciosos
  - no-op indevido
  - perda de contexto
  - promessas operacionais antes da execucao real

---

## Hardening seguro aplicado

Sem alterar regra de negocio:

- retry leve (`2` tentativas) em HTTPs de saida e reinjecao
- timeout padrao de `30s` nos HTTP Request endurecidos da V2
- utilitario comum atualizado em `N8N_Workflows/_workflow_utils.py`
- `Polling Fallback v2 Draft` validado estruturalmente como `valid = true`

Isso reduziu warnings de robustez, especialmente em `Financeiro`, `Diagnostico`, `CTA` e `Polling`.

---

## Correcoes aplicadas nesta rodada

### Resolvido - Financeiro nao fica mais silencioso quando o cliente nao e encontrado

Workflow: `VIP Online - Sub - Financeiro Segunda Via v2 Draft`

- o ramo `R4 - IF Cliente Encontrado` agora envia para `R4 - OPA Cliente Nao Encontrado`
- o `noOp` anterior foi removido
- isso evita silencio operacional no lookup falho

### Resolvido - Diagnostico nao fica mais silencioso quando o cliente nao e encontrado

Workflow: `VIP Online - Sub - Diagnostico L1 v2 Draft`

- o ramo `R5 - IF Cliente Encontrado` agora envia para `R5 - OPA Cliente Nao Encontrado`
- o `noOp` anterior foi removido
- isso garante retorno minimo ao cliente quando o cadastro nao e localizado

### Resolvido - O diagnostico agora abre a OS antes de avisar o cliente

Workflow: `VIP Online - Sub - Diagnostico L1 v2 Draft`

- o ramo `offline` foi reordenado para `R5 - IXC Abrir OS -> R5 - OPA Msg Offline`
- a conexao antiga que gerava ciclo foi removida
- isso elimina a promessa antecipada de abertura de chamado

### Resolvido - Contexto de transferencia agora deixa rastro quando o lookup falha

Workflow: `VIP Online - Sub - Contexto Transferencia v2 Draft`

- o ramo `IF Cliente Encontrado = false` agora envia para `OPA - Obs Contexto Fallback`
- o `noOp` anterior foi removido
- assim o humano recebe um rastro operacional mesmo sem enriquecimento

---

## Pendencias restantes

### Medio - O financeiro pergunta o contrato antes de persistir o estado pendente

Workflow: `VIP Online - Sub - Financeiro Segunda Via v2 Draft`
Nodes: `R4 - OPA Escolher Contrato` -> `R4 - Marcar Contrato Pendente`

Problema:

- a mensagem de escolha e enviada antes do `staticData` ser salvo

Impacto:

- se o node de persistencia falhar, o cliente responde e o orquestrador nao consegue retomar corretamente

### Medio - Polling descarta mensagens sem cliente OPA resolvido

Workflow: `VIP Online - Sub - Polling Fallback v2 Draft`
Node: `Polling - Extrair Cliente OPA`

Problema:

- quando `opaClienteId` nao existe, o code node retorna `[]`

Impacto:

- a mensagem e descartada silenciosamente
- isso e aceitavel como fallback tecnico, mas nao como rastreabilidade de producao

### Medio - Reinjecao do polling pode perder fidelidade de `rawPayload`

Workflow: `VIP Online - Sub - Polling Fallback v2 Draft`
Node: `Polling - Reinjeta na Entrada`

Problema:

- o envio usa `bodyParameters`
- campos aninhados como `rawPayload` podem nao preservar a mesma estrutura do webhook original

Impacto:

- o roteamento principal continua funcionando
- mas a profundidade do contexto pode ficar menor em debug e auditoria

### Medio - CTA pode ficar parcial entre OPA e CRM

Workflow: `VIP Online - Sub - CTA Lead v2 Draft`
Nodes: `OPA - Obs CTA` -> `IXC - Registrar CRM`

Problema:

- OPA pode ter etiqueta e observacao aplicadas
- CRM do IXC pode falhar depois

Impacto:

- gera lead parcialmente registrado

### Baixo - Evento desconhecido termina sem rastro operacional

Workflow: `VIP Online - Automacoes Unificadas v2 Draft`
Node: `Evento Desconhecido`

Problema:

- eventos fora do escopo atual terminam em `noOp`

Impacto:

- nao quebra a execucao
- mas dificulta descobrir novos eventos reais do OPA

---

## Leitura tecnica

O desenho `orquestrador + especialistas` esta correto.

Os riscos restantes na V2 ja nao estao mais em arquitetura macro. Eles estao em:

- ordem operacional de nodes criticos
- rastreabilidade de fallback
- validacao ruidosa em `Code` nodes

Isso e um bom sinal: a base esta madura, e os proximos ajustes sao de integridade e producao, nao de redirecao completa.
