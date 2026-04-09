# Workflow 01 — CTA Lead Detector

**Arquivo:** `C:\Users\thiag\OPA_SUITE\N8N_Workflows\01_CTA_Lead_Detector.json`
**Status:** Pronto para importar — aguardando configuração do webhook OPA e credenciais IXC
**Criado em:** 2026-03-27

---

## O que faz

Quando chega uma mensagem no WhatsApp, verifica se o texto corresponde a um CTA conhecido do site `viponline.net.br`. Se sim, enriquece automaticamente o atendimento no OPA e registra como lead no IXC CRM.

## Fluxo

```
Webhook OPA — Nova Mensagem
    ↓
Detectar CTA do Site (Code JS)
    ↓
É Lead do Site? (IF)
    ├── SIM →
    │   OPA: Aplica "Lead Site" (master)
    │       ↓
    │   OPA: Aplica etiqueta de produto
    │       ↓
    │   OPA: Adiciona observação com contexto
    │       ↓
    │   IXC: Registra em /crm_canditados
    │
    └── NÃO → Ignorar (no-op)
```

## Etiquetas Criadas no OPA

| Nome | ID | Cor |
|------|----|-----|
| Lead Site | 69c727a7ba9a36bf3d29b620 | green |
| Lead Site — Residencial | 69c727a8a1a95d76fd97b651 | red |
| Lead Site — Empresarial PME | 69c727a84e349ac2356a8fa3 | orange |
| Lead Site — VIP Mobile | 69c727a8ec24a6bd2c029004 | yellow |
| Lead Site — PABX | 69c727a9ba9a36bf3d29b62b | blue |
| Lead Site — Câmeras | 69c727a9a1a95d76fd97b65c | purple |
| Lead Site — ISP | 69c727aa4e349ac2356a8fae | gray |

## Padrões Detectados

| Produto | Trigger (regex) | Temperatura |
|---------|----------------|-------------|
| Residencial 600M | `Essencial Connect` | HOT |
| Residencial 800M | `VIP Ultra` | HOT |
| Residencial 1G | `VIP Infinity` | HOT |
| Oferta Novo Cliente | `oferta exclusiva` | HOT |
| Residencial (dúvida) | `dúvida sobre os planos VIP Online` | MORNO |
| PME | `montar proposta para` | HOT |
| Enterprise | `projeto Enterprise` | HOT |
| VIP Mobile | `VIP Mobile` | MORNO |
| PABX | `PABX` | QUENTE |
| Câmeras | `câmera*residencial / câmera*empresa` | QUENTE |
| ISP | `sou um provedor` | B2B |

## Pendências para Ativar

1. **Webhook OPA** — configurar no OPA Suite a URL:
   ```
   http://SEU_IP_N8N:5678/webhook/cta-lead-vip
   ```
   Evento: nova mensagem recebida (primeiro contato)

2. **Ajustar payload** — verificar os campos do webhook OPA no nó "Detectar CTA do Site":
   - Linha `messageText` — ajustar caminho para o texto da mensagem
   - Linha `atendimentoId` — ajustar caminho para o ID do atendimento
   - Linha `contactName` / `contactPhone` — ajustar caminhos

3. **IXC CRM** — no nó "IXC — Registrar Lead CRM":
   - Substituir `SEU_DOMINIO_IXC` pela URL real
   - Substituir `COLE_AQUI_BASE64_DE_USUARIO:SENHA` pelo Base64 das credenciais IXC
   - Verificar campos aceitos pelo `/crm_canditados` (podem variar por versão)

## Como Gerar o Base64 das Credenciais IXC

```bash
echo -n "usuario:senha" | base64
```

---

## Observação Gerada (exemplo)

```
📌 Origem: Lead Site — Residencial
📦 Produto: Internet Residencial 800Mbps
🎯 Intenção: contratar_plano
🌡️ Temperatura: HOT
💬 Msg: "Olá! Quero assinar o plano de VIP Ultra por 129.9."
```
