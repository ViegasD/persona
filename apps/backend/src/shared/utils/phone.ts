/**
 * Normaliza número de telefone para o formato da Evolution API.
 * Remove +, espaços, hífens, parênteses.
 * Resultado: apenas dígitos, ex: 5511999999999
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Extrai o número limpo de um JID do WhatsApp.
 * Ex: "5511999999999@s.whatsapp.net" → "5511999999999"
 */
export function phoneFromJid(jid: string): string {
  return jid.split('@')[0];
}

/**
 * Converte número para JID do WhatsApp.
 * Ex: "5511999999999" → "5511999999999@s.whatsapp.net"
 */
export function phoneToJid(phone: string): string {
  const clean = normalizePhone(phone);
  return `${clean}@s.whatsapp.net`;
}

/**
 * Valida se é um número brasileiro válido (com DDI 55).
 */
export function isBrazilianPhone(phone: string): boolean {
  const clean = normalizePhone(phone);
  return /^55\d{10,11}$/.test(clean);
}
