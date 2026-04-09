---
tipo: referencia
sistema: OPA
componente: assistente-ia
status: ativo
atualizado: 2026-03-31
tags: [luiza, financeiro, ia, opa]
---

# Assistente Luiza - Analise do JSON Real

> Referencia oficial baseada no arquivo real `C:\Users\thiag\OPA_SUITE\assistente_luiza_28032026.json`.
> Esta nota substitui inferencias antigas e deve ser usada como fonte de verdade sobre a configuracao atual da Luiza.
> Observacao historica: quando esta nota citar o `Workflow Unificado` como live em `2026-03-31`, isso deve ser lido como fotografia daquela data, nao como estado atual do projeto.

Relacionado: [[Workflow Unificado]] | [[IXC Provedor API]] | [[Decisoes]]

---

## O que o arquivo realmente e

O arquivo salvo no projeto nao e um JSON puro em texto aberto.
Ele veio empacotado como um token JWT cujo payload contem a configuracao da assistente.

### Chaves de topo encontradas

- `name`
- `avatar`
- `isActive`
- `description`
- `sharedTools`
- `flowOfInteraction`
- `instructions`
- `iat`

---

## Resumo estrutural

### Shared tools

- total: `14`
- `5` ferramentas do tipo `transferToFlow`
- `2` ferramentas do tipo `transferToDepartment`
- `3` ferramentas do tipo `addTag`
- `3` ferramentas do tipo `httpRequest`
- `1` ferramenta do tipo `closeCustomerService`

### Fluxo visual interno

- `32` nodes
- `34` edges
- `18` nodes de instrucao
- `13` nodes condicionais
- `1` ponto inicial

### Conclusao estrutural

A Luiza esta configurada como uma combinacao de:

- prompt global forte
- fluxo visual de decisao
- poucas ferramentas HTTP deterministicas
- handoff para fluxos e departamentos do OPA

Isso e uma boa base para governanca, porque mistura IA com rails operacionais.

---

## Ferramentas reais presentes no JSON

### Transferencias para fluxos

| Ferramenta | Tipo | Uso |
|---|---|---|
| `Transferencia suporte` | `transferToFlow` | suporte tecnico |
| `Assinatura do Contrato` | `transferToFlow` | assinatura |
| `Geracao de PIX - IA` | `transferToFlow` | emissao de PIX |
| `Desbloqueio de Confianca - IA` | `transferToFlow` | desbloqueio |
| `Geracao de BOLETO - IA` | `transferToFlow` | emissao de boleto |

### Transferencias de departamento

| Ferramenta | Tipo | Uso |
|---|---|---|
| `Comercial` | `transferToDepartment` | vendas / falar com comercial |
| `Financeiro` | `transferToDepartment` | comprovante ou duvida fora do escopo |

### Etiquetas

| Ferramenta | Tipo | Uso |
|---|---|---|
| `Segunda Via` | `addTag` | pedido de 2a via |
| `Duvidas Financeiras` | `addTag` | duvidas gerais |
| `Atendimento Financeiro` | `addTag` | transferido para humano |

### HTTP Requests

| Nome | Metodo | Endpoint | Papel |
|---|---|---|---|
| `1.0 Busca idClienteOpa` | `GET` | `atendimento` | pega `id_cliente`, `protocolo`, `date` |
| `1.2 Busca IdClienteIxc` | `GET` | `cliente/{{id_cliente}}` | pega o id salvo no OPA para o lookup financeiro |
| `1.4 Busca Fatura` | `GET` | `/fn_areceber` | consulta fatura por `id_contrato` + mes |

### Ferramenta de encerramento

- `Encerramento` (`closeCustomerService`)

---

## Cadeia de lookup real encontrada

No JSON analisado em `2026-03-31`, a cadeia implementada de forma explicita nas ferramentas e:

```text
1.0 GET OPA /atendimento
 -> retorna id_cliente OPA e date

1.2 GET OPA /cliente/{{id_cliente}}
 -> retorna id usado na etapa financeira

1.4 GET IXC /fn_areceber
 -> consulta fatura por id_contrato e mes
```

### Observacao importante

A documentacao anterior do vault falava em um passo `1.3 GET IXC /cliente_contrato`.
Esse passo faz sentido na arquitetura do projeto, mas **na exportacao real da Luiza analisada aqui ele nao apareceu como shared tool**.

Entao a leitura correta e:

- `1.3` pode ter existido em versoes anteriores ou em outra camada
- no JSON atual da Luiza, o lookup exposto como ferramenta termina em `1.4`

---

## Fluxo de atendimento que o JSON descreve

### Ramo: emissao de 2a via

1. identificar que o cliente quer 2a via
2. adicionar etiqueta `Segunda Via`
3. perguntar se o cliente deseja `PIX` ou `boleto`
4. se boleto:
   - perguntar se quer `outro mes` ou `proximo vencimento`
   - executar a cadeia de lookup
   - executar fluxo de boleto
5. se PIX:
   - executar fluxo de PIX depois da confirmacao do cliente

### Ramo: duvidas financeiras gerais

Existem condicionais separadas para:

- vencimentos
- valores
- formas de pagamento
- politicas de cobranca

O comportamento orientado pelo fluxo e:

- primeiro entender sobre qual fatura ou mes o cliente fala
- depois responder
- nao atropelar a ordem da conversa

### Ramo: comprovante / arquivo / foto

- informar transferencia para financeiro humano
- aplicar etiqueta `Atendimento Financeiro`
- transferir para departamento financeiro

### Ramo: desbloqueio de confianca

- executar fluxo especifico de desbloqueio

### Ramo: encerramento

- informar encerramento
- executar ferramenta de fechar atendimento

---

## Regras de negocio fortes da Luiza

### Regras excelentes

- escopo estrito em financeiro
- respostas curtas e objetivas
- proibicao explicita de descontos e condicoes especiais
- validacao obrigatoria da regra dos 10 dias
- transferencia para humano quando sai do escopo ou entra comprovante
- promocao do app depois de atendimentos relevantes
- frase obrigatoria no desbloqueio de confianca

### Regra critica

> Nunca enviar boleto, PIX ou link de pagamento se a fatura estiver a mais de 10 dias do vencimento.

Essa regra esta muito bem definida no prompt da Luiza e foi corretamente absorvida no novo modelo do projeto.

---

## Boas praticas que devemos reaproveitar

### 1. Escopo muito bem fechado

A Luiza nao tenta ser universal.
Ela e boa porque sabe exatamente onde atuar e quando transferir.

### 2. Fluxos conversacionais claros

Ela nao pula para a resposta final.
Faz perguntas intermediarias quando a informacao ainda esta ambigua.

### 3. Mistura IA com ferramenta

O JSON mostra um bom padrao do OPA:

- IA interpreta
- fluxo visual limita o comportamento
- ferramenta executa a acao concreta

### 4. Regras inviolaveis escritas em linguagem operacional

O prompt nao fala genericamente "aja com cuidado".
Ele diz exatamente o que nao pode acontecer.

### 5. Transferencia segura

Quando comprovante entra, ou quando a duvida passa do escopo, a Luiza nao improvisa.
Ela transfere.

---

## Pontos fracos ou confusos da configuracao atual

### 1. Nome de variavel confuso

`{{id_contrato}}` aparece com nome que induz erro.
Na propria documentacao antiga, ele foi tratado como se fosse cliente IXC em alguns momentos.

Para o novo modelo, devemos usar nomes semanticamente corretos, por exemplo:

- `clienteIdOpa`
- `clienteIdIxc`
- `contratoIdIxc`
- `faturaIdIxc`

### 2. Pouca visibilidade de estado conversacional

A Luiza faz perguntas boas, mas o JSON nao deixa um estado conversacional estruturado e auditavel do lado de fora.

No novo modelo, vale registrar estado explicito quando houver:

- escolha de contrato
- escolha de forma de pagamento
- espera de comprovante
- transferencia para humano

### 3. Falta de desambiguacao explicita de multiplos contratos no JSON atual

A cadeia da Luiza leva a busca de fatura por `id_contrato`, o que e bom.
Mas o JSON analisado nao explicita um passo formal de:

- buscar todos os contratos ativos
- detectar mais de um
- pedir ao cliente que escolha o contrato

Como esse cenario existe na base real da VIP Online, o novo modelo **deve** ter essa etapa.

### 4. Dependencia forte de logica conversacional em vez de orquestracao observavel

Para atendimento humano-assistido isso funciona.
Para automacao robusta 24/7 no n8n, precisamos complementar com:

- nodes deterministas
- dedupe
- checkpoint
- logs
- comportamento idempotente

---

## Decisoes aplicadas no novo modelo

Com base na Luiza e nos testes reais do projeto, o novo modelo financeiro vai seguir assim:

### Contratos ativos

- se houver `0` contratos ativos: avisar e parar com seguranca
- se houver `1` contrato ativo: seguir direto
- se houver `mais de 1` contrato ativo: perguntar qual contrato o cliente deseja consultar

### Fatura

- consultar `fn_areceber` por `id_contrato` quando a operacao for de segunda via
- aplicar janela de `10 dias` antes de enviar qualquer documento

### Entrega

- tentar `PIX` primeiro
- se nao houver PIX vinculado, cair para `boleto`

### Escalada

- comprovante, excecao ou duvida fora da politica -> humano

---

## O que ja foi aproveitado no workflow novo

No `Workflow Unificado`, que era o live em `2026-03-31`:

- regra dos 10 dias aplicada
- leituras IXC alinhadas para `GET`
- ramo 4 atualizado para perguntar o contrato quando houver mais de um ativo
- resposta segura quando nao houver contrato ativo
- retomada stateful da escolha do contrato implementada no n8n

### Ponto em aberto

A parte de arquitetura ficou fechada.
O que ainda falta e validacao controlada em execucao real para confirmar:

- resposta com numero da opcao
- resposta com ID do contrato
- repeticao correta das opcoes quando a mensagem vier ambigua

---

## Resumo executivo

A Luiza foi bem configurada pelo pessoal do OPA em tres pilares:

- escopo fechado
- regras fortes
- handoff seguro

O novo modelo do projeto deve copiar isso, mas melhorar em quatro pontos:

- nomes de variaveis sem ambiguidade
- desambiguacao formal de multiplos contratos
- estado conversacional rastreavel
- execucao deterministica no n8n
