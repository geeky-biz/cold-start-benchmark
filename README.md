# Cold Start Benchmark

Automated cold-start performance benchmarking tool that periodically tests web application cold-start behavior using Playwright.

## Overview

This tool visits a series of URLs in sequence, measures cold-start performance metrics, and logs the results to a CSV file. It runs automatically every hour and intelligently rotates through the URL list to ensure comprehensive testing coverage.

## Features

- 🌐 Headless Chromium browser automation via Playwright
- ⏰ Automated hourly testing schedule
- 📊 CSV-based results tracking
- 🔄 Smart URL rotation (different starting point each run)
- 🛡️ Error handling with graceful fallbacks
- 📝 Detailed console logging

## Prerequisites

- **Node.js v22** or higher
- **nvm** (Node Version Manager) - recommended for managing Node.js versions

## Installation

1. **Clone or navigate to the project directory**

```bash
cd /opt/cold-start-benchmark
```

2. **Switch to Node.js v22 using nvm**

```bash
nvm use 22
```

3. **Install dependencies**

```bash
npm install
```

4. **Install Playwright browsers**

```bash
npm run install-browsers
```

This will download Chromium and any required system dependencies.

## Usage

### Start the benchmark tool

```bash
nvm use 22
npm start
```

The tool will:
- Run immediately upon startup
- Schedule subsequent runs every 60 minutes
- Continue running until you stop it (Ctrl+C)

### Output

Results are saved to `results.csv` with the following columns:

| Column | Description |
|--------|-------------|
| URL | The URL that was tested |
| cold-start-indicator | Cold start status indicator |
| request-count | Number of requests made |
| instance-age | Age of the server instance |
| page-processing-time | Time taken to process the page |
| start-render-time | Time to start rendering |
| initialized-from | Initialization source |

If any element is not found on the page, the value will be recorded as `N/A`.

## How It Works

### URL Rotation Logic

The tool tests 9 URLs in a specific sequence:

1. `https://cold-start-check.vercel.app/`
2. `https://cold-start-check.vercel.app/breed`
3. `https://cold-start-check.vercel.app/group`
4. `https://cold-start-check.vercel.app/group/hound-group`
5. `https://cold-start-check.vercel.app/group/terrier-group`
6. `https://cold-start-check.vercel.app/group/working-group`
7. `https://cold-start-check.vercel.app/breed/siberian-husky`
8. `https://cold-start-check.vercel.app/breed/dogo-argentino`
9. `https://cold-start-check.vercel.app/breed/anatolian-shepherd-dog`

**Rotation Behavior:**
- **1st run** (0 CSV rows): Starts with URL #1
- **2nd run** (1 CSV row): Starts with URL #2
- **3rd run** (2 CSV rows): Starts with URL #3
- ...and so on, cycling back after URL #9

This ensures each URL gets tested as the "first hit" periodically, which is important for cold-start analysis.

### Timing

- **Between URLs**: 60 second delay
- **After page load**: 5 second wait before data extraction
- **Between runs**: 60 minutes

## Setting Up a GitHub Repository

### 1. Initialize Git repository

```bash
cd /opt/cold-start-benchmark
git init
```

### 2. Add files to Git

```bash
git add .
```

### 3. Create initial commit

```bash
git commit -m "Initial commit: Cold start benchmark tool"
```

### 4. Create GitHub repository

Go to [https://github.com/new](https://github.com/new) and create a new repository named `cold-start-benchmark`. **Do not** initialize it with README, .gitignore, or license (since we already have these files).

### 5. Add remote and push

Replace `YOUR_USERNAME` with your GitHub username:

```bash
git remote add origin https://github.com/YOUR_USERNAME/cold-start-benchmark.git
git branch -M main
git push -u origin main
```

### 6. Verify

Visit your repository on GitHub to confirm all files have been pushed successfully.

## Troubleshooting

### Playwright browser not found

Run the browser installation command:

```bash
npm run install-browsers
```

### Node version issues

Ensure you're using Node.js v22:

```bash
nvm use 22
node --version
```

### Permission errors on results.csv

Ensure the script has write permissions in the current directory:

```bash
chmod 755 /opt/cold-start-benchmark
```

### Page load timeouts

The default timeout is 30 seconds. If pages consistently fail to load, check your internet connection or the availability of the target website.

## Development

### Project Structure

```
cold-start-benchmark/
├── index.js          # Main script
├── package.json      # Project configuration
├── results.csv       # Generated results (created on first run)
├── README.md         # This file
└── .gitignore        # Git ignore rules
```

### Modifying URLs

Edit the `URLS` array in `index.js`:

```javascript
const URLS = [
  'https://your-url-1.com',
  'https://your-url-2.com',
  // ... add more URLs
];
```

### Changing Schedule

Modify the `RUN_INTERVAL` constant in `index.js`:

```javascript
const RUN_INTERVAL = 60 * 60 * 1000; // 60 minutes
```

## License

MIT

