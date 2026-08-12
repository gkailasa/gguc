const { google } = require('googleapis');

const SHEET_ID = '1-P3FOKShM4aBRPqL5qAWblXbO0X6XqtB6uMRHL6-rh8';
const KEY_FILE = '/Users/giridhar.kailasam/Downloads/gguc-2026-9df63206db2a.json';

async function test() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  console.log('Connected! Sheet title:', res.data.properties.title);
  console.log('Tabs:', res.data.sheets.map(s => s.properties.title).join(', '));
}

test().catch(err => console.error('Error:', err.message));
