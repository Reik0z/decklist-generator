const fs        = require('fs');
const path      = require('path');
const os        = require('os');
const puppeteer = require('puppeteer');

// ── Color palette por leyenda ─────────────────────────────────────────────────
// Colores representativos de cada campeón (fallback: PALETTE_FALLBACK por índice)
const LEGEND_COLORS = {
  'Ahri':         '#FF6EB4', // rosa — zorro espiritual
  'Annie':        '#FF5722', // naranja fuego — Tibbers
  'Azir':         '#C9A84C', // ámbar dorado — emperador del desierto
  'Darius':       '#8B0000', // rojo oscuro — Noxus
  'Diana':        '#7FB3D3', // azul plateado — aspecto lunar
  'Draven':       '#CC4400', // naranja quemado — el espectáculo
  'Ezreal':       '#2980B9', // azul explorador — guantelete arcano
  'Fiora':        '#0E6655', // verde oscuro — duelista
  'Garen':        '#1F618D', // azul real — Demacia
  'Irelia':       '#7D3C98', // violeta — danza de cuchillas
  'Ivern':        '#27AE60', // verde bosque — espíritu natural
  'Jax':          '#5B2C8D', // morado — gran maestro
  'Jhin':         '#B22222', // rojo carmesí — el Virtuoso
  'Jinx':         '#00D4FF', // cian eléctrico — caos Zaun
  "Kai'Sa":       '#884EA0', // morado vacío — cazadora
  "Kha'Zix":      '#6C3483', // morado oscuro — depredador
  'LeBlanc':      '#A020F0', // púrpura mágico — la engañadora
  'Lee Sin':      '#E67E22', // ámbar naranja — monje ciego
  'Leona':        '#FFD700', // dorado solar — aspecto del sol
  'Lillia':       '#F1948A', // rosa suave — cierva onírica
  'Lucian':       '#5DADE2', // azul claro — luz de reliquias
  'Lux':          '#F9E400', // amarillo brillante — magia de luz
  'Master Yi':    '#2874A6', // azul acero — Wuju
  'Miss Fortune': '#DC143C', // carmesí — Aguas Estancadas
  'Ornn':         '#D35400', // óxido naranja — la forja
  'Poppy':        '#4A235A', // morado profundo — yordle
  'Pyke':         '#148F77', // verde azulado oscuro — el ahogado
  "Rek'Sai":      '#A569BD', // morado vacío medio
  'Renata Glasc': '#2ECC71', // verde tóxico — química Zaun
  'Rengar':       '#784212', // marrón oscuro — cazador
  'Rumble':       '#F39C12', // naranja dorado — fuego mecánico
  'Sett':         '#CD853F', // marrón dorado — luchador de foso
  'Sivir':        '#17A589', // verde azulado — la maestra de batalla
  'Teemo':        '#52BE80', // verde medio — explorador yordle
  'Vex':          '#717D7E', // gris sombrío — la lúgubre
  'Vi':           '#E91E8C', // magenta intenso — ejecutora Piltover
  'Viktor':       '#626567', // gris metálico — el heraldo máquina
  'Volibear':     '#1A5276', // azul tormenta — dios de la tormenta
  'Yasuo':        '#85929E', // gris acero — el viento
};

const PALETTE_FALLBACK = [
  '#C4982A','#E52424','#2A7BC4','#24A050',
  '#8A2AC4','#C4602A','#2AC4BA','#C42A7B',
];

// ── Paths ─────────────────────────────────────────────────────────────────────
const CARDS_JSON  = path.join(__dirname, 'cards_local.json');
const INPUT_DIR   = path.join(__dirname, 'input');
const OUTPUT_DIR  = path.join(__dirname, 'output');
const TEMPLATE    = path.join(__dirname, 'template-stats-pie.html');

// ── Card database ─────────────────────────────────────────────────────────────
const cardsData       = JSON.parse(fs.readFileSync(CARDS_JSON, 'utf8'));
const cardByExactName = new Map();
const cardByCleanName = new Map();

function cleanName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

for (const card of cardsData.items) {
  const exact = card.name.toLowerCase().trim();
  if (!cardByExactName.has(exact)) cardByExactName.set(exact, card);
  const clean = cleanName(card.name);
  if (!cardByCleanName.has(clean)) cardByCleanName.set(clean, card);
}

function findCard(name) {
  const lower = name.toLowerCase().trim();
  if (cardByExactName.has(lower)) return cardByExactName.get(lower);
  const dashVersion = lower.replace(/,\s+/, ' - ');
  if (cardByExactName.has(dashVersion)) return cardByExactName.get(dashVersion);
  const clean = cleanName(name);
  if (cardByCleanName.has(clean)) return cardByCleanName.get(clean);
  return null;
}

function resolveImage(card) {
  if (!card) return null;
  const rawPath = card.media.local_image.replace(/\?.*$/, '');
  const abs = path.resolve(__dirname, rawPath);
  if (!fs.existsSync(abs)) return null;
  return 'file:///' + abs.replace(/\\/g, '/');
}

// ── Decklist parser (only extracts the Legend name) ───────────────────────────
const SECTION_REGEX = /^(Legend|Champion|MainDeck|Battlefields|Runes?(?:\s*Pool)?|Sideboard)\s*:\s*(.*)/i;
const CARD_REGEX    = /^(\d+)\s+(.+?)\.?\s*$/;

function parseLegendName(raw) {
  const normalised = raw
    .replace(/(Legend\s*:)/gi,             '\n$1')
    .replace(/(Champion\s*:)/gi,           '\n$1')
    .replace(/(MainDeck\s*:)/gi,           '\n$1')
    .replace(/(Battlefields\s*:)/gi,       '\n$1')
    .replace(/(Runes?\s*(?:Pool\s*)?:)/gi, '\n$1')
    .replace(/(Sideboard\s*:)/gi,          '\n$1');

  let inLegend = false;

  for (const rawLine of normalised.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const sectionMatch = line.match(SECTION_REGEX);
    if (sectionMatch) {
      inLegend = sectionMatch[1].toLowerCase().startsWith('legend');
      const inline = sectionMatch[2].trim();
      if (inLegend && inline) {
        const m = inline.match(CARD_REGEX);
        if (m) return m[2].replace(/\s*\[[A-Z0-9*-]+\]\s*$/, '').trim();
      }
      continue;
    }

    if (!inLegend) continue;

    const m = line.match(CARD_REGEX);
    if (m) return m[2].replace(/\s*\[[A-Z0-9*-]+\]\s*$/, '').trim();
  }

  return null;
}

// ── Build stats from all input decklists ──────────────────────────────────────
function collectStats() {
  const files = fs.readdirSync(INPUT_DIR).filter(f => f.toLowerCase().endsWith('.txt'));
  if (files.length === 0) return null;

  const counts = new Map();
  for (const file of files) {
    const text = fs.readFileSync(path.join(INPUT_DIR, file), 'utf8');
    const name = parseLegendName(text);
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }

  const total = files.length;

  const stats = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([rawName, count], i) => {
      const card        = findCard(rawName);
      const baseName    = card?.tags?.[0] ?? rawName.split(/\s*[-,]\s*/)[0].trim();
      const displayName = baseName.toUpperCase();
      const color       = LEGEND_COLORS[baseName] ?? PALETTE_FALLBACK[i % PALETTE_FALLBACK.length];
      return {
        rank:   i + 1,
        name:   displayName,
        count,
        pct:    ((count / total) * 100).toFixed(1),
        img:    resolveImage(card),
        domain: card?.classification?.domain ?? [],
        color,
      };
    });

  return { stats, total };
}

// ── Render ────────────────────────────────────────────────────────────────────
async function generateStatsPie(options = {}) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const result = collectStats();
  if (!result) {
    console.log('No decklists found in input/');
    return;
  }

  const { stats, total } = result;
  const statsData = {
    stats,
    total,
    date:      new Date().toLocaleDateString('es-CL'),
    eventName: options.eventName ?? 'Unleashed Open',
  };

  const templateHtml = fs.readFileSync(TEMPLATE, 'utf8');
  const html = templateHtml.replace(
    '/* __STATS_DATA__ */',
    `window.STATS_DATA = ${JSON.stringify(statsData)};`
  );

  const tmpFile = path.join(os.tmpdir(), `riftbound_pie_${Date.now()}.html`);
  fs.writeFileSync(tmpFile, html, 'utf8');

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page    = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 2 });
  await page.goto('file:///' + tmpFile.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

  const outFile = path.join(OUTPUT_DIR, 'stats-pie.png');
  await page.screenshot({ path: outFile, fullPage: false });
  await browser.close();
  fs.unlinkSync(tmpFile);

  console.log(`\nPie chart → ${outFile}`);
  console.log(`Total decklists: ${total}\n`);
  for (const s of stats) {
    console.log(`  #${s.rank} ${s.name.padEnd(24)} ${s.count} decks  (${s.pct}%)`);
  }
}

generateStatsPie();
