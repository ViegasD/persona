/**
 * Templates de mensagem em Português (PT-BR).
 * Usados como FALLBACK quando o LLM não está disponível.
 * Em operação normal, as mensagens são geradas pelo LLM.
 */
export const MESSAGES = {
  // ─── Boas-vindas / Engajamento ───────────────────────────
  welcome: (_name: string | null) =>
    `Olá! 🎬✨\n\n` +
    `Aqui a gente cria *vídeos personalizados com personagens incríveis* — um presente único pra crianças! 🎁\n\n` +
    `*Como funciona:*\n` +
    `1️⃣ Você escolhe o tema/personagem\n` +
    `2️⃣ A gente cria um vídeo com uma mensagem especial\n` +
    `3️⃣ Você recebe pronto pra enviar 💛\n\n` +
    `📦 *Planos:*\n\n` +
    `✨ *Plano Teste — R$ 14,90*\n` +
    `• 1 vídeo personalizado\n` +
    `• 1 personagem (entre 5 opções aleatórias)\n` +
    `• Alta qualidade + sem marca d'água\n` +
    `_Só pra sentir a magia antes de se apaixonar 💜_\n\n` +
    `⭐ *Plano Surpresa — R$ 24,90 (mais escolhido)*\n` +
    `• 3 vídeos diferentes\n` +
    `• Todos os personagens liberados (K-pop, Disney, heróis e mais!)\n` +
    `• Novos personagens todo dia\n` +
    `• Suporte prioritário via WhatsApp\n\n` +
    `🎁 *Plano Completo — R$ 34,90*\n` +
    `• 6 vídeos diferentes\n` +
    `• Todos os personagens liberados\n` +
    `• Novos personagens todo dia\n` +
    `• Suporte prioritário via WhatsApp\n\n` +
    `🎭 *Temas disponíveis:*\n\n` +
    `👑 Princesas & Contos mágicos\n` +
    `(Cinderela, Elsa, Anna, Ariel, Rapunzel, Bela…)\n\n` +
    `🦸‍♂️ Heróis & Aventura\n` +
    `(Sonic, Hércules, Aladdin, Buzz Lightyear…)\n\n` +
    `🐾 Patrulha Canina & Amigos\n` +
    `(Chase, Marshall, Skye, Rubble, Zuma…)\n\n` +
    `🧸 Clássicos Disney & Amigos fofos\n` +
    `(Mickey, Minnie, Pooh, Stitch, Nemo, Dory…)\n\n` +
    `🏎️ Carros & Ação\n` +
    `(Relâmpago McQueen, Mate…)\n\n` +
    `🧙‍♂️ Fantasia & Contos épicos\n` +
    `(Shrek, Gato de Botas, Peter Pan, Sininho…)\n\n` +
    `🎤 Estrelas & Música\n` +
    `(Guerreiras do K-pop 💃✨)\n\n` +
    `💬 Me fala, qual o *nome da criança* que vai receber esse presente? 😊`,

  // Fallback for follow-up messages (no re-introduction)
  engagementFollowUp: () =>
    `Desculpa, tive um probleminha aqui! 😅 Pode repetir o que disse?`,

  // ─── Pagamento ───────────────────────────────────────────
  pixPayment: (amount: number, accountName?: string) =>
    `💰 *Pagamento via Pix*\n\n` +
    `Valor: *R$ ${amount.toFixed(2).replace('.', ',')}*\n` +
    (accountName ? `Destinatário: *${accountName}*\n` : '') +
    `\nEscaneie o QR Code acima no app do seu banco 📱`,

  pixCopyPaste: (code: string) => code,

  pixCopyPasteHint: () =>
    `👆 Essa é a chave *copia e cola*. Abra o app do seu banco, vá em *Pix Copia e Cola* e cole o código acima.\n\nSe não conseguir pelo código, escaneie o *QR Code* que enviei antes 📱`,

  paymentConfirmed: () =>
    `✅ Pagamento confirmado!\n\n` +
    `Estamos criando seus vídeos personalizados 🎬✨\n\n` +
    `Aviso assim que ficarem prontos! ⏳`,

  paymentReminder: () =>
    `O QR Code Pix foi enviado ali em cima 👆\n\n` +
    `Ele vale por *30 minutos* ⏰ Se expirar, me avisa que gero outro!\n\n` +
    `Qualquer dúvida, tô aqui 😊`,

  // ─── Geração ─────────────────────────────────────────────
  generationProgress: () =>
    `🎬 Seus vídeos estão sendo criados... A magia está acontecendo! ✨`,

  generationComplete: () =>
    `✨ Seus vídeos ficaram prontos!\n\n` +
    `Estamos fazendo uma revisão de qualidade antes de enviar 🔍\n\n` +
    `Já já mando tudo aqui mesmo! 😊`,

  // ─── Entrega ─────────────────────────────────────────────
  deliveryStart: () =>
    `📦 Enviando seus vídeos...`,

  deliveryComplete: (count: number) =>
    `✅ *${count} vídeo${count > 1 ? 's' : ''}* enviado${count > 1 ? 's' : ''} com sucesso!\n\n` +
    `Espero que tenha adorado! 😍\n\n` +
    `Se quiser criar outro vídeo com um personagem diferente, é só me chamar! 🌟`,

  // ─── Upsell ──────────────────────────────────────────────
  upsellFollowUp: (_name: string) =>
    `Olá! 😊 Tudo bem?\n\n` +
    `Que tal um novo vídeo com outro personagem? 🎬\n\n` +
    `Responda *QUERO* para saber mais.`,

  reengagement: (_name: string, _discount: number) =>
    `Bora criar mais um vídeo especial? 🎬\n\n` +
    `Responda *SIM* pra começar!`,

  // ─── Erros / Fallback ─────────────────────────────────────────
  invalidOption: () =>
    `Hmm, não entendi 🤔 Pode repetir de outra forma?`,

  sessionExpired: () =>
    `Sua sessão expirou. Mande qualquer mensagem pra começar de novo! 😊`,

  errorOccurred: () =>
    `Ops, houve um probleminha aqui do meu lado 😅 Tente novamente em alguns instantes!`,

  // ─── Fallbacks por Estado ────────────────────────────────────
  galleryFallback: () =>
    `O link da galeria foi enviado ali em cima 👆 Abre ele e aprova os vídeos que mais gostar! 😍`,

  approvingFallback: () =>
    `Tô aqui se precisar! Pode aprovar os vídeos no link que enviei 😊`,

  deliveringFallback: () =>
    `Seus vídeos estão sendo enviados! 📦 Já já chega tudo!`,

  deliveredFallback: () =>
    `Olá! 😊 Se quiser criar um novo vídeo personalizado, é só me dizer! 🌟`,
} as const;
