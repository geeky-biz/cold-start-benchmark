const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const URLS = [
  'https://cold-start-check.vercel.app/',
  'https://cold-start-check.vercel.app/breed',
  'https://cold-start-check.vercel.app/group',
  'https://cold-start-check.vercel.app/group/hound-group',
  'https://cold-start-check.vercel.app/group/terrier-group',
  'https://cold-start-check.vercel.app/group/working-group',
  'https://cold-start-check.vercel.app/breed/siberian-husky',
  'https://cold-start-check.vercel.app/breed/dogo-argentino',
  'https://cold-start-check.vercel.app/breed/anatolian-shepherd-dog'
];

const ELEMENT_IDS = [
  'cold-start-indicator',
  'request-count',
  'instance-age',
  'page-processing-time',
  'start-render-time',
  'initialized-from'
];

const CSV_FILE = path.join(__dirname, 'results.csv');
const DELAY_BETWEEN_URLS = 60 * 1000; // 60 seconds
const WAIT_AFTER_LOAD = 5 * 1000; // 5 seconds
const RUN_INTERVAL = 60 * 60 * 1000; // 60 minutes

// Utility function to sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Count rows in CSV file (excluding header)
function countCSVRows() {
  if (!fs.existsSync(CSV_FILE)) {
    return 0;
  }
  
  const content = fs.readFileSync(CSV_FILE, 'utf-8');
  const lines = content.trim().split('\n');
  
  // If file is empty or only has header, return 0
  if (lines.length <= 1) {
    return 0;
  }
  
  return lines.length - 1; // Exclude header row
}

// Rotate URL array based on starting index
function rotateURLs(startIndex) {
  const index = startIndex % URLS.length;
  return [...URLS.slice(index), ...URLS.slice(0, index)];
}

// Extract element text by ID, return 'N/A' if not found
async function extractElementText(page, elementId) {
  try {
    const element = await page.$(`#${elementId}`);
    if (element) {
      const text = await element.innerText();
      return text.trim();
    }
    return 'N/A';
  } catch (error) {
    console.log(`  ⚠️  Error extracting element '${elementId}': ${error.message}`);
    return 'N/A';
  }
}

// Main benchmark run
async function runBenchmark() {
  console.log('\n' + '='.repeat(60));
  console.log(`🚀 Starting benchmark run at ${new Date().toISOString()}`);
  console.log('='.repeat(60) + '\n');
  
  let browser = null;
  const results = [];
  
  try {
    // Calculate starting URL index based on CSV row count
    const rowCount = countCSVRows();
    const rotatedURLs = rotateURLs(rowCount);
    
    console.log(`📊 Current CSV row count: ${rowCount}`);
    console.log(`🔄 Starting from URL index: ${rowCount % URLS.length}\n`);
    
    // Launch browser
    console.log('🌐 Launching Chromium headless browser...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Visit each URL in sequence
    for (let i = 0; i < rotatedURLs.length; i++) {
      const url = rotatedURLs[i];
      console.log(`\n[${i + 1}/${rotatedURLs.length}] Processing: ${url}`);
      
      try {
        // Navigate to URL and wait for load
        console.log('  ⏳ Navigating...');
        await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        
        // Wait additional 5 seconds
        console.log('  ⏳ Waiting 5 seconds...');
        await sleep(WAIT_AFTER_LOAD);
        
        // Extract data from elements
        console.log('  📝 Extracting data...');
        const rowData = { URL: url };
        
        for (const elementId of ELEMENT_IDS) {
          const value = await extractElementText(page, elementId);
          rowData[elementId] = value;
        }
        
        results.push(rowData);
        console.log('  ✅ Data extracted successfully');
        
        // Log extracted values
        console.log('  📊 Values:');
        ELEMENT_IDS.forEach(id => {
          console.log(`     ${id}: ${rowData[id]}`);
        });
        
        // Wait 60 seconds before next URL (except for last URL)
        if (i < rotatedURLs.length - 1) {
          console.log(`  ⏸️  Waiting 60 seconds before next URL...`);
          await sleep(DELAY_BETWEEN_URLS);
        }
        
      } catch (error) {
        console.log(`  ❌ Error processing URL: ${error.message}`);
        // Add row with N/A values on error
        const rowData = { URL: url };
        ELEMENT_IDS.forEach(id => {
          rowData[id] = 'N/A';
        });
        results.push(rowData);
        
        // Still wait before next URL if not last
        if (i < rotatedURLs.length - 1) {
          console.log(`  ⏸️  Waiting 60 seconds before next URL...`);
          await sleep(DELAY_BETWEEN_URLS);
        }
      }
    }
    
    // Close browser
    console.log('\n🔒 Closing browser...');
    await browser.close();
    browser = null;
    
    // Write results to CSV
    console.log('💾 Writing results to CSV...');
    writeResultsToCSV(results);
    console.log('✅ Results saved successfully\n');
    
  } catch (error) {
    console.error(`\n❌ Fatal error during benchmark: ${error.message}\n`);
    console.error(error.stack);
  } finally {
    // Ensure browser is closed
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('Error closing browser:', e.message);
      }
    }
  }
  
  console.log('='.repeat(60));
  console.log(`✨ Benchmark run completed at ${new Date().toISOString()}`);
  console.log('='.repeat(60) + '\n');
}

// Write results to CSV file
function writeResultsToCSV(results) {
  const headers = ['URL', ...ELEMENT_IDS];
  
  // Check if file exists and has headers
  let needsHeaders = false;
  if (!fs.existsSync(CSV_FILE)) {
    needsHeaders = true;
  } else {
    const content = fs.readFileSync(CSV_FILE, 'utf-8');
    if (content.trim().length === 0) {
      needsHeaders = true;
    }
  }
  
  // Write headers if needed
  if (needsHeaders) {
    fs.writeFileSync(CSV_FILE, headers.join(',') + '\n');
  }
  
  // Append results
  const rows = results.map(row => {
    return headers.map(header => {
      const value = row[header] || 'N/A';
      // Escape commas and quotes in CSV
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
  });
  
  fs.appendFileSync(CSV_FILE, rows.join('\n') + '\n');
}

// Main execution
async function main() {
  console.log('\n🎯 Cold Start Benchmark Tool');
  console.log('================================\n');
  console.log('📅 Scheduled to run every 60 minutes');
  console.log('📁 Results will be saved to: results.csv\n');
  
  // Run immediately on startup
  await runBenchmark();
  
  // Schedule to run every 60 minutes
  console.log('⏰ Next run scheduled in 60 minutes...\n');
  setInterval(async () => {
    await runBenchmark();
    console.log('⏰ Next run scheduled in 60 minutes...\n');
  }, RUN_INTERVAL);
}

// Start the application
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

