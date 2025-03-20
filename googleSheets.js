const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SHEETS_CREDENTIALS,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;

// Validate environment variables
if (!process.env.GOOGLE_SHEETS_CREDENTIALS || !process.env.GOOGLE_SHEETS_ID) {
  throw new Error('Missing required Google Sheets environment variables');
}

// Retry logic for Google Sheets operations
async function withRetry(operation, maxRetries = 3) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${i + 1} failed:`, error.message);
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  throw lastError;
}

async function getUserSession(chatId) {
  if (!chatId || typeof chatId !== 'string') {
    throw new Error('Invalid chat ID');
  }

  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  try {
    const response = await withRetry(() => 
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sessions!A:D',
      })
    );

    const rows = response.data.values;
    const session = rows.find(row => row[0] === chatId.toString());

    if (session) {
      const lastUpdate = new Date(session[3]).getTime();
      if (Date.now() - lastUpdate > SESSION_TIMEOUT) {
        // Session expired
        return null;
      }
    }

    return session;
  } catch (error) {
    console.error('Error getting user session:', error);
    throw new Error('Failed to get user session');
  }
}

async function updateUserSession(chatId, state, data, lastMessage) {
  if (!chatId || typeof chatId !== 'string') {
    throw new Error('Invalid chat ID');
  }

  try {
    const row = [
      chatId.toString(),
      state,
      JSON.stringify(data),
      new Date().toISOString()
    ];

    const existingSession = await getUserSession(chatId);
    
    if (existingSession) {
      await withRetry(() =>
        sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `Sessions!A${existingSession[0]}:D${existingSession[0]}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [row],
          },
        })
      );
    } else {
      await withRetry(() =>
        sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: 'Sessions!A:D',
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [row],
          },
        })
      );
    }
  } catch (error) {
    console.error('Error updating user session:', error);
    throw new Error('Failed to update user session');
  }
}

async function appendToSheet(data, sheetName = 'Properties') {
  try {
    const response = await withRetry(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [data],
        },
      })
    );
    return response.data;
  } catch (error) {
    console.error('Error appending to sheet:', error);
    throw new Error('Failed to append data to sheet');
  }
}

module.exports = {
  getUserSession,
  updateUserSession,
  appendToSheet
}; 