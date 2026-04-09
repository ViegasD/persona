# Workflows N8N

> Pasta dos exports e das descricoes dos workflows.
> Use esta area junto com [[Padrao do Vault e LLMs]] para manter a documentacao consistente.

## Como importar no N8N

1. Abrir N8N e acessar `Import Workflow`
2. Colar o JSON ou enviar o arquivo exportado
3. Configurar credenciais e URLs de webhook
4. Testar antes de ativar

## Indice de Workflows

- [[01_CTA_Lead_Detector]] - detectar lead de CTA e classificar origem
- [[03_Context_Enrichment]] - enriquecer contexto do atendimento antes do humano
- [[Arquitetura Modular V2]] - arquitetura live atual com orquestrador e sub-workflows
- [[Workflow Unificado]] - legado/rollback preservado

## Regra de manutencao

- manter um note por workflow
- manter o JSON exportado na pasta `N8N_Workflows`
- atualizar o log quando um workflow mudar
- manter o nome visivel do workflow igual ao nome da nota sempre que possivel
