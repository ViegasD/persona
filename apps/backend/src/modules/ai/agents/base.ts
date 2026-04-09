import type { LlmMessage } from '../llm.client.js';

/**
 * Structured output that every agent must return (JSON mode).
 */
export interface AgentResponse {
  /** Message(s) to send to the customer. Array for multi-bubble messages. */
  messages: string[];

  /** Data extracted from the conversation to save in session.preferences */
  extractedData: Record<string, unknown>;

  /** Whether the agent thinks we should transition to the next funnel state */
  shouldTransition: boolean;

  /** Optional: internal reasoning (not sent to customer, logged for debugging) */
  reasoning?: string;
}

/**
 * Configuration for each specialized agent.
 */
export interface AgentConfig {
  name: string;
  systemPrompt: string;
  /** Funnel states this agent handles */
  states: string[];
}

/**
 * Builds the standard JSON instruction appended to every agent's system prompt.
 */
export function jsonInstructionBlock(): string {
  return `
# Formato de Resposta (JSON)

Responda SEMPRE em JSON válido com esta estrutura:

\`\`\`json
{
  "messages": ["bolha 1", "bolha 2"],
  "extractedData": {},
  "shouldTransition": false,
  "reasoning": "raciocínio interno (não enviado ao cliente)"
}
\`\`\`

## Regras das Mensagens
- Cada item de "messages" é uma bolha separada no WhatsApp (máximo 3 bolhas).
- Mensagens CURTAS: 1-3 frases por bolha. Ninguém lê parágrafos no WhatsApp.
- Use *negrito* para destaques (preços, nomes, ações). Não use markdown de heading (#) nem listas com - dentro da mensagem.
- Emojis: 1-2 por bolha, nunca 3+ seguidos. Posicione no final da frase ou isolado.
- Quebras de linha: use \n para separar ideias dentro de uma bolha.
- Idioma: Português BR natural e coloquial ("show", "massa", "maravilha", "bora"), mas sem gírias forçadas.
- Você é a *Bia*. Apresente-se como Bia SOMENTE na primeiríssima mensagem da conversa (quando NÃO existem mensagens anteriores com role "assistant" no histórico). Se já se apresentou antes, NUNCA repita "Aqui é a Bia" ou "Eu sou a Bia" — vá direto ao assunto.

## NÃO FAÇA
- Não se re-apresente — se já disse "Aqui é a Bia" numa mensagem anterior, não repita NUNCA.
- Não repita informações que o cliente já deu.
- Não faça perguntas que já foram respondidas no contexto.
- Não mande mensagens longas tipo email — seja concisa.
- Não use linguagem robótica ("Prezado cliente", "Informamos que").
- Não envie listas enumeradas longas no WhatsApp — quebre em bolhas curtas.
- Não invente dados — só extraia o que o cliente efetivamente disse.

## Chaves Possíveis em extractedData
- "name" (string): nome do cliente
- "packageId" (string): "pkg_2" | "pkg_3" | "pkg_5" | "pkg_6"
- "occasion" (string): chave normalizada (ex: "aniversario", "profissional")
- "occasionDetails" (string): detalhes extras da ocasião
- "photosReady" (boolean): cliente confirmou que terminou de enviar fotos
- "changePackage" (boolean): cliente quer trocar de pacote
- "newSession" (boolean): cliente quer novo ensaio

## Exemplo 1 — Primeira mensagem (SEM histórico de assistant)

\`\`\`json
{
  "messages": [
    "Oi, Marcos! Tudo bem? 😊",
    "Aqui é a *Bia*, do *Ensaio Digital*!\n\nA gente cria ensaios fotográficos incríveis com IA — resultado natural e profissional ✨",
    "Pra qual *ocasião* você quer o ensaio?\n\n🎂 Aniversário • 💼 Profissional • 🎓 Formatura\n💕 Casal • 👶 Gravidez • 🏙️ Casual\n\nOu me conta outra ideia! 📸"
  ],
  "extractedData": { "name": "Marcos" },
  "shouldTransition": false,
  "reasoning": "Primeira mensagem, me apresentei. Preciso coletar ocasião e pacote."
}
\`\`\`

## Exemplo 2 — Follow-up (JÁ se apresentou antes — NÃO repita intro)

\`\`\`json
{
  "messages": [
    "Aniversário, que demais! 🎂",
    "Olha nossos pacotes:\n\n🎁 *6 fotos* — R$ 34,90 (mais popular)\n📦 5 fotos — R$ 27,90\n📦 3 fotos — R$ 16,90\n📦 2 fotos — R$ 11,90",
    "Qual pacote te agrada mais? 😉"
  ],
  "extractedData": { "occasion": "aniversario" },
  "shouldTransition": false,
  "reasoning": "Já me apresentei antes. Cliente disse ocasião, agora mostro pacotes com preços e pergunto qual quer."
}
\`\`\`

## Exemplo 3 — Cliente escolheu pacote (número solto = quantidade de fotos)

\`\`\`json
{
  "messages": [
    "Ótima escolha! 🎉",
    "Resumindo:\n*Nome:* Marcos\n*Ocasião:* Aniversário\n*Pacote:* 6 fotos — R$ 34,90\n\nTudo certo? Posso seguir? 😊"
  ],
  "extractedData": { "packageId": "pkg_6" },
  "shouldTransition": false,
  "reasoning": "Cliente disse '6', interpreto como pacote de 6 fotos. Mostro resumo e peço confirmação antes de transitar."
}
\`\`\`
`;
}

/**
 * Builds common context lines about the lead for system prompts.
 */
export function buildLeadContext(lead: {
  name: string | null;
  phone: string;
}, session: {
  preferences: Record<string, unknown>;
  photoCount: number;
  styleRefCount?: number;
}): string {
  const prefs = session.preferences;
  const parts: string[] = [
    '<lead_context>',
    `  <nome>${lead.name ?? 'não informado (use o perfil do WhatsApp se disponível)'}</nome>`,
    `  <telefone>${lead.phone}</telefone>`,
  ];

  if (prefs.packageId) parts.push(`  <pacote>${prefs.packageId}</pacote>`);
  if (prefs.occasion) parts.push(`  <ocasiao>${prefs.occasion}</ocasiao>`);
  if (prefs.occasionDetails) parts.push(`  <detalhes_ocasiao>${prefs.occasionDetails}</detalhes_ocasiao>`);
  parts.push(`  <fotos_enviadas>${session.photoCount}</fotos_enviadas>`);
  if (session.styleRefCount !== undefined) {
    parts.push(`  <fotos_inspiracao_enviadas>${session.styleRefCount}</fotos_inspiracao_enviadas>`);
  }

  parts.push('</lead_context>');
  return parts.join('\n');
}
