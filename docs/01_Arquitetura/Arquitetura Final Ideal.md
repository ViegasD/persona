---
tipo: arquitetura
sistema: n8n
status: recomendado
atualizado: 2026-04-03
tags: [n8n, arquitetura, producao, padrao-ouro]
---

# Arquitetura Final Ideal

> Arquitetura recomendada para entregar o projeto com seguranca, legibilidade e espaco de evolucao, sem breaking change.

Relacionado: [[Sistema de Atendimento - Definicao Mestra]] | [[Arquitetura Modular V2]] | [[Workflow Unificado]] | [[Blueprint - Entrada Hibrida OPA-N8N]]

---

## Resumo executivo

O melhor desenho para este projeto e:

- `1` orquestrador fino
- sub-workflows por dominio de negocio
- `Code` nodes para regra complexa
- nodes nativos para fluxo simples
- estado explicito para conversa e deduplicacao
- rollback preservado e V2 como base ativa

Em termos praticos, isso significa:

- o workflow principal decide
- os sub-workflows resolvem
- o humano entra cedo quando isso melhora a experiencia
- o financeiro opera com confiabilidade e contexto

---

## Objetivo dessa arquitetura

- evitar um monolito impossivel de manter
- evitar modularizacao excessiva e artificial
- permitir testes por ramo
- reduzir risco de regressao
- facilitar handoff tecnico e entrega ao cliente
- preparar a operacao para self-hosted no Proxmox

---

## Principios oficiais

### 1. Orquestrador fino

O workflow principal deve ficar responsavel apenas por:

- entrada `webhook + polling`
- normalizacao canonica
- deduplicacao
- identificacao do cliente
- deteccao de pendencias stateful
- roteamento por intencao
- handoff para humano

O orquestrador **nao** deve concentrar toda a regra de negocio.

### 2. Especialistas por dominio

Cada sub-workflow deve ser dono de um resultado operacional claro:

- `Alertas internos`
- `CTA / Comercial`
- `Contexto de transferencia`
- `Financeiro`
- `Diagnostico L1`
- `Polling fallback`

### 3. Code node onde ele faz diferenca

Usar `Code` node para:

- normalizacao de payload
- deduplicacao
- state da conversa
- desambiguacao
- selecao de contrato/fatura
- formatacao de mensagens complexas

Usar nodes nativos para:

- `IF`
- `Switch`
- `Set`
- `HTTP Request`
- `Execute Workflow`

### 4. Modularizar por capacidade de negocio

O corte ideal e por dominio, nao por API.

Bom:

- `Financeiro` contendo OPA + IXC
- `Diagnostico` contendo OPA + IXC + Radius

Ruim:

- sub-workflow so para `cliente`
- sub-workflow so para `fn_areceber`
- sub-workflow so para `get_pix`

### 5. Estado explicito

O atendimento premium depende de memoria operacional minima:

- mensagem processada
- checkpoint de polling
- contrato pendente de escolha
- contexto do atendimento
- situacao de handoff

### 6. Produzir sem big bang

Melhor pratica operacional:

- rollback preservado
- V2 ativa como trilha principal
- testes controlados por ramo
- ativacao com possibilidade clara de retorno ao rollback

---

## Topologia final recomendada

```text
[Webhook OPA]
  -> Orquestrador

[Cron Polling]
  -> Polling Fallback
  -> Reinjeta no Orquestrador

[Cron Alertas]
  -> Sub - Alertas

[Orquestrador]
  -> Entrada canonica
  -> Dedupe
  -> Resolver estado pendente
  -> Router por intencao
     -> Sub - CTA
     -> Sub - Contexto
     -> Sub - Financeiro
     -> Sub - Diagnostico
     -> Handoff / no-op seguro
```

---

## Estrutura ideal da V2

### Workflow 1 - Orquestrador

Responsabilidades:

- receber tudo
- unificar payload
- resolver ambiguidade pendente
- decidir qual especialista chamar

Nao deve fazer:

- lookup financeiro completo
- diagnostico completo
- enriquecimento completo

### Workflow 2 - Financeiro

Responsabilidades:

- encontrar cliente
- identificar contratos ativos
- desambiguar contrato
- buscar fatura elegivel
- validar janela financeira
- entregar PIX ou boleto

Esse deve ser o sub-workflow mais robusto do projeto.

### Workflow 3 - Diagnostico L1

Responsabilidades:

- identificar cliente
- validar contrato
- verificar bloqueio ou atraso
- consultar radius
- orientar testes simples
- abrir OS so quando estiver dentro da politica

Limite:

- nao substituir suporte tecnico humano acima do nivel inicial

### Workflow 4 - CTA / Comercial

Responsabilidades:

- detectar lead/CTA
- etiquetar atendimento
- registrar observacao
- abrir lead no CRM

Limite:

- nao fechar venda consultiva sozinho

### Workflow 5 - Contexto de transferencia

Responsabilidades:

- consolidar visao do cliente
- contratos, financeiro e OS
- entregar observacao pronta para humano

### Workflow 6 - Alertas internos

Responsabilidades:

- monitorar tickets esquecidos
- avisar a equipe
- registrar observacao operacional

### Workflow 7 - Polling fallback

Responsabilidades:

- recuperar mensagens perdidas
- enriquecer contexto minimo
- reinjetar na entrada canonica

Limite:

- nao executar regra de negocio diretamente

---

## Padrao visual oficial no n8n

### Canvas

- fluxo sempre da esquerda para a direita
- trigger na esquerda
- decisao no centro
- acoes na direita
- fallbacks abaixo
- no-op seguro embaixo do ramo principal

### Sticky notes

Cada workflow deve ter blocos visuais claros:

- `Entrada`
- `Lookup`
- `Decisao`
- `Acao`
- `Fallback`

### Nomeacao

Padrao recomendado:

- `R4 - IXC Buscar Cliente`
- `R4 - IF Tem Contrato`
- `R4 - OPA Envia PIX`

Ou, no caso da V2:

- `Exec - Financeiro Segunda Via`
- `Exec - Diagnostico L1`

### Regra de ouro visual

Se um humano novo nao conseguir entender o fluxo em menos de `2` minutos no canvas, ele ainda esta complexo demais.

---

## Padrao de producao recomendado

### Credenciais

- sempre via `credentials` ou variaveis de ambiente
- nunca hardcoded em export

### HTTP Request

- retry leve em leitura critica
- mensagens operacionais claras
- headers padronizados

### Erro

- falha dura quando a execucao nao pode prosseguir
- resposta segura quando a melhor opcao for preservar experiencia
- log/observacao quando a equipe precisar rastrear

### Testes

Minimo antes de ativar:

- `Financeiro`
- `Diagnostico`
- `Contexto`
- `CTA`
- `Polling`

---

## Decisao oficial

A arquitetura final ideal deste projeto e:

- manter o baseline como referencia
- usar a `V2` como caminho de producao
- organizar a V2 com orquestrador + especialistas
- manter `Code` nodes para a inteligencia operacional
- evitar reescrever tudo do zero

Essa e a melhor combinacao entre:

- seguranca
- manutencao
- legibilidade
- velocidade de evolucao
- entrega profissional para cliente
