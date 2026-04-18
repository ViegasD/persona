/**
 * Templates de mensagem em Português (PT-BR).
 * Usados como FALLBACK quando o LLM não está disponível.
 * Em operação normal, as mensagens são geradas pelo LLM.
 */
export const MESSAGES = {
  // ─── Boas-vindas / Engajamento ───────────────────────────
  welcome: (_name: string | null) =>
    `Olá, tudo bem? 🎬\n\n` +
    `Aqui a gente cria *vídeos personalizados* com personagens incríveis pra surpreender quem você ama! ✨\n\n` +
    `🎂 Aniversário • 🎉 Parabéns • 💪 Motivação • 🎄 Natal • 💐 Dia das Mães • e mais!\n\n` +
    `📦 *Pacotes:*\n` +
    `🎥 1 vídeo — R$ 9,90\n` +
    `🎥 2 vídeos — R$ 14,90\n` +
    `🎥 3 vídeos — R$ 19,90 ⭐ mais popular\n` +
    `🎥 5 vídeos — R$ 29,90\n\n` +
    `Pra começar, me diz: qual personagem você quer no vídeo? 🎭`,

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
