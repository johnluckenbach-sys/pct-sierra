// Google Apps Script — paste into Extensions > Apps Script in your Google Sheet
// Setup:
//   1. Paste this script
//   2. Run setConfig() once to store your GitHub token
//   3. Add an installable trigger: Triggers > Add Trigger > syncToGitHub > onEdit (or time-based)

const REPO    = 'johnluckenbach-sys/pct-sierra';
const PATH    = 'src/data/trips.csv';
const BRANCH  = 'master';

function setConfig() {
  // Run this once manually to store your token securely
  const props = PropertiesService.getScriptProperties();
  props.setProperty('GITHUB_TOKEN', 'YOUR_GITHUB_TOKEN_HERE');
}

function syncToGitHub() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) { Logger.log('No GITHUB_TOKEN set — run setConfig() first'); return; }

  const csv = sheetToCsv();

  // Get current file SHA (required by GitHub API to update a file)
  const apiUrl = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
  };

  const getResp = UrlFetchApp.fetch(`${apiUrl}?ref=${BRANCH}`, { headers, muteHttpExceptions: true });
  const current = JSON.parse(getResp.getContentText());
  const sha = current.sha;

  // Skip if content is identical
  const newContent = Utilities.base64Encode(csv);
  if (current.content && current.content.replace(/\n/g, '') === newContent) {
    Logger.log('No changes — skipping push');
    return;
  }

  // Push updated CSV
  const payload = JSON.stringify({
    message: 'Auto-sync trips data from Google Sheet',
    content: newContent,
    sha,
    branch: BRANCH,
  });

  const putResp = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    headers: { ...headers, 'Content-Type': 'application/json' },
    payload,
    muteHttpExceptions: true,
  });

  const result = JSON.parse(putResp.getContentText());
  Logger.log(result.commit ? `Pushed: ${result.commit.sha}` : `Error: ${putResp.getContentText()}`);
}

function sheetToCsv() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const data  = sheet.getDataRange().getValues();
  return data.map(row =>
    row.map(cell => {
      const val = String(cell ?? '');
      // Wrap in quotes if value contains comma, newline, or quote
      return val.includes(',') || val.includes('\n') || val.includes('"')
        ? `"${val.replace(/"/g, '""')}"` : val;
    }).join(',')
  ).join('\n');
}
