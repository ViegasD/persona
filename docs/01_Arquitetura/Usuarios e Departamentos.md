# Usuários e Departamentos — Snapshot Operacional

**Atualizado em:** 2026-03-27
**Fonte:** API OPA Suite (500 atendimentos Jan–Mar 2026)

---

## Departamentos Ativos (após limpeza)

| Nome | ID | Token | Obs |
|------|----|-------|-----|
| Comercial | 5bf73d1d186f7d2b0d647a60 | 20 | Principal |
| Suporte | 5bf73d1d186f7d2b0d647a61 | 19 | |
| Financeiro | 5d1624085e74a002308aa25e | 22 | |
| Renegociações | 5d1629315e74a002308aa262 | 23 | |
| Bot | 5d1623f35e74a002308aa25d | 21 | Victor entra aqui |
| Ouvidoria | 5bf73d1d186f7d2b0d647a64 | 16 | Baixo uso |

**Inativados em 2026-03-27:** teste, Dueré, Figueirópolis, Formoso do Araguaia, Lagoa da Confusão, Peixe

**Alerta:** todos os departamentos com `inatividade.expirationTime = 2592000s (30 dias)` — fila nunca expira.

---

## Usuários Ativos

| ID | Nome | Tipo | Atend Jan-Mar | Perfil |
|----|------|------|---------------|--------|
| 668d7fdd0c342f9bf23176c5 | Nadja Ferreira | user | 91 | Generalista — Comercial+Suporte+Financeiro |
| 680f9b99836e64904f92f5ce | Livanir | user | 64 | Comercial (81%) |
| 662f87616864d033eebd6411 | Jamilly Sousa | user | 47 | Misto — muito overflow Bot |
| 68b5c2f62526439c8f281d8d | Georgia Wortmam | user | 45 | Maioria Bot/overflow |
| 650844515edec51d4a077c94 | Elana | user | 2 | Baixíssima atividade |
| 5d1642ad4b16a50312cc8f4d | Víctor | bot | 104 | Bot principal |
| 66717b8baf17ec19a8bdb6f8 | Victor antigo | bot | 0 | Inativo na prática — deveria ser desativado |
| 68ff84d0aee43d5538982ee4 | opaSuiteCallCenter | callCenter | 59 | Bot overflow |
| 61547ced8df1a2553e866663 | Administrador | user | 0 | Admin |
| 66d6f34683705ff0352e992b | Alana Cristina | user | 0 | Sem atividade registrada |
| 6970bc729738e07da5a02073 | Antônio Neto | user | 0 | Gerência |
| 69c599494e349ac23569b47b | Carolaine | user | 0 | Novo cadastro |
| 67b5e93d836e64904f7ce4c2 | Clean Tavares | user | 0 | Sem atividade |
| 68a314ea5ad367625e5308b6 | Idemar Junior | user | 0 | Sem atividade |
| 64282a7e1297ae880f5e5559 | Suporte | user | 0 | Usuário genérico |
| 6432f7c713aec02f263a8acb | Suporte 2 | user | 0 | Usuário genérico |
| 68f2a7991a45eadce1c9e39d | Suporte Vip 01 | user | 0 | Usuário genérico |
| 681d1984167b6a3e83129114 | Thiago Tavares | user | 0 | Dono do token API |

---

## Distribuição Real por Departamento

| Atendente | Comercial | Suporte | Financeiro | Bot | Total |
|-----------|-----------|---------|------------|-----|-------|
| Nadja Ferreira | 45 | 24 | 18 | 4 | 91 |
| Livanir | 52 | 8 | 4 | — | 64 |
| Jamilly Sousa | 14 | 4 | 3 | 26 | 47 |
| Georgia Wortmam | 1 | 3 | — | 41 | 45 |
| Elana | 1 | — | — | 1 | 2 |

> "Bot" na coluna de humanos = atendimento iniciado no bot e transferido sem trocar o setor

---

## Alertas Identificados

1. **Nadja é ponto único de falha** — 91 atend, único perfil que cobre tudo com volume real
2. **Fila nunca expira** — 30 dias de timeout em todos os setores
3. **Georgia e Jamilly no Bot** — provavelmente recebendo overflow sem setor correto
4. **Victor antigo (bot) ainda ativo** — sem atendimentos mas ativo no sistema
5. **10 usuários ativos sem nenhum atendimento** — usuários genéricos (Suporte, Suporte 2) nunca recebem nada
6. **Sem distribuição automática configurada** — todos usam `tipoEncaminhamentoLigacoes: S` mas sem regras de balanceamento visíveis
