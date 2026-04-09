# Webhooks do OPA Suite - Eventos Disponiveis

> Observacao historica: esta nota ainda guarda exemplos de homologacao com tunnels temporarios usados durante os testes. Nao trate URLs de `trycloudflare` daqui como configuracao atual de producao.

## Status
Mapeamento em andamento. A integracao de homologacao com o n8n ja ficou definida e validada no lado do n8n/guard.

---

## Eventos esperados

| Evento | Descricao | Usado em |
|--------|-----------|----------|
| `novo_atendimento` | Quando um atendimento e aberto | Etiquetagem automatica |
| `transferencia_humano` | Quando bot transfere para atendente | Contexto pre-atendimento |
| `encerramento` | Quando atendimento e encerrado | Relatorios |
| `mensagem_recebida` | Nova mensagem do cliente | Entrada hibrida / IA |

---

## Como configurar no OPA

O OPA Suite tem suporte a integracao HTTP generica na Opa! Store:

- Acesso: `Integracoes -> Http -> Instalar`
- Campos observados no card: `nome`, `permitir conexao insegura`, `url`, `token`, `conteudo adicional a encaminhar (json)`

## Configuracao recomendada de homologacao

### Cadastro principal

| Campo | Valor recomendado |
|------|-------------------|
| `nome` | `N8N VIP Online - Entrada Hibrida (Homologacao)` |
| `permitir conexao insegura` | `Nao` |
| `url` | `https://meters-bicycle-missouri-median.trycloudflare.com/ingress-c566b8def730?secret=261cc219bbf843d1bd9c420861c4687a` |
| `token` | `261cc219bbf843d1bd9c420861c4687a` |
| `conteudo adicional a encaminhar (json)` | ver exemplos abaixo |

### Conteudo adicional - nova mensagem

```json
{
  "source": "opa",
  "event": "nova_mensagem"
}
```

### Conteudo adicional - transferencia

```json
{
  "source": "opa",
  "event": "transferencia"
}
```

### Conteudo adicional - segunda via forcada

```json
{
  "source": "opa",
  "event": "segunda_via"
}
```

### Observacao importante

Na homologacao atual, a URL publica acima aponta para um `webhook guard` local, que por sua vez encaminha para:

```text
/webhook-test/vip-online
```

Isso permite testar sem ativar o webhook de producao nem expor o editor inteiro do n8n.

Quando a validacao terminar, a ideia e manter a mesma URL do OPA e trocar apenas o destino interno do guard para:

```text
/webhook/vip-online
```

---

## Validacao de credenciais

### OPA

- token validado com sucesso em chamada de leitura
- endpoint testado: `GET /api/v1/canal-comunicacao/`

### IXC

- token validado com sucesso em chamada de leitura segura
- endpoint testado: `cliente`
- observacao: o cliente HTTP do PowerShell nao aceitou `GET + body`, entao a validacao de credencial foi fechada com `POST` de leitura

---

## Pendencias

- [ ] Confirmar quais eventos do OPA conseguem disparar webhook automaticamente
- [ ] Confirmar como o OPA transmite o campo `token` no request final
- [ ] Testar callback real do OPA -> guard -> n8n
