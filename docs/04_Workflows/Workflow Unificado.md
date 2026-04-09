---
tipo: workflow
sistema: n8n
status: legado
n8n_id: GVwVVWXZfHUvRL4T
n8n_url: http://localhost:5678/workflow/GVwVVWXZfHUvRL4T
atualizado: 2026-04-03
tags: [n8n, workflow, automacao, legado, rollback]
---

# Workflow Unificado - VIP Online

> Referencia historica do monolito que serviu como baseline e agora fica preservado apenas como rollback.

## Estado atual

- nome atual no n8n: `VIP Online — Automacoes Unificadas (Legacy Rollback)`
- id: `GVwVVWXZfHUvRL4T`
- status: inativo
- papel: rollback seguro da operacao anterior

## Por que ele deixou de ser o principal

- a arquitetura modular V2 ficou comprovadamente melhor para evolucao segura
- as correcoes provadas no canal real ja foram migradas para a V2
- continuar investindo no monolito criaria mais atrito do que velocidade

## O que este workflow representa agora

- baseline historico
- referencia de comportamento que foi validado no canal real
- ponto de rollback rapido se precisarmos comparar regressao

## O que foi aproveitado dele

As mudancas abaixo foram portadas para a V2 ativa:

- resolucao de atendimento por `protocolo`
- sessao por `CPF/CNPJ`
- triagem `Victor` dentro do n8n
- financeiro `Luiza` dentro do n8n
- envio de resposta operacional no OPA
- polling fallback reinjetando na entrada canonica

## Workflow ativo atual

- `[[Arquitetura Modular V2]]`
- orquestrador ativo: `VIP Online — Automacoes V2`
- id: `bolaJ6TSCXF6azpy`

## Regra de uso daqui para frente

- nao evoluir mais este workflow como trilha principal
- qualquer nova melhoria deve entrar na V2
- este documento fica como referencia historica e de rollback
