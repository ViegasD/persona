# Fluxos de Comunicação — Documentação Completa

**Total:** 17 fluxos exportados em 2026-03-27

---

## Lista de Fluxos

| # | Nome | ID |
|---|------|----|
| 1 | _SGI_1.0 Entrada | 66d1ac3d8a0ff7aae62f05db |
| 2 | _SGI_2.0 Entrada Diagnostico | 66d1af8f8a0ff7aae62f1038 |
| 3 | _SGI_Atendimento Comercial | 66d1afaa8a0ff7aae62f104e |
| 4 | _SGI_2.1 Diagnostico financeiro (bloqueio) | 66d1b35b8a0ff7aae62f17d3 |
| 5 | _SGI_2.2 Diagnostico financeiro (Em atraso) | 66d1b3718a0ff7aae62f17ea |
| 6 | _SGI_Atendimento Suporte | 66d1ca1d8a0ff7aae62f35cb |
| 7 | _SGI_3.0 Principal | 66d1ca378a0ff7aae62f35e0 |
| 8 | _SGI_3.3.1 Diagnostico Suporte (Sem conexao) | 66d1d3e38a0ff7aae62f4263 |
| 9 | _SGI_3.1 Comercial | 66d1d4f58a0ff7aae62f42f7 |
| 10 | _SGI_3.2 Financeiro | 66d1d5008a0ff7aae62f430c |
| 11 | _SGI_3.3 Suporte | 66d1d5108a0ff7aae62f4321 |
| 12 | _SGI_3.4 Outras Opcoes | 66d1d5248a0ff7aae62f4337 |
| 13 | _SGI_3.2.1 Segunda via da fatura | 66d1f8368a0ff7aae62f6cc6 |
| 14 | _SGI_3.2.3 Renegociacao | 66d1f87c8a0ff7aae62f6d12 |
| 15 | _SGI_3.3.3 Troca de senha | 6839f349ffdc9cc934cb3694 |
| 16 | Mensagens Iniciais | 6868190a73cddde28e45fe11 |
| 17 | Transferencia Vendas Speed | 691b0ae33c1874874d7b2165 |

---

## Fluxo Principal de Entrada

### _SGI_1.0 Entrada (17 cards)

```
Card 0: Init
Card 1: Saudação → {{nome_usuario}}, {{nome_empresa}}, {{nome_atendente}}
Card 2-5: Condição tipo de cliente (cliente / fornecedor / prospect / prestadorServico)
Card 6-7: Autenticação ERP (CPF/CNPJ) — máx 2 tentativas
Card 8: Pergunta "Você já é nosso cliente?" (Sim / Não)
Card 10: Condição sobre existência do cliente
Cards 11-17: Chamadas para fluxos externos
```

**Autenticação:**
- Prompt: "Por favor, digite seu CPF/CNPJ para continuar."
- Erro: "Ops, o CPF/CNPJ que você digitou é inválido!"
- Máx tentativas: 2
- Falha → transfere automaticamente para _SGI_Atendimento Suporte

---

## Roteamento Principal (_SGI_3.0 Principal)

Menu de 4 opções:
1. **Comercial** → _SGI_3.1
2. **Financeiro** → _SGI_3.2
3. **Suporte** → _SGI_3.3
4. **Outras Opções** → _SGI_3.4

---

## Fluxos de Suporte

### _SGI_3.3.1 Diagnóstico Sem Conexão
- Guia o cliente por diagnóstico de conexão
- Verifica reinicialização do equipamento
- Se não resolver → transfere para técnico humano

### _SGI_3.3.3 Troca de Senha
- Orienta troca de senha do Wi-Fi ou conta
- Integra com ERP para validação

---

## Fluxos Financeiros

### _SGI_3.2 Financeiro
- Submenu: Segunda via / Pagamento / Renegociação / Desbloqueio

### _SGI_3.2.1 Segunda Via da Fatura
- Consulta fatura no ERP
- Envia boleto ou PIX via WhatsApp

### _SGI_3.2.3 Renegociação
- Qualifica a dívida
- Transfere para equipe humana (sem autonomia para negociar)

### _SGI_2.1 Diagnóstico Financeiro (Bloqueio)
- Detecta motivo do bloqueio
- Opções: desbloqueio de confiança via app / pagamento / atendimento humano

### _SGI_2.2 Diagnóstico Financeiro (Em Atraso)
- Apresenta fatura em atraso
- Oferece segunda via e opções de pagamento

---

## Fluxo Comercial

### _SGI_3.1 Comercial / _SGI_Atendimento Comercial
- Qualifica interesse (plano residencial / empresarial / upgrade)
- Tag: Atendimento Comercial
- Transfere para departamento Comercial
- Escalada: **Transferencia Vendas Speed** (36+ usos — mais acionado do sistema)

---

## Variáveis do Sistema

| Variável | Descrição |
|----------|-----------|
| {{nome_usuario}} | Nome do cliente |
| {{nome_empresa}} | Nome da empresa |
| {{nome_atendente}} | Nome do atendente humano |
| tipoCliente | cliente / fornecedor / prospect / prestadorServico |
| voce_ja_e_nosso_cliente | Sim / Não |

---

## Integrações

- **ERP (IXC):** Validação CPF/CNPJ em tempo real, consulta faturas, desbloqueio de confiança
- **Fila/Departamentos:** Suporte especialistas, equipe de vendas
- **Etiquetas:** Atendimento Comercial e outras

---

## Fluxo de Escalada

```
Qualquer falha / fora do escopo
    └── _SGI_Atendimento Suporte (error handler geral)
            └── Transferência manual para humano

Comercial qualificado
    └── Transferencia Vendas Speed (36+ usos)
```
