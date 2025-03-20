require('dotenv').config();
const Airtable = require('airtable');

// Validate required environment variables
if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
  throw new Error('Missing required environment variables: AIRTABLE_API_KEY or AIRTABLE_BASE_ID');
}

const base = new Airtable({ 
    apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

// Table names
const TABLES = {
    PROPERTIES: 'Properties',
    SESSIONS: 'User Sessions'
};

// Properties table functions
const propertiesTable = base(TABLES.PROPERTIES);
const sessionsTable = base(TABLES.SESSIONS);

// Add property to Airtable
async function addProperty(propertyData) {
    try {
        const record = await propertiesTable.create([
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
        return record[0];
    } catch (error) {
        console.error('Error adding property:', error);
        throw error;
    }
}

// Get or create user session
async function getUserSession(telegramId) {
    try {
        console.log('Looking for session with Telegram ID:', telegramId);
        console.log('Using Airtable base ID:', process.env.AIRTABLE_BASE_ID);
        
        // Try to get existing session
        try {
            const records = await base(TABLES.SESSIONS)
                .select({
                    filterByFormula: `{Telegram_ID} = '${telegramId}'`,
                    maxRecords: 1
                })
                .firstPage();

            if (records && records.length > 0) {
                console.log('Found existing session:', records[0].fields);
                return records[0].fields;
            }
        } catch (error) {
            console.error('Error accessing sessions table:', error);
            if (error.error === 'NOT_FOUND') {
                console.log('Creating sessions table...');
                throw new Error('Airtable tables not found. Please create the tables manually in your Airtable base.');
            }
            throw error;
        }

        console.log('No existing session found, creating new one');
        // If no session exists, create a new one
        const newSession = await base(TABLES.SESSIONS).create([
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

        console.log('Created new session:', newSession[0].fields);
        return newSession[0].fields;
    } catch (error) {
        console.error('Error in getUserSession:', error);
        throw error;
    }
}

// Update user session
async function updateUserSession(telegramId, currentState, collectedData, lastMessage) {
    try {
        const records = await sessionsTable.select({
            filterByFormula: `{Telegram_ID} = '${telegramId}'`,
        }).firstPage();

        const sessionData = {
            'Telegram_ID': telegramId.toString(),
            'Current_State': currentState,
            'Collected_Data': JSON.stringify(collectedData),
            'Last_Message': lastMessage,
            'Last_Updated': new Date().toISOString()
        };

        if (records.length > 0) {
            await sessionsTable.update(records[0].id, sessionData);
        } else {
            await sessionsTable.create(sessionData);
        }
    } catch (error) {
        console.error('Error updating user session:', error);
        throw error;
    }
}

module.exports = {
    addProperty,
    getUserSession,
    updateUserSession
}; 