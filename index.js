const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URLS = [
  'https://cold-start-check.vercel.app',
  'https://loquacious-yeot-3496da.netlify.app',
  'https://cold-start-check.punit-e52.workers.dev',
  'https://cold-start-check.punits.dev'
]
// Configuration
const URLS = [
  '/',
  '/breed',
  '/group',
  '/group/hound-group',
  '/group/terrier-group',
  '/group/working-group',
  '/breed/siberian-husky',
  '/breed/dogo-argentino',
  '/breed/anatolian-shepherd-dog',
  '/api/db-like',
  '/api/compute-like',
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
const DELAY_BETWEEN_URLS = 20 * 1000; // 20 seconds
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

// Simple CSV parser that handles quoted values
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  result.push(current);
  return result;
}

// Calculate run number dynamically by analyzing CSV data
// This makes the rotation logic robust to changes in BASE_URLS.length or URLS.length
function calculateRunNumber() {
  if (!fs.existsSync(CSV_FILE)) {
    return 0;
  }
  
  const content = fs.readFileSync(CSV_FILE, 'utf-8');
  const lines = content.trim().split('\n');
  
  // If file is empty or only has header, return 0
  if (lines.length <= 1) {
    return 0;
  }
  
  // Parse header to find URL column index
  const headers = parseCSVLine(lines[0]);
  const urlColumnIndex = headers.indexOf('URL');
  
  if (urlColumnIndex === -1) {
    // Fallback: if URL column not found, use row count method
    const rowCount = lines.length - 1;
    return Math.floor(rowCount / (BASE_URLS.length * URLS.length));
  }
  
  // Count occurrences of each URL
  const urlCounts = new Map();
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length > urlColumnIndex) {
      const url = row[urlColumnIndex].trim();
      if (url) {
        urlCounts.set(url, (urlCounts.get(url) || 0) + 1);
      }
    }
  }
  
  // If no URLs found, return 0
  if (urlCounts.size === 0) {
    return 0;
  }
  
  // Find minimum count - this represents complete runs
  // Each complete run tests all URLs once (with all BASE_URLS for each)
  const counts = Array.from(urlCounts.values());
  const minCount = Math.min(...counts);
  
  // The minimum count is the number of complete runs
  // (all URLs have been tested at least this many times)
  return minCount;
}

// Rotate URL array based on starting index
function rotateURLs(startIndex) {
  const index = startIndex % URLS.length;
  return [...URLS.slice(index), ...URLS.slice(0, index)];
}

// Check if URL is an API endpoint
function isAPIUrl(url) {
  return url.includes('/api/');
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

// Extract data from API JSON response
async function extractAPIData(response) {
  try {
    if (!response) {
      throw new Error('No response received');
    }
    
    // Parse JSON response
    const json = await response.json();
    
    // Extract timing data
    const timing = json.timing || {};
    
    return {
      'cold-start-indicator': timing['x-is-cold-start'] !== undefined ? String(timing['x-is-cold-start']) : 'N/A',
      'request-count': timing['x-request-count'] !== undefined ? String(timing['x-request-count']) : 'N/A',
      'instance-age': timing['x-instance-age'] || 'N/A',
      'page-processing-time': timing['x-page-processing-time'] !== undefined ? String(timing['x-page-processing-time']) : 'N/A',
      'start-render-time': 'N/A', // Will be set by TTFB capture
      'initialized-from': timing['x-initialized-from'] || 'N/A'
    };
  } catch (error) {
    console.log(`  ⚠️  Error extracting API data: ${error.message}`);
    return {
      'cold-start-indicator': 'N/A',
      'request-count': 'N/A',
      'instance-age': 'N/A',
      'page-processing-time': 'N/A',
      'start-render-time': 'N/A',
      'initialized-from': 'N/A'
    };
  }
}

// Capture TTFB for API requests
async function captureTTFB(page, fullUrl) {
  return new Promise((resolve) => {
    let ttfbCaptured = false;
    
    const handler = async (request) => {
      const requestUrl = request.url();
      // Match the exact URL or URL without query params (handles redirects)
      const urlBase = fullUrl.split('?')[0];
      const requestUrlBase = requestUrl.split('?')[0];
      
      if ((requestUrl === fullUrl || requestUrlBase === urlBase) && requestUrl.includes('/api/')) {
        if (!ttfbCaptured) {
          try {
            const timing = request.timing();
            // Calculate TTFB: time from request start to response start
            const ttfb = timing.responseStart - timing.requestStart;
            
            console.log(`  📊 TTFB captured: ${ttfb}ms`);
            ttfbCaptured = true;
            page.removeListener('requestfinished', handler);
            resolve(String(ttfb));
          } catch (error) {
            console.log(`  ⚠️  Error capturing TTFB: ${error.message}`);
            if (!ttfbCaptured) {
              ttfbCaptured = true;
              page.removeListener('requestfinished', handler);
              resolve('N/A');
            }
          }
        }
      }
    };
    
    page.on('requestfinished', handler);
    
    // Set a timeout to resolve if TTFB is not captured within 30 seconds
    setTimeout(() => {
      if (!ttfbCaptured) {
        ttfbCaptured = true;
        page.removeListener('requestfinished', handler);
        console.log('  ⚠️  TTFB capture timeout');
        resolve('N/A');
      }
    }, 30000);
  });
}

// Main benchmark run
async function runBenchmark() {
  const iterationStartTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log(`🚀 Starting benchmark run at ${new Date().toISOString()}`);
  console.log('='.repeat(60) + '\n');
  
  let browser = null;
  const results = [];
  
  try {
    // Calculate starting indices based on CSV analysis
    const rowCount = countCSVRows();
    const totalMeasurementsPerIteration = BASE_URLS.length * URLS.length;
    
    // Calculate run number dynamically by analyzing CSV data
    // This approach is robust to changes in BASE_URLS.length or URLS.length
    // It counts how many times each URL appears and uses the minimum count
    // as the number of complete runs
    const runNumber = calculateRunNumber();
    
    // For each run, rotate the starting URL (run 0: '/', run 1: '/breed', etc.)
    // BASE_URL never rotates - always uses original order
    // Next run starts with URL index = runNumber (since run 0 uses index 0, run 1 uses index 1, etc.)
    const urlStartIndex = runNumber % URLS.length;
    
    const rotatedURLs = rotateURLs(urlStartIndex);
    // BASE_URLs always in original order, no rotation
    const baseURLsToUse = BASE_URLS;
    
    console.log(`📊 Current CSV row count: ${rowCount}`);
    console.log(`🔄 Run number: ${runNumber}`);
    console.log(`📍 Starting URL for this run: ${rotatedURLs[0]} (URL index: ${urlStartIndex})`);
    console.log(`📍 BASE_URLs always in original order (no rotation)\n`);
    
    // Launch browser
    console.log('🌐 Launching Chromium headless browser...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    let measurementCount = 0;
    const totalMeasurements = BASE_URLS.length * URLS.length;
    
    // Visit each URL and each BASE_URL combination (all BASE_URLs for a URL, then next URL)
    for (let urlIdx = 0; urlIdx < rotatedURLs.length; urlIdx++) {
      const url = rotatedURLs[urlIdx];
      const isAPI = isAPIUrl(url);
      
      for (let baseUrlIdx = 0; baseUrlIdx < baseURLsToUse.length; baseUrlIdx++) {
        const baseUrl = baseURLsToUse[baseUrlIdx];
        const fullUrl = baseUrl + url;
        measurementCount++;
        
        console.log(`\n[${measurementCount}/${totalMeasurements}] Processing: ${fullUrl} ${isAPI ? '(API)' : ''}`);
        console.log(`  📍 BASE_URL: ${baseUrl}, URL: ${url}`);
        
        try {
          let rowData = { 'BASE_URL': baseUrl, 'URL': url };
          
          if (isAPI) {
            // Handle API endpoints
            console.log('  ⏳ Capturing TTFB and fetching API response...');
            
            // Start TTFB capture before navigation
            const ttfbPromise = captureTTFB(page, fullUrl);
            
            // Navigate to API URL
            const response = await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 30000 });
            
            // Wait for TTFB capture
            const ttfb = await ttfbPromise;
            
            // Extract data from JSON response
            console.log('  📝 Extracting data from JSON...');
            const apiData = await extractAPIData(response);
            
            // Combine API data with TTFB
            rowData = {
              'BASE_URL': baseUrl,
              'URL': url,
              'cold-start-indicator': apiData['cold-start-indicator'],
              'request-count': apiData['request-count'],
              'instance-age': apiData['instance-age'],
              'page-processing-time': apiData['page-processing-time'],
              'start-render-time': ttfb,
              'initialized-from': apiData['initialized-from']
            };
            
            // Wait additional 5 seconds
            console.log('  ⏳ Waiting 5 seconds...');
            await sleep(WAIT_AFTER_LOAD);
            
          } else {
            // Handle HTML pages (existing logic)
            // Navigate to URL and wait for load
            console.log('  ⏳ Navigating...');
            await page.goto(fullUrl, { waitUntil: 'load', timeout: 30000 });
            
            // Wait additional 5 seconds
            console.log('  ⏳ Waiting 5 seconds...');
            await sleep(WAIT_AFTER_LOAD);
            
            // Extract data from elements
            console.log('  📝 Extracting data...');
            
            for (const elementId of ELEMENT_IDS) {
              const value = await extractElementText(page, elementId);
              rowData[elementId] = value;
            }
          }
          
          results.push(rowData);
          console.log('  ✅ Data extracted successfully');
          
          // Log extracted values
          console.log('  📊 Values:');
          ELEMENT_IDS.forEach(id => {
            console.log(`     ${id}: ${rowData[id]}`);
          });
          
          // Wait 20 seconds before next measurement (except for last measurement)
          if (measurementCount < totalMeasurements) {
            console.log(`  ⏸️  Waiting 20 seconds before next measurement...`);
            await sleep(DELAY_BETWEEN_URLS);
          }
          
        } catch (error) {
          console.log(`  ❌ Error processing URL: ${error.message}`);
          // Add row with N/A values on error
          const rowData = { 'BASE_URL': baseUrl, 'URL': url };
          ELEMENT_IDS.forEach(id => {
            rowData[id] = 'N/A';
          });
          results.push(rowData);
          
          // Still wait before next measurement if not last
          if (measurementCount < totalMeasurements) {
            console.log(`  ⏸️  Waiting 20 seconds before next measurement...`);
            await sleep(DELAY_BETWEEN_URLS);
          }
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
  
  // Calculate elapsed time and wait until 60 minutes from iteration start
  const elapsedTime = Date.now() - iterationStartTime;
  const remainingTime = RUN_INTERVAL ;
  
  console.log('='.repeat(60));
  console.log(`✨ Benchmark run completed at ${new Date().toISOString()}`);
  console.log(`⏱️  Elapsed time: ${Math.round(elapsedTime / 1000)} seconds`);
  
  if (remainingTime > 0) {
    const waitMinutes = Math.round(remainingTime / 60000);
    console.log(`⏰ Waiting ${waitMinutes} minutes until next iteration (60 minutes from start)...`);
    console.log('='.repeat(60) + '\n');
    await sleep(remainingTime);
  } else {
    console.log('⚠️  Iteration took longer than 60 minutes, starting next iteration immediately');
    console.log('='.repeat(60) + '\n');
  }
  
  return remainingTime <= 0; // Return true if we should continue immediately
}

// Write results to CSV file
function writeResultsToCSV(results) {
  const headers = ['BASE_URL', 'URL', ...ELEMENT_IDS];
  
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
  console.log('📅 Each iteration will test all BASE_URLS × URLS combinations');
  console.log('⏱️  20 seconds delay between each measurement');
  console.log('🔄 Next iteration starts 60 minutes from the start of current iteration');
  console.log('📁 Results will be saved to: results.csv\n');
  
  // Run continuously with proper timing
  while (true) {
    await runBenchmark();
  }
}

// Start the application
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

