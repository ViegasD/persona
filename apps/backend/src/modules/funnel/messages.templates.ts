/**
 * Templates de mensagem da Bia em Português (PT-PT).
 * Usados como FALLBACK quando o LLM não está disponível.
 * Em operação normal, as mensagens são geradas pelo LLM.
 */
export const MESSAGES = {
  // ─── Boas-vindas / Engajamento (fallback para ENGAGING) ──
  welcome: (_name: string | null) =>
    `Olá! Sim, é verdade! Sessão fotográfica profissional sem sair de casa, feita com IA 😊\n\n` +
    `Funciona assim: envia as suas fotos e a nossa IA transforma-as numa sessão profissional. O resultado é natural, sem aspeto artificial.\n` +
    `Veja alguns resultados reais acima 👆\n\n` +
    `🔥 PROMOÇÃO DE MARÇO 🔥\n` +
    `🎁 10 fotos — 16,90 € (mais pedido)\n` +
    `📦 5 fotos — 9,90 €\n` +
    `📦 3 fotos — 6,90 €\n` +
    `📦 2 fotos — 4,90 €\n\n` +
    `✅ Mais de 3000 clientes atendidos\n` +
    `✅ Entrega até 48h\n` +
    `✅ Ideal para: LinkedIn, Instagram, Tinder, presentes, fim de curso...\n\n` +
    `🎂 Aniversário • 💼 Profissional • 🎓 Fim de curso • 💕 Casal • 👶 Gravidez • 🏙️ Casual • e mais!\n\n` +
    `Para agilizar: diga-me qual é o pacote que pretende para que eu lhe explique o passo seguinte! 😉`,

  // Fallback for follow-up messages (no re-introduction)
  engagementFollowUp: () =>
    `Desculpe, tive um probleminha aqui! 😅 Pode repetir o que disse?`,

  // ─── Coleta de Fotos (fallback para COLLECTING_PHOTOS) ──
  askPhotos: () =>
    `Agora vem a parte divertida! Preciso de pelo menos *2 fotos suas* para referência — uma de rosto e outra de corpo inteiro 📷\n\n` +
    `Dicas rápidas:\n` +
    `✅ Nítidas, sem filtro\n` +
    `✅ Rosto bem visível\n` +
    `✅ Se quiser a sorrir, envie a sorrir 😄\n\n` +
    `Pode enviar aqui mesmo! 🚀`,

  photoReceived: (count: number, _max: number) =>
    count >= 2
      ? `📸 Foto ${count} recebida! Já tenho o suficiente — pode enviar mais ou dizer *pronto* quando terminar 😉`
      : `📸 Foto ${count} recebida! Envie mais ${2 - count} pelo menos 🙏`,

  // ─── Referências de Estilo ───────────────────────────────
  askStyleRefs: () =>
    `Agora uma etapa especial! ✨\n\n` +
    `Se tiver fotos de *inspiração* — tipo uma foto do Pinterest, Instagram ou de uma sessão que gostou do estilo — pode enviar aqui! 📸\n\n` +
    `A IA vai usar como referência de *iluminação, cenário e vibe* para a sua sessão.\n\n` +
    `Envie as fotos que quiser, ou diga *saltar* se quiser seguir sem referência de estilo 😊`,

  // ─── Pagamento ───────────────────────────────────────────
  pixPayment: (amount: number) =>
    `💰 *Pagamento via Pix*\n\n` +
    `Valor: *€ ${amount.toFixed(2).replace('.', ',')}*\n\n` +
    `Escaneie o QR Code acima na app do seu banco 📱`,

  pixCopyPaste: (code: string) => code,

  paymentConfirmed: (name: string) =>
    `✅ Pagamento confirmado, ${name}!\n\n` +
    `A IA já está a trabalhar na sua sessão 🎨\n\n` +
    `Aviso assim que estiver pronto! ⏳`,

  paymentReminder: () =>
    `O QR Code Pix foi enviado ali em cima 👆\n\n` +
    `Ele vale por *30 minutos* ⏰ Se expirar, avise-me que gero outro!\n\n` +
    `Qualquer dúvida, estou aqui 😊`,

  // ─── Geração ─────────────────────────────────────────────
  generationProgress: () =>
    `🎨 As suas fotos estão a ser criadas... A magia está a acontecer! ✨`,

  generationComplete: () =>
    `✨ As suas fotos ficaram prontas!\n\n` +
    `Estamos a fazer uma revisão de qualidade antes de enviar 🔍\n\n` +
    `Já já envio tudo aqui mesmo! 😊`,

  // ─── Entrega ─────────────────────────────────────────────
  deliveryStart: () =>
    `📦 A enviar as suas fotos em alta qualidade...`,

  deliveryComplete: (count: number) =>
    `✅ *${count} fotos* enviadas com sucesso!\n\n` +
    `Espero que tenha adorado! 😍\n\n` +
    `Sabia que clientes que já fizeram sessão têm *desconto especial* na próxima? Se quiser outra, é só dizer! 🌟`,

  // ─── Upsell ──────────────────────────────────────────────
  upsellFollowUp: (name: string) =>
    `Olá, ${name}! 😊 Tudo bem?\n\n` +
    `Que tal uma nova sessão com estilo diferente? Tem *desconto especial* para quem já é cliente! 🌟\n\n` +
    `Responda *QUERO* para saber mais.`,

  reengagement: (name: string, discount: number) =>
    `${name}, a sua sessão digital está à espera! 📸\n\n` +
    `Reservei um *desconto de ${discount}%* especial para si.\n\n` +
    `Responda *SIM* para aproveitar!`,

  // ─── Erros / Fallback ───────────────────────────────────
  invalidOption: () =>
    `Hmm, não percebi 🤔 Pode repetir de outra forma?`,

  sessionExpired: () =>
    `A sua sessão expirou. Envie qualquer mensagem para recomeçar! 😊`,

  errorOccurred: () =>
    `Ops, houve um probleminha aqui do meu lado 😅 Tente novamente em alguns instantes!`,
} as const;
