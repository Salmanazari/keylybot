require('dotenv').config();
const Airtable = require('airtable');

// Validate required environment variables
if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
  console.error('❌ Missing required Airtable environment variables:');
  if (!process.env.AIRTABLE_API_KEY) console.error('   - AIRTABLE_API_KEY');
  if (!process.env.AIRTABLE_BASE_ID) console.error('   - AIRTABLE_BASE_ID');
  throw new Error('Missing required Airtable environment variables');
}

// Configure Airtable with retries
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

console.log('Initializing Airtable with:', {
  baseId: process.env.AIRTABLE_BASE_ID,
  hasApiKey: !!process.env.AIRTABLE_API_KEY,
  timestamp: new Date().toISOString()
});

const base = new Airtable({ 
    apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

// Table names
const TABLES = {
    PROPERTIES: 'Properties',
    SESSIONS: 'User Sessions'
};

// Verify tables exist
async function verifyTables() {
    try {
        console.log('Verifying Airtable tables...');
        await base(TABLES.PROPERTIES).select({ maxRecords: 1 }).firstPage();
        await base(TABLES.SESSIONS).select({ maxRecords: 1 }).firstPage();
        console.log('✅ Airtable tables verified successfully');
    } catch (error) {
        console.error('❌ Error verifying Airtable tables:', error);
        throw new Error('Failed to verify Airtable tables. Please ensure the tables exist and are properly configured.');
    }
}

// Verify tables on startup
verifyTables().catch(error => {
    console.error('❌ Airtable verification failed:', error);
    process.exit(1);
});

// Retry function
async function withRetry(fn, maxRetries = MAX_RETRIES) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            console.error(`Attempt ${i + 1} failed:`, error);
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (i + 1)));
            }
        }
    }
    throw lastError;
}

// Properties table functions
const propertiesTable = base(TABLES.PROPERTIES);
const sessionsTable = base(TABLES.SESSIONS);

// Add property to Airtable
async function addProperty(propertyData) {
    try {
        console.log('Adding property:', {
            telegramId: propertyData.telegramId,
            timestamp: new Date().toISOString()
        });

        const record = await withRetry(async () => {
            const result = await propertiesTable.create([
                {
                    fields: {
                        'Telegram_ID': propertyData.telegramId,
                        'User_Name': propertyData.userName,
                        'Property_Type': propertyData.propertyType,
                        'Address': propertyData.address,
                        'ZIP': propertyData.zip,
                        'Size_sqm': propertyData.size,
                        'Bedrooms': propertyData.bedrooms,
                        'Bathrooms': propertyData.bathrooms,
                        'Price': propertyData.price,
                        'Amenities': propertyData.amenities,
                        'Image_URL': propertyData.imageUrl,
                        'SEO_Meta_Title': propertyData.seoTitle,
                        'SEO_Meta_Desc': propertyData.seoDesc,
                        'SEO_URL_Slug': propertyData.seoSlug,
                        'SEO_Keywords': propertyData.seoKeywords,
                        'Created_At': new Date().toISOString(),
                        'Updated_At': new Date().toISOString()
                    }
                }
            ]);
            return result[0];
        });

        console.log('Property added successfully:', {
            recordId: record.id,
            timestamp: new Date().toISOString()
        });

        return record;
    } catch (error) {
        console.error('Error adding property:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        throw error;
    }
}

// Get or create user session
async function getUserSession(telegramId) {
    try {
        console.log('Looking for session:', {
            telegramId,
            baseId: process.env.AIRTABLE_BASE_ID,
            timestamp: new Date().toISOString()
        });
        
        // Try to get existing session
        const records = await withRetry(async () => {
            try {
                return await base(TABLES.SESSIONS)
                    .select({
                        filterByFormula: `{Telegram_ID} = '${telegramId}'`,
                        maxRecords: 1
                    })
                    .firstPage();
            } catch (error) {
                if (error.error === 'NOT_FOUND') {
                    console.log('Table not found, throwing error');
                    throw new Error('Airtable tables not found. Please create the tables manually in your Airtable base.');
                }
                throw error;
            }
        });

        if (records && records.length > 0) {
            console.log('Found existing session:', {
                telegramId,
                sessionId: records[0].id,
                timestamp: new Date().toISOString()
            });
            return records[0].fields;
        }

        console.log('Creating new session:', {
            telegramId,
            timestamp: new Date().toISOString()
        });

        // If no session exists, create a new one
        const newSession = await withRetry(async () => {
            return await base(TABLES.SESSIONS).create([
                {
                    fields: {
                        'Telegram_ID': telegramId,
                        'Current_State': 'initial',
                        'Collected_Data': JSON.stringify({}),
                        'Last_Message': '',
                        'Created_At': new Date().toISOString(),
                        'Last_Updated': new Date().toISOString()
                    }
                }
            ]);
        });

        console.log('New session created:', {
            telegramId,
            sessionId: newSession[0].id,
            timestamp: new Date().toISOString()
        });

        return newSession[0].fields;
    } catch (error) {
        console.error('Session error:', {
            error: error.message,
            stack: error.stack,
            telegramId,
            timestamp: new Date().toISOString()
        });
        throw error;
    }
}

// Update user session
async function updateUserSession(telegramId, currentState, collectedData, lastMessage) {
    try {
        console.log('Updating session:', {
            telegramId,
            currentState,
            timestamp: new Date().toISOString()
        });

        const records = await withRetry(async () => {
            return await sessionsTable.select({
                filterByFormula: `{Telegram_ID} = '${telegramId}'`,
            }).firstPage();
        });

        const sessionData = {
            'Telegram_ID': telegramId.toString(),
            'Current_State': currentState,
            'Collected_Data': JSON.stringify(collectedData),
            'Last_Message': lastMessage,
            'Last_Updated': new Date().toISOString()
        };

        if (records.length > 0) {
            await withRetry(async () => {
                await sessionsTable.update(records[0].id, sessionData);
            });
            console.log('Session updated:', {
                telegramId,
                sessionId: records[0].id,
                timestamp: new Date().toISOString()
            });
        } else {
            const newRecord = await withRetry(async () => {
                return await sessionsTable.create(sessionData);
            });
            console.log('New session created during update:', {
                telegramId,
                sessionId: newRecord.id,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('Update error:', {
            error: error.message,
            stack: error.stack,
            telegramId,
            timestamp: new Date().toISOString()
        });
        throw error;
    }
}

module.exports = {
    addProperty,
    getUserSession,
    updateUserSession
}; 