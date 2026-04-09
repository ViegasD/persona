---
tipo: arquitetura
sistema: n8n
status: ativo
atualizado: 2026-04-03
tags: [n8n, arquitetura, modularizacao, v2]
---

# Arquitetura Modular V2

> Versao modular que substituiu o monolito unificado como base ativa do projeto.

Relacionado: [[Arquitetura Final Ideal]] | [[Workflow Unificado]] | [[Decisoes]]

## Objetivo

- reduzir acoplamento
- melhorar legibilidade e manutencao
- facilitar testes por dominio
- preparar entrega segura para cliente
- manter rollback claro

## Estrategia adotada

- preservar o workflow unificado como rollback
- migrar a operacao para a suite V2
- modularizar por dominio, sem redesenhar a regra de negocio do zero
- manter `Code` nodes nas partes realmente complexas
- alinhar leituras IXC ao padrao `GET + ixcsoft: listar`

## Papel da V2

A `V2` e a implementacao ativa da [[Arquitetura Final Ideal]].

Ela existe para:

- operar no modelo `orquestrador fino + especialistas`
- reduzir risco de regressao ao evoluir financeiro, suporte e contexto
- servir como base real de homologacao e producao

## Estado real em 2026-04-03

- orquestrador ativo:
  - `VIP Online — Automacoes V2`
  - id `bolaJ6TSCXF6azpy`
- workflow legado:
  - `VIP Online — Automacoes Unificadas (Legacy Rollback)`
  - id `GVwVVWXZfHUvRL4T`
  - status inativo

## Suite ativa

### Orquestrador

- `VIP Online — Automacoes V2`
- ID: `bolaJ6TSCXF6azpy`

### Sub-workflows

- `VIP Online - Sub - Tickets Esquecidos v2`
- ID: `ptofsXSH4Xi8vhql`

- `VIP Online - Sub - CTA Lead v2`
- ID: `FTqIP1Ajc7byGEdm`

- `VIP Online - Sub - Contexto Transferencia v2`
- ID: `Nv0vNoQaXtWj4h5k`

- `VIP Online - Sub - Financeiro Segunda Via v2`
- ID: `FjlkV8lWeT80fmIC`

- `VIP Online - Sub - Diagnostico L1 v2`
- ID: `V0nKFCzNZ4R7gRwP`

- `VIP Online - Sub - Polling Fallback v2`
- ID: `Ujv8Um3733XRSemG`

## Desenho da V2

```text
[Cron 30min]
  -> Exec - Tickets Esquecidos

[Webhook /vip-online]
  -> Normalizar -> Dedupe
  -> Resolver protocolo OPA quando necessario
  -> Aplicar sessao/documento
  -> Resolver pendencia financeira
    -> se resolvido: Exec - Financeiro Segunda Via
    -> se reprompt: OPA - Enviar Texto Operacional
    -> senao: Victor -> CTA / transferencia / documento / financeiro / diagnostico

[Cron Polling 10s]
  -> Exec - Polling Fallback
  -> reinjecao na mesma entrada canonica
```

## O que foi migrado do unificado

- resolucao por `protocolo`
- sessao por `CPF/CNPJ`
- triagem `Victor`
- financeiro `Luiza`
- envio de resposta operacional no OPA
- polling fallback reinjetando na entrada canonica

## O que mudou sem breaking change

- o path principal do webhook foi mantido
- o rollback foi preservado
- a topologia passou a ser modular
- a logica provada no canal real foi portada, nao reinventada
- o polling ativo da V2 roda em `10s`

## Validacao atual

- `Polling Fallback v2`: validacao MCP `valid = true`
- orquestrador e subflows principais ainda recebem ruido de validacao concentrado em `Code` nodes
- a topologia e as conexoes da V2 ficaram validas
- o smoke local do corte confirmou:
  - webhook da V2 iniciando o fluxo corretamente
  - polling da V2 executando com sucesso
  - a resposta chega ao node de envio do OPA; quando o `customerServiceId` e ficticio, o OPA devolve `400`, o que e esperado para teste local

## Estabilizacao de runtime em 2026-04-03

- removido do orquestrador o path antigo de reprompt financeiro que ainda apontava para logica herdada do monolito
- removido o node morto `Financeiro - IF Multiplos Contratos` que ja nao representava o desenho real da V2
- normalizados os nodes `Execute Workflow` com `workflowId` no formato esperado pelo n8n para evitar falha intermitente entre orquestrador e sub-workflows
- leituras de cliente no IXC conferidas novamente em `Financeiro`, `Contexto` e `Diagnostico` no padrao `GET + ixcsoft: listar`
- polling da V2 voltou a fechar com sucesso apos os hotfixes de runtime

## Leitura tecnica

A V2 e melhor que o unificado para este projeto porque:

- separa responsabilidades por dominio
- preserva o canal real de atendimento
- facilita teste controlado
- reduz risco de mexer em uma ponta e quebrar outra
- deixa a manutencao mais profissional para entrega ao cliente

## Corte realizado em 2026-04-03

1. mudancas provadas do unificado migradas para a V2
2. leituras IXC alinhadas para `GET + listar`
3. workflow unificado desativado
4. V2 ativada como base principal

## Proximo foco recomendado

1. testar a V2 no atendimento real
2. validar:
   - saudacao
   - captura de intencao
   - pedido de `CPF/CNPJ`
   - localizacao do cliente
   - contrato unico vs multiplos contratos
   - segunda via
   - diagnostico
3. refinar tom e microcopy do `Victor`
