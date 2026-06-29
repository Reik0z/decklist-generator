const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// ── Paths (todas relativas al proyecto) ───────────────────────────────────────
const CARDS_JSON  = path.join(__dirname, 'cards_local.json');
const INPUT_DIR   = path.join(__dirname, 'input');
const OUTPUT_DIR  = path.join(__dirname, 'output');
const TEMPLATE    = path.join(__dirname, 'template.html');

// ── Load card database ────────────────────────────────────────────────────────
const cardsData = JSON.parse(fs.readFileSync(CARDS_JSON, 'utf8'));

const cardByExactName  = new Map(); // "leblanc, deceiver" -> card
const cardByCleanName  = new Map(); // "leblancdeciver"   -> card (fallback)

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

  // Decklist uses "Name, Title" but JSON uses "Name - Title" for champions/legends
  const dashVersion = lower.replace(/,\s+/, ' - ');
  if (cardByExactName.has(dashVersion)) return cardByExactName.get(dashVersion);

  // Normalized fallback (strips all non-alphanumeric)
  const clean = cleanName(name);
  if (cardByCleanName.has(clean)) return cardByCleanName.get(clean);

  return null;
}

function resolveImage(card) {
  if (!card) return null;
  const rawPath = card.media.local_image.replace(/\?.*$/, ''); // strip query string
  const abs = path.resolve(__dirname, rawPath);
  if (!fs.existsSync(abs)) return null;
  return 'file:///' + abs.replace(/\\/g, '/');
}

// ── Decklist parser ───────────────────────────────────────────────────────────
const SECTION_REGEX = /^(Legend|Champion|MainDeck|Battlefields|Rune\s*Pool|Sideboard)\s*:\s*(.*)/i;
const SECTION_MAP   = {
  legend:      'legend',
  champion:    'champion',
  maindeck:    'maindeck',
  battlefields:'battlefields',
  rune_pool:   'runepool',
  runepool:    'runepool',
  sideboard:   'sideboard',
};

function parseDecklist(raw) {
  const deck = { legend:[], champion:[], maindeck:[], battlefields:[], runepool:[], sideboard:[] };

  // Ensure every section keyword starts on its own line
  const normalised = raw
    .replace(/(Legend\s*:)/gi,       '\n$1')
    .replace(/(Champion\s*:)/gi,     '\n$1')
    .replace(/(MainDeck\s*:)/gi,     '\n$1')
    .replace(/(Battlefields\s*:)/gi, '\n$1')
    .replace(/(Rune\s*Pool\s*:)/gi,  '\n$1')
    .replace(/(Sideboard\s*:)/gi,    '\n$1');

  let section = null;

  for (const rawLine of normalised.split('\n')) {
    let line = rawLine.trim();
    if (!line || line === '.') continue;

    const sectionMatch = line.match(SECTION_REGEX);
    if (sectionMatch) {
      const key = sectionMatch[1].toLowerCase().replace(/\s+/g, '_');
      section = SECTION_MAP[key] || null;
      line    = sectionMatch[2].trim(); // possible first card on same line
    }

    if (!line || !section) continue;

    const cardMatch = line.match(/^(\d+)\s+(.+?)\.?\s*$/);
    if (cardMatch) {
      const qty  = parseInt(cardMatch[1], 10);
      const name = cardMatch[2].trim();
      const card = findCard(name);
      deck[section].push({ qty, name, card, img: resolveImage(card), orientation: card?.orientation ?? 'portrait' });
    }
  }

  return deck;
}

const os = require('os');

// ── HTML rendering ────────────────────────────────────────────────────────────
async function renderDeck(browser, playerName, decklistText, outputFile) {
  const deck     = parseDecklist(decklistText);
  const deckData = { playerName, ...deck };

  const templateHtml = fs.readFileSync(TEMPLATE, 'utf8');
  const html = templateHtml.replace(
    '/* __DECK_DATA__ */',
    `window.DECK_DATA = ${JSON.stringify(deckData, null, 0)};`
  );

  // Write to a temp file so Puppeteer can load file:// images from the same origin
  const tmpFile = path.join(os.tmpdir(), `riftbound_${Date.now()}.html`);
  fs.writeFileSync(tmpFile, html, 'utf8');

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
  await page.goto('file:///' + tmpFile.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });

  // Wait for images to settle
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

  await page.screenshot({ path: outputFile, fullPage: false });
  await page.close();
  fs.unlinkSync(tmpFile);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = fs.readdirSync(INPUT_DIR).filter(f => f.toLowerCase().endsWith('.txt'));

  if (files.length === 0) {
    console.log('No .txt files found in input/. Add player decklists there and re-run.');
    return;
  }

  console.log(`Found ${files.length} decklist(s) to process.\n`);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

  for (const file of files) {
    const playerName = path.basename(file, '.txt');
    const text       = fs.readFileSync(path.join(INPUT_DIR, file), 'utf8');
    const out        = path.join(OUTPUT_DIR, `${playerName}.png`);

    process.stdout.write(`  Processing "${playerName}"...`);
    try {
      await renderDeck(browser, playerName, text, out);
      console.log(' ✓');
    } catch (err) {
      console.log(` ✗  ${err.message}`);
    }
  }

  await browser.close();
  console.log(`\nDone. Images saved in: ${OUTPUT_DIR}`);
}

main();
