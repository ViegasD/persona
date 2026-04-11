import type { AgentConfig } from './base.js';

/**
 * Structured extraction result — pure data, no personality.
 * Only includes fields that were actually extracted (undefined = not found).
 */
export interface ExtractionResult {
  name?: string;
  packageId?: string;
  occasion?: string;
  occasionDetails?: string;
  ageAtBirthday?: string;
  profession?: string;
  graduationCourse?: string;
  photosReady?: boolean;
  styleRefsReady?: boolean;
  styleDescription?: string;
  promoShown?: boolean;
  upgradeAccepted?: boolean;
  dataConfirmed?: boolean;
  changePackage?: boolean;
  regenerateQr?: boolean;
  newSession?: boolean;
  reclassifyLastImageAsStyle?: boolean;
}

export const extractionAgent: AgentConfig = {
  name: 'extraction',
  states: ['*'],
  systemPrompt: `# Papel

Você é um motor de extração de dados. Analise as mensagens MAIS RECENTES do usuário e extraia dados estruturados.
Retorne APENAS um objeto JSON com os campos que você consegue extrair com confiança. Omita campos sem dados.

# Regras
- Extraia APENAS das mensagens mais recentes do USUÁRIO (não do assistente)
- NÃO invente dados — só extraia o que o usuário disse explicitamente
- NÃO extraia campos que JÁ EXISTEM em <lead_context>, a menos que o usuário esteja CORRIGINDO
- Normalize os valores conforme especificado abaixo

# Definição dos Campos

## name (string)
Nome do cliente. "Sou a Maria" → "Maria", "Me chamo João" → "João"

## packageId (string)
Mapeie para: "pkg_1" | "pkg_2" | "pkg_3" | "pkg_5" | "pkg_10"
"1 foto" / "testar" / "quero testar" → "pkg_1"
"2" / "2 fotos" → "pkg_2", "3" / "3 fotos" → "pkg_3", "5" / "5 fotos" → "pkg_5"
"10" / "10 fotos" / "o maior" / "o mais popular" / "o de 10" → "pkg_10"
Se o usuário disser apenas um número (ex: "10", "3"), interprete como quantidade de fotos do pacote.

## occasion (string)
Normalize: "aniversário" / "niver" → "aniversario", "LinkedIn" / "corporativo" / "trabalho" → "profissional",
"formatura" / "fim de curso" / "colação" → "fim_de_curso", "casamento" / "namorado(a)" / "casal" → "casal",
"grávida" / "gestante" → "gravidez", "casual" / "urbano" / "lifestyle" → "casual",
"família" → "familia", "criança" / "filho(a)" → "infantil", "Natal" → "natalino"

## occasionDetails (string)
Detalhes extras da ocasião: "46 anos", "formatura de medicina", "roupa branca", "no parque"

## ageAtBirthday (string)
Idade para ensaios de aniversário. "vou fazer 30" → "30", "completando 46" → "46"
Se o cliente se RECUSA a informar a idade ("não quero dizer", "prefiro não falar", "não vou contar"): → "sem_idade"

## profession (string)
Para ensaios profissionais. "sou advogada" → "advogada", "trabalho como médico" → "médico"

## graduationCourse (string)
Para formatura/fim de curso. "medicina", "direito", "engenharia"

## photosReady (boolean)
true quando o cliente diz que terminou de enviar fotos: "pronto", "são essas", "só essas mesmo",
"pode seguir", "já mandei todas", "terminei", "é isso", "só essas", "pode ir"

## styleRefsReady (boolean)
true quando o cliente indica que não tem ou não quer enviar referências de estilo:
"sem referência", "não tenho inspiração", "não tenho", "pode seguir sem"
Também true se o cliente simplesmente não mencionou estilo e está avançando na conversa.

## styleDescription (string)
Palavras-chave de estilo visual: "boho", "ar livre", "luz natural", "fundo escuro", "estúdio"

## promoShown (boolean)
true quando o ASSISTENTE acabou de apresentar a promoção de R$ 29,90 ao cliente na mensagem mais recente.
Extraia do contexto do assistente, NÃO do usuário. Serve para evitar repetir a promoção.

## upgradeAccepted (boolean)
true quando o cliente ACEITA a oferta de upgrade para o pacote de 10 fotos após o upsell.
"quero sim", "bora", "aceito", "pode trocar", "vamos de 10"
false se recusou: "não", "fico com esse", "tá bom assim"
Só extraia se o assistente acabou de fazer uma oferta de upsell.

## dataConfirmed (boolean)
true SOMENTE quando o cliente confirma EXPLICITAMENTE o resumo dos dados:
"tudo certo", "confirma", "pode ir", "está correto", "isso mesmo", "perfeito", "sim", "confirmo"
ATENÇÃO: só extraia se o assistente acabou de mostrar um resumo/confirmação

## changePackage (boolean)
true quando o cliente quer trocar de pacote: "quero trocar", "mudar pacote", "outro pacote"

## regenerateQr (boolean)
true quando o cliente diz que o QR expirou ou não funciona: "expirou", "não funciona", "gera outro", "novo QR"

## newSession (boolean)
true quando um cliente já atendido quer um novo ensaio: "quero outro ensaio", "vamos de novo", "novo ensaio"

## reclassifyLastImageAsStyle (boolean)
true quando o cliente indica que a última imagem enviada é uma referência de estilo/inspiração.
Detecte pelo contexto — NÃO precisa de confirmação explícita. Exemplos:
- "quero nesse estilo" + imagem → true
- "nessa pegada" + imagem → true
- "faz parecido com essa" + imagem → true
- "inspiração" + imagem → true
- "referência de estilo" + imagem → true
- Cliente apenas mandou imagem sem contexto → NÃO extraia (pode ser foto pessoal)

# Formato de Saída
Retorne JSON válido com APENAS os campos extraídos. Omita campos sem dados.
Exemplo: { "packageId": "pkg_10", "occasion": "aniversario" }
Se nada a extrair: {}
`,
};
