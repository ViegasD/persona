/**
 * Templates de mensagem da Bia em Português (PT-BR).
 * Usados como FALLBACK quando o LLM não está disponível.
 * Em operação normal, as mensagens são geradas pelo LLM.
 */
export const MESSAGES = {
  // ─── Boas-vindas / Engajamento (fallback para ENGAGING) ──
  welcome: (_name: string | null) =>
    `Olá, tudo bem?\n\n` +
    `Antes dos valores, deixa eu te explicar rapidinho como funciona 👇\n` +
    `Você nos envia suas fotos e a gente cria um ensaio profissional personalizado pra você. Resultado natural e incrível ✨\n\n` +
    `🔥 PROMOÇÕES ABRIL 🔥\n` +
    `🎁 10 fotos — R$ 34,90 (mais popular)\n` +
    `📦 2 fotos — R$ 9,90\n` +
    `📦 3 fotos — R$ 13,90\n` +
    `📦 5 fotos — R$ 18,90\n\n` +
    `🎂 Aniversário • 💼 Profissional • 🎓 Formatura • 💕 Casal • 👶 Gravidez • 🏙️ Casual • e mais!\n\n\n` +
    `Pra começar, me manda suas melhores fotos — uma de rosto e uma de corpo inteiro! 📸😉`,

  // Fallback for follow-up messages (no re-introduction)
  engagementFollowUp: () =>
    `Desculpa, tive um probleminha aqui! 😅 Pode repetir o que disse?`,

  // ─── Coleta de Fotos (fallback para COLLECTING_PHOTOS) ──
  askPhotos: () =>
    `Agora vem a parte divertida! Preciso de pelo menos *2 fotos suas* pra referência — uma de rosto e outra de corpo inteiro 📷\n\n` +
    `Dicas rápidas:\n` +
    `✅ Nítidas, sem filtro\n` +
    `✅ Rosto bem visível\n` +
    `✅ Se quiser sorrindo, mande sorrindo 😄\n\n` +
    `Pode mandar aqui mesmo! 🚀`,

  photoReceived: (count: number, _max: number) =>
    count >= 2
      ? `📸 Foto ${count} recebida! Já tenho o suficiente — pode enviar mais, e quando tiver enviado todas me avisa que eu prossigo 😉`
      : `📸 Foto ${count} recebida! Envie mais ${2 - count} pelo menos 🙏`,

  // ─── Referências de Estilo ───────────────────────────────
  askStyleRefs: () =>
    `Agora uma etapa especial! ✨\n\n` +
    `Se tiver fotos de *inspiração* — tipo uma foto do Pinterest, Instagram ou de uma sessão que gostou do estilo — pode enviar aqui! 📸\n\n` +
    `A IA vai usar como referência de *iluminação, cenário e vibe* para a sua sessão.\n\n` +
    `Envie as fotos que quiser, ou diga *pular* se quiser seguir sem referência de estilo 😊`,

  // ─── Pagamento ───────────────────────────────────────────
  pixPayment: (amount: number, accountName?: string) =>
    `💰 *Pagamento via Pix*\n\n` +
    `Valor: *R$ ${amount.toFixed(2).replace('.', ',')}*\n` +
    (accountName ? `Destinatário: *${accountName}*\n` : '') +
    `\nEscaneie o QR Code acima no app do seu banco 📱`,

  pixCopyPaste: (code: string) => code,

  pixCopyPasteHint: () =>
    `👆 Essa é a chave *copia e cola*. Abra o app do seu banco, vá em *Pix Copia e Cola* e cole o código acima.\n\nSe não conseguir pelo código, escaneie o *QR Code* que enviei antes 📱`,

  paymentConfirmed: (name: string) =>
    `✅ Pagamento confirmado, ${name}!\n\n` +
    `A IA já está trabalhando na sua sessão 🎨\n\n` +
    `Aviso assim que ficar pronto! ⏳`,

  paymentReminder: () =>
    `O QR Code Pix foi enviado ali em cima 👆\n\n` +
    `Ele vale por *30 minutos* ⏰ Se expirar, me avisa que gero outro!\n\n` +
    `Qualquer dúvida, tô aqui 😊`,

  // ─── Geração ─────────────────────────────────────────────
  generationProgress: () =>
    `🎨 Suas fotos estão sendo criadas... A magia está acontecendo! ✨`,

  generationComplete: () =>
    `✨ Suas fotos ficaram prontas!\n\n` +
    `Estamos fazendo uma revisão de qualidade antes de enviar 🔍\n\n` +
    `Já já mando tudo aqui mesmo! 😊`,

  // ─── Entrega ─────────────────────────────────────────────
  deliveryStart: () =>
    `📦 Enviando suas fotos em alta qualidade...`,

  deliveryComplete: (count: number) =>
    `✅ *${count} fotos* enviadas com sucesso!\n\n` +
    `Espero que tenha adorado! 😍\n\n` +
    `Se quiser fazer outro ensaio com um estilo diferente, é só me chamar! 🌟`,

  // ─── Upsell ──────────────────────────────────────────────
  upsellFollowUp: (name: string) =>
    `Olá, ${name}! 😊 Tudo bem?\n\n` +
    `Que tal uma nova sessão com estilo diferente? 🌟\n\n` +
    `Responda *QUERO* para saber mais.`,

  reengagement: (name: string, _discount: number) =>
    `${name}, bora fazer mais um ensaio? 📸\n\n` +
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
    `O link da galeria foi enviado ali em cima 👆 Abre ele e aprova as fotos que mais gostar! 😍`,

  approvingFallback: () =>
    `Tô aqui se precisar! Pode aprovar as fotos no link que enviei 😊`,

  deliveringFallback: () =>
    `Suas fotos estão sendo enviadas em alta qualidade! 📦 Já já chega tudo!`,

  deliveredFallback: () =>
    `Olá! 😊 Se quiser fazer um novo ensaio, é só me dizer! 🌟`,
} as const;
