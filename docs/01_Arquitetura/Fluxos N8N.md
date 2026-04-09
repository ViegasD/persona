# Fluxos N8N - Visao Geral

> Nota de navegacao. O estado real das automacoes deve ser lido primeiro em [[Arquitetura Modular V2]] e [[Resumo Atual para IAs]].

## Fonte de verdade atual

- [[Arquitetura Modular V2]]
- [[Workflow Unificado]]
- [[Resumo Atual para IAs]]
- [[Progresso]]

## Resumo executivo

### Suite ativa hoje

- orquestrador `VIP Online - Automacoes V2`
- especialistas por dominio
- entrada canonica com webhook e polling
- triagem `Victor` dentro do n8n
- financeiro `Luiza` dentro do n8n
- resposta operacional no OPA

### Workflow legado preservado

- `VIP Online - Automacoes Unificadas (Legacy Rollback)`
- mantido apenas para comparacao e rollback

## Direcao recomendada

- trabalhar somente na V2
- usar o unificado apenas como rollback
- testar novos ajustes no canal real da V2
- manter a documentacao alinhada com a execucao real
