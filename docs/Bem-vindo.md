---
tipo: home
atualizado: 2026-04-03
---

# VIP Online - Segundo Cerebro

> Centro de navegacao do vault. Use esta pagina para entrar no padrao, nas APIs, nos workflows e no historico.

## Mapa do Vault

### Arquitetura

- [[Resumo Atual para IAs]] - resumo de handoff para qualquer IA entender o estado do projeto rapidamente
- [[Sistema de Atendimento - Definicao Mestra]] - como o atendimento deve funcionar, limites e padrao ouro
- [[Blueprint - Entrada Hibrida OPA-N8N]] - nova espinha dorsal de webhook + polling + dedupe
- [[Acesso ao N8N]] - como abrir a instancia sem criar uma base nova
- [[Padrao do Vault e LLMs]] - regras do cerebro, ordem de confianca e padrao editorial
- [[Usuarios e Departamentos]] - quem atende o que, volumes e alertas
- [[Decisoes]] - por que cada decisao tecnica foi tomada
- [[Fluxos N8N]] - visao geral das automacoes ativas

### Assistentes OPA

- [[Assistente Victor]] - bot de triagem e primeiro contato
- [[Assistente Luiza]] - especialista financeiro, regras e ferramentas
- [[Fluxos de Comunicacao]] - fluxos exportados do OPA

### APIs e Integracoes

- [[Indice APIs|Indice de APIs]] - indice geral da area de API
- [[OPA Suite Endpoints]] - referencia da API do OPA Suite
- [[IXC Provedor API]] - autenticacao, padroes e endpoints confirmados
- [[n8n API]] - referencia viva da API do n8n
- [[CTAs do Site]] - padroes de mensagem para deteccao de leads

### Workflows N8N

- [[Arquitetura Modular V2]] - arquitetura live atual (orquestrador + sub-workflows)
- [[Workflow Unificado]] - legado/rollback (id: GVwVVWXZfHUvRL4T)

### Webhooks

- [[Eventos OPA]] - eventos disponiveis e formato de payload

### Log

- [[Progresso]] - historico do que foi feito e do que falta

## Resumo rapido

```text
N8N:         http://localhost:5678
Workflow ID:  bolaJ6TSCXF6azpy
OPA:         https://atendimento.viponline.net.br
IXC:         https://hotsite.viponline.net.br/webservice/v1
```

## Regras de ouro

- IXC usa `GET` com header `ixcsoft: listar` para leitura
- IXC usa `POST` com header `ixcsoft: incluir` para criacao
- resposta IXC sempre fica em `data.registros` e `data.total`
- credenciais nao ficam aqui; use o cofre interno de credenciais
- se mudar um fluxo, atualize a nota do fluxo e a nota da API relacionada

## Status das automacoes

| # | Automacao | Status |
|---|-----------|--------|
| 1 | Alertas internos | Ativo pela suite V2 |
| 2 | Entrada e triagem | Ativo na V2, com Victor dentro do n8n |
| 3 | Contexto de transferencia | Ativo na V2 |
| 4 | Segunda via financeira | Ativo na V2, em refinamento funcional |
| 5 | Disparo de cobranca | Pendente |
| 6 | Polling de fallback | Ativo na V2, com hotfixes recentes de runtime |

## Credenciais

Nao ficam nesta nota. Use o cofre interno de credenciais do projeto.
