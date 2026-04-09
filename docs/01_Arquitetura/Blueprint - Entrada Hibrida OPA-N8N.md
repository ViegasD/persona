---
tipo: arquitetura
status: implementado-parcialmente
atualizado: 2026-04-03
tags: [arquitetura, n8n, webhook, polling, idempotencia]
---

# Blueprint - Entrada Hibrida OPA-N8N

> Blueprint tecnico da nova camada de entrada do atendimento.
> O objetivo e receber mensagens com confiabilidade, evitar duplicidade e alimentar os ramos de negocio ja existentes.

Relacionados: [[Sistema de Atendimento - Definicao Mestra]] | [[Workflow Unificado]] | [[Eventos OPA]] | [[Decisoes]]

---

## Decisao oficial

Adotar uma arquitetura hibrida:

- `webhook` como canal principal de entrada
- `polling` como fallback de recuperacao
- `deduplicacao` obrigatoria antes de qualquer resposta ao cliente
- `roteamento unico` para todos os ramos de negocio

Nao refazer o sistema do zero.

Reaproveitar o comportamento ja provado e concentrar a operacao na `V2`, com uma espinha dorsal de entrada mais robusta.

### Status de implementacao em 2026-04-03

- `webhook + normalizacao + dedupe`: ativo na `V2`
- `polling + enriquecimento minimo + reinjecao`: ativo na `V2`
- o comportamento originalmente provado no workflow unificado foi migrado para a `V2` live
- `hotfix ramo 4`: refletido no sub-workflow financeiro da `V2`
- `hotfix ramo 5`: refletido no sub-workflow de diagnostico da `V2`
- proximo passo operacional: continuar testes funcionais somente na `V2`

---

## Por que esta arquitetura

### So webhook nao basta

Riscos:

- webhook nao disparar
- card HTTP do OPA falhar
- tunnel cair
- n8n reiniciar no momento errado
- perda silenciosa de evento

### So polling nao basta

Riscos:

- experiencia mais lenta
- mais chamadas na API do OPA
- maior chance de reler mensagens
- mais complexidade para saber o que ja foi tratado

### Combinacao recomendada

- webhook entrega velocidade
- polling entrega resiliencia
- dedupe garante seguranca operacional

---

## Principio central

Webhook e polling nao podem ter logicas de negocio separadas.

Os dois devem convergir para um mesmo contrato canonico de mensagem e, a partir dali, entrar na mesma pipeline:

1. normalizar
2. deduplicar
3. identificar cliente
4. classificar intencao
5. puxar contexto
6. decidir
7. executar ou transferir

---

## Contrato canonico de mensagem

Toda mensagem recebida, seja por webhook ou polling, deve virar este objeto:

```json
{
  "source": "webhook|polling",
  "eventType": "nova_mensagem|transferencia|segunda_via|diagnostico|outro",
  "messageId": "id-estavel-ou-hash",
  "messageTimestamp": "2026-03-31T12:34:56Z",
  "customerServiceId": "id-do-atendimento",
  "customerId": "id-opa-se-existir",
  "contactName": "Nome do cliente",
  "contactPhoneRaw": "5563984510882@c.us",
  "contactPhoneNormalized": "63984510882",
  "channel": "whatsapp",
  "messageText": "texto original",
  "direction": "inbound",
  "isFirstMessage": false,
  "rawPayload": {}
}
```

### Regras

- `messageId` deve ser o identificador mais estavel possivel
- se o OPA nao fornecer ID unico confiavel, gerar hash com:
  - `customerServiceId`
  - `messageTimestamp`
  - `contactPhoneNormalized`
  - `messageText`
- `rawPayload` deve preservar o payload original para auditoria

---

## Fontes de entrada

### Canal 1 - Webhook principal

Responsabilidade:

- receber eventos quase em tempo real do OPA

Entrada esperada:

- `nova_mensagem`
- `transferencia`
- eventos operacionais que o OPA conseguir emitir

Uso ideal:

- primeira resposta
- triagem
- CTA e lead
- disparo rapido do financeiro
- enriquecimento de contexto na transferencia

### Canal 2 - Polling de fallback

Responsabilidade:

- recuperar mensagens que nao chegaram pelo webhook

Frequencia recomendada:

- a cada 1 minuto

Fontes sugeridas:

- endpoint do OPA de mensagens
- endpoint do OPA de atendimentos, se ajudar a localizar novos itens

Regras:

- nunca responder direto sem passar pela mesma deduplicacao
- nunca assumir que polling encontrou algo inedito
- sempre trabalhar com checkpoint + janela de seguranca

---

## Checkpoint do polling

O polling precisa guardar um estado persistente:

```json
{
  "lastSeenTimestamp": "2026-03-31T12:34:56Z",
  "lastSeenMessageId": "abc123",
  "updatedAt": "2026-03-31T12:35:10Z"
}
```

### Estrategia recomendada

- reler uma pequena janela de seguranca, por exemplo 2 a 5 minutos
- confiar na deduplicacao para descartar o que ja foi tratado

Isso e melhor do que depender de checkpoint estritamente monotono, porque protege contra atrasos e desordem de eventos.

---

## Dedupe e idempotencia

Antes de qualquer acao visivel ao cliente, consultar um registro de mensagens processadas.

### Estrutura minima

```json
{
  "messageId": "id-ou-hash",
  "customerServiceId": "opa-id",
  "sourceFirstSeen": "webhook|polling",
  "firstSeenAt": "2026-03-31T12:34:56Z",
  "status": "processed|ignored|error"
}
```

### Regras

- se `messageId` ja existir com status `processed`, parar
- se estiver `error`, decidir se reprocessa ou envia para fila manual
- registrar a mensagem antes da resposta final, mas de forma que nao gere falso positivo permanente em caso de falha no meio

### Objetivo

Evitar:

- dupla resposta ao cliente
- dupla abertura de chamado
- dupla emissao de financeiro
- repeticao de observacoes no OPA

---

## Espinha dorsal recomendada no workflow

### Camada 1 - Ingestao

- `Webhook - OPA Principal`
- `Cron - Polling Mensagens`
- `OPA - Buscar Mensagens Recentes`

### Camada 2 - Normalizacao

- `Normalizar Webhook`
- `Normalizar Polling`
- `Merge Entrada Canonica`

### Camada 3 - Confiabilidade

- `Gerar Message ID`
- `Consultar Dedupe`
- `IF Ja Processada?`
- `Registrar First Seen`

### Camada 4 - Orquestracao

- `Identificar Cliente`
- `Etiquetar Atendimento`
- `Classificar Intencao`
- `Puxar Contexto Base`
- `Validar Permissao e Risco`

### Camada 5 - Roteamento

- `Rota Financeiro`
- `Rota Suporte L1`
- `Rota Lead/CTA`
- `Rota Transferencia`
- `Rota Humano`

### Camada 6 - Fechamento operacional

- `Registrar Resultado`
- `Atualizar Dedupe`
- `Atualizar Checkpoint`
- `Log/Auditoria`

---

## Como encaixar no workflow atual

### Reaproveitar

- ramo 2: CTA e lead
- ramo 3: enriquecimento de contexto
- ramo 4: financeiro
- ramo 5: diagnostico inicial
- integracoes com OPA e IXC

### Mudar

- hoje os ramos dependem demais de eventos pontuais como `segunda_via` ou `transferencia`
- a nova camada deve partir de `mensagem recebida` e decidir a intencao
- `transferencia` continua existindo como evento especial
- `segunda_via` deixa de depender apenas de card dedicado e passa a poder nascer da classificacao de mensagem

### Resultado esperado

O mesmo workflow continua existindo, mas agora com:

- entrada resiliente
- roteamento mais inteligente
- menos dependencia de cards manuais no OPA
- mais autonomia do n8n

---

## Persistencia recomendada

### Fase inicial

Persistir:

- checkpoint do polling
- tabela de dedupe

Opcao aceitavel:

- mecanismo simples e persistente acessivel pelo n8n self-hosted

### Fase mais madura

Persistir tambem:

- estado de transferencia
- tentativas de execucao
- trilha de auditoria

Recomendacao de arquitetura:

- usar persistencia dedicada e confiavel no ambiente self-hosted
- evitar depender apenas de memoria de workflow

---

## Regras de resposta e seguranca

Nenhuma resposta automatica deve sair antes de validar:

1. a mensagem e nova?
2. a intencao foi entendida com confianca?
3. esta dentro da autonomia permitida?
4. a acao prometida pode ser executada agora?
5. seria melhor transferir para humano?

Se qualquer uma dessas respostas for negativa, o sistema deve:

- pedir confirmacao
- responder com seguranca
- ou transferir

---

## Casos que esta arquitetura precisa cobrir

### Caso 1 - Mensagem chega pelo webhook

- webhook recebe
- normaliza
- dedupe libera
- orquestrador classifica
- ramo executa

### Caso 2 - Webhook falha

- polling encontra a mensagem
- normaliza
- dedupe ve que ela ainda nao existe
- orquestrador executa normalmente

### Caso 3 - Webhook e polling veem a mesma mensagem

- um deles processa
- o outro encontra a mensagem ja registrada
- para sem responder de novo

### Caso 4 - Duas mensagens seguidas

- ambas entram com IDs distintos
- cada uma segue sua propria trilha
- pode existir regra de serializacao por atendimento se necessario

---

## Ordem recomendada de implementacao

1. criar contrato canonico de mensagem
2. implementar entrada via webhook
3. implementar polling de fallback
4. implementar dedupe
5. plugar os ramos atuais na nova espinha dorsal
6. corrigir falhas criticas ja encontradas nos ramos 4 e 5
7. ativar e testar com cenarios reais

---

## Decisao final

O sistema deve evoluir por refatoracao estruturada, nao por reconstrucao total.

Traducao pratica:

- manter o workflow atual como base
- redesenhar a entrada
- centralizar a orquestracao
- proteger com dedupe e checkpoint
- depois corrigir e expandir os ramos de negocio
