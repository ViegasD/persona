---
tipo: arquitetura
sistema: n8n
status: planejado
atualizado: 2026-03-31
tags: [n8n, proxmox, migracao, producao, backup, rollback]
---

# Migracao N8N para Proxmox

> Plano pratico para migrar a instancia atual do n8n no Windows para uma VM self-hosted no Proxmox, com persistencia, seguranca e rollback. O foco aqui e planejamento e documentacao. Nenhum workflow deve ser alterado durante esta fase.

Relacionado: [[Acesso ao N8N]] | [[Arquitetura Final Ideal]] | [[Arquitetura Modular V2]] | [[Workflow Unificado]] | [[Progresso]]

---

## Resumo executivo

### Recomendacao principal

Migrar para uma **VM Linux dedicada no Proxmox**, rodando n8n em **Docker Compose**, com:

- `n8n`
- `Postgres`
- `Caddy` ou `Nginx` como reverse proxy de producao
- `Cloudflare Tunnel` apenas como apoio de teste ou contingencia

### Por que este desenho

- reduz risco em relacao a expor o editor do n8n diretamente
- separa aplicacao, banco e proxy de forma clara
- facilita backup, restore e rollback
- encaixa bem com snapshot e backup de VM no Proxmox
- prepara a base para escalar depois sem redesenho total
- aproveita melhor a infraestrutura de rede que voce ja opera como ISP

### Recomendacao de rollout

Fazer em **duas fases logicas**:

1. preparar a VM e restaurar a instancia sem trocar producao
2. executar testes controlados, fazer o corte e manter rollback imediato

Nao recomendo migrar e ativar tudo de uma vez.

---

## Arquitetura recomendada na VM

## Topologia

```text
[Internet]
   -> [Reverse Proxy publico da sua operacao]
   -> [Caddy/Nginx na VM ou proxy de borda]
   -> [n8n]
   -> [Postgres]

[Proxmox]
   -> [VM Ubuntu LTS]
   -> [Disco persistente para dados]
   -> [Backup da VM + backup logico do Postgres]

[Rede interna]
   -> [n8n]
   -> [OPA Suite]
   -> [IXC]
```

## Escolha de plataforma dentro do Proxmox

### Recomendado

- **VM Ubuntu LTS** dedicada ao n8n

### Motivo

- melhor isolamento do que instalar na maquina Windows atual
- operacao mais previsivel para Docker, restore e upgrades
- mais simples de documentar, entregar e manter

### Observacao

Se voce ja usa LXC com padrao forte de operacao, tambem e viavel. Ainda assim, para este projeto eu prefiro **VM** pela portabilidade e pela menor surpresa em upgrades, rede e restore.

## Sizing inicial recomendado

Com base no volume ja documentado no projeto e no escopo atual:

- `2 vCPU`
- `4 GB RAM`
- `40-80 GB` de disco

Se a operacao crescer para mais IA, transcricao, anexos ou workers, subir para:

- `4 vCPU`
- `8 GB RAM`

Isso e uma recomendacao inicial. O corte final deve observar uso real de CPU, memoria e disco durante os testes.

---

## Persistencia de dados

## Banco de dados

### Recomendacao principal

Usar **Postgres** na VM desde o ambiente de producao.

### Motivo

- melhor caminho para confiabilidade e evolucao
- recomendado para cenarios de producao e futuro queue mode
- evita ficar preso em SQLite quando quiser escalar

### Tradeoff

Migrar banco e host ao mesmo tempo aumenta um pouco o risco do corte.

### Alternativa conservadora

Se quiser o menor risco possivel no primeiro corte:

1. subir a VM com a instancia equivalente a atual
2. estabilizar
3. migrar de SQLite para Postgres numa segunda janela

### Minha opiniao

Para este projeto, eu faria **VM + Postgres** ja na primeira ida para producao, mas com rollback claro e backup completo antes do corte.

## Pasta de dados do n8n

Definir um diretorio persistente explicito, por exemplo:

```text
/data/n8n
```

E configurar:

```text
N8N_USER_FOLDER=/data/n8n
```

O n8n criara:

```text
/data/n8n/.n8n
```

Isso preserva:

- settings da instancia
- chave local gerada pelo n8n, se ainda existir
- arquivos auxiliares da base

## Chave de criptografia

### Regra obrigatoria

Definir uma `N8N_ENCRYPTION_KEY` explicita e persistente na VM.

### Motivo

As credenciais do n8n dependem desta chave. Se a chave mudar, as credenciais salvas deixam de abrir corretamente.

### Implicacao pratica

- a chave precisa entrar no cofre operacional da VM
- backup da base sem essa chave nao e backup completo
- se no futuro houver workers, todos precisam compartilhar a mesma chave

## Segredos operacionais deste projeto

Hoje o projeto ja depende de:

- `OPA_TOKEN`
- `IXC_AUTH`

Na migracao:

- manter essas variaveis no ambiente da VM na primeira fase
- nao deixar segredos no Obsidian
- depois do corte, decidir se continua via env vars ou se migra partes para credenciais internas do n8n

## Conectividade com OPA e IXC

### Recomendacao obrigatoria de arquitetura

Na VM do Proxmox, o n8n deve acessar OPA e IXC por **rota interna**, nao pelo hostname publico, sempre que isso for viavel.

### Ordem de preferencia

1. IP privado
2. DNS interno
3. hostname publico, apenas se a rota interna nao existir

### Motivo

- menor latencia
- menos dependencia da borda publica
- evita hairpin NAT
- reduz risco operacional
- troubleshooting mais simples dentro da sua rede

## Binarios e anexos

Como o projeto envia QR code, boleto e anexos, prever persistencia para binarios se a estrategia operacional for manter historico local.

No minimo:

- monitorar crescimento de disco
- separar volume de dados da aplicacao

Se o volume de anexos crescer, vale considerar object storage no futuro. Nao recomendo colocar isso no primeiro corte.

---

## Exposicao publica: reverse proxy ou Cloudflare Tunnel

## Opcao recomendada para producao

### Reverse proxy proprio

Desenho:

```text
Internet
  -> reverse proxy/firewall da sua operacao
  -> n8n
```

### Vantagens

- voce controla a borda
- reduz dependencia de terceiro
- combina melhor com ambiente de ISP
- facilita separar editor administrativo de webhook publico
- fica mais coerente com OPA e IXC ja hospedados na sua rede

### Regras praticas

- publicar somente `80/443`
- manter TLS valido
- restringir o editor do n8n
- expor webhooks de forma controlada

## Opcao secundaria

### Cloudflare Tunnel

Usar como:

- teste
- homologacao
- contingencia
- acesso temporario

### Observacao

Nao recomendo Cloudflare Tunnel como desenho principal de producao para este projeto.

## Minha recomendacao objetiva

Para este projeto:

1. **reverse proxy proprio** como publicacao principal
2. **rota interna** do n8n para OPA e IXC
3. **Caddy/Nginx** como camada HTTP/TLS
4. **Cloudflare Tunnel** apenas como contingencia ou fase de teste

---

## Seguranca

## Regras obrigatorias

- nao expor o n8n cru em `:5678`
- usar `N8N_ENCRYPTION_KEY` fixa
- separar segredos da configuracao versionada
- manter a VM atras de firewall
- restringir acesso administrativo ao editor
- desativar qualquer tunnel temporario antes do corte final

## Medidas recomendadas

### Editor do n8n

- acesso apenas por IP restrito, VPN, ACL de borda ou equivalente
- nunca deixar editor aberto publicamente sem controle

### Webhooks

- expor apenas os endpoints necessarios
- se possivel, diferenciar rota publica de webhook e rota administrativa
- usar segredo compartilhado quando o emissor suportar

### Sistema operacional

- Ubuntu LTS atualizado
- usuario administrativo proprio
- SSH com chave
- sem login root direto
- fail2ban se houver superficie publica

### Docker

- compose versionado fora do vault
- restart policy ativa
- logs persistidos no padrao da stack

---

## Observabilidade

## Saude da instancia

Habilitar e monitorar:

- `/healthz`
- `/healthz/readiness`
- `/metrics`

## O que monitorar

- container do n8n
- container do Postgres
- tunnel ou proxy
- espaco em disco
- uso de memoria
- taxa de erro das execucoes
- workflows com falha recorrente

## Ferramentas praticas

Minimo viavel:

- logs do Docker
- uptime check externo
- alerta basico de indisponibilidade

Melhor desenho:

- `Uptime Kuma` para disponibilidade
- `Prometheus/Grafana` se voce ja usar isso no ambiente

## Logs

Guardar:

- logs do n8n
- logs do proxy
- logs do cloudflared

Pelo menos durante a janela de corte e nos primeiros dias de operacao.

---

## Backup e restore

## Estrategia de backup

Tratar backup em **tres camadas**:

### 1. Backup logico do banco

Se usar Postgres:

- `pg_dump` diario
- retencao curta local
- copia fora da VM se possivel

### 2. Backup do user folder do n8n

Salvar:

- `/data/n8n/.n8n`

Isso cobre settings e artefatos locais importantes.

### 3. Backup operacional de workflows e credenciais

Usar CLI do n8n para export de seguranca:

- `n8n export:workflow --backup`
- `n8n export:credentials --backup`

Observacao:

- export de credenciais descriptografadas existe, mas deve ser usado so em janela controlada e armazenado com rigor

## Proxmox

No Proxmox:

- snapshot antes de upgrade relevante
- backup agendado da VM

### Regra importante

Snapshot de VM ajuda muito, mas **nao substitui** backup logico do banco e do user folder.

## Restore

O restore deve ser ensaiado em ambiente isolado.

Checklist minimo de restore:

1. subir VM ou clone
2. restaurar Postgres
3. restaurar `/data/n8n/.n8n`
4. restaurar `N8N_ENCRYPTION_KEY`
5. restaurar `OPA_TOKEN` e `IXC_AUTH`
6. subir stack
7. validar login, workflows, credenciais e webhook

Se a chave de criptografia nao casar com a base, o restore esta incompleto.

---

## Migracao de workflows, credenciais e variaveis

## O que precisa migrar

- workflows
- credenciais
- variaveis de ambiente operacionais
- chave de criptografia
- configuracao do host externo

## Ordem recomendada

### Opcao A - lift and shift controlado

1. congelar mudancas na instancia Windows
2. fazer backup completo
3. exportar workflows e credenciais por CLI
4. levantar VM
5. subir n8n na VM com a configuracao alvo
6. importar entidades ou restaurar banco
7. validar tudo antes do corte

### Opcao B - restore de base

1. copiar/restaurar a base atual
2. garantir mesma chave de criptografia
3. subir a VM restaurada
4. validar credenciais e workflows

## O que eu faria aqui

### Recomendado

- usar export de workflows e credenciais como backup adicional
- fazer a migracao principal por restore controlado de base + secrets

### Motivo

- reduz risco de perda de metadados
- preserva IDs e configuracao operacional
- simplifica rollback

## Variaveis e secrets

Separar em arquivo de ambiente ou secret store da VM:

- `N8N_ENCRYPTION_KEY`
- `OPA_TOKEN`
- `IXC_AUTH`
- URL externa do n8n
- qualquer secret adicional de proxy ou tunnel

Nao guardar isso no vault.

---

## Arquitetura de escalabilidade

## Fase 1 - recomendada para o corte

Rodar um unico n8n principal com Postgres.

### Motivo

- menor risco
- menos moving parts
- suficiente para o volume atual

## Fase 2 - quando crescer

Se aumentar volume, paralelismo ou tempo de execucao:

- mover para `queue mode`
- adicionar `Redis`
- separar `main`, `webhook processor` e `worker`

### Regra importante

Queue mode pede:

- Postgres
- Redis
- mesma `N8N_ENCRYPTION_KEY` em todos os processos

Nao recomendo entrar em queue mode no primeiro corte sem necessidade real.

---

## Rollback

## Objetivo

Se o corte falhar, voltar rapido para o Windows atual sem improviso.

## Plano de rollback

1. manter a instancia Windows intacta e desligada apenas na hora do corte
2. nao alterar workflows durante a janela de migracao
3. apontar o endpoint publico para a VM so no momento final
4. se houver falha critica, apontar o endpoint de volta para a origem anterior
5. religar a instancia anterior com os mesmos secrets

## Condicoes que disparam rollback

- credenciais nao abrem
- webhook nao recebe
- workflows criticos falham nos testes de corte
- editor fica instavel
- banco ou proxy fica intermitente

## Regra de ouro

Rollback precisa ser mais simples do que o cutover.

---

## Checklist de corte

## Antes da janela

- [ ] VM criada no Proxmox
- [ ] Ubuntu LTS atualizado
- [ ] Docker e Compose instalados
- [ ] volume persistente criado
- [ ] Postgres configurado
- [ ] n8n configurado com `N8N_USER_FOLDER`
- [ ] `N8N_ENCRYPTION_KEY` definida
- [ ] `OPA_TOKEN` e `IXC_AUTH` configurados
- [ ] proxy ou tunnel configurado
- [ ] backup da instancia Windows executado
- [ ] export de workflows e credenciais executado
- [ ] restore de homologacao validado

## Durante a janela

- [ ] congelar mudancas no Windows
- [ ] executar backup final
- [ ] restaurar/importar na VM
- [ ] subir stack
- [ ] validar login
- [ ] validar credenciais
- [ ] validar workflows principais
- [ ] validar URL externa
- [ ] executar testes de corte
- [ ] trocar rota publica para a VM

## Depois do corte

- [ ] monitorar logs
- [ ] monitorar healthz/readiness
- [ ] validar execucoes reais iniciais
- [ ] manter rollback preparado por janela definida

---

## Testes de corte

## Smoke test de plataforma

- [ ] editor abre
- [ ] login funciona
- [ ] workflows aparecem
- [ ] credenciais nao quebraram
- [ ] `/healthz` responde
- [ ] `/healthz/readiness` responde

## Teste funcional do projeto

- [ ] webhook principal recebe evento
- [ ] CTA/lead continua roteando
- [ ] contexto continua enriquecendo
- [ ] financeiro com `1` contrato ativo responde
- [ ] financeiro com `>1` contratos ativos pede escolha
- [ ] diagnostico online responde corretamente
- [ ] diagnostico offline abre OS antes de confirmar ao cliente
- [ ] envio de QR code e boleto funciona

## Teste de falha

- [ ] reiniciar container do n8n
- [ ] reiniciar VM
- [ ] validar se a stack volta sozinha
- [ ] validar se os dados persistiram

---

## Sequencia pratica recomendada

### Fase 0 - Preparacao

1. inventariar a base atual no Windows
2. capturar secrets e chave de criptografia
3. definir compose e volumes da VM

### Fase 1 - Homologacao na VM

1. subir a VM no Proxmox
2. restaurar uma copia
3. validar login, workflows e credenciais
4. validar tunnel/proxy

### Fase 2 - Teste funcional

1. testar webhook
2. testar financeiro
3. testar diagnostico
4. testar anexos

### Fase 3 - Corte

1. congelar alteracoes
2. backup final
3. restore final
4. smoke test
5. trocar rota publica
6. acompanhar

### Fase 4 - Pos-corte

1. operar com observabilidade reforcada
2. registrar incidentes e ajustes
3. decidir se a etapa seguinte sera queue mode ou manter single instance

---

## Decisoes recomendadas

### Recomendadas agora

- VM no Proxmox
- Ubuntu LTS
- Docker Compose
- Postgres
- reverse proxy proprio
- rota interna para OPA e IXC
- Caddy/Nginx local
- `N8N_ENCRYPTION_KEY` explicita
- backups em tres camadas
- rollback pronto antes do corte

### Nao recomendadas agora

- queue mode no primeiro corte
- expor `:5678` publicamente
- migrar logica de workflow junto com a mudanca de host
- depender so de snapshot de VM como estrategia de backup
- depender de Cloudflare Tunnel como unica entrada de producao

---

## Proximos passos

1. detalhar o compose alvo da VM
2. levantar checklist da base atual a ser extraida do Windows
3. preparar um runbook de corte com comandos exatos

---

## Referencias oficiais

- n8n Docs - Deployment environment variables: https://docs.n8n.io/hosting/configuration/environment-variables/deployment/
- n8n Docs - Set a custom encryption key: https://docs.n8n.io/hosting/configuration/configuration-examples/encryption-key/
- n8n Docs - CLI commands: https://docs.n8n.io/hosting/cli-commands/
- n8n Docs - Monitoring: https://docs.n8n.io/hosting/logging-monitoring/monitoring/
- n8n Docs - Queue mode: https://docs.n8n.io/hosting/scaling/queue-mode/
