---
tipo: arquitetura
status: ativo
atualizado: 2026-03-31
tags: [arquitetura, atendimento, automacao, operacao]
---

# Sistema de Atendimento - Definicao Mestra

> Esta nota define como o sistema de atendimento da VIP Online deve funcionar.
> E a referencia principal para humanos e LLMs antes de alterar fluxos, bots ou automacoes.

Relacionados: [[Decisoes]] | [[Workflow Unificado]] | [[Assistente Luiza]] | [[Assistente Victor]] | [[CTAs do Site]]

---

## Objetivo do sistema

Construir um atendimento padrao ouro para a VIP Online, com automacao avancada, contexto operacional real e transferencia segura para humano quando isso melhorar a experiencia do cliente.

O sistema deve:

- automatizar o financeiro de ponta a ponta
- automatizar triagem, etiquetagem e enriquecimento de contexto
- fazer suporte apenas ate o nivel inicial
- apoiar vendas, mas manter o fechamento com atendentes humanas
- operar com linguagem humana, formal e objetiva
- responder curto por padrao, expandindo apenas quando necessario

---

## Principios do atendimento

1. O sistema deve reconhecer o cliente com o minimo de atrito.
2. O sistema deve entender a intencao antes de responder.
3. O sistema deve puxar contexto real antes de agir.
4. O sistema nunca deve prometer uma acao que nao foi executada.
5. O sistema deve resolver no primeiro contato sempre que isso for seguro.
6. O sistema deve escalar cedo quando um humano for melhor opcao.
7. O cliente nao deve repetir informacoes quando houver transferencia.
8. O financeiro deve funcionar 24/7.
9. O suporte automatizado deve ir so ate diagnostico inicial.
10. A experiencia deve parecer concierge, nao URA.

---

## Escopo de automacao

### Deve automatizar

- financeiro completo
- segunda via
- PIX
- boleto
- desbloqueio dentro da politica
- triagem inicial
- identificacao e etiquetagem
- enriquecimento de contexto
- consulta de status basico de conexao
- sugestao de testes iniciais
- deteccao de leads e CTAs do site

### Nao deve automatizar de ponta a ponta

- venda consultiva
- cancelamento
- reclamacoes sensiveis
- negociacao fora da politica
- suporte acima do nivel inicial

---

## Limites de autonomia

### O sistema pode fazer sozinho

- consultar IXC
- consultar OPA
- consultar contrato, faturas e status
- mandar segunda via
- mandar PIX e boleto
- registrar observacao no OPA
- etiquetar atendimento
- abrir fluxo de triagem
- sugerir testes iniciais

### O sistema so pode fazer com confirmacao explicita

- abrir chamado tecnico
- transferir para humano quando isso for tratado como acao explicitamente visivel ao cliente
- emitir negociacao fora da politica
- reenviar acao que gere expectativa operacional sensivel

---

## Criticos de transferencia para humano

Transferir para humano quando ocorrer qualquer um dos cenarios abaixo:

- duas falhas consecutivas de entendimento ou execucao
- deteccao de irritacao, escalacao emocional ou risco reputacional
- assunto fora do escopo da automacao
- venda consultiva
- suporte acima de diagnostico inicial
- excecao de politica
- inconsistencia de dados entre OPA e IXC
- impossibilidade de executar com confianca

---

## Ordem mental do sistema

Toda mensagem nova deve seguir esta ordem:

1. identificar cliente
2. etiquetar atendimento
3. entender intencao
4. puxar contexto
5. validar permissao e risco
6. responder, executar ou transferir

### Validar permissao e risco significa

- o sistema entendeu com confianca?
- o sistema pode executar isso sozinho?
- precisa confirmacao explicita do cliente?
- existe risco de prometer algo e nao cumprir?
- humano faria melhor neste caso?

---

## Intencoes de entrada obrigatorias

O sistema deve reconhecer pelo menos estas intencoes:

- segunda via
- pagamento
- boleto
- PIX
- desbloqueio financeiro
- sem conexao
- lentidao
- suporte tecnico
- falar com atendente
- lead do site
- duvida comercial
- interesse em plano
- transferencia de contexto
- cobranca

Observacao:

- A biblioteca de CTAs do site e parte obrigatoria da classificacao de entrada.
- Ver referencia em [[CTAs do Site]].

---

## Arquitetura de especialistas recomendada

### Recomendacao oficial

Usar 1 orquestrador central com especialistas por dominio.

### 1. Orquestrador

Responsabilidades:

- receber a mensagem
- normalizar payload
- deduplicar evento
- identificar cliente
- classificar intencao
- puxar contexto base
- decidir o proximo especialista ou transferencia

### 2. Especialista Financeiro

Responsabilidades:

- operar 24/7
- resolver todo o escopo financeiro coberto pela politica
- emitir segunda via, PIX e boleto
- consultar faturas e situacao financeira
- executar desbloqueio dentro das regras

### 3. Especialista Suporte L1

Responsabilidades:

- consultar status basico
- avaliar contrato e login
- verificar sinais iniciais de conectividade
- sugerir testes
- parar antes de suporte avancado

### 4. Especialista Comercial

Responsabilidades:

- detectar lead
- identificar origem e CTA
- aquecer atendimento
- registrar contexto para vendas
- deixar o fechamento para humano

### 5. Camada Humana

Responsabilidades:

- fechamento comercial
- suporte avancado
- excecoes
- reclamacoes sensiveis
- negociacoes fora da politica

---

## Regra de horario

### Financeiro

- deve operar 24/7

### Comercial

- depois das 22h, pode tentar vender e manter conversa util
- o fechamento operacional continua sendo humano

### Suporte

- pode fazer triagem inicial e orientacao
- deve transferir quando passar do nivel inicial

---

## Proatividade

No momento, automacoes proativas devem ficar desenhadas, mas em standby.

Exemplos:

- cobranca automatizada
- aviso de vencimento
- aviso de desbloqueio expirando
- retomada de atendimento parado

---

## Erros inaceitaveis

Os seguintes erros sao inaceitaveis:

- responder errado com confianca
- duplicar mensagem
- prometer acao que nao ocorreu
- nao transferir quando deveria
- executar acao fora da politica
- perder contexto na transferencia

---

## Definicao de padrao ouro para ISP

Para a VIP Online, padrao ouro significa:

- reconhecer o cliente na primeira mensagem
- entender a intencao sem friccao
- puxar contexto automaticamente
- resolver o financeiro por completo
- fazer triagem tecnica inicial com dados reais
- transferir com contexto pronto quando humano for melhor
- manter linguagem formal, humana e objetiva
- evitar textao desnecessario
- operar com alta confiabilidade e rastreabilidade

### Frase guia

Atendimento que reconhece o cliente na primeira mensagem, entende a intencao sem atrito, resolve o financeiro integralmente, faz triagem tecnica com contexto real e transfere para humano so quando isso melhora a experiencia.

---

## Decisao de engenharia para o n8n

### Nao refazer tudo do zero

Recomendacao: aproveitar o workflow existente como base e refatorar a camada de entrada, orquestracao e seguranca operacional.

### O que reaproveitar

- ramo de CTA e lead
- ramo de enriquecimento de contexto
- ramo financeiro
- ramo de diagnostico inicial
- integracoes prontas com OPA e IXC

### O que precisa ser redesenhado

- camada de ingestao de mensagens
- webhook principal + polling de fallback
- deduplicacao
- checkpoint do polling
- regras de transferencia
- governanca de credenciais
- validacoes de seguranca antes de responder

### Justificativa

Refazer tudo do zero hoje aumentaria custo, risco e retrabalho.

O desenho atual ja tem valor real nos ramos de negocio. O problema principal nao e a logica de dominio, e a falta de uma espinha dorsal robusta para ingestao, idempotencia e operacao segura.

Conclusao:

- manter a base atual
- corrigir falhas criticas
- reorganizar a entrada
- fortalecer confiabilidade

---

## Ordem de implementacao recomendada

1. definir contrato canonico de mensagem
2. implementar webhook + polling + deduplicacao
3. ajustar regras de transferencia
4. corrigir falhas criticas dos ramos 4 e 5
5. mover credenciais para estrutura segura
6. ativar e testar por cenario
