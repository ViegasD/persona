# Ensaio Digital — Funil WhatsApp com IA

Sistema de funil de vendas via WhatsApp que captura leads, coleta preferências, processa pagamento e gera ensaios fotográficos profissionais com IA.

## Stack

- **Backend**: Node.js + Fastify 5 + TypeScript
- **Frontend**: Next.js 15 + TailwindCSS 4
- **Banco de dados**: PostgreSQL 16 + Prisma 6
- **Filas**: Redis 7 + BullMQ 5
- **WhatsApp**: Evolution API v2.3.7
- **Pagamento**: Mercado Pago (Checkout Pro)
- **Geração de imagens**: Kie.ai (Nano Banana 2)
- **Storage**: AWS S3 / MinIO

## Pré-requisitos

- Node.js 20+
- pnpm 9+
- Docker e Docker Compose

## Setup

```bash
# 1. Clonar e instalar dependências
pnpm install

# 2. Subir serviços locais (Postgres, Redis, MinIO)
docker compose up -d

# 3. Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais

# 4. Rodar migrations do banco
pnpm db:migrate

# 5. Gerar client Prisma
pnpm db:generate

# 6. Iniciar em modo desenvolvimento
pnpm dev:backend   # Backend na porta 3000
pnpm dev:web       # Frontend na porta 3001
```

## Estrutura do Projeto

```
ensaio/
├── apps/
│   ├── backend/          # API + Workers (Fastify + BullMQ)
│   │   ├── prisma/       # Schema e migrations
│   │   └── src/
│   │       ├── modules/  # Módulos do domínio
│   │       │   ├── whatsapp/    # Integração Evolution API
│   │       │   ├── funnel/      # Máquina de estados do funil
│   │       │   ├── payment/     # Mercado Pago
│   │       │   ├── image-gen/   # Kie.ai + processamento
│   │       │   ├── gallery/     # API da galeria de aprovação
│   │       │   ├── delivery/    # Entrega + upsell
│   │       │   └── analytics/   # Métricas e admin
│   │       └── shared/   # Config, DB, S3, filas, middleware
│   └── web/              # Next.js (galeria de aprovação)
├── docker-compose.yml    # Postgres, Redis, MinIO
└── .env.example
```

## Fluxo do Funil

1. **Captura**: Lead envia mensagem no WhatsApp
2. **Qualificação**: Bot coleta nome e apresenta oferta
3. **Preferências**: Coleta estilo, cenário e fotos de referência
4. **Pagamento**: Gera link Mercado Pago, aguarda confirmação
5. **Geração**: Após pagamento, envia para Kie.ai via BullMQ
6. **Aprovação**: Galeria web (Next.js) para seleção das fotos
7. **Entrega**: Fotos aprovadas enviadas via WhatsApp
8. **Upsell**: Follow-up automático 24-48h depois

## API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/webhooks/evolution` | Webhook Evolution API |
| POST | `/api/webhooks/mercadopago` | Webhook Mercado Pago |
| GET | `/api/gallery/:token` | Dados da galeria |
| POST | `/api/gallery/:token/approve` | Aprovar seleção |
| GET | `/api/gallery/:token/status` | Status da sessão |
| GET | `/api/admin/analytics` | Métricas do funil |
| GET | `/api/admin/costs` | Custos Kie.ai |
| GET | `/api/admin/leads` | Lista de leads |
| GET | `/api/admin/leads/:id` | Detalhe do lead |
| GET | `/api/health` | Health check |

## Filas BullMQ

| Fila | Função |
|------|--------|
| `image-generation` | Geração de imagens via Kie.ai |
| `delivery` | Entrega de fotos via WhatsApp |
| `upsell` | Follow-up e reengajamento |
| `analytics` | Registro de eventos |
| `whatsapp-send` | Envio de mensagens WhatsApp |

## Variáveis de Ambiente

Veja `.env.example` para todas as variáveis necessárias.
