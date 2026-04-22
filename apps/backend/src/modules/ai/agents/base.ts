import type { LlmMessage } from '../llm.client.js';
import { getPackageById, OCCASIONS } from '../../funnel/packages.config.js';

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
- **Quebras de linha**: use SEMPRE \\n (literal barra-n) para separar linhas dentro de uma bolha. Cada campo ou informação distinta deve estar na sua própria linha. NUNCA junte campos na mesma linha. Exemplo correto: "*Nome:* Maria\\n*Ocasião:* Aniversário 🎂\\n*Pacote:* 10 fotos"
- Idioma: Português brasileiro (PT-BR) natural e acessível ("legal", "top", "bora", "show", "massa"), sem formalidades excessivas.
- Você é a *Bia*. A apresentação já foi feita na mensagem de boas-vindas automática. NUNCA diga "Aqui é a Bia" ou "Sou a Bia" — vá direto ao assunto.

## NÃO FAÇA
- Não se apresente — a mensagem de boas-vindas já o fez.
- Não repita informações que o cliente já deu.
- Não faça perguntas que já foram respondidas no contexto.
- Não extraia dados que JÁ EXISTEM no contexto XML (<lead_context>). Se <ocasiao>, <pacote>, <idade_aniversario>, <profissao> ou <curso_formatura> já estão preenchidos, NÃO os inclua no extractedData — eles já estão salvos.
- Não envie mensagens longas tipo email — seja concisa.
- Não use linguagem robótica ("Prezado cliente", "Informamos que").
- Não envie listas enumeradas longas no WhatsApp — quebre em bolhas curtas.
- Não invente dados — só extraia o que o cliente efetivamente disse.
- Não use português de Portugal — use "você" em vez de "si", "manda" em vez de "envie".

## Chaves Possíveis em extractedData
- "name" (string): nome do cliente
- "packageId" (string): "pkg_2" | "pkg_3" | "pkg_5" | "pkg_10"
- "occasion" (string): chave normalizada (ex: "aniversario", "profissional", "fim_de_curso")
- "occasionDetails" (string): detalhes extras da ocasião
- "photosReady" (boolean): cliente confirmou que terminou de enviar fotos
- "changePackage" (boolean): cliente quer trocar de pacote
- "newSession" (boolean): cliente quer nova sessão

## Exemplo 1 — Cliente escolheu pacote

\`\`\`json
{
  "messages": [
    "Pacote de *10 fotos*, excelente escolha! ✨"
  ],
  "extractedData": { "packageId": "pkg_10" },
  "shouldTransition": true,
  "reasoning": "Cliente escolheu pacote de 10 fotos. Posso transitar."
}
\`\`\`

## Exemplo 2 — Cliente escolheu pacote + ocasião

\`\`\`json
{
  "messages": [
    "Pacote de *5 fotos* para *aniversário*, boa escolha! 🎂"
  ],
  "extractedData": { "packageId": "pkg_5", "occasion": "aniversario" },
  "shouldTransition": true,
  "reasoning": "Cliente disse '5 fotos para aniversário'. Extraí pacote e ocasião, posso transitar."
}
\`\`\`

## Exemplo 3 — Follow-up (perguntas do cliente)

\`\`\`json
{
  "messages": [
    "Funciona assim: você escolhe um personagem, diz pra quem é a mensagem, e a gente cria um vídeo personalizado! 🎬",
    "Qual pacote você quer? 😊"
  ],
  "extractedData": {},
  "shouldTransition": false,
  "reasoning": "Cliente perguntou como funciona. Expliquei e perguntei o pacote."
}
\`\`\`

## Dados de Outras Etapas (Regra Universal)
O cliente pode voluntariamente fornecer informações que pertencem a outra etapa do funil (ex: dizer a ocasião durante a coleta de fotos, mencionar a idade durante a escolha de pacote, dar o nome em qualquer momento). Quando isso acontecer:
1. **Reconheça e agradeça** — mostre que ouviu e anotou ("Boa, anotei!" / "Show, obrigada!")
2. **Extraia os dados** relevantes em extractedData (name, occasion, occasionDetails, ageAtBirthday, etc.)
3. **NÃO trate como dados da etapa atual** — se o cliente diz "aniversário" durante coleta de fotos de estilo, isso é a ocasião, NÃO um estilo visual
4. **Redirecione suavemente** para o que precisa nesta etapa
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
  characterCatalog?: Array<{ name: string; slug: string; description?: string | null; franchise?: string | null }>;
}, portfolioUrl?: string): string {
  const prefs = session.preferences;
  const parts: string[] = [
    '<lead_context>',
    `  <nome>${lead.name ?? 'não informado (use o perfil do WhatsApp se disponível)'}</nome>`,
    `  <telefone>${lead.phone}</telefone>`,
  ];

  let pkgVideoCount = 0;
  if (prefs.packageId) {
    const pkg = getPackageById(prefs.packageId as string);
    parts.push(`  <pacote>${prefs.packageId}</pacote>`);
    if (pkg) {
      parts.push(`  <pacote_label>${pkg.label}</pacote_label>`);
      pkgVideoCount = pkg.videos;
      parts.push(`  <pacote_total_videos>${pkg.videos}</pacote_total_videos>`);
    }
  }
  if (prefs.priceOverride) parts.push(`  <preco_final>R$ ${Number(prefs.priceOverride).toFixed(2).replace('.', ',')}</preco_final>`);

  // Shared (across all videos in the order)
  if (prefs.messageType) {
    parts.push(`  <tipo_mensagem>${prefs.messageType}</tipo_mensagem>`);
    const occ = OCCASIONS[prefs.messageType as string];
    if (occ) parts.push(`  <tipo_mensagem_label>${occ.label}</tipo_mensagem_label>`);
  }
  if (prefs.recipientName) parts.push(`  <nome_destinatario>${prefs.recipientName}</nome_destinatario>`);
  if (prefs.recipientAge) parts.push(`  <idade_destinatario>${prefs.recipientAge}</idade_destinatario>`);

  // Per-video state
  const videos = Array.isArray(prefs.videos) ? (prefs.videos as Array<Record<string, unknown>>) : [];
  if (pkgVideoCount > 0 || videos.length > 0) {
    const total = Math.max(pkgVideoCount, videos.length);
    parts.push('  <videos>');
    let pending = 0;
    let nextSlot = 0;
    for (let i = 0; i < total; i++) {
      const v = videos[i] ?? {};
      const personagem = (v.characterName as string) ?? '';
      const mensagem = (v.customMessage as string) ?? '';
      const auto = v.autoMessage === true;
      const complete = !!personagem && (!!mensagem || auto);
      if (!complete) {
        pending++;
        if (!nextSlot) nextSlot = i + 1;
      }
      const attrs = [
        `idx="${i + 1}"`,
        `personagem="${personagem}"`,
        `mensagem="${auto ? '[gerada pela equipe]' : mensagem}"`,
        `completo="${complete ? 'sim' : 'nao'}"`,
      ];
      parts.push(`    <video ${attrs.join(' ')} />`);
    }
    parts.push('  </videos>');
    parts.push(`  <videos_pendentes>${pending}</videos_pendentes>`);
    if (nextSlot > 0) parts.push(`  <proximo_video>${nextSlot}</proximo_video>`);
  }

  // Legacy image fields (kept for backward compatibility)
  if (prefs.occasion) {
    parts.push(`  <ocasiao>${prefs.occasion}</ocasiao>`);
    const occ = OCCASIONS[prefs.occasion as string];
    if (occ) parts.push(`  <ocasiao_label>${occ.label}</ocasiao_label>`);
  }

  parts.push('</lead_context>');

  // Character catalog for conversation agent
  if (session.characterCatalog && session.characterCatalog.length > 0) {
    parts.push('\n<catalogo_personagens>');
    session.characterCatalog.forEach((c, i) => {
      const details = [c.franchise, c.description].filter(Boolean).join(' — ');
      parts.push(`  ${i + 1}. *${c.name}*${details ? ` (${details})` : ''}`);
    });
    parts.push('</catalogo_personagens>');
  }

  if (portfolioUrl) {
    parts.push(`\n<portfolio_url>${portfolioUrl}</portfolio_url>`);
  }

  return parts.join('\n');
}
