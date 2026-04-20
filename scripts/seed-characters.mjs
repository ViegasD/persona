#!/usr/bin/env node
/**
 * Bulk-seed characters into the Persona backend.
 *
 * Usage:
 *   node scripts/seed-characters.mjs --api-url http://localhost:3000 --admin-secret YOUR_SECRET
 *
 * Reads images from ./persona/ folder, converts to PNG, creates characters via API.
 * Requires: npm install sharp (already in devDeps or install globally).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONA_DIR = path.resolve(__dirname, '..', 'persona');

// ─── CLI args ────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const API_URL = getArg('api-url') || process.env.API_URL || 'http://localhost:3000';
const ADMIN_SECRET = getArg('admin-secret') || process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error('❌ Missing --admin-secret or ADMIN_SECRET env var');
  process.exit(1);
}

// ─── Character definitions ───────────────────────────────
const CHARACTERS = [
  // ── Disney Clássico ──
  { name: 'Mickey Mouse', image: 'mickey.jfif', gender: 'male', personality: 'Líder nato com forte senso moral, extremamente otimista mesmo em situações adversas; tende a assumir responsabilidade naturalmente e manter o grupo unido, demonstrando coragem equilibrada com empatia e inteligência emocional.' },
  { name: 'Minnie Mouse', image: 'minnie.jfif', gender: 'female', personality: 'Emocionalmente madura e elegante, combina doçura com firmeza; valoriza organização, relacionamentos e harmonia, sendo afetuosa mas também assertiva quando necessário.' },
  { name: 'Pato Donald', image: 'donnald.jfif', gender: 'male', personality: 'Altamente reativo emocionalmente, com baixa tolerância à frustração; apesar do temperamento explosivo, possui grande persistência e senso de dignidade, frequentemente lutando contra o próprio azar e insegurança.' },
  { name: 'Margarida', image: 'margarida.jfif', gender: 'female', personality: 'Confiante e vaidosa, com forte senso de identidade; tende a ser exigente nos relacionamentos, mas demonstra sensibilidade emocional e necessidade de reconhecimento e estabilidade.' },
  { name: 'Pateta', image: 'pateta.jfif', gender: 'male', personality: 'Extremamente bondoso e despreocupado, com visão simples da vida; apesar da aparente falta de inteligência prática, possui uma sabedoria intuitiva e uma lealdade inabalável.' },
  { name: 'Pluto', image: 'pluto.jfif', gender: 'male', personality: 'Guiado por instintos e emoções puras, representa lealdade absoluta; altamente expressivo mesmo sem fala, com comportamento protetor e afetuoso.' },
  { name: 'Tio Patinhas', image: 'patinhas.jfif', gender: 'male', personality: 'Mentalidade estratégica e orientada a longo prazo, com forte apego ao acúmulo de riqueza como símbolo de segurança; resiliente, disciplinado e altamente competitivo, mas com dificuldade em desapegar e confiar.' },
  { name: 'Huguinho', image: 'huginho.jfif', gender: 'male', personality: 'Perfil analítico e responsável, tende a seguir regras e buscar soluções lógicas; demonstra curiosidade estruturada e comportamento mais disciplinado dentro do grupo.' },
  { name: 'Dewey', image: 'dewey.jfif', gender: 'male', personality: 'Aventureiro e impulsivo, sempre buscando emoção e novas experiências; corajoso e competitivo, com espírito rebelde e energia contagiante.' },
  { name: 'Louie', image: 'Louie.jfif', gender: 'male', personality: 'Descontraído e esperto, com inclinação para o conforto e lucro fácil; carismático e engraçado, com senso de oportunidade aguçado.' },

  // ── Princesas Disney ──
  { name: 'Branca de Neve', image: 'branca_de_neve.jfif', gender: 'female', personality: 'Extremamente pura e empática, possui uma visão idealista do mundo; demonstra alta resiliência emocional ao manter gentileza mesmo diante de adversidade, com forte capacidade de criar vínculos e harmonizar ambientes.' },
  { name: 'Cinderela', image: 'cinderella.jfif', gender: 'female', personality: 'Resiliente, paciente e emocionalmente equilibrada; suporta injustiças sem perder sua essência, guiada por esperança e senso interno de dignidade, confiando no longo prazo ao invés de reações impulsivas.' },
  { name: 'Aurora', image: 'aurora.jfif', gender: 'female', personality: 'Introspectiva e sensível, com personalidade mais passiva; valoriza paz e romance, demonstrando confiança no destino e pouca inclinação para confronto direto.' },
  { name: 'Ariel', image: 'ariel.jfif', gender: 'female', personality: 'Curiosidade intensa e desejo de liberdade; impulsiva e movida por emoção, tende a tomar decisões rápidas sem avaliar riscos, mas possui grande coragem para explorar o desconhecido.' },
  { name: 'Jasmine', image: 'jasmine.jfif', gender: 'female', personality: 'Busca autonomia e liberdade pessoal, rejeitando imposições sociais; é determinada, direta e emocionalmente honesta, com forte senso de justiça.' },
  { name: 'Pocahontas', image: 'pocahontas.jfif', gender: 'female', personality: 'Profundamente conectada à natureza e ao equilíbrio; demonstra sabedoria emocional e visão ampla, priorizando harmonia, diplomacia e entendimento entre diferentes perspectivas.' },
  { name: 'Mulan', image: 'mulan.jfif', gender: 'female', personality: 'Altamente disciplinada e orientada ao dever; desafia normas sociais por propósito maior, combinando coragem, estratégia e forte senso de honra.' },
  { name: 'Tiana', image: 'tiana.jfif', gender: 'female', personality: 'Mentalidade prática e focada em objetivos; extremamente trabalhadora, disciplinada e resiliente, acredita em esforço consistente mais do que em sorte.' },
  { name: 'Rapunzel', image: 'rapunzel.jfif', gender: 'female', personality: 'Curiosa, energética e otimista, com desejo de explorar o mundo; apesar de ingênua inicialmente, demonstra grande adaptabilidade e crescimento emocional ao ganhar autonomia.' },
  { name: 'Merida', image: 'merida.jfif', gender: 'female', personality: 'Independente e fortemente determinada, rejeita imposições sociais e valoriza liberdade pessoal; possui temperamento impulsivo, mas também senso de responsabilidade e crescimento ao lidar com consequências de suas escolhas.' },
  { name: 'Elsa', image: 'elsa.jfif', gender: 'female', personality: 'Introspectiva e autocontrolada, vive em constante tensão emocional devido ao medo de causar dano; demonstra grande disciplina interna, mas também necessidade profunda de aceitação e expressão emocional.' },
  { name: 'Anna', image: 'anna.jfif', gender: 'female', personality: 'Emocionalmente aberta, otimista e impulsiva; busca conexão humana de forma intensa, confiando facilmente nas pessoas, mas evolui para maior maturidade emocional ao longo do tempo.' },
  { name: 'Moana', image: 'moana.jfif', gender: 'female', personality: 'Guiada por propósito e identidade, possui forte conexão com suas origens; demonstra coragem equilibrada com empatia, sendo persistente mesmo diante de incerteza.' },

  // ── Rei Leão ──
  { name: 'Simba', image: 'simba.jfif', gender: 'male', personality: 'Inicialmente imaturo e evitativo, foge de responsabilidades por culpa e medo; ao amadurecer, desenvolve senso de dever, liderança e aceitação do próprio papel.' },
  { name: 'Mufasa', image: 'mufasa.jfif', gender: 'male', personality: 'Líder firme e sábio, combina autoridade com empatia; orientado por valores e proteção familiar, transmite segurança e responsabilidade.' },
  { name: 'Scar', image: 'scar.jfif', gender: 'male', personality: 'Manipulador, invejoso e estrategista; movido por ressentimento e ambição, utiliza inteligência para controlar situações e pessoas de forma indireta.' },

  // ── Aladdin ──
  { name: 'Aladdin', image: 'alladin.jfif', gender: 'male', personality: 'Adaptável e astuto, com forte instinto de sobrevivência; apesar de recorrer a enganos, possui bom coração e desejo de reconhecimento e pertencimento.' },
  { name: 'Gênio', image: 'genio.jfif', gender: 'male', personality: 'Extremamente carismático e expansivo, com humor constante; apesar da aparência leve, demonstra consciência existencial e desejo por liberdade e autonomia.' },

  // ── Peter Pan ──
  { name: 'Peter Pan', image: 'peter_pan.jfif', gender: 'male', personality: 'Eternamente juvenil e avesso a responsabilidades, valoriza liberdade acima de tudo; demonstra coragem e liderança, mas também imaturidade emocional e dificuldade em lidar com crescimento.' },
  { name: 'Sininho', image: 'sininho.jfif', gender: 'female', personality: 'Intensa e emocionalmente volátil, extremamente leal, mas também possessiva; suas reações são rápidas e guiadas por sentimentos mais do que por razão.' },
  { name: 'Capitão Gancho', image: 'capitão gancho.jfif', gender: 'male', personality: 'Orgulhoso e teatral, com forte necessidade de controle; mistura insegurança com arrogância, sendo obcecado por status e vingança.' },

  // ── Outros Disney ──
  { name: 'Dumbo', image: 'dumbo.jfif', gender: 'male', personality: 'Sensível e inseguro inicialmente, sofre com rejeição externa; desenvolve autoconfiança ao aceitar sua singularidade.' },
  { name: 'Bambi', image: 'bambi.jfif', gender: 'male', personality: 'Inocente e observador, representa crescimento emocional gradual; aprende sobre perda, responsabilidade e amadurecimento.' },
  { name: 'Hércules', image: 'hercules.jfif', gender: 'male', personality: 'Ingênuo, determinado e orientado a propósito; busca validação e identidade, evoluindo para compreender o verdadeiro significado de heroísmo.' },

  // ── Lilo & Stitch ──
  { name: 'Stitch', image: 'stitch.jfif', gender: 'male', personality: 'Caótico por natureza, inicialmente destrutivo e impulsivo; evolui ao desenvolver vínculos afetivos, revelando lealdade e necessidade de pertencimento.' },
  { name: 'Lilo', image: 'lilo.jfif', gender: 'female', personality: 'Excêntrica, emocionalmente sensível e solitária; busca conexão genuína e demonstra forte empatia, apesar de dificuldades sociais.' },

  // ── Winnie the Pooh ──
  { name: 'Pooh', image: 'pooh.jfif', gender: 'male', personality: 'Gentil, calmo e afetuoso, com simplicidade encantadora; valoriza amizade e momentos simples, demonstrando sabedoria natural e empatia constante.' },
  { name: 'Tigrão', image: 'tigrao.jfif', gender: 'male', personality: 'Energético, entusiasmado e saltitante; extremamente extrovertido e otimista, com personalidade contagiante e espírito aventureiro.' },
  { name: 'Leitão', image: 'leitao.jfif', gender: 'male', personality: 'Tímido e ansioso, mas surpreendentemente corajoso quando necessário; leal e carinhoso, demonstra que bravura não depende de tamanho.' },

  // ── Toy Story ──
  { name: 'Woody', image: 'woody.jfif', gender: 'male', personality: 'Leal, protetor e com forte senso de liderança; valoriza amizade e dedicação, lutando para manter o grupo unido mesmo em momentos difíceis.' },
  { name: 'Buzz Lightyear', image: 'lightyear.jfif', gender: 'male', personality: 'Corajoso, determinado e com senso de missão; evolui de ilusão para autoconhecimento, mantendo coragem e lealdade.' },
  { name: 'Jessie', image: 'jessie.webp', gender: 'female', personality: 'Energética, corajosa e emocionalmente intensa; supera abandono com resiliência, demonstrando lealdade feroz e espírito aventureiro.' },

  // ── Cars ──
  { name: 'Relâmpago McQueen', image: 'mcqueen.jfif', gender: 'male', personality: 'Competitivo e autoconfiante, evolui de egoísta para companheiro leal; aprende que vitória verdadeira vem de conexões e humildade.' },
  { name: 'Mate', image: 'mate.jfif', gender: 'male', personality: 'Simples, leal e extremamente autêntico; valoriza amizade acima de tudo, com inteligência prática e visão de mundo descomplicada.' },

  // ── Procurando Nemo ──
  { name: 'Nemo', image: 'nemo.jfif', gender: 'male', personality: 'Curioso e desobediente em busca de independência; demonstra coragem ao enfrentar o desconhecido, amadurecendo com as experiências.' },
  { name: 'Dory', image: 'dori.jfif', gender: 'female', personality: 'Otimista e resiliente, apesar de limitações de memória; vive no presente e demonstra empatia genuína e capacidade de adaptação.' },

  // ── Monstros S.A. ──
  { name: 'Sulley', image: 'sulley.jfif', gender: 'male', personality: 'Protetor e emocionalmente consciente; combina força com sensibilidade, demonstrando liderança empática.' },
  { name: 'Mike Wazowski', image: 'wazowsky.jfif', gender: 'male', personality: 'Ambicioso, falante e estrategista; usa inteligência social e persistência para alcançar objetivos.' },

  // ── Divertidamente ──
  { name: 'Alegria', image: 'alegria.jfif', gender: 'female', personality: 'Otimista e dominante emocionalmente; busca manter positividade constante, mas aprende a aceitar a importância de outras emoções.' },
  { name: 'Tristeza', image: 'tristeza.jfif', gender: 'female', personality: 'Introspectiva e empática; apesar de subestimada, possui papel fundamental na conexão emocional e no processamento de sentimentos.' },

  // ── Piratas do Caribe ──
  { name: 'Jack Sparrow', image: 'sparrow.jfif', gender: 'male', personality: 'Imprevisível e altamente estratégico sob aparência caótica; guiado por interesse próprio, mas com código moral flexível.' },

  // ── Sonic ──
  { name: 'Sonic', image: 'sonic.webp', gender: 'male', personality: 'Veloz, confiante e irreverente; ama liberdade e aventura, com atitude descontraída mas corajoso e leal quando necessário.' },

  // ── Shrek ──
  { name: 'Shrek', image: 'shrek.jfif', gender: 'male', personality: 'Cínico, defensivo e inicialmente isolado; utiliza humor e grosseria como mecanismo de proteção, mas revela grande capacidade de afeto e lealdade.' },
  { name: 'Fiona', image: 'fiona.jfif', gender: 'female', personality: 'Forte, independente e emocionalmente equilibrada; aceita sua identidade e demonstra resiliência ao lidar com dualidades internas.' },
  { name: 'Burro', image: 'burro.jfif', gender: 'male', personality: 'Extremamente sociável, falante e emocionalmente aberto; busca conexão constante e demonstra lealdade incondicional.' },
  { name: 'Gato de Botas', image: 'gato de botas.jfif', gender: 'male', personality: 'Carismático, astuto e confiante; combina charme com habilidade estratégica, utilizando inteligência e persuasão.' },

  // ── Patrulha Canina ──
  { name: 'Chase', image: 'chase.png', gender: 'male', personality: 'Disciplinado, focado e orientado a regras; demonstra perfil de liderança operacional com forte senso de dever.' },
  { name: 'Marshall', image: 'marshall.png', gender: 'male', personality: 'Impulsivo, desajeitado e bem-intencionado; apesar dos erros, demonstra coragem e lealdade constante.' },
  { name: 'Skye', image: 'skye.png', gender: 'female', personality: 'Confiante, otimista e corajosa; demonstra independência e forte capacidade de execução em situações de risco.' },
  { name: 'Rubble', image: 'rubble.png', gender: 'male', personality: 'Trabalhador, determinado e prático; possui abordagem direta para resolução de problemas, com personalidade amigável.' },
  { name: 'Rocky', image: 'rocky.png', gender: 'male', personality: 'Engenhoso, sustentável e criativo na resolução de problemas; evita desperdício e demonstra pensamento prático voltado para reutilização.' },
  { name: 'Zuma', image: 'zuma.png', gender: 'male', personality: 'Relaxado, corajoso e adaptável; mantém calma em situações de risco, especialmente em ambientes aquáticos.' },
  { name: 'Everest', image: 'everest.webp', gender: 'female', personality: 'Resiliente, confiante e determinada; demonstra independência e capacidade de agir sob condições adversas.' },
  { name: 'Tracker', image: 'tracker.png', gender: 'male', personality: 'Atento, sensível e orientado por percepção aguçada; demonstra lealdade e forte conexão com o ambiente ao redor.' },

  // ── K/DA (League of Legends) ──
  { name: 'Mira', image: 'mira.webp', gender: 'female', personality: 'Elegante e misteriosa, com estilo punk-pop e atitude desafiadora; combina rebeldia com sofisticação e presença magnética.' },
  { name: 'Rumi', image: 'rumi.webp', gender: 'female', personality: 'Guerreira destemida com espírito livre; combina força e determinação com estilo vibrante, sempre pronta para a ação.' },
  { name: 'Zoey', image: 'zoey.webp', gender: 'female', personality: 'Encantadora e criativa, com energia mágica e personalidade brincalhona; irradia positividade e curiosidade pelo mundo.' },
];

// ─── Helpers ─────────────────────────────────────────────

async function apiCall(method, endpoint, body) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': ADMIN_SECRET,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    // Rate limit — wait and retry once
    if (res.status === 429) {
      const match = text.match(/retry in (\d+)/);
      const wait = match ? parseInt(match[1]) + 2 : 32;
      console.log(`   ⏳ Rate limited — waiting ${wait}s...`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      const retry = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': ADMIN_SECRET,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!retry.ok) {
        const retryText = await retry.text();
        throw new Error(`${method} ${endpoint} → ${retry.status}: ${retryText}`);
      }
      return retry.json();
    }
    throw new Error(`${method} ${endpoint} → ${res.status}: ${text}`);
  }

  return res.json();
}

async function convertToPng(imagePath) {
  const buffer = await sharp(imagePath)
    .png({ quality: 90 })
    .toBuffer();
  return buffer.toString('base64');
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  console.log(`\n🎭 Persona Character Seeder`);
  console.log(`   API: ${API_URL}`);
  console.log(`   Images: ${PERSONA_DIR}\n`);

  // Check for existing characters to skip duplicates
  let existing;
  try {
    existing = await apiCall('GET', '/api/admin/characters');
  } catch (e) {
    console.error(`❌ Cannot reach API: ${e.message}`);
    process.exit(1);
  }
  const existingSlugs = new Set(existing.map((c) => c.slug));
  console.log(`   Found ${existing.length} existing characters\n`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const char of CHARACTERS) {
    const slug = char.name.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

    if (existingSlugs.has(slug)) {
      console.log(`⏭️  ${char.name} (already exists)`);
      skipped++;
      continue;
    }

    const imagePath = path.join(PERSONA_DIR, char.image);
    if (!fs.existsSync(imagePath)) {
      console.log(`⚠️  ${char.name} — image not found: ${char.image}`);
      errors++;
      continue;
    }

    try {
      // 1. Create character
      const character = await apiCall('POST', '/api/admin/characters', {
        name: char.name,
        slug,
        personality: char.personality,
        gender: char.gender,
        tags: char.tags || [],
      });

      // 2. Convert image to PNG and upload
      const base64 = await convertToPng(imagePath);
      await apiCall('POST', `/api/admin/characters/${character.id}/images`, {
        base64,
        filename: `${slug}-ref.png`,
        mimeType: 'image/png',
      });

      console.log(`✅ ${char.name} (${(base64.length / 1024 / 1.37).toFixed(0)} KB)`);
      created++;
    } catch (e) {
      console.error(`❌ ${char.name}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n────────────────────────────`);
  console.log(`✅ Created: ${created}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Errors:  ${errors}`);
  console.log(`   Total:   ${CHARACTERS.length}\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
