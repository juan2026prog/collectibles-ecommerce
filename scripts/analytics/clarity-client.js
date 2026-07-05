const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') });
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env.local') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const CLARITY_API_TOKEN = process.env.CLARITY_API_TOKEN;

if (!CLARITY_API_TOKEN) {
  console.error('CLARITY_API_TOKEN no configurado');
  process.exit(1);
}

// Target folder for snapshots
const targetDir = path.join(__dirname, '../../docs/analytics/data/clarity');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Helper to get date string in local timezone (YYYY-MM-DD)
function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const currentDate = getLocalDateString();
const dimensions = {
  device: 'Device',
  browser: 'Browser',
  os: 'OS',
  url: 'URL',
  referrer: 'Referrer URL',
  country: 'Country/Region'
};

async function fetchClarityDimension(dimKey, dimName) {
  const fileName = `clarity-${dimKey}-${currentDate}.json`;
  const filePath = path.join(targetDir, fileName);

  // Caching mechanism: check if snapshot already exists
  if (fs.existsSync(filePath)) {
    console.log(`[Cache Hit] Snapshot for ${dimKey} on ${currentDate} already exists at: ${fileName}`);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  console.log(`[API Call] Fetching Clarity data for dimension: ${dimName}...`);
  try {
    const url = `https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=3&dimension1=${encodeURIComponent(dimName)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CLARITY_API_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    const result = await response.json();
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
    console.log(`[Saved] Created snapshot: ${fileName}`);
    return result;
  } catch (err) {
    console.error(`[Error] Failed to fetch dimension ${dimName}:`, err.message);
    return null;
  }
}

async function run() {
  console.log('--- STARTING CLARITY REAL DATA EXTRACTION ---');
  const summary = {
    extractedAt: new Date().toISOString(),
    date: currentDate,
    dimensions: {}
  };

  for (const [key, name] of Object.entries(dimensions)) {
    const data = await fetchClarityDimension(key, name);
    if (data) {
      summary.dimensions[key] = data;
    }
  }

  // Save latest summary
  const summaryPath = path.join(targetDir, 'latest-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`[Saved] Consolidated results written to: latest-summary.json`);
  console.log('--- CLARITY EXTRACTION COMPLETE ---');
}

run();
