---
tipo: governanca
status: ativo
atualizado: 2026-04-03
tags: [governanca, padrao, llm, obsidian, segundo-cerebro]
---

# Padrao do Vault e Guia para LLMs

> Este vault e a fonte de verdade do projeto VIP Online.
> Se algo estiver nos JSONs, nas notas ou nas decisoes, isso vale mais do que memoria de conversa.

## Objetivo

Organizar o Obsidian como um cerebro operacional para:

- atendimento avancado
- vendas assistidas por humano
- suporte com escalonamento humano
- financeiro altamente automatizado
- documentacao tecnica para Claude Code, Gemini e manutencao manual

## Ordem de confianca

Quando houver conflito entre fontes, seguir esta prioridade:

| Prioridade | Fonte | Regra |
|------------|-------|-------|
| 1 | Execucao real / teste recente | Vale mais do que qualquer documento |
| 2 | JSON exportado do fluxo / colecao | Reflete a implementacao atual |
| 3 | Nota tecnica atualizada | Serve como referencia operacional |
| 4 | Log de progresso | Registra o que foi feito e o que falta |
| 5 | Memoria da conversa | Nunca usar como unica fonte para decisao tecnica |

## Producao primeiro

Toda homologacao deste projeto deve refletir o caminho real de producao.

Regra pratica:

- se um teste funcionar, ele deve poder ser promovido para producao sem exigir nova mudanca estrutural
- testes temporarios so sao aceitaveis quando nao alteram a arquitetura final
- evitar montar fluxo de teste que depois precise ser refeito para operar de verdade
- preferir ajuste de parametro, seguranca, volume ou ativacao a refatoracao estrutural depois do teste
- sempre pensar no comportamento final antes de implementar o caminho de homologacao

## Como o vault deve ser usado

### Para humanos

- encontrar rapidamente a decisao certa
- entender por que algo foi feito de um jeito especifico
- localizar o fluxo, a API ou o webhook relacionado
- registrar pendencias sem perder historico

### Para LLMs

- comecar por `[[Resumo Atual para IAs]]` quando a tarefa exigir contexto rapido de onboarding
- ler o contexto antes de sugerir mudanca
- nao inventar IDs, rotas ou credenciais
- nao sobrescrever notas sem respeitar o padrao
- sempre atualizar a nota correspondente quando mudar um fluxo

## Padrão editorial

### Estrutura ideal de uma nota tecnica

1. Frontmatter curto com metadados
2. Contexto em uma frase
3. O que o artefato faz
4. Estrutura ou inventario
5. Exemplos de payload ou uso
6. Regras e armadilhas
7. Relacionamentos com outras notas
8. Pendencias e proximo passo

### Regra de ouro

Uma nota tecnica precisa responder:

- o que e
- para que serve
- como usa
- o que pode dar errado
- o que depende dela

## Nomeacao

### Pastas

- `00_Governanca` para padroes e regras do vault
- `01_Arquitetura` para decisoes e visao macro
- `02_API` para integracoes externas e contratos
- `03_Webhooks` para eventos de entrada e saida
- `04_Workflows` para documentacao de fluxos n8n
- `05_Log` para historico e backlog

### Arquivos

- usar nomes descritivos, sem siglas obscuras
- evitar versoes no nome quando a nota for viva
- usar sufixo de data apenas em logs, exports e snapshots
- manter um arquivo por assunto principal

## Convenções para outras LLMs

### Antes de editar

1. Ler esta nota.
2. Ler a nota do dominio que vai mudar.
3. Conferir o JSON ou export original quando existir.
4. Atualizar o log se a mudanca alterar o estado do sistema.

### Durante a edicao

- manter ASCII quando possivel
- nao apagar conhecimento util por acidente
- preferir acrescentar estrutura a reescrever sem necessidade
- usar links absolutos ao citar arquivos no resultado final

### Depois de editar

- verificar se a nota continua coerente com os JSONs
- atualizar `05_Log/Progresso.md` quando a mudanca for relevante
- registrar novos riscos ou decisoes em `01_Arquitetura/Decisoes.md` se houver impacto tecnico

## Template recomendado para notas de dominio

```md
---
tipo: <dominio>
status: <ativo|rascunho|confirmado|pendente>
atualizado: YYYY-MM-DD
tags: [tag1, tag2]
---

# Titulo

> Resumo de uma linha.

## Contexto

## Estrutura

## Exemplos

## Regras / Armadilhas

## Relacionados

## Pendencias
```

## Template recomendado para notas de workflow

```md
---
tipo: workflow
sistema: n8n
status: <estado>
n8n_id: <id>
atualizado: YYYY-MM-DD
tags: [n8n, workflow]
---

# Nome do workflow

## O que faz
## Fluxo
## Entradas / Saidas
## Dependencias
## Pendencias
## Notas tecnicas
```

## O que nao deve acontecer

- guardar segredo real em nota aberta
- duplicar a mesma informacao em muitas notas sem motivo
- criar nomes genéricos como `novo`, `final`, `teste2`
- misturar documento tecnico com brainstorming sem marcar a diferenca
- inventar endpoint, campo ou regra sem base real

## Como manter o vault vivo

- sempre que um fluxo mudar, atualizar a nota do fluxo e a nota da API envolvida
- sempre que uma decisao mudar, registrar em `Decisoes.md`
- sempre que houver uma implementacao relevante, registrar em `Progresso.md`
- sempre que um endpoint novo aparecer, atualizar a nota da API correspondente

## Relacionados

- [[Bem-vindo]]
- [[Decisoes]]
- [[Arquitetura Modular V2]]
- [[OPA Suite Endpoints]]
- [[IXC Provedor API]]
- [[Workflow Unificado]]
