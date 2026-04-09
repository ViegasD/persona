---
tipo: api
sistema: OPA Suite
fonte: Opa Suite API.postman_collection.json
status: ativo
atualizado: 2026-03-31
tags: [api, postman, opa, atendimento, automacao]
---

# OPA Suite — API Reference Completa

> Derivado diretamente da colecao `Opa Suite API.postman_collection.json` (38 requests, 12 grupos).
> Inclui todos os campos, filtros e exemplos reais de request/response.

---

## Autenticacao e Base

```
Base URL:  https://<seu-dominio>/api/v1/
Header:    Authorization: Bearer <token>
           Content-Type: application/json
```

Token gerado no OPA Suite em Cadastro de Usuarios, perfil do tipo **API**.

---

## Convencao de resposta

Toda resposta bem-sucedida segue o padrao:

```json
{
  "status": "success",
  "code": 200,
  "data": { ... }
}
```

---

## 1. Atendimentos

### GET `/atendimento/:id` — Buscar atendimento populado

Retorna um unico atendimento com todos os campos de relacionamento populados.

**Exemplo de resposta:**
```json
{
  "_id": "657ca4f695a89a4dd206ce5f",
  "id_cliente": { "_id": "...", "nome": "Joao Santos", "cpf_cnpj": "56982161005", "status": "A" },
  "id_user": { "_id": "...", "nome": "" },
  "id_atendente": { "_id": "...", "nome": "Lucas Silva", "genero": "" },
  "setor": "2bf43d1d186f7d2b0d647a11",
  "descricao": "",
  "status": "EA",
  "canal": "page",
  "canal_id": "12a3a31ddcfd29baf4990e2f",
  "canal_cliente": "c2b22a37-fb2a-4875-bd3c-dae9735393c6",
  "protocolo": "OPA20232017",
  "tags": [],
  "avaliacoes": [],
  "observacoes": [],
  "date": "2023-12-15T19:11:50.657Z",
  "id_motivo_atendimento": { "_id": "...", "motivo": "Atendimento teste" }
}
```

**Status possiveis:** `EA` (em atendimento), `F` (finalizado), `NV` (na fila/nao visualizado)

**Nota:** Nao retorna mensagens — use `GET /atendimento/mensagem` com `id_rota` para isso.

---

### GET `/atendimento` — Listar atendimentos

Suporta filtros via body JSON (GET com body — `disableBodyPruning: true`).

**Filtros disponiveis:**

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `protocolo` | string | Numero do protocolo, ex: "OPA202210" |
| `dataInicialAbertura` | string | Data YYYY-MM-DD |
| `dataFinalAbertura` | string | Data YYYY-MM-DD |
| `dataInicialEncerramento` | string | Data YYYY-MM-DD |
| `dataFinalEncerramento` | string | Data YYYY-MM-DD |
| `status` | string | "EA", "F", "NV" — nao documentado na colecao mas funciona |

**Opcoes:**

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `skip` | number | Paginacao: registros a pular |
| `limit` | number | Maximo de registros |

**Exemplo de request:**
```json
{
  "filter": {
    "dataInicialAbertura": "2023-12-10",
    "dataFinalAbertura": "2023-12-18",
    "status": "EA"
  },
  "options": { "limit": 100 }
}
```

**Exemplo de resposta (lista):**
```json
[
  {
    "_id": "657c407f95a89d4dd802ca1c",
    "id_cliente": "646657ac0940d216c59e95ea",
    "id_user": "...",
    "id_atendente": "...",
    "setor": "5bf13d1d126f7d2b0d647a61",
    "status": "F",
    "canal": "page",
    "protocolo": "OPA20232025",
    "tags": [],
    "date": "2023-12-15T12:03:11.406Z",
    "fim": "2023-12-15T19:11:02.391Z"
  }
]
```

---

### POST `/atendimento/:id/observacao` — Criar observacao

Registra uma observacao interna no ticket. Aparece para o atendente mas nao e enviada ao cliente.

**Body:**
```json
{ "message": "mensagem da observacao" }
```

**Resposta:**
```json
{ "data": { "success": true } }
```

---

### POST `/atendimento/:id/etiqueta` — Adicionar etiqueta

**Body:**
```json
{ "tagId": "690a073d18ae4105416b5eda" }
```

**Resposta:**
```json
{ "data": { "success": true } }
```

---

### DELETE `/atendimento/:id/etiqueta/:id_etiqueta` — Remover etiqueta

Sem body. Resposta vazia em caso de sucesso.

---

## 2. Mensagens

### GET `/atendimento/mensagem` — Listar mensagens

Principal endpoint para leitura de conversa. Fundamental para o ramo de IA.

**Filtros via body:**

| Campo | Descricao |
|-------|-----------|
| `id_rota` | `_id` do atendimento (nao confundir com protocolo) |

**Opcoes:** `skip`, `limit`

**Exemplo de request:**
```json
{
  "filter": { "id_rota": "62a8c296cba8621f428b50d5" },
  "options": { "limit": 100 }
}
```

**Estrutura de cada mensagem na resposta:**
```json
{
  "_id": "657ca4c795a89d4dd806ce14",
  "id_rota": "62a8c296cba8621f428b50d5",
  "id_user": "6539837c61b23cfec1d35918",   // presente se veio do cliente
  "id_atend": "5d1642ad4b16a50312cc8f4d",  // presente se veio do bot/atendente
  "mensagem": "Teste",
  "tipo": "texto",
  "objeto": null,
  "chamada": null,
  "canalComunicacao": "62a3a36ddcfd29baf4990e2f",
  "destinatario": "5d1642ad4b16a50312cc8f4d",
  "tipoDestinatario": "usuarios",
  "statusEnvio": { "status": "sent", "observacao": "" },
  "data": "2023-12-15T19:11:03.548Z",
  "createdAt": "2023-12-15T19:11:03.554Z"
}
```

**Como identificar origem da mensagem:**

| `tipoDestinatario` | Significado |
|--------------------|-------------|
| `"usuarios"` | Mensagem DO CLIENTE (destinatario e o atendente/bot) |
| `"clientes_users"` | Mensagem DO BOT/ATENDENTE para o cliente |

**Tipos de mensagem (`tipo`):**

| Valor | Descricao |
|-------|-----------|
| `"texto"` | Texto simples |
| `""` (vazio) | Protocolo, sistema |
| `"menuInterativo"` | Menu com opcoes — `mensagem` vira objeto com `titulo` e `opcoes[]` |
| `"media"` | Arquivo/imagem |

**Uso para polling de IA:** buscar mensagens com `tipoDestinatario: "usuarios"` posteriores a um timestamp para detectar novas mensagens do cliente.

---

### GET `/atendimento/mensagem/:id` — Buscar mensagem populada

Retorna uma mensagem com `id_rota` populado (objeto completo do atendimento) e `id_atend` populado (objeto do bot/atendente).

**Util para:** inspecionar o contexto completo de uma mensagem especifica.

---

### POST `/atendimento/mensagem/send` — Enviar mensagem

Envia mensagem para um atendimento em andamento (com atendente, bot ou em fila).

**Body — texto:**
```json
{
  "customerServiceId": "624c358355802dbdd2eb944a",
  "content": {
    "type": "text",
    "text": "Mensagem enviada pela automacao"
  }
}
```

**Body — midia via URL:**
```json
{
  "customerServiceId": "624c358355802dbdd2eb944a",
  "content": {
    "type": "media",
    "media": { "url": "https://domain.com/file.png" }
  }
}
```

**Body — midia via Base64:**
```json
{
  "customerServiceId": "624c358355802dbdd2eb944a",
  "content": {
    "type": "media",
    "media": { "base64": "data:image/png;base64,iVBORw0KGgo..." }
  }
}
```

**Restricoes:**
- Apenas uma mensagem por vez (texto OU arquivo)
- `media` deve ter APENAS `url` ou `base64`, nunca os dois

**Resposta:** retorna o `_id` da mensagem criada.

---

## 3. Canais de Comunicacao

### GET `/canal-comunicacao/` — Listar canais

**Filtros disponiveis:**

| Campo | Valores |
|-------|---------|
| `nome` | string livre |
| `id_atendente` | ObjectId do bot/atendente |
| `status` | "A" ou "I" |
| `canal` | "Whatsapp", "Instagram", "Page", "Telegram", "Messenger", "Telefonia" |
| `integracao` | "facebook" ou "dialog360" |

**Resposta (item):**
```json
{
  "_id": "212b435c1cc6221ac1zf125a",
  "nome": "Canal 360dialog",
  "id_atendente": "116d2132b4x5fe04ehd76f68",
  "status": "A",
  "canal": "Whatsapp",
  "integracao": "dialog360",
  "prioridadeListagemAtendimentos": 5
}
```

---

### GET `/canal-comunicacao/:id` — Buscar canal populado

Mesmo retorno mas com `id_atendente` expandido:
```json
"id_atendente": { "_id": "...", "nome": "BotExemplo", "genero": "fem" }
```

---

### GET `/canal-comunicacao/:id/template` — Templates por canal

Lista templates vinculados ao canal. Util para descobrir quais templates estao disponiveis para um canal especifico.

**Resposta (item):**
```json
{
  "_id": "13197eb7dfcx7928f233512f",
  "texto": "Ola {{nome_usuario}} segue link de assinatura digital do seu contrato {{protocolo}}",
  "atalho": "assinatura_digital",
  "dados": "{...json serializado...}",
  "identificadorCanal": "Oxi9iMOL",
  "tipo_mensagem": "dialog360",
  "departamentos": ["5bf26c1f186f7d2b1c647a15"],
  "anexo": null,
  "flow": null
}
```

---

### GET `/canal-comunicacao/:id/template/limites-diarios-envio` — Limites diarios

**Resposta:**
```json
{
  "messagesSent": 1,
  "dailyLimit": 1000,
  "availableAmount": 999
}
```

Se o canal nao tiver limites, retorna objeto vazio.

---

## 4. Templates de Mensagem

### GET `/template` — Listar templates

**Filtros:**

| Campo | Descricao |
|-------|-----------|
| `atalho` | Identificador curto do template |
| `tipo_mensagem` | "dialog360", etc. |

**Resposta (item):**
```json
{
  "_id": "12452eb7dfcc7928f522912e",
  "texto": "Ola {{nome_usuario}} segue link...",
  "atalho": "assinatura_digital",
  "tipo_mensagem": "dialog360",
  "departamentos": ["1bf26d1d136f7d2b0d247a61"]
}
```

---

### GET `/template/:id` — Buscar template populado

Mesmo retorno mas `departamentos` vem como array de objetos `{_id, nome, status}`.

---

### POST `/template/send` — Enviar template

Envia template fora da janela de 24h (ou dentro dela). Canais suportados: WhatsApp, Telegram, Messenger, Instagram.

**Body completo:**
```json
{
  "contato": { "canalCliente": "+5563984510882" },
  "template": {
    "_id": "624c358355802dbdd2eb944a",
    "variaveis": ["variavel 1", "variavel 2"],
    "midiaAlternativa": "https://github.com/exemplo.png"
  },
  "canal": "622f8e310d7149ee66bb654c",
  "allowSendingToStartedCustomerService": true,
  "metadata": { "chave": "valor" }
}
```

**Parametros:**

| Campo | Obrigatorio | Descricao |
|-------|-------------|-----------|
| `contato.canalCliente` | sim | Numero com +DDI, ex: "+5563984510882" |
| `template._id` | sim | ID do template |
| `template.variaveis` | nao | Array de strings OU objeto (ver abaixo) |
| `template.midiaAlternativa` | nao | URL que substitui a midia original do template |
| `canal` | sim | ID do canal de comunicacao |
| `allowSendingToStartedCustomerService` | nao | Permite envio mesmo com atendimento ativo |
| `metadata` | nao | Objeto livre, recuperavel via webhook |

**Formato de `variaveis` — template padrao:**
```json
"variaveis": ["Valor 1", "Valor 2"]
```

**Formato de `variaveis` — template de pagamento (`paymentDetailTemplate`):**
```json
"variaveis": {
  "valor": "5700",
  "tipoPagamento": "pix",
  "codigo": "0002010102112...",
  "merchantName": "EMPRESA LTDA",
  "pixKey": "email@empresa.com",
  "pixKeyType": "EMAIL"
}
```
Ou para boleto: substituir `codigo/merchantName/pixKey/pixKeyType` por `linhaDigitavel`.

**Atencao:** por padrao, envio bloqueado se contato ja estiver em atendimento. Use `allowSendingToStartedCustomerService: true` para forcar.

**Resposta:**
```json
{
  "message": "Template has been succesfully sent.",
  "messageSentId": "659c365bfdf5907fd69e28XX"
}
```

---

## 5. Cliente

### POST `/cliente/` — Criar cliente

**Body:**
```json
{
  "nome": "Arnold Schwarzenegger",
  "cpf_cnpj": "640.642.910-93",
  "status": "A",
  "cliente": true,
  "prospect": false,
  "fornecedor": false,
  "prestadorServico": false,
  "tags": ["62878ee28d8911cd3916e8d4"]
}
```

**Todos os campos:**

| Campo | Obrigatorio | Descricao |
|-------|-------------|-----------|
| `nome` | sim | Nome completo |
| `cpf_cnpj` | nao | CPF ou CNPJ (aceita formatado) |
| `status` | sim | "A" ou "I" |
| `cliente` | sim | boolean |
| `prospect` | sim | boolean |
| `fornecedor` | sim | boolean |
| `prestadorServico` | sim | boolean |
| `fantasia` | nao | Nome fantasia |
| `id` | nao | ID do sistema de origem (ERP) |
| `id_fornecedor` | nao | ID do sistema de origem (se fornecedor) |
| `id_filial` | nao | ID da filial no sistema de origem |
| `publicKey` | nao | Chave publica |
| `tags` | nao | Array de IDs de etiquetas |

**Clientes de integracao (IXC) nao podem ser editados via API.**

---

### PUT `/cliente/:id` — Editar cliente (completo)

Mesmos campos do POST. Todos os obrigatorios devem ser enviados mesmo que nao mudem.

---

### PATCH `/cliente/:id` — Editar cliente (parcial)

Envia apenas os campos que deseja alterar:
```json
{ "status": "I" }
```

---

### GET `/cliente/` — Listar clientes

**Filtros:**
`id`, `id_fornecedor`, `id_filial`, `nome`, `fantasia`, `cpf_cnpj`, `status`, `prospect`, `cliente`, `fornecedor`

---

### GET `/cliente/:id` — Buscar cliente populado

**Resposta:**
```json
{
  "_id": "65848df5ae1d33ee2c1ce988",
  "nome": "Arnold Schwarzenegger",
  "fantasia": "",
  "cpf_cnpj": "64064291093",
  "status": "I",
  "prospect": false,
  "cliente": true,
  "fornecedor": false,
  "prestadorServico": false
}
```

---

### DELETE `/cliente/:id` — Remover cliente

Nao e possivel excluir clientes que ja realizaram atendimentos.

---

## 6. Usuario

### GET `/usuario/` — Listar usuarios

**Filtros:**

| Campo | Valores |
|-------|---------|
| `nome` | string livre |
| `status` | "A" ou "I" |
| `tipo` | "user", "bot" ou "callCenter" |

**Resposta (item):**
```json
{
  "_id": "5d1642434b16a50312cc8f43",
  "nome": "Lucas Silva",
  "status": "A",
  "tipo": "user"
}
```

**Uso:** buscar IDs de atendentes para enviar notificacoes.

---

## 7. Contatos

> Contato no OPA e diferente de Cliente. Contato = canal de comunicacao do cliente (telefone, WhatsApp). Cliente = entidade principal.

### POST `/contato/` — Criar contato

**Body:**
```json
{
  "nome": "Arnold Schwarzenegger",
  "celularCompleto": "+5549988776655",
  "requerAutenticacaoSempre": true,
  "habilitarAlerta": true,
  "lead": false,
  "historico_email": true,
  "senha": "senha",
  "repetirSenha": "senha"
}
```

**Campos adicionais:**

| Campo | Descricao |
|-------|-----------|
| `celularCompleto` | Celular com +DDI+DDD |
| `WhatsappCompleto` | WhatsApp com +DDI+DDD |
| `foneResidencialCompleto` | Residencial com +DDI+DDD |
| `foneComercialCompleto` | Comercial com +DDI+DDD |
| `email_principal` | Email |
| `classificacao` | "titular", "familiar", "amigo", "trabalho", "outro" |
| `mensagemAlerta` | Mensagem de notificacao |
| `id_contato` | ID no sistema de origem |
| `id_cliente` | ID do cliente no sistema de origem |

**Contatos de integracao nao podem ser editados.**

---

### PUT `/contato/:id` — Editar contato

Obrigatorios: `nome`, `requerAutenticacaoSempre`, `habilitarAlerta`, `lead`, `historico_email`

---

### GET `/contato/` — Listar contatos

**Filtros:** `nome`, `email_principal`, `"fones.numero"`, `classificacao`, `cli_emp`

**Resposta (item):**
```json
{
  "_id": "...",
  "nome": "Arnold Schwarzenegger",
  "fones": [
    { "numero": "+5549988776655", "tipo": "Celular", "whatsapp": false, "celular": true }
  ],
  "lead": false,
  "classificacao": "",
  "opt_in_opt_out": []
}
```

---

### GET `/contato/:id` — Buscar contato populado

Mesmo retorno com relacionamentos expandidos.

---

### DELETE `/contato/:id` — Remover contato

Nao e possivel excluir contatos que ja realizaram atendimentos.

---

## 8. Etiqueta

### POST `/etiqueta/` — Criar etiqueta

**Body:**
```json
{
  "nome": "Nome da Etiqueta",
  "cor": "blue",
  "tipo": "empresa"
}
```

**Cores disponiveis:** `blue`, `green`, `yellow`, `orange`, `red`, `purple`, `gray`

**Tipo:** `"empresa"` (visivel para todos) ou `"usuario"` (requer `id_criador`)

---

### GET `/etiqueta/` — Listar etiquetas

**Filtros:** `nome`, `id_criador`, `empresa`

**Resposta (item):**
```json
{ "_id": "...", "nome": "Nome da Etiqueta", "cor": "blue" }
```

---

## 9. Notificacao

### POST `/notificacao/send` — Enviar notificacao interna

**Body:**
```json
{
  "users": ["636e3b59d3469e7108b67d49", "636e3b75043d5f805ff40fa8"],
  "type": "alert",
  "title": "Titulo da notificacao",
  "description": "Descricao da notificacao",
  "link": "https://exemplo.com"
}
```

**Campos:**

| Campo | Obrigatorio | Descricao |
|-------|-------------|-----------|
| `users` | nao | Array de IDs. Se vazio, envia para TODOS os usuarios ativos |
| `type` | sim | "alert", "news" ou "survey" |
| `title` | sim | Titulo |
| `description` | sim | Texto da notificacao |
| `link` | nao | URL de redirecionamento |

**Resposta:** array com os IDs das notificacoes criadas.

---

## 10. Departamentos

### POST `/departamento/` — Criar departamento

**Body minimo:**
```json
{
  "nome": "Suporte",
  "status": "A",
  "tipoEncaminhamentoLigacoes": "S"
}
```

**Campos completos:**

| Campo | Obrigatorio | Descricao |
|-------|-------------|-----------|
| `nome` | sim | Nome do departamento |
| `status` | sim | "A" ou "I" |
| `tipoEncaminhamentoLigacoes` | sim | "S" (simultaneo) ou "T" (transbordo) |
| `token` | nao | Token do departamento |
| `ordem` | nao | Posicao na listagem |
| `parametros` | nao | Array: "notifica_ag", "motivo_atendimento", "observacaoAtendimento", "realizaAtendimento" |
| `flowAvaliacao` | nao | ID do fluxo de pesquisa de satisfacao |
| `encerramentoInatividadeAvaliacao` | nao | Minutos de inatividade para encerrar pesquisa |
| `cod_pabx` | nao | Codigo PABX para transferencias |

---

### GET `/departamento/` — Listar departamentos

**Filtros:** `nome`, `token`, `cod_pabx`, `realizaAtendimento`

**Resposta (item):**
```json
{
  "_id": "...",
  "nome": "Teste API",
  "status": "A",
  "ordem": 25,
  "notifica_ag": "I",
  "motivo_atendimento": false,
  "realizaAtendimento": false,
  "observacaoAtendimento": false,
  "flowAvaliacao": null,
  "encerramentoInatividadeAvaliacao": 30,
  "tipoEncaminhamentoLigacoes": "S"
}
```

---

### GET `/departamento/:id` — Buscar departamento populado

Mesmo retorno com relacionamentos expandidos.

---

### PUT `/departamento/:id` — Editar departamento

Obrigatorios: `nome`, `status`, `tipoEncaminhamentoLigacoes`, `cod_pabx`

---

## 11. Motivos de Atendimento

### GET `/atendimento/motivo` — Listar motivos

**Filtros:** `motivo`, `departamentos` (ID do departamento)

**Resposta (item):**
```json
{ "_id": "...", "motivo": "Suporte tecnico", "departamentos": ["..."] }
```

---

### GET `/atendimento/motivo/:id` — Buscar motivo especifico

---

## 12. Periodos de Atendimento

### GET `/atendimento/periodo` — Listar periodos

**Filtros disponiveis:**

| Campo | Descricao |
|-------|-----------|
| `nome` | Nome do periodo |
| `departamento` | ID do departamento |
| `ativo` | boolean |
| `periodos.segunda` ... `periodos.domingo` | boolean por dia |
| `periodos.feriado` | boolean |
| `periodos.horaInicio` | ISO timestamp, ex: "1970-01-01T08:00:00.000Z" |
| `periodos.horaFim` | ISO timestamp |

**Resposta (item):**
```json
{
  "_id": "5fd0dc3f29ed4439abb789d3",
  "nome": "Comercial",
  "ativo": true,
  "periodos": [
    {
      "nome": "Manha",
      "segunda": true,
      "terca": true,
      "quarta": true,
      "quinta": true,
      "sexta": true,
      "sabado": true,
      "domingo": false,
      "feriado": false,
      "horaInicio": "1970-01-01T08:00:00.000Z",
      "horaFim": "1970-01-01T12:00:00.000Z"
    }
  ]
}
```

---

### GET `/atendimento/periodo/:id` — Buscar periodo especifico

---

## Resumo dos endpoints (referencia rapida)

| Metodo | Endpoint | Acao |
|--------|----------|------|
| GET | `/atendimento` | Listar com filtros |
| GET | `/atendimento/:id` | Buscar populado |
| POST | `/atendimento/:id/observacao` | Criar observacao |
| POST | `/atendimento/:id/etiqueta` | Adicionar etiqueta |
| DELETE | `/atendimento/:id/etiqueta/:id_etiqueta` | Remover etiqueta |
| GET | `/atendimento/mensagem` | Listar mensagens (filtro por `id_rota`) |
| GET | `/atendimento/mensagem/:id` | Buscar mensagem populada |
| POST | `/atendimento/mensagem/send` | Enviar mensagem (texto ou midia) |
| GET | `/canal-comunicacao/` | Listar canais |
| GET | `/canal-comunicacao/:id` | Buscar canal populado |
| GET | `/canal-comunicacao/:id/template` | Templates do canal |
| GET | `/canal-comunicacao/:id/template/limites-diarios-envio` | Limite diario |
| GET | `/template` | Listar templates |
| GET | `/template/:id` | Buscar template populado |
| POST | `/template/send` | Enviar template |
| POST | `/cliente/` | Criar cliente |
| PUT | `/cliente/:id` | Editar cliente completo |
| PATCH | `/cliente/:id` | Editar cliente parcial |
| GET | `/cliente/` | Listar clientes |
| GET | `/cliente/:id` | Buscar cliente populado |
| DELETE | `/cliente/:id` | Remover cliente |
| GET | `/usuario/` | Listar usuarios |
| POST | `/contato/` | Criar contato |
| PUT | `/contato/:id` | Editar contato |
| GET | `/contato/` | Listar contatos |
| GET | `/contato/:id` | Buscar contato populado |
| DELETE | `/contato/:id` | Remover contato |
| POST | `/etiqueta/` | Criar etiqueta |
| GET | `/etiqueta/` | Listar etiquetas |
| POST | `/notificacao/send` | Enviar notificacao interna |
| POST | `/departamento/` | Criar departamento |
| GET | `/departamento/` | Listar departamentos |
| GET | `/departamento/:id` | Buscar departamento populado |
| PUT | `/departamento/:id` | Editar departamento |
| GET | `/atendimento/motivo` | Listar motivos |
| GET | `/atendimento/motivo/:id` | Buscar motivo |
| GET | `/atendimento/periodo` | Listar periodos |
| GET | `/atendimento/periodo/:id` | Buscar periodo |

---

## Notas criticas para o projeto VIP Online

### Polling de mensagens para substituir IA do OPA

O OPA nao tem webhook por mensagem. O fluxo alternativo:

1. Webhook "Atendimento Movimentado" dispara ao assumir atendimento
2. N8N faz polling em `GET /atendimento/mensagem` com `id_rota = atendimento._id`
3. Filtra mensagens com `tipoDestinatario: "usuarios"` (vindas do cliente)
4. Ordena por `data` para detectar novas mensagens
5. Envia para Claude/GPT diretamente
6. Responde via `POST /atendimento/mensagem/send`

### Endpoints mais usados no dia a dia

- `POST /atendimento/:id/observacao` — contexto pre-atendimento
- `POST /atendimento/:id/etiqueta` — classificacao automatica
- `GET /atendimento/mensagem` — leitura de conversa
- `POST /atendimento/mensagem/send` — resposta via N8N/IA
- `POST /template/send` — cobranca proativa
- `POST /notificacao/send` — alertas de tickets esquecidos

### Atendentes VIP Online

| Nome | ID |
|------|----|
| Nadja | 668d7fdd... |
| Livanir | 680f9b99... |
| Jamilly | 662f8761... |
| Georgia | 68b5c2f6... |

---

## Relacao com outras notas

- [[Decisoes]]
- [[Workflow Unificado]]
- [[Assistente Luiza]]
- [[Assistente Victor]]
- [[IXC Provedor API]]
