---
tipo: operacao
sistema: n8n
status: ativo
atualizado: 2026-03-31
tags: [n8n, acesso, operacao, windows, proxmox]
---

# Acesso ao N8N

> Procedimento para subir o n8n local sem perder a base existente.
> Esta nota registra a armadilha do `N8N_USER_FOLDER` para evitar setup novo desnecessario.

## Contexto

O n8n salva a configuracao no diretório informado em `N8N_USER_FOLDER`, criando uma pasta `.n8n` dentro dele.

Se o valor apontar para a pasta errada, o n8n abre como se fosse uma instalacao nova e pede setup/login novamente.

## Regra principal

Quando quiser usar uma base existente, `N8N_USER_FOLDER` deve apontar para o **diretorio pai** da pasta `.n8n`, e nao para a propria `.n8n`.

### Exemplo no Windows

- Base antiga em `C:\Users\thiag\.n8n`
- Valor correto: `N8N_USER_FOLDER=C:\Users\thiag`
- Resultado esperado: o n8n usa `C:\Users\thiag\.n8n`

### O que nao fazer

- `N8N_USER_FOLDER=C:\Users\thiag\.n8n`

Isso cria uma pasta aninhada:

- `C:\Users\thiag\.n8n\.n8n`

E isso faz o n8n parecer uma instalacao nova.

## Comandos usados aqui

### Subir o n8n com a base original

```bat
cmd /c "set N8N_USER_FOLDER=C:\Users\thiag&& C:\Users\thiag\AppData\Roaming\npm\n8n.cmd start"
```

### Verificar se a porta subiu

```bat
netstat -ano | findstr :5678
```

### Testar a interface

```text
http://localhost:5678
```

## Variaveis operacionais deste projeto

Para esta base local funcionar com os workflows atuais, o processo do n8n precisa subir com estas variaveis de ambiente:

```text
OPA_TOKEN
IXC_AUTH
```

### Regra pratica

- `OPA_TOKEN`: bearer token usado pelos nodes de integracao com o OPA
- `IXC_AUTH`: authorization basic usada pelos nodes de integracao com o IXC

Os scripts geradores e o workflow hardened passaram a consumir essas variaveis por expressao de ambiente, em vez de segredos hardcoded no JSON.

### Observacao importante

Se o n8n for iniciado sem essas variaveis, os nodes HTTP vao carregar, mas as chamadas autenticadas do OPA e do IXC vao falhar em execucao.

## Teste externo seguro no Windows

Para teste externo sem expor o painel inteiro do n8n, o caminho recomendado neste projeto passou a ser:

```text
TryCloudflare -> webhook guard local -> webhook-test do n8n
```

### Desenho

```text
Internet
  -> URL temporaria .trycloudflare.com
  -> webhook guard local (porta 8787)
  -> /webhook-test/vip-online no n8n
```

### Motivo

- evita expor `http://localhost:5678` inteiro
- reduz o risco durante homologacao
- permite testar a logica real do webhook sem ativar cron ou fluxo de producao

### Comportamento do guard

O guard local deve:

- aceitar somente `POST`
- aceitar somente uma rota aleatoria dedicada
- exigir segredo compartilhado em header ou query param
- repassar o payload bruto para o `webhook-test` do n8n

### Variaveis do guard

```text
GUARD_PORT
GUARD_ROUTE
GUARD_SECRET
TARGET_BASE
TARGET_PATH
```

### Regra pratica de teste

Para homologacao segura:

1. abrir o workflow no n8n
2. colocar o `Webhook` em modo de teste
3. enviar a chamada para a URL publica do guard
4. usar o segredo compartilhado no header `x-opa-secret`

### Observacao importante

`TryCloudflare` e adequado para teste e validacao rapida.

Para producao na VM do Proxmox, a recomendacao oficial do projeto e:

- reverse proxy proprio
- editor administrativo restrito
- webhook publico exposto de forma controlada

## Caminhos relevantes neste projeto

| Caminho | Uso |
|--------|-----|
| `C:\Users\thiag\.n8n` | Base original com a conta e os dados existentes |
| `C:\Users\thiag\OPA_SUITE\n8n-data` | Copia de trabalho usada durante o ajuste |
| `C:\Users\thiag\AppData\Roaming\npm\n8n.cmd` | Executavel global do n8n instalado via npm |

## Para o futuro no Proxmox

Quando esta instancia for levada para uma VM self-hosted, o ideal e manter a mesma logica:

1. escolher um diretorio persistente da VM
2. apontar `N8N_USER_FOLDER` para o diretorio pai
3. deixar o n8n criar e usar a pasta `.n8n` ali dentro
4. preservar o banco SQLite ou migrar para o banco final planejado

### Recomendacao pratica

Se a VM tiver um volume dedicado, use algo como:

```text
N8N_USER_FOLDER=/data/n8n
```

E deixe o n8n criar:

```text
/data/n8n/.n8n
```

## Boas praticas

- documentar sempre a pasta real do user folder
- manter a base do n8n em local persistente
- nao misturar ambiente de teste com ambiente principal
- registrar no log quando mudar de maquina ou diretório

## Relacionados

- [[Padrao do Vault e LLMs]]
- [[Decisoes]]
- [[Fluxos N8N]]
- [[Progresso]]
