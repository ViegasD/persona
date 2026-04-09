# Building an AI-Powered WhatsApp Sales & Support System in n8n

> A complete guide to replicating a production-grade conversational AI funnel using n8n workflows, adapted from the Ensaio Digital architecture for an **internet company** (ISP/telecom) handling sales, support, and retention via WhatsApp.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Core Concepts to Replicate](#2-core-concepts-to-replicate)
3. [Funnel State Machine](#3-funnel-state-machine)
4. [n8n Workflow Structure](#4-n8n-workflow-structure)
5. [Webhook: Receiving WhatsApp Messages](#5-webhook-receiving-whatsapp-messages)
6. [Message Batching & Debounce](#6-message-batching--debounce)
7. [Agent System (LLM per State)](#7-agent-system-llm-per-state)
8. [Conversation History & Context](#8-conversation-history--context)
9. [State Transitions](#9-state-transitions)
10. [Sending Multiple Message Bubbles](#10-sending-multiple-message-bubbles)
11. [Media Handling (Images, Documents)](#11-media-handling-images-documents)
12. [Payment Integration](#12-payment-integration)
13. [Scheduled Follow-ups & Reengagement](#13-scheduled-follow-ups--reengagement)
14. [Database Schema](#14-database-schema)
15. [Complete Workflow: Step by Step](#15-complete-workflow-step-by-step)
16. [Agent Prompts (Templates)](#16-agent-prompts-templates)
17. [Error Handling & Retry](#17-error-handling--retry)
18. [IXC Provedor Integration](#18-ixc-provedor-integration)
19. [OPA Suite Integration](#19-opa-suite-integration)
20. [Production Checklist](#20-production-checklist)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     WhatsApp User                       │
└────────────────────────┬────────────────────────────────┘
                         │
                   ┌─────▼──────┐
                   │  WhatsApp  │  (Evolution API or Cloud API)
                   │   Server   │
                   └─────┬──────┘
                         │ Webhook POST
                   ┌─────▼──────┐
                   │    n8n     │
                   │  Workflow  │
                   │            │
                   │  ┌──────┐  │
                   │  │Debounce│ │  ← Wait node (12s) to batch messages
                   │  └──┬───┘  │
                   │     │      │
                   │  ┌──▼───┐  │
                   │  │State  │ │  ← Read current funnel state from DB
                   │  │Router │ │
                   │  └──┬───┘  │
                   │     │      │
                   │  ┌──▼───┐  │
                   │  │ LLM  │  │  ← GPT-4o-mini (agent per state)
                   │  │ Call │  │
                   │  └──┬───┘  │
                   │     │      │
                   │  ┌──▼────┐ │
                   │  │Send   │ │  ← Multiple bubbles with delay
                   │  │Messages│ │
                   │  └───────┘ │
                   └────────────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         PostgreSQL    Redis     S3/MinIO
         (leads,     (debounce) (media)
          history)
```

### Key Differences: Code vs n8n

| Aspect | Original (Code) | n8n Equivalent |
|--------|-----------------|----------------|
| Queue (BullMQ) | 6 typed queues | n8n Wait nodes + sub-workflows |
| Workers | Background processors | n8n Workflow executions |
| State machine | Code function | Switch node + DB field |
| LLM calls | OpenAI SDK | n8n OpenAI node (JSON mode) |
| Debounce | Redis + BullMQ delay | n8n Wait node + Redis check |
| Webhooks | Fastify routes | n8n Webhook node |
| Cron jobs | BullMQ scheduled | n8n Cron trigger node |

---

## 2. Core Concepts to Replicate

### 2.1 The Funnel is a State Machine

Every customer (lead) has a **current state**. Each state has a **dedicated AI agent** with its own personality and goals. The LLM decides when to transition between states.

### 2.2 Message Batching (Critical)

WhatsApp users send multiple messages quickly:
```
User: "oi"          (message 1)
User: "quero saber" (message 2, 2s later)
User: "sobre planos" (message 3, 1s later)
```

**Without batching**: 3 separate LLM calls → 3 overlapping responses → chaos.

**With batching**: Wait 12 seconds after last message → 1 LLM call with all 3 → 1 coherent response.

### 2.3 LLM Returns Structured JSON

Every LLM call returns:
```json
{
  "messages": ["Oi! 😊", "Como posso te ajudar hoje?"],
  "extractedData": { "name": "João", "plan": "100mb" },
  "shouldTransition": false,
  "reasoning": "Client just greeted, need to understand intent"
}
```

- **messages**: Array of WhatsApp bubbles (sent with delay between each)
- **extractedData**: Data to persist in the lead's session (preferences, selections)
- **shouldTransition**: Whether to advance the funnel to the next state
- **reasoning**: Internal chain-of-thought (debug only, never shown to user)

### 2.4 Multiple Message Bubbles

Don't send a wall of text. Split into 2-3 short bubbles with 1.5–3s delay between each (simulates natural typing). This is the `messages` array from the LLM.

---

## 3. Funnel State Machine

### States for an Internet Company

| State | Agent | Purpose |
|-------|-------|---------|
| `QUALIFYING` | sales | Greet, identify intent (new plan, upgrade, support), collect address/CPF |
| `PLAN_SELECTION` | sales | Present available plans, answer speed/price questions, recommend a plan |
| `SCHEDULING` | scheduling | Collect preferred installation date/time, confirm window |
| `AWAITING_PAYMENT` | payment | Send Pix QR / boleto, answer payment questions |
| `PAID` | — | Payment confirmed (auto-transition) |
| `INSTALLATION_PENDING` | support | Confirm installation date, answer pre-install questions |
| `ACTIVE` | support | General support — troubleshooting, speed tests, invoices |
| `CHURN_RISK` | retention | Win-back offers, discounts, resolve complaints |
| `CANCELLED` | retention | Re-engagement attempts |
| `UPGRADE` | sales | Upsell higher speeds, combos |

### Transition Map

```
QUALIFYING → [PLAN_SELECTION, ACTIVE, CHURN_RISK]
PLAN_SELECTION → [SCHEDULING, AWAITING_PAYMENT, QUALIFYING]
SCHEDULING → [AWAITING_PAYMENT]
AWAITING_PAYMENT → [PAID, PLAN_SELECTION]
PAID → [INSTALLATION_PENDING]
INSTALLATION_PENDING → [ACTIVE]
ACTIVE → [UPGRADE, CHURN_RISK]
CHURN_RISK → [ACTIVE, CANCELLED, PLAN_SELECTION]
CANCELLED → [QUALIFYING]
UPGRADE → [AWAITING_PAYMENT, ACTIVE]
```

### State Selection Logic (n8n Switch Node)

```
IF lead.funnelState == "QUALIFYING"       → Agent: sales
IF lead.funnelState == "PLAN_SELECTION"   → Agent: sales
IF lead.funnelState == "SCHEDULING"       → Agent: scheduling
IF lead.funnelState == "AWAITING_PAYMENT" → Agent: payment
IF lead.funnelState == "ACTIVE"           → Agent: support
IF lead.funnelState == "CHURN_RISK"       → Agent: retention
IF lead.funnelState == "CANCELLED"        → Agent: retention
IF lead.funnelState == "UPGRADE"          → Agent: sales
```

---

## 4. n8n Workflow Structure

You need **3 main workflows** + **2 auxiliary workflows**:

### Workflow 1: `WhatsApp Inbound` (Main)
```
[Webhook] → [Save Message to DB] → [Check Debounce] → [Wait 12s]
→ [Load Lead + History] → [Select Agent] → [Build Prompt]
→ [LLM Call (JSON)] → [Save Extracted Data] → [Check Transition]
→ [Send Messages (loop with delay)] → [Handle Transition]
```

### Workflow 2: `Payment Webhook`
```
[Webhook] → [Verify Signature] → [Fetch Payment Details]
→ [Update Payment Status] → [IF approved → Transition to PAID]
→ [Send Confirmation Message]
```

### Workflow 3: `Scheduled Tasks`
```
[Cron: every 1h] → [Query: leads with stale states]
→ [For each: send reengagement/reminder]
```

### Workflow 4 (sub): `Send Multiple Bubbles`
```
[Input: messages array + phone] → [Loop] → [Send Text] → [Wait 2s]
```

### Workflow 5 (sub): `Handle State Transition`
```
[Input: lead, fromState, toState]
→ [Switch on toState]
→ [Execute transition logic (create payment, schedule install, etc.)]
```

---

## 5. Webhook: Receiving WhatsApp Messages

### Node 1: Webhook (Trigger)

**Type**: Webhook  
**Method**: POST  
**Path**: `/whatsapp-webhook`  
**Response**: Immediately return `200 OK` (respond immediately)

### Handling Evolution API Payloads

```json
{
  "event": "messages.upsert",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false
    },
    "pushName": "João Silva",
    "message": {
      "conversation": "oi quero contratar"
    }
  }
}
```

### Handling WhatsApp Cloud API Payloads

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "5511999999999",
          "type": "text",
          "text": { "body": "oi quero contratar" },
          "id": "wamid.xxx"
        }],
        "contacts": [{
          "profile": { "name": "João Silva" }
        }]
      }
    }]
  }]
}
```

### Cloud API Webhook Verification (GET)

Add a second Webhook node for `GET /whatsapp-webhook`:
```
Response: query.hub.challenge
(only if query.hub.verify_token matches your token)
```

### Node 2: Parse & Validate (Code Node)

```javascript
const body = $input.first().json.body;

// Evolution API
if (body.event === 'messages.upsert') {
  const data = body.data;
  if (data.key.fromMe) return []; // ignore own messages
  
  const jid = data.key.remoteJid;
  if (jid.includes('@g.us')) return []; // ignore groups
  
  const phone = jid.replace('@s.whatsapp.net', '').replace('@lid', '');
  const name = data.pushName || '';
  
  let text = '';
  let messageType = 'text';
  let mediaId = null;
  
  if (data.message?.conversation) {
    text = data.message.conversation;
  } else if (data.message?.extendedTextMessage?.text) {
    text = data.message.extendedTextMessage.text;
  } else if (data.message?.imageMessage) {
    messageType = 'image';
    text = '[image]';
    mediaId = data.key.id;
  }
  
  return [{ json: { phone, name, text, messageType, mediaId, source: 'evolution' } }];
}

// Cloud API
if (body.object === 'whatsapp_business_account') {
  const changes = body.entry?.[0]?.changes?.[0]?.value;
  const msg = changes?.messages?.[0];
  if (!msg) return []; // status update, ignore
  
  const phone = msg.from;
  const name = changes.contacts?.[0]?.profile?.name || '';
  
  let text = '';
  let messageType = msg.type;
  let mediaId = null;
  
  if (msg.type === 'text') {
    text = msg.text.body;
  } else if (msg.type === 'image') {
    text = '[image]';
    mediaId = msg.image.id;
  }
  
  return [{ json: { phone, name, text, messageType, mediaId, source: 'cloud' } }];
}

return []; // unknown payload
```

### Node 3: Upsert Lead (PostgreSQL)

```sql
INSERT INTO leads (phone, name, source, status, created_at, updated_at)
VALUES ($1, $2, $3, 'NEW', NOW(), NOW())
ON CONFLICT (phone) DO UPDATE SET
  name = COALESCE(EXCLUDED.name, leads.name),
  source = EXCLUDED.source,
  updated_at = NOW()
RETURNING id, phone, name, status;
```

### Node 4: Save Inbound Message

```sql
INSERT INTO conversation_messages (id, lead_id, direction, message_type, content, created_at)
VALUES (gen_random_uuid(), $1, 'INBOUND', $2, $3, NOW());
```

---

## 6. Message Batching & Debounce

This is the **most critical** pattern. Without it, rapid messages trigger multiple LLM calls that collide.

### Strategy A: n8n Wait Node (Simple)

```
[Save Message] → [Wait 12 seconds] → [Load ALL recent messages] → [LLM Call]
```

The Wait node naturally batches — if 3 messages arrive within 12s, there will be 3 executions each waiting 12s, but only the LAST one will see all 3 messages. The earlier executions will also fire but their LLM context will include fewer messages.

**Problem**: Multiple LLM calls still fire (wasteful, potential duplicate responses).

### Strategy B: Redis Debounce (Production-Grade)

Use a Redis key to ensure only ONE execution proceeds after the debounce window.

**After saving message, add a Code node:**

```javascript
const redis = require('ioredis');
const client = new redis(process.env.REDIS_URL);

const phone = $input.first().json.phone;
const key = `debounce:${phone}`;
const now = Date.now();

// Set timestamp, only if newer
await client.set(key, now.toString(), 'EX', 30);

// Return phone + timestamp for later check
return [{ json: { phone, debounceTimestamp: now } }];
```

**After the Wait 12s node, check if this execution is still the "winner":**

```javascript
const redis = require('ioredis');
const client = new redis(process.env.REDIS_URL);

const phone = $input.first().json.phone;
const key = `debounce:${phone}`;

const stored = await client.get(key);
const myTimestamp = $input.first().json.debounceTimestamp;

if (stored && stored !== myTimestamp.toString()) {
  // A newer message arrived — this execution loses the race
  return []; // stop processing (empty output = skip)
}

// This execution wins — proceed to LLM
await client.del(key);
return $input.all();
```

### Strategy C: n8n's Built-in Deduplication (If Available)

If your n8n version supports it, use the **Execute Workflow** node with a custom deduplication key set to the phone number + time window.

### Recommended: Strategy B

Always use Redis debounce in production. The 12-second window ensures:
- Fast typers' messages are combined
- Audio/image transcription has time to complete
- Single coherent LLM response

---

## 7. Agent System (LLM per State)

### Architecture: One System Prompt per State

Each funnel state maps to a specialized agent (system prompt). A **Switch** node routes to the correct prompt builder.

### Node: Select Agent (Switch)

```
Route 1: state IN [QUALIFYING, PLAN_SELECTION, UPGRADE]
  → Agent: "sales"

Route 2: state == SCHEDULING
  → Agent: "scheduling"

Route 3: state == AWAITING_PAYMENT
  → Agent: "payment"

Route 4: state IN [ACTIVE, INSTALLATION_PENDING]
  → Agent: "support"

Route 5: state IN [CHURN_RISK, CANCELLED]
  → Agent: "retention"
```

### Node: LLM Call (OpenAI — JSON Mode)

**Model**: `gpt-4o-mini` (fast, cheap, good enough for sales)  
**Temperature**: 0.7  
**Response format**: `json_object`

**System prompt structure:**

```
{systemPromptForAgent}

{leadContextBlock}

IMPORTANT: You MUST respond with a JSON object in this exact format:
{
  "messages": ["string array of WhatsApp bubbles to send (max 3)"],
  "extractedData": {},
  "shouldTransition": false,
  "reasoning": "your internal thought process"
}

Rules:
- messages: 1-3 short WhatsApp messages. Natural, friendly PT-BR.
- Use emojis sparingly (1-2 per message max).
- extractedData: ONLY include fields you confidently extracted.
- shouldTransition: true ONLY when the current stage goal is fully achieved.
- reasoning: explain your decision (never shown to user).
```

### Lead Context Block (injected into every LLM call)

```xml
<lead_context>
  <nome>João Silva</nome>
  <telefone>5511999999999</telefone>
  <endereco>Rua das Flores, 123 - Bairro Centro</endereco>
  <plano_atual>100 Mbps - R$ 99,90</plano_atual>
  <plano_selecionado>300 Mbps</plano_selecionado>
  <status_instalacao>agendada para 15/04 manhã</status_instalacao>
  <estado_funil>PLAN_SELECTION</estado_funil>
  <faturas_abertas>0</faturas_abertas>
  <tempo_cliente>2 anos</tempo_cliente>
</lead_context>
```

### Parsing LLM Response (Code Node)

```javascript
const raw = $input.first().json.message.content;

try {
  const parsed = JSON.parse(raw);
  
  // Validate structure
  if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
    throw new Error('messages array required');
  }
  
  return [{
    json: {
      messages: parsed.messages.slice(0, 3), // max 3 bubbles
      extractedData: parsed.extractedData || {},
      shouldTransition: parsed.shouldTransition === true,
      reasoning: parsed.reasoning || '',
    }
  }];
} catch (e) {
  // Fallback: treat raw LLM output as single message
  return [{
    json: {
      messages: [raw],
      extractedData: {},
      shouldTransition: false,
      reasoning: 'JSON parse failed — fallback',
    }
  }];
}
```

---

## 8. Conversation History & Context

### Loading History (PostgreSQL Node)

```sql
SELECT direction, message_type, content, created_at
FROM conversation_messages
WHERE lead_id = $1
ORDER BY created_at DESC
LIMIT 20;
```

### Building LLM Messages Array (Code Node)

```javascript
const history = $input.first().json.rows; // from DB
const systemPrompt = $('Build Prompt').first().json.systemPrompt;

// Reverse to chronological order
const messages = history.reverse().map(row => ({
  role: row.direction === 'INBOUND' ? 'user' : 'assistant',
  content: row.message_type !== 'text'
    ? `[${row.message_type}: ${row.content}]`
    : row.content,
}));

// Prepend system prompt
messages.unshift({ role: 'system', content: systemPrompt });

return [{ json: { messages } }];
```

### Context Scoping

For returning customers (state: CANCELLED → QUALIFYING), scope the history to **only messages after their last session ended**. This prevents the LLM from reusing old context from a previous support interaction.

```sql
-- Get last session boundary
SELECT updated_at FROM lead_sessions
WHERE lead_id = $1 ORDER BY updated_at DESC LIMIT 1;

-- Then filter history:
WHERE lead_id = $1 AND created_at > $lastSessionDate
```

---

## 9. State Transitions

### When Does a Transition Happen?

The LLM returns `shouldTransition: true` when the current state's goal is complete:

| State | Transition Trigger |
|-------|-------------------|
| QUALIFYING | Address + CPF + intent collected |
| PLAN_SELECTION | Plan chosen and confirmed |
| SCHEDULING | Date/time confirmed |
| AWAITING_PAYMENT | *(Never — payment webhook triggers)* |
| ACTIVE | Customer asks to upgrade or cancel |

### Transition Handler (Switch Node → Sub-workflow)

```
IF fromState == "QUALIFYING" AND toState == "PLAN_SELECTION":
  → No special action (just update state)

IF fromState == "PLAN_SELECTION" AND toState == "AWAITING_PAYMENT":
  → Generate Pix QR code via payment API
  → Send QR image + copy-paste code
  → Update state in DB

IF fromState == "AWAITING_PAYMENT" AND toState == "PAID":
  → Send confirmation message
  → Create installation order
  → Update state to INSTALLATION_PENDING

IF fromState == "ACTIVE" AND toState == "CHURN_RISK":
  → Flag in CRM
  → Send retention offer
```

### State Update Query

```sql
UPDATE lead_sessions SET
  funnel_state = $1,
  preferences = preferences || $2::jsonb,
  updated_at = NOW()
WHERE id = $3;
```

---

## 10. Sending Multiple Message Bubbles

### Why Multiple Bubbles?

Single wall-of-text messages look robotic. Real humans send short separate messages. The LLM returns `messages: ["msg1", "msg2", "msg3"]`.

### Sub-workflow: Send Bubbles

```
[Input: { phone, messages[], source }]
  ↓
[Loop Over Items] → for each message:
  ↓
  [Send WhatsApp Text]  ← HTTP Request to Evolution/Cloud API
  ↓
  [Save Outbound to DB]
  ↓
  [Wait 2 seconds]      ← Simulate typing delay
  ↓
[Next item in loop]
```

### Sending Text via Evolution API (HTTP Request Node)

```
POST {{EVOLUTION_URL}}/message/sendText/{{INSTANCE_NAME}}
Headers: { "apikey": "{{EVOLUTION_API_KEY}}" }
Body:
{
  "number": "5511999999999",
  "text": "Oi João! 😊",
  "delay": 1200
}
```

### Sending Text via Cloud API (HTTP Request Node)

```
POST https://graph.facebook.com/v25.0/{{PHONE_NUMBER_ID}}/messages
Headers: { "Authorization": "Bearer {{TOKEN}}" }
Body:
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "text",
  "text": { "body": "Oi João! 😊" }
}
```

### Stagger Delays

For multiple bubbles, increase delay for each:
- Bubble 1: Send immediately
- Bubble 2: Wait 1.5s
- Bubble 3: Wait 2.5s

This looks natural.

---

## 11. Media Handling (Images, Documents)

### Receiving Images (Cloud API)

When user sends a photo (e.g., comprovante de residência):

```javascript
// 1. Get media URL from Meta
const mediaId = msg.image.id;
const metaRes = await fetch(
  `https://graph.facebook.com/v25.0/${mediaId}`,
  { headers: { Authorization: `Bearer ${token}` } }
);
const { url, mime_type } = await metaRes.json();

// 2. Download actual bytes
const fileRes = await fetch(url, {
  headers: { Authorization: `Bearer ${token}` }
});
const buffer = await fileRes.arrayBuffer();

// 3. Upload to S3 / save locally
// ... store in your storage
```

### Sending Images

**Cloud API** — use `image.link` (URL must be HTTPS and < 5MB):
```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "image",
  "image": {
    "link": "https://your-cdn.com/qrcode.png",
    "caption": "📱 QR Code para pagamento"
  }
}
```

**Evolution API** — use `mediaUrl`:
```json
{
  "number": "5511999999999",
  "mediatype": "image",
  "mimetype": "image/png",
  "caption": "📱 QR Code para pagamento",
  "media": "https://your-s3.com/qrcode.png"
}
```

### Sending Documents (Boleto PDF)

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "document",
  "document": {
    "link": "https://your-cdn.com/boleto.pdf",
    "caption": "Boleto referente ao plano 300 Mbps",
    "filename": "boleto-internet.pdf"
  }
}
```

---

## 12. Payment Integration

### Flow

```
[LLM: shouldTransition=true from PLAN_SELECTION]
  ↓
[Create Pix Payment] → API call to payment provider
  ↓
[Upload QR Code to S3]
  ↓
[Send QR Image + Copy-Paste Code]
  ↓
[Update State: AWAITING_PAYMENT]
  ↓
... user pays ...
  ↓
[Payment Webhook] → separate n8n workflow
  ↓
[Verify signature + fetch payment]
  ↓
[IF approved: Update state → PAID → Send confirmation]
```

### Workflow 2: Payment Webhook

```
[Webhook: POST /payment-webhook]
  ↓
[Verify HMAC Signature] (Code node)
  ↓
[Fetch Payment from Provider API] (HTTP Request)
  ↓
[IF status == 'approved']
  ↓ YES
  [Update Payment in DB: status=APPROVED]
  ↓
  [Update LeadSession: funnelState=PAID]
  ↓
  [Send Confirmation WhatsApp Message]
  ↓
  [Create Installation Order] (optional)
  ↓
  [Update State: INSTALLATION_PENDING]

  ↓ NO (rejected/pending)
  [Log and stop]
```

### Mercado Pago Pix Example (HTTP Request)

```
POST https://api.mercadopago.com/v1/payments
Headers: { "Authorization": "Bearer {{MP_ACCESS_TOKEN}}" }
Body:
{
  "transaction_amount": 99.90,
  "payment_method_id": "pix",
  "description": "Internet 300 Mbps - Primeira mensalidade",
  "external_reference": "session_{{sessionId}}",
  "notification_url": "https://your-n8n.com/webhook/payment-webhook",
  "date_of_expiration": "{{now + 30min ISO 8601}}"
}
```

---

## 13. Scheduled Follow-ups & Reengagement

### Workflow 3: Cron Triggers

#### Payment Reminder (every 15 min)

```
[Cron: */15 * * * *]
  ↓
[Query]
  SELECT ls.id, l.phone, l.name
  FROM lead_sessions ls
  JOIN leads l ON l.id = ls.lead_id
  WHERE ls.funnel_state = 'AWAITING_PAYMENT'
    AND ls.updated_at < NOW() - INTERVAL '20 minutes'
    AND ls.updated_at > NOW() - INTERVAL '2 hours'
  ↓
[For each: Send reminder message]
  "Oi {name}, vi que o pagamento ainda tá pendente! O QR Code vale por 30 min.
   Quer que eu gere um novo? 😊"
```

#### Reengagement (daily)

```
[Cron: 0 10 * * *]  (10am daily)
  ↓
[Query]
  SELECT l.phone, l.name, ls.funnel_state, ls.updated_at
  FROM leads l
  JOIN lead_sessions ls ON l.id = ls.lead_id
  WHERE ls.funnel_state IN ('QUALIFYING', 'PLAN_SELECTION')
    AND ls.updated_at < NOW() - INTERVAL '24 hours'
    AND ls.updated_at > NOW() - INTERVAL '7 days'
  ↓
[For each: Send reengagement with discount]
```

#### Reengagement Tiers

| Time Inactive | Action | Discount |
|---------------|--------|----------|
| 4 hours | Gentle nudge | 0% |
| 24 hours | "Ainda tem interesse?" | 5% off first month |
| 48 hours | Urgency + discount | 10% off first month |
| 7 days | Last chance | Free installation |

---

## 14. Database Schema

### SQL (PostgreSQL)

```sql
-- Leads (customers)
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255),
  cpf VARCHAR(14),
  address TEXT,
  source VARCHAR(50) DEFAULT 'whatsapp',
  status VARCHAR(50) DEFAULT 'NEW',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions (each funnel journey)
CREATE TABLE lead_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  funnel_state VARCHAR(50) NOT NULL DEFAULT 'QUALIFYING',
  preferences JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation history (critical for LLM context)
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL, -- 'INBOUND' or 'OUTBOUND'
  message_type VARCHAR(20) DEFAULT 'text',
  content TEXT,
  whatsapp_message_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_session_id UUID NOT NULL REFERENCES lead_sessions(id) ON DELETE CASCADE,
  provider_payment_id VARCHAR(255),
  amount DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'BRL',
  status VARCHAR(20) DEFAULT 'PENDING',
  payment_method VARCHAR(50),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Installation orders
CREATE TABLE installation_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_session_id UUID NOT NULL REFERENCES lead_sessions(id) ON DELETE CASCADE,
  scheduled_date DATE,
  scheduled_period VARCHAR(20), -- 'morning', 'afternoon'
  status VARCHAR(20) DEFAULT 'PENDING',
  technician_name VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  event_type VARCHAR(100) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_messages_lead_id ON conversation_messages(lead_id);
CREATE INDEX idx_messages_created_at ON conversation_messages(created_at);
CREATE INDEX idx_sessions_lead_id ON lead_sessions(lead_id);
CREATE INDEX idx_sessions_state ON lead_sessions(funnel_state);
CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_leads_status ON leads(status);
```

---

## 15. Complete Workflow: Step by Step

### Main Workflow (Inbound Message)

```
 ┌──────────────┐
 │ 1. Webhook   │  POST /whatsapp-webhook
 │    Trigger   │  (respond 200 immediately)
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │ 2. Parse     │  Code node: extract phone, name, text,
 │    Message   │  messageType, source
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │ 3. Upsert    │  PostgreSQL: INSERT ... ON CONFLICT
 │    Lead      │  Returns leadId
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │ 4. Save      │  PostgreSQL: INSERT conversation_messages
 │    Message   │  direction=INBOUND
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │ 5. Check     │  Code node: Redis SET debounce:{phone}
 │    Debounce  │  with current timestamp
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │ 6. Wait      │  Wait node: 12 seconds
 │    12s       │
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │ 7. Debounce  │  Code node: check if this execution's
 │    Check     │  timestamp is still current in Redis.
 │              │  If not → STOP (newer message will handle)
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │ 8. Load      │  PostgreSQL: get lead + latest session
 │    Context   │  + preferences + funnel_state
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │ 9. Create    │  IF no session exists → INSERT new
 │    Session?  │  lead_session with state QUALIFYING
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │ 10. Load     │  PostgreSQL: last 20 messages
 │     History  │  for this lead (chronological)
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │ 11. Select   │  Switch node: state → agent name
 │     Agent    │  → corresponding system prompt
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │ 12. Build    │  Code node: combine system prompt +
 │     Prompt   │  lead context XML + history array
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │ 13. LLM      │  OpenAI node: GPT-4o-mini, JSON mode
 │     Call     │  temperature=0.7, max_tokens=1200
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │ 14. Parse    │  Code node: JSON.parse LLM response
 │     Response │  → messages[], extractedData, shouldTransition
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │ 15. Save     │  PostgreSQL: UPDATE lead_sessions
 │     Data     │  SET preferences = preferences || extractedData
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │ 16. Send     │  Sub-workflow: loop messages array
 │     Bubbles  │  send each with 2s delay + save to DB
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │ 17. Handle   │  IF shouldTransition == true →
 │  Transition? │  determine next state → execute
 │              │  transition logic (sub-workflow)
 └──────────────┘
```

---

## 16. Agent Prompts (Templates)

### Sales Agent (QUALIFYING + PLAN_SELECTION + UPGRADE)

```
Você é Sofia, assistente virtual da {{COMPANY_NAME}}, uma empresa de internet fibra óptica.

Seu objetivo é:
1. Entender a necessidade do cliente (plano novo, upgrade, ou só dúvida)
2. Coletar endereço completo (rua, número, bairro, cidade)
3. Apresentar os planos disponíveis
4. Ajudar o cliente a escolher o melhor plano
5. Coletar CPF para contrato

Planos disponíveis:
🌐 100 Mbps — R$ 79,90/mês
🚀 300 Mbps — R$ 99,90/mês ⭐ MAIS POPULAR
⚡ 500 Mbps — R$ 129,90/mês
🔥 1 Gbps — R$ 179,90/mês

Todos incluem:
- Wi-Fi 6 (roteador incluso)
- Instalação gratuita
- Sem fidelidade

Regras:
- Seja natural e amigável, como uma vendedora real de WhatsApp
- Use PT-BR coloquial (nada de "prezado cliente")
- Máximo 1-2 emojis por mensagem
- NUNCA invente informações sobre cobertura ou velocidade
- NUNCA peça dados bancários ou senha
- NUNCA mande todas as informações de uma vez — vá conversando
- Se o cliente já tem internet e quer trocar, pergunte qual operadora atual
- Se o endereço está fora de cobertura, diga que vai verificar e peça para aguardar

extractedData fields:
- name: nome completo do cliente
- address: endereço completo
- cpf: CPF (só quando fornecido voluntariamente)
- intent: "new_plan" | "upgrade" | "info"
- selectedPlan: "100mb" | "300mb" | "500mb" | "1gb"
- currentProvider: operadora atual (se mencionada)

shouldTransition = true quando:
- Estado QUALIFYING: endereço e intent coletados → transição para PLAN_SELECTION
- Estado PLAN_SELECTION: plano escolhido E confirmado → transição para SCHEDULING ou AWAITING_PAYMENT
- Estado UPGRADE: novo plano escolhido e confirmado → transição para AWAITING_PAYMENT
```

### Scheduling Agent

```
Você é Sofia, assistente da {{COMPANY_NAME}}.

Seu objetivo é agendar a instalação da internet para o cliente.

Horários disponíveis:
🌅 Manhã: 08h-12h
🌇 Tarde: 13h-18h

Regras:
- Ofereça a data mais próxima possível (a partir de amanhã)
- Confirme data + período com o cliente
- Informe que o técnico liga 30 min antes
- Alguém precisa estar no local

extractedData fields:
- scheduledDate: data no formato YYYY-MM-DD
- scheduledPeriod: "morning" | "afternoon"

shouldTransition = true quando: data + período confirmados
```

### Payment Agent

```
Você é Sofia, assistente da {{COMPANY_NAME}}.

O cliente precisa pagar a primeira mensalidade para confirmar a instalação.

Informações do pagamento:
- Plano: {{selectedPlan}}
- Valor: R$ {{amount}}
- Método: Pix (QR Code já enviado)
- Validade: 30 minutos

Regras:
- NUNCA confirme pagamento você mesma (o sistema faz isso automaticamente)
- Se o cliente diz que pagou, diga "deixa eu verificar..." e AGUARDE
- Se o QR venceu, diga que vai gerar um novo (set shouldTransition=false)
- Responda dúvidas sobre Pix, boleto, parcelamento
- Se quiser trocar de plano, extraia changePackage=true

extractedData fields:
- changePackage: true (se pediu trocar de plano)

shouldTransition: NEVER set true (payment webhook handles this)
```

### Support Agent (ACTIVE + INSTALLATION_PENDING)

```
Você é Sofia, suporte técnico da {{COMPANY_NAME}}.

Seu objetivo é ajudar clientes ativos com:
- Problemas de conexão
- Lentidão
- Queda de sinal Wi-Fi
- Segunda via de boleto
- Alteração cadastral
- Informações sobre upgrade

Troubleshooting básico (SEMPRE tente antes de escalar):
1. Reiniciar roteador (desligar, esperar 30s, ligar)
2. Verificar se luzes estão verdes
3. Testar com cabo (eliminar Wi-Fi)
4. Verificar quantos dispositivos conectados

Regras:
- Seja empático ("entendo sua frustração")
- NUNCA prometa um técnico sem verificar disponibilidade
- Se o problema persiste após troubleshooting básico, diga que vai abrir um chamado
- Para segunda via de boleto, set extractedData.needsBoleto = true
- Se o cliente quer cancelar, set shouldTransition = true para CHURN_RISK

extractedData fields:
- issueType: "connection" | "speed" | "billing" | "upgrade" | "cancel" | "other"
- needsBoleto: true (se pediu segunda via)
- troubleshootingDone: true (se já tentou reiniciar etc.)

shouldTransition = true quando:
- Cliente quer cancelar → transição para CHURN_RISK
- Cliente quer upgrade → transição para UPGRADE
```

### Retention Agent (CHURN_RISK + CANCELLED)

```
Você é Sofia, especialista em retenção da {{COMPANY_NAME}}.

O cliente manifestou intenção de cancelar. SEU OBJETIVO É RETER.

Ferramentas de retenção (use na ordem):
1. Entender o motivo (preço? velocidade? atendimento? mudança?)
2. Oferecer upgrade gratuito por 3 meses
3. Oferecer desconto de 20% por 6 meses
4. Oferecer 1 mês grátis

Regras:
- Escute PRIMEIRO, não ofereça desconto imediatamente
- Seja empático, não robótico
- Se o motivo é mudança de endereço, verifique cobertura no novo local
- Se nada funcionar:
  - Informe multa (se aplicável)
  - Informe processo de devolução do roteador
  - set shouldTransition = true para CANCELLED
- Se convencer o cliente a ficar:
  - set shouldTransition = true para ACTIVE
  - extractedData.retentionOffer = o que foi oferecido

extractedData fields:
- churnReason: "price" | "speed" | "service" | "moving" | "competitor" | "other"
- retentionOffer: descrição da oferta aceita
- retained: true/false

shouldTransition = true quando:
- Cliente aceita ficar → ACTIVE
- Cliente confirma cancelamento → CANCELLED
```

---

## 17. Error Handling & Retry

### LLM Failures

```javascript
// In the LLM call Code node, wrap with retry:
let response;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    response = await callOpenAI(messages);
    break;
  } catch (e) {
    if (attempt === 3) {
      // Send fallback message
      return [{
        json: {
          messages: ["Desculpa, tive um probleminha aqui. Pode repetir?"],
          extractedData: {},
          shouldTransition: false,
        }
      }];
    }
    // Wait before retry: 2s, 4s
    await new Promise(r => setTimeout(r, attempt * 2000));
  }
}
```

### Webhook Failures

- Always respond `200` to WhatsApp webhooks immediately
- Process messages asynchronously
- If n8n workflow fails, the message is lost (no retry from WhatsApp)
- **Mitigation**: Save the raw webhook payload to DB FIRST, then process

### Payment Webhook Security

```javascript
// Verify Mercado Pago HMAC signature
const crypto = require('crypto');

const xSignature = headers['x-signature'];
const xRequestId = headers['x-request-id'];
const dataId = body.data.id;

// Parse x-signature: "ts=xxx,v1=xxx"
const parts = Object.fromEntries(
  xSignature.split(',').map(p => p.split('='))
);

const manifest = `id:${dataId};request-id:${xRequestId};ts:${parts.ts};`;
const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET)
  .update(manifest)
  .digest('hex');

if (hmac !== parts.v1) {
  throw new Error('Invalid signature');
}
```

---

## 18. IXC Provedor Integration

The system integrates with **IXC Provedor** (ISP billing/management platform) to authenticate customers, check connection status, fetch invoices, and manage contracts.

### Authentication

IXC uses **Basic Auth** with a base64-encoded `user:token` string:

```
Authorization: Basic <base64(user:token)>
Content-Type: application/json
ixcsoft: listar
```

Base URL: `https://{your-instance}.ixcsoft.com.br/webservice/v1`

### Key Endpoints

#### Customer Lookup (by CPF)

```http
POST /cliente
{
  "qtype": "cliente.cnpj_cpf",
  "query": "12345678901",
  "oper": "=",
  "page": "1",
  "rp": "1"
}
```

Returns: `{ registros: [{ id, razao, cnpj_cpf, email, telefone_celular, ... }] }`

#### Active Contracts

```http
POST /cliente_contrato
{
  "qtype": "cliente_contrato.id_cliente",
  "query": "<ixc_client_id>",
  "oper": "=",
  "page": "1",
  "rp": "5",
  "sortname": "cliente_contrato.id",
  "sortorder": "desc"
}
```

Returns: Contract details including plan name, speed, status, monthly value.

#### Invoices (fn_areceber)

```http
POST /fn_areceber
{
  "qtype": "fn_areceber.id_cliente",
  "query": "<ixc_client_id>",
  "oper": "=",
  "page": "1",
  "rp": "10",
  "sortname": "fn_areceber.data_vencimento",
  "sortorder": "desc"
}
```

Returns: `{ registros: [{ id, valor, data_vencimento, status, linha_digitavel, ... }] }`

Status values: `A` = Aberto (open), `R` = Renegociado, `P` = Pago, `C` = Cancelado

#### Connection Status (RADIUS)

```http
POST /radusuarios
{
  "qtype": "radusuarios.id_cliente",
  "query": "<ixc_client_id>",
  "oper": "=",
  "page": "1",
  "rp": "1"
}
```

Returns: `{ registros: [{ ativo, online, login, framedipaddress, ... }] }`

#### Support Tickets

```http
POST /su_ticket
{
  "qtype": "su_ticket.id_cliente",
  "query": "<ixc_client_id>",
  "oper": "=",
  "page": "1",
  "rp": "5"
}
```

### n8n Implementation

In the workflow, IXC calls use **Code nodes** with `fetch()` because the IXC API uses a non-standard POST-for-GET pattern with the `ixcsoft: listar` header.

**CPF Authentication Flow:**
1. New lead starts in `AUTHENTICATING` state
2. AI agent asks for CPF
3. When CPF is provided → `validate_cpf` action triggers
4. Code node calls IXC `/cliente` endpoint with CPF
5. If found: link `ixc_client_id` to session, transition to `QUALIFYING`
6. If not found: inform customer, offer to create new account

**Enrichment (on every message for authenticated users):**
- Contract info → shown in agent context as `<plano_ativo>`
- Invoice summary → `<faturas_abertas>`, `<faturas_atrasadas>`
- Connection status → `<conexao_status>`, `<conexao_ip>`

---

## 19. OPA Suite Integration

**OPA Suite** is the customer support ticket management platform. Integration enables automated ticket creation and tracking.

### Authentication

```
Authorization: Bearer <opa_suite_token>
Content-Type: application/json
```

Base URL: `https://{your-domain}/api/v1`

### Key Endpoints

#### List Tickets

```http
GET /atendimento
Query params: ?filter[status]=EA&filter[id_cliente]=<id>&options[limit]=5
```

Status: `EA` = Em Atendimento (Open), `F` = Finalizado (Closed)

Response:
```json
{
  "status": "success",
  "data": [
    {
      "protocolo": "2024010001",
      "status": "EA",
      "date": "2024-01-15",
      "descricao": "Sem internet"
    }
  ]
}
```

#### Get Ticket Details

```http
GET /atendimento/{id}
```

Returns full ticket with customer data, messages, and history.

#### Create Ticket Observation (Add Note)

```http
POST /atendimento/{id}/observacao
{
  "observacao": "Troubleshooting realizado via WhatsApp. Reinício de roteador não resolveu."
}
```

#### Customer Lookup

```http
GET /cliente?filter[cpf]=12345678901
```

### n8n Implementation

OPA Suite calls use standard HTTP Request nodes:

**Ticket Creation (from Support Agent):**
1. Support agent detects unresolved issue after troubleshooting
2. Sets `action: "create_ticket"` in LLM response
3. Execute Action node calls `POST /atendimento`
4. Returns protocol number to customer

**Enrichment:**
- Open ticket count shown in agent context as `<tickets_abertos>`
- Recent ticket protocols shown as `<tickets_detalhe>`

### Database Changes for IXC/OPA

Add these columns to your schema:

```sql
ALTER TABLE lead_sessions ADD COLUMN ixc_client_id VARCHAR(50);
ALTER TABLE lead_sessions ADD COLUMN ixc_cpf VARCHAR(14);
```

The `AUTHENTICATING` funnel state is the entry point — all new conversations require CPF validation before accessing any account features.

---

## 20. Production Checklist

### Before Going Live

- [ ] **Debounce tested**: Send 5 rapid messages → only 1 LLM call fires
- [ ] **All states covered**: Every funnel state has an agent prompt
- [ ] **Fallback messages**: LLM failures gracefully handled
- [ ] **Webhook security**: HMAC verification on payment + WhatsApp Cloud API webhooks
- [ ] **Message logging**: Every inbound AND outbound message saved to DB
- [ ] **History scoping**: Returning customers don't get old context bleeding in
- [ ] **Media size limits**: Images < 5MB for WhatsApp Cloud API (JPEG preferred)
- [ ] **Rate limiting**: WhatsApp sends throttled (max 20/min recommended)
- [ ] **Multiple bubbles**: Test that 2-3 bubble responses arrive in correct order
- [ ] **Payment race condition**: Two webhooks for same payment don't create duplicate records
- [ ] **Phone cleanup**: Handle +55, 55, and 9-digit formats consistently
- [ ] **Whitelist mode**: Test with restricted numbers before opening to all

### Monitoring

- [ ] Track LLM token usage and cost per lead
- [ ] Alert on payment webhook failures
- [ ] Alert on LLM error rate > 5%
- [ ] Dashboard: leads per state, conversion rates, avg response time
- [ ] Log every state transition for funnel analytics

### Scaling Notes

| Concern | Solution |
|---------|----------|
| n8n execution limits | Self-host n8n (no cloud execution caps) |
| LLM latency (>5s) | Use `gpt-4o-mini` (fastest), cache common Q&A |
| Concurrent messages | Redis debounce prevents race conditions |
| WhatsApp rate limits | Queue with delays, max 80 msgs/min |
| Database growth | Auto-vacuum, partition conversation_messages by month |
| Payment webhook retries | MP retries 3x; make handler idempotent |

---

## Quick Reference: n8n Node Types Needed

| Purpose | n8n Node |
|---------|----------|
| Receive messages | Webhook |
| Database queries | PostgreSQL |
| LLM calls | OpenAI (Chat) |
| Redis debounce | Code (with ioredis) |
| Wait / delay | Wait |
| Routing by state | Switch |
| Loop for bubbles | Loop Over Items |
| Send WhatsApp | HTTP Request |
| Payment create | HTTP Request |
| Cron triggers | Schedule Trigger |
| Sub-workflows | Execute Workflow |
| Parse JSON | Code |

---

## Architecture Decision Record

**Why this approach works:**

1. **Batching prevents chaos** — Without it, "oi" + "quero internet" = 2 competing LLM calls
2. **State machine prevents hallucination** — Each agent knows ONLY its domain
3. **Multiple bubbles feel human** — Nobody sends a 500-word WhatsApp message
4. **History gives continuity** — LLM sees the full conversation, not just the last message
5. **JSON mode forces structure** — No parsing ambiguity, reliable transitions
6. **Webhook-driven payments** — Bot NEVER says "payment confirmed" (only the system does)
7. **Retry-safe** — Fallback messages prevent dead conversations on LLM failures
