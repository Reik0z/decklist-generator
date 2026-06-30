const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const puppeteer = require('puppeteer');

// ── Paths ─────────────────────────────────────────────────────────────────────
const CARDS_JSON     = path.join(__dirname, 'cards_local.json');
const INPUT_DIR      = path.join(__dirname, 'input');
const OUTPUT_DIR     = path.join(__dirname, 'output');
const STATS_TEMPLATE = path.join(__dirname, 'template-stats.html');

// ── Card database ─────────────────────────────────────────────────────────────
const cardsData      = JSON.parse(fs.readFileSync(CARDS_JSON, 'utf8'));
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

// ── Decklist parser (only extracts Legend) ────────────────────────────────────
const SECTION_REGEX = /^(Legend|Champion|MainDeck|Battlefields|Runes?(?:\s*Pool)?|Sideboard)\s*:\s*(.*)/i;
const CARD_REGEX    = /^(\d+)\s+(.+?)\.?\s*$/;

function parseLegendName(raw) {
  const normalised = raw
    .replace(/(Legend\s*:)/gi,              '\n$1')
    .replace(/(Champion\s*:)/gi,            '\n$1')
    .replace(/(MainDeck\s*:)/gi,            '\n$1')
    .replace(/(Battlefields\s*:)/gi,        '\n$1')
    .replace(/(Runes?\s*(?:Pool\s*)?:)/gi,  '\n$1')
    .replace(/(Sideboard\s*:)/gi,           '\n$1');

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
      const card = findCard(rawName);

      // Display name: part before " - " or ", " (base champion name only)
      const displayName = rawName.split(/\s*[-,]\s*/)[0].trim().toUpperCase();

      return {
        rank:    i + 1,
        name:    displayName,
        count,
        pct:     ((count / total) * 100).toFixed(1),
        img:     resolveImage(card),
        domain:  card?.classification?.domain ?? [],
      };
    });

  return { stats, total };
}

// ── Render ────────────────────────────────────────────────────────────────────
async function generateStats(options = {}) {
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

  const templateHtml = fs.readFileSync(STATS_TEMPLATE, 'utf8');
  const html = templateHtml.replace(
    '/* __STATS_DATA__ */',
    `window.STATS_DATA = ${JSON.stringify(statsData)};`
  );

  const tmpFile = path.join(os.tmpdir(), `riftbound_stats_${Date.now()}.html`);
  fs.writeFileSync(tmpFile, html, 'utf8');

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page    = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
  await page.goto('file:///' + tmpFile.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

  const outFile = path.join(OUTPUT_DIR, 'stats.png');
  await page.screenshot({ path: outFile, fullPage: false });
  await browser.close();
  fs.unlinkSync(tmpFile);

  console.log(`\nStats → ${outFile}`);
  console.log(`Total decklists: ${total}\n`);
  for (const s of stats) {
    console.log(`  #${s.rank} ${s.name.padEnd(24)} ${s.count} decks  (${s.pct}%)`);
  }
}

generateStats();
