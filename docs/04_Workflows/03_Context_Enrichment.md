# Workflow 03 — Enriquecimento de Contexto Pré-Atendimento

**Arquivo:** `C:\Users\thiag\OPA_SUITE\N8N_Workflows\03_Context_Enrichment.json`
**Status:** Pronto para importar — aguardando configuração do Card HTTP no fluxo Victor
**Criado em:** 2026-03-28

---

## O que faz

Quando o bot Victor transfere um atendimento para humano, um Card HTTP dispara este workflow. Em ~2 segundos o N8N:
1. Busca o cliente no IXC pelo número de WhatsApp
2. Consulta contrato, faturas recentes e OS abertas
3. Posta uma observação estruturada no atendimento OPA

O atendente abre o ticket e já vê tudo: status do contrato, se tem débito, se tem OS aberta.

---

## Fluxo

```
Webhook N8N (POST /webhook/context-enrichment-vip)
    ↓
Code: Extrair Telefone e ID
    ↓
IXC: POST /cliente  (busca por whatsapp, oper L)
    ↓
IF: Cliente encontrado? (total > 0)
    ├── SIM →
    │   Code: Extrair Dados do Cliente
    │       ↓
    │   IXC: POST /cliente_contrato
    │       ↓
    │   IXC: POST /fn_areceber   (últimas 5 faturas)
    │       ↓
    │   IXC: POST /su_oss_chamado  (últimas 3 OS)
    │       ↓
    │   Code: Formatar Observação
    │       ↓
    │   OPA: POST /atendimento/:id/observacao
    │
    └── NÃO → NoOp (atendimento segue sem contexto)
```

---

## Observação Gerada (exemplo)

```
[N8N] Contexto do Cliente
Cliente: João Silva | CPF/CNPJ: 123.456.789-00
Cidade: Gurupi | Cadastro ativo: Sim
Contrato: ATIVO | Internet: ATIVO
Plano: VIP Ultra 800Mbps
Desbloqueio Confiança: Sim

Faturas recentes:
  - R$ 129.90 | vence 2026-04-05
  - R$ 129.90 | PAGA
  - R$ 129.90 | PAGA

OS recentes:
  - Nenhuma OS aberta
```

---

## Configuração no OPA (Card HTTP no fluxo Victor)

No painel OPA, no fluxo do bot Victor, antes da ação de transferência para humano, adicionar um **Card HTTP**:

| Campo | Valor |
|-------|-------|
| URL | `http://[IP_N8N]:5678/webhook/context-enrichment-vip` |
| Método | POST |
| Body | `{"atendimentoId": "{{atendimento._id}}", "telefone": "{{contato.telefone}}"}` |
| Aguardar resposta | Não (responseMode: onReceived — não bloqueia o fluxo) |

> O N8N responde imediatamente com 200 e processa em background.
> Quando o atendente abrir o ticket, a observação já estará lá.

---

## Campos IXC mapeados

### /cliente
| Campo | Uso |
|-------|-----|
| `id` | Chave para buscas subsequentes |
| `razao` / `fantasia` | Nome do cliente |
| `cnpj_cpf` | CPF ou CNPJ |
| `cidade` | Localidade |
| `ativo` | S/N |
| `whatsapp` | Formato: `(63) 98451-0882` |

### /cliente_contrato
| Campo | Uso |
|-------|-----|
| `status` | A=ATIVO, BL=BLOQUEADO, etc. |
| `status_internet` | Status específico da internet |
| `descricao_aux_plano_venda` | Nome do plano |
| `desbloqueio_confianca_ativo` | S/N |

### /fn_areceber
| Campo | Uso |
|-------|-----|
| `status` | A=aberta, P=paga |
| `data_vencimento` | Data de vencimento |
| `valor` | Valor total |

### /su_oss_chamado
| Campo | Uso |
|-------|-----|
| `status` | F=fechada, A=aberta |
| `tipo` | Tipo da OS |
| `assunto` | Descrição |
| `data_abertura` | Data |

---

## Busca por telefone (lógica)

OPA envia: `5563984510882@c.us`
1. Extrair dígitos: `5563984510882`
2. Remover `55`: `63984510882`
3. DDD: `63`, número: `984510882`
4. Formatar com hífen (9 dígitos → pos 5): `98451-0882`
5. IXC query: `cliente.whatsapp LIKE %98451-0882%`

---

## Pendências para Ativar

1. **Card HTTP no Victor** — adicionar antes da transferência para humano
   - Ajustar campos do payload (`atendimentoId`, `telefone`) conforme variáveis disponíveis no OPA
2. **Verificar se N8N tem IP acessível pelo OPA** — OPA é cloud, N8N é local
   - Se necessário: ngrok, cloudflare tunnel, ou abrir porta no roteador
3. **Testar com atendimento real** — fazer trigger manual no N8N e verificar observação criada

---

## Observações Técnicas

- O Webhook usa `responseMode: onReceived` — responde 200 imediatamente sem bloquear o Victor
- Busca sequencial (não paralela) para simplicidade: ~1-3s de latência total
- Se o cliente não for encontrado no IXC (número não cadastrado), o workflow termina silenciosamente no NoOp
- Para testar sem o OPA, pode-se usar `curl -X POST http://localhost:5678/webhook/context-enrichment-vip -H "Content-Type: application/json" -d '{"atendimentoId":"ID_REAL","telefone":"5563984510882@c.us"}'`
