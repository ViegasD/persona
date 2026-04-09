---
tipo: decisoes
atualizado: 2026-04-03
tags: [arquitetura, decisao, tecnico]
---

# Decisoes de Arquitetura e Tecnicas

> Nota-mestra das escolhas tecnicas do projeto.
> Leia aqui antes de mudar workflows, integracoes ou contratos de payload.

---

## POST vs GET no IXC

**Decisao atual:** usar `GET` com header `ixcsoft: listar` para leituras IXC.

### Evidencia consolidada

- o card HTTP do OPA mostrou leitura em `GET`
- o header usado no OPA e `ixcsoft: listar`
- o body vai em JSON, inclusive com `grid_param` serializado como string JSON
- a colecao oficial do IXC tambem documenta `listar` como `GET`
- a resposta real do caso do cliente `1722` retornou `data.total = 4` e `data.registros`

### Regra operacional do projeto

- leitura IXC: `GET` + `ixcsoft: listar`
- insercao IXC: `POST` + `ixcsoft: incluir`
- atualizacao IXC: `PUT`
- remocao IXC: `DELETE`

### Observacao importante

`POST` antigo continua registrado apenas como fallback de compatibilidade caso algum cliente HTTP falhe com `GET` + body.

### `grid_param`

`grid_param` deve ser enviado como **string JSON**, nao como objeto.

Exemplo:

```json
{
  "qtype": "cliente_contrato.id_cliente",
  "query": "1722",
  "oper": "=",
  "grid_param": "[{\"TB\":\"cliente_contrato.status\",\"OP\":\"=\",\"P\":\"A\"}]"
}
```

---

## id_cliente vs id_contrato no fn_areceber

**Decisao:** usar `id_cliente` para visao financeira ampla e `id_contrato` para segunda via operacional de um contrato especifico.

| Caso de uso | Campo | Resultado |
|------------|-------|-----------|
| Contexto pre-atendimento | `fn_areceber.id_cliente` | todas as faturas do cliente |
| Segunda via especifica | `fn_areceber.id_contrato` | faturas de um contrato especifico |

### Atualizacao em 2026-03-31

No ramo 4, a automacao deixou de depender de `ativos[0]`, mas tambem nao deve escolher sozinha entre multiplos contratos ativos.

Regra atual do projeto:

- `0` contratos ativos -> responder com seguranca e parar
- `1` contrato ativo -> seguir direto para busca de fatura
- `mais de 1` contrato ativo -> perguntar ao cliente qual contrato deseja consultar

Essa decisao foi reforcada pela analise do JSON real da [[Assistente Luiza]], que trabalha financeiramente por `id_contrato`.

### Estado conversacional associado

Quando o fluxo pergunta qual contrato o cliente deseja consultar, o estado pendente fica salvo no `workflow static data` do n8n, indexado por `atendimentoId`.

Regra de retomada:

- se o cliente responder com numero da opcao ou ID do contrato, o fluxo retoma automaticamente
- se a resposta nao for reconhecida, o fluxo repete as opcoes
- se o estado expirar, a conversa volta ao roteamento normal

---

## Resposta IXC esta dentro de `data`

**Decisao:** acessar sempre `$json.data.registros` e `$json.data.total`, com fallback apenas defensivo para estruturas antigas.

Estrutura real:

```json
{
  "data": {
    "page": "1",
    "total": "4",
    "registros": []
  },
  "error": {},
  "statusCode": 200
}
```

---

## Workflow unico vs multiplos workflows

**Decisao atual:** operar com `V2` modular como workflow live e manter o unificado apenas como rollback.

### Motivos

- orquestrador fino com especialistas por dominio
- menos acoplamento entre financeiro, suporte, contexto e CTA
- mais facil de testar e corrigir sem quebrar o resto
- melhor para handoff tecnico e entrega ao cliente
- rollback preservado caso precisemos comparar comportamento

### Regra

- novas evolucoes entram na `V2`
- o workflow unificado nao e mais trilha principal
- webhook e polling convergem para a mesma entrada canonica da V2

---

## Homologacao deve servir para producao

**Decisao:** o caminho de teste deve ser o mesmo caminho estrutural de producao.

### Regra operacional

- nao criar fluxo de homologacao que precise ser desmontado para entrar em producao
- quando houver diferenca entre teste e producao, ela deve ficar em configuracao e nao em arquitetura
- exemplos aceitaveis de diferenca:
  - intervalo do polling
  - limites de volume
  - credenciais ou URL de homologacao
  - ativacao controlada
- exemplos que devem ser evitados:
  - trocar a forma de entrada depois que o teste passar
  - reorganizar o estado da conversa depois da homologacao
  - refazer o roteamento principal so na hora de publicar

### Implicacao para este projeto

Se um teste der certo, o passo seguinte deve ser promover com seguranca, e nao reestruturar o fluxo.

---

## Abordagem hibrida OPA + N8N

**Decisao:** manter o OPA como camada operacional principal e o n8n como motor de automacao e orquestracao.

| OPA cuida de | N8N cuida de |
|-------------|-------------|
| filas e atendimento humano | automacoes e cron |
| bots e cards nativos | orquestracao externa |
| interface das atendentes | integracoes, IA e enriquecimento |
| envio operacional no atendimento | logica transversal e resiliencia |

### Fronteira pratica

- OPA continua sendo o sistema operacional do atendimento
- n8n executa automacoes avancadas, regras e integracoes
- o vault no Obsidian documenta tudo como fonte de verdade

---

## Busca por telefone no IXC

**Decisao:** usar `cliente.whatsapp` com operador `L`.

### Fluxo

- OPA envia algo como `5563984510882@c.us`
- o workflow extrai apenas os digitos
- converte para formato local, ex.: `98451-0882`
- consulta `cliente.whatsapp` com operador `L`

### Motivo

- elimina chamadas desnecessarias no OPA
- usa o dado ja presente no webhook
- funciona bem para identificar cliente rapidamente

---

## N8N local vs cloud

**Decisao atual:** n8n local na porta `5678`, com preparacao para migracao futura para ambiente self-hosted em VM.

### Implicacoes

- webhook do OPA nao chama `localhost` sem tunel ou exposicao controlada
- em producao, o ideal e rodar com armazenamento persistente, backup e URL publica estavel

### Caminho preferido

1. VM self-hosted no Proxmox
2. volume persistente do n8n
3. backup da base e dos exports
4. URL publica segura para os webhooks do OPA

---

## Estado atual consolidado

- workflow live atual: `VIP Online - Automacoes V2` (`bolaJ6TSCXF6azpy`)
- workflow legado para rollback: `VIP Online - Automacoes Unificadas (Legacy Rollback)` (`GVwVVWXZfHUvRL4T`)
- V2 live alinhada para `GET` nas leituras IXC de cliente
- financeiro com desambiguacao stateful por contrato ativo antes da fatura
- suporte com abertura de OS usando `ixcsoft: incluir`
- polling ativo na V2 como fallback operacional
