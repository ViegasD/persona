/**
 * Templates de mensagem da Bia em Português (BR).
 * Usados como FALLBACK quando o LLM não está disponível.
 * Em operação normal, as mensagens são geradas pelo LLM.
 */
export const MESSAGES = {
  // ─── Boas-vindas / Engajamento (fallback para ENGAGING) ──
  welcome: (name: string | null) =>
    name
      ? `Oi, ${name}! 👋 Eu sou a Bia, do *Ensaio Digital*!\n\nA gente cria ensaios fotográficos profissionais usando IA — resultado super natural e bonito ✨\n\nMe conta: pra qual *ocasião* você quer o ensaio? 📸`
      : `Oi! 👋 Eu sou a Bia, do *Ensaio Digital*!\n\nA gente cria ensaios fotográficos incríveis com IA ✨\n\nMe conta: pra qual *ocasião* você quer o ensaio? 📸`,

  // Fallback for follow-up messages (no re-introduction)
  engagementFollowUp: () =>
    `Desculpa, tive um probleminha aqui! 😅 Pode repetir o que você disse?`,

  // ─── Coleta de Fotos (fallback para COLLECTING_PHOTOS) ──
  askPhotos: () =>
    `Agora vem a parte divertida! Preciso de pelo menos *2 fotos suas* pra referência — uma de rosto e outra de corpo todo 📷\n\n` +
    `Dicas rápidas:\n` +
    `✅ Nítidas, sem filtro\n` +
    `✅ Rosto bem visível\n` +
    `✅ Se quiser sorrindo, mande sorrindo 😄\n\n` +
    `Pode mandar aqui mesmo! 🚀`,

  photoReceived: (count: number, max: number) =>
    count >= 2
      ? `📸 Foto ${count} recebida! Já tenho o suficiente — pode mandar mais ou enviar *pronto* quando terminar 😉`
      : `📸 Foto ${count} recebida! Manda mais ${2 - count} pelo menos 🙏`,

  // ─── Pagamento ───────────────────────────────────────────
  pixPayment: (amount: number) =>
    `💰 *Pagamento via Pix*\n\n` +
    `Valor: *R$ ${amount.toFixed(2).replace('.', ',')}*\n\n` +
    `Escaneie o QR Code acima no app do seu banco 📱`,

  pixCopyPaste: (code: string) => code,

  paymentConfirmed: (name: string) =>
    `✅ Pagamento confirmado, ${name}!\n\n` +
    `A IA já tá trabalhando no seu ensaio 🎨\n\n` +
    `Te aviso assim que ficar pronto! ⏳`,

  paymentReminder: () =>
    `O QR Code Pix foi enviado ali em cima 👆\n\n` +
    `Ele vale por *30 minutos* ⏰ Se expirar, me avisa que gero outro!\n\n` +
    `Qualquer dúvida, estou aqui 😊`,

  // ─── Geração ─────────────────────────────────────────────
  generationProgress: () =>
    `🎨 Suas fotos estão sendo criadas... A mágica tá acontecendo! ✨`,

  generationComplete: () =>
    `✨ Suas fotos ficaram prontas!\n\n` +
    `Estamos fazendo uma revisão de qualidade antes de enviar pra você 🔍\n\n` +
    `Já já te mando tudo aqui mesmo! 😊`,

  // ─── Entrega ─────────────────────────────────────────────
  deliveryStart: () =>
    `📦 Enviando suas fotos em alta qualidade...`,

  deliveryComplete: (count: number) =>
    `✅ *${count} fotos* enviadas com sucesso!\n\n` +
    `Espero que tenha amado! 😍\n\n` +
    `Sabia que clientes que já fizeram ensaio têm *desconto especial* no próximo? Se quiser outro, é só falar! 🌟`,

  // ─── Upsell ──────────────────────────────────────────────
  upsellFollowUp: (name: string) =>
    `Oi, ${name}! 😊 Tudo bem?\n\n` +
    `Que tal um novo ensaio com estilo diferente? Tem *desconto especial* pra quem já é cliente! 🌟\n\n` +
    `Responda *QUERO* pra saber mais.`,

  reengagement: (name: string, discount: number) =>
    `${name}, seu ensaio digital tá esperando! 📸\n\n` +
    `Reservei um *desconto de ${discount}%* especial pra você.\n\n` +
    `Responda *SIM* pra aproveitar!`,

  // ─── Erros / Fallback ───────────────────────────────────
  invalidOption: () =>
    `Hmm, não entendi 🤔 Pode repetir de outro jeito?`,

  sessionExpired: () =>
    `Sua sessão expirou. Manda qualquer mensagem pra recomeçar! 😊`,

  errorOccurred: () =>
    `Ops, deu um probleminha aqui do meu lado 😅 Tenta de novo em alguns instantes!`,
} as const;
