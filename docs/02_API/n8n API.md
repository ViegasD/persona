---
tipo: referencia
sistema: n8n
status: confirmado
atualizado: 2026-04-03
tags: [n8n, api, automacao, webhook, workflows]
---

# n8n API

> Referencia viva da API da instancia local e da API publica do n8n.

## Basico

| Campo | Valor |
|------|-------|
| Versao local validada | 2.14.2 |
| Base path | `/api/v1` |
| Autenticacao | `X-N8N-API-KEY` |
| Settings endpoint local | `/rest/settings` |

## O que foi validado na instancia local

### Funcionando

- `GET /api/v1/workflows?limit=2`
- `GET /api/v1/executions?limit=2`
- `GET /rest/settings`

### Respostas observadas

- `workflows` retorna uma estrutura com `data` e `nextCursor`
- `executions` retorna `data` e `nextCursor`
- `rest/settings` mostra:
  - `settingsMode: public`
  - `userManagement.authenticationMethod: email`
  - `communityNodesEnabled: true`

### Recursos com restricao ou negacao

- `GET /api/v1/projects` retornou `403`
- `GET /api/v1/variables` retornou `403`
- os caminhos comuns de spec publica testados nao responderam com documento:
  - `/api/v1/openapi.json`
  - `/api/v1/swagger.json`
  - `/api/v1/api-docs`
  - `/api/v1/docs`

## Formato de autenticação

```http
X-N8N-API-KEY: <api_key>
Accept: application/json
```

## Forma tipica de consumo

```bash
GET /api/v1/workflows
GET /api/v1/executions
GET /api/v1/tags
GET /api/v1/credentials
GET /api/v1/projects
GET /api/v1/variables
```

## Estruturas confirmadas

### Workflows

> Observacao historica: o bloco JSON abaixo e um exemplo de resposta observado durante a sessao. O estado atual do workflow live deve ser conferido em [[Resumo Atual para IAs]] e [[Arquitetura Modular V2]].

```json
{
  "data": [
    {
      "id": "bolaJ6TSCXF6azpy",
      "name": "VIP Online — Automacoes Unificadas",
      "active": true,
      "isArchived": false,
      "nodes": [],
      "connections": {},
      "settings": {}
    }
  ],
  "nextCursor": null
}
```

Observacao: o exemplo acima e apenas uma amostra historica da resposta. Para saber o nome e o estado live corretos, conferir [[Resumo Atual para IAs]] e [[Arquitetura Modular V2]].

### Executions

```json
{
  "data": [],
  "nextCursor": null
}
```

## Observações importantes

- O n8n usa banco persistente no diretório do usuário.
- Se `N8N_USER_FOLDER` apontar para a pasta errada, o n8n cria uma nova base e pede setup.
- O diretório correto deve ser o pai de `.n8n`, nao a propria `.n8n`.
- No ambiente desta conversa, a forma correta foi:
  - `N8N_USER_FOLDER=C:\Users\thiag`

## Relacionados

- [[Acesso ao N8N]]
- [[Padrao do Vault e LLMs]]
- [[Arquitetura Modular V2]]
- [[Workflow Unificado]]
- [[Progresso]]
