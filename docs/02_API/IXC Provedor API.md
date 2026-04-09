---
tipo: referencia
sistema: IXC Provedor
status: confirmado
atualizado: 2026-03-31
tags: [ixc, api, integracao, tecnico]
---

# IXC Provedor - API Reference Completa

> Referencia operacional da integracao IXC usada neste projeto.
> Prioriza o que foi confirmado na VIP Online e o que realmente entra nos workflows.

Relacionado: [[Decisoes#POST vs GET no IXC]] | [[Workflow Unificado]] | [[Assistente Luiza]]

---

## Autenticacao

```text
Base URL:  https://hotsite.viponline.net.br/webservice/v1
Auth:      Authorization: Basic {IXC_BASE64}
Header:    ixcsoft: listar   <- leituras
Content:   Content-Type: application/json
```

### Regra atual do projeto

- leituras IXC: `GET` + body JSON + `ixcsoft: listar`
- criacoes IXC: `POST` + `ixcsoft: incluir`
- `POST` para leitura fica apenas como fallback de compatibilidade

### Evidencia consolidada

- o card HTTP do OPA usa `GET`
- a colecao oficial do IXC documenta `listar` como `GET`
- o caso real do cliente `1722` retornou `4` contratos ativos via `GET`

---

## Estrutura da Resposta

A resposta confiavel vem dentro de `data`.

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

### Regra de acesso

- usar `$json.data.total`
- usar `$json.data.registros`
- manter fallback defensivo para `$json.total` e `$json.registros` apenas em codigo antigo

---

## Estrutura do Body de Busca

Padrao de leitura confirmado:

```json
{
  "qtype": "cliente_contrato.id_cliente",
  "query": "1722",
  "oper": "=",
  "page": "1",
  "rp": "20",
  "sortname": "cliente_contrato.id",
  "sortorder": "desc",
  "grid_param": "[{\"TB\":\"cliente_contrato.status\",\"OP\":\"=\",\"P\":\"A\"}]"
}
```

### Campos principais

| Campo | Funcao |
|------|--------|
| `qtype` | campo principal da consulta |
| `query` | valor procurado |
| `oper` | operador |
| `page` | pagina |
| `rp` | registros por pagina |
| `sortname` | campo de ordenacao |
| `sortorder` | ordem |
| `grid_param` | filtros adicionais |

### Regra critica

`grid_param` deve ser enviado como **string JSON**.

---

## Operadores de Filtro

| Operador | Significado |
|---------|-------------|
| `=` | igual |
| `!=` | diferente |
| `>` | maior |
| `<` | menor |
| `>=` | maior ou igual |
| `<=` | menor ou igual |
| `L` | contem |
| `NL` | nao contem |
| `IN` | contido |
| `NI` | nao contido |
| `BE` | entre |
| `NBE` | nao entre |

---

## Endpoints Confirmados no Projeto

### 1. `cliente`

**Uso:** encontrar cliente pelo telefone.

```json
{
  "qtype": "cliente.whatsapp",
  "query": "98451-0882",
  "oper": "L"
}
```

### 2. `cliente_contrato`

**Uso:** buscar contratos do cliente.

```json
{
  "qtype": "cliente_contrato.id_cliente",
  "query": "1722",
  "oper": "=",
  "grid_param": "[{\"TB\":\"cliente_contrato.status\",\"OP\":\"=\",\"P\":\"A\"}]"
}
```

### 3. `fn_areceber`

**Uso:** buscar faturas abertas e elegiveis.

Campos relevantes:

- `id`
- `id_contrato`
- `valor`
- `data_vencimento`
- `linha_digitavel`
- `status`

### 4. `radusuarios`

**Uso:** diagnostico basico de conectividade no suporte L1.

Campo de busca usado no projeto:

```json
{
  "qtype": "radusuarios.login",
  "query": "<login_do_contrato>",
  "oper": "="
}
```

### 5. `su_oss_chamado`

**Uso 1:** leitura de OS no contexto do cliente

- metodo: `GET`
- header: `ixcsoft: listar`

**Uso 2:** abertura de OS automatica

- metodo: `POST`
- header: `ixcsoft: incluir`

### 6. `get_pix`

**Uso:** gerar PIX da fatura selecionada.

Entrada principal:

```json
{
  "id_areceber": "12345"
}
```

### 7. `get_boleto`

**Uso:** gerar boleto/PDF da fatura selecionada.

Entrada principal:

```json
{
  "boletos": "12345",
  "juro": "N",
  "multa": "N",
  "atualiza_boleto": "N",
  "tipo_boleto": "arquivo",
  "base64": "S"
}
```

---

## Campos Confirmados Como Importantes

### Em `cliente_contrato`

| Campo | Uso no projeto |
|------|----------------|
| `id` | id do contrato |
| `status` | status do contrato |
| `status_internet` | status tecnico |
| `id_cliente` | vinculo com cliente |
| `contrato` | nome/plano correto para exibir |
| `login` | consulta no Radius |
| `pago_ate_data` | apoio em analise financeira |

### Armadilhas

- `descricao_aux_plano_venda` nao foi o campo confiavel no projeto
- o campo certo para exibir o plano e `contrato`
- clientes corporativos podem ter multiplos contratos ativos

---

## Algoritmo: Telefone OPA -> Busca IXC

1. receber telefone do webhook do OPA
2. remover `@c.us` ou sufixo equivalente
3. remover `55`
4. separar DDD e numero
5. formatar como `98451-0882`
6. consultar `cliente.whatsapp` com operador `L`

---

## Regra Financeira Atual no Projeto

No ramo 4:

- buscar contratos ativos do cliente
- se houver `0` contratos ativos, responder com seguranca
- se houver `1` contrato ativo, consultar faturas desse contrato
- se houver `mais de 1` contrato ativo, perguntar ao cliente qual contrato deseja consultar
- aplicar a janela financeira de 10 dias
- gerar PIX primeiro
- cair para boleto se o PIX nao vier disponivel

### Observacao importante

Essa regra foi implementada para nao depender de `ativos[0]` e, ao mesmo tempo, nao escolher um contrato ambiguo sozinho.
Ela foi reforcada pela analise do JSON real da [[Assistente Luiza]], que opera financeiramente por `id_contrato`.

---

## Erros Comuns

| Sintoma | Causa provavel |
|--------|----------------|
| 404 em leitura | metodo/body incorretos ou rota errada |
| sem resultados | telefone mal formatado ou `qtype` incorreto |
| fatura nao encontrada | filtro ruim, contrato errado ou janela financeira |
| plano em branco | uso de campo errado em vez de `contrato` |
| resposta vazia no n8n | leitura feita fora de `data.registros` |

---

## Documentacao oficial

- [Wiki API IXC](https://wikiapiprovedor.ixcsoft.com.br/index.php)

---

## Resumo executivo

- leitura IXC no projeto deve seguir `GET` + `ixcsoft: listar`
- resposta confiavel fica em `data.total` e `data.registros`
- campo correto do plano e `contrato`
- financeiro nao deve depender do primeiro contrato ativo
- quando houver mais de um contrato ativo, deve pedir desambiguacao ao cliente
