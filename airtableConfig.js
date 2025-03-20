require('dotenv').config();
const Airtable = require('airtable');

const base = new Airtable({ 
    apiKey: 'pat8gejo6xwqaZXGE.d3c61e0d572e64f88fd24a26d0876f725a5ec469c11a1f9b66f4f3ae9c306f89' 
}).base('TelegramAIProperties');

// Properties table functions
const propertiesTable = base('Properties');
const sessionsTable = base('User Sessions');

// Add property to Airtable
async function addProperty(propertyData) {
    try {
        const record = await propertiesTable.create([
            {
                fields: {
                    'Timestamp': new Date().toISOString(),
                    'Address': propertyData.address,
                    'ZIP': propertyData.zip,
                    'Bedrooms': propertyData.bedrooms,
                    'Bathrooms': propertyData.bathrooms,
                    'Square Meters': propertyData.squareMeters,
                    'Price': propertyData.price,
                    'Description': propertyData.description,
                    'Property ID': propertyData.propertyId,
                    'Image URLs': propertyData.imageUrls || []
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
async function getUserSession(chatId) {
    try {
        const records = await sessionsTable.select({
            filterByFormula: `{Telegram_ID} = '${chatId}'`
        }).firstPage();

        if (records.length > 0) {
            return {
                id: records[0].id,
                ...records[0].fields
            };
        }

        const newSession = await sessionsTable.create([
            {
                fields: {
                    'Telegram_ID': chatId.toString(),
                    'Current_State': 'START',
                    'Collected_Data_JSON': '{}',
                    'Last_Message': '',
                    'Last_Updated': new Date().toISOString()
                }
            }
        ]);

        return {
            id: newSession[0].id,
            ...newSession[0].fields
        };
    } catch (error) {
        console.error('Error getting user session:', error);
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
            Telegram_ID: telegramId.toString(),
            Current_State: currentState,
            Collected_Data_JSON: JSON.stringify(collectedData),
            Last_Message: lastMessage,
            Last_Updated: new Date().toISOString(),
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