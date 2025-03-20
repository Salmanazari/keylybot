require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const OpenAI = require('openai');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const rateLimit = require('express-rate-limit');
const { getUserSession, updateUserSession, addProperty } = require('./airtableConfig');

const app = express();
const port = process.env.PORT || 3000;

// Validate required environment variables
const requiredEnvVars = [
  'TELEGRAM_TOKEN',
  'OPENAI_API_KEY',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET'
];

// Load environment variables from .env file if it exists
if (require('fs').existsSync('.env')) {
  require('dotenv').config();
}

// Check for missing environment variables
const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(envVar => {
    console.error(`   - ${envVar}`);
  });
  console.error('\nPlease check your .env file and ensure all required variables are set.');
  process.exit(1);
}

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Configure rate limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skipFailedRequests: true, // Don't count failed requests
    keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress;
    }
});

app.use(cors());
app.use(bodyParser.json());
app.use(limiter);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Telegram AI Property Bot is running' });
});

// Add message deduplication
const processedMessages = new Set();

// Helper function to send Telegram messages with retry
async function sendTelegramMessage(chatId, text, maxRetries = 3) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      });
      return;
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  throw lastError;
}

// Handle PDF files with improved error handling
async function handlePDF(document) {
  try {
    const fileInfo = await axios.get(
      `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/getFile?file_id=${document.file_id}`
    );
    
    const filePath = fileInfo.data.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${filePath}`;
    
    const response = await axios.get(fileUrl, { 
      responseType: 'arraybuffer',
      timeout: 30000 // 30 second timeout
    });
    
    const pdfData = await pdfParse(response.data);
    return pdfData.text;
  } catch (error) {
    console.error('Error processing PDF:', error);
    throw new Error('✨ Oopsie! I had a bit of trouble reading that PDF. Could you try sending it again? 📄');
  }
}

// Handle voice notes with improved error handling
async function handleVoiceNote(voice) {
  try {
    const fileInfo = await axios.get(
      `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/getFile?file_id=${voice.file_id}`
    );
    
    const filePath = fileInfo.data.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${filePath}`;
    
    const response = await axios.get(fileUrl, { 
      responseType: 'arraybuffer',
      timeout: 30000 // 30 second timeout
    });
    
    const whisperResponse = await openai.audio.transcriptions.create({
      file: response.data,
      model: "whisper-1"
    });
    
    return whisperResponse.text;
  } catch (error) {
    console.error('Error processing voice note:', error);
    throw new Error('🎀 Oh dear! I had trouble understanding that voice note. Could you try recording it again? 🎤');
  }
}

// Handle images with improved error handling
async function handleImage(photos, propertyId = null) {
  try {
    const photo = photos[photos.length - 1];
    
    const fileInfo = await axios.get(
      `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/getFile?file_id=${photo.file_id}`
    );
    
    const filePath = fileInfo.data.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${filePath}`;
    
    const response = await axios.get(fileUrl, { 
      responseType: 'arraybuffer',
      timeout: 30000 // 30 second timeout
    });
    
    const uploadResponse = await cloudinary.uploader.upload(
      `data:image/jpeg;base64,${Buffer.from(response.data).toString('base64')}`,
      {
        folder: 'property-images',
        public_id: propertyId ? `${propertyId}-${Date.now()}` : undefined
      }
    );

    if (propertyId) {
      await addProperty({
        propertyId,
        imageUrls: [uploadResponse.secure_url]
      });
    }

    const visionResponse = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Please analyze this property image and extract any visible details about the property. Focus on: architectural style, condition, key features, and any visible amenities." },
            { type: "image_url", image_url: { url: uploadResponse.secure_url } }
          ],
        },
      ],
      max_tokens: 500,
    });

    if (!propertyId) {
      await cloudinary.uploader.destroy(uploadResponse.public_id);
    }
    
    return {
      imageUrl: uploadResponse.secure_url,
      analysis: visionResponse.choices[0].message.content
    };
  } catch (error) {
    console.error('Error processing image:', error);
    throw new Error('🌈 Oops! Something went wrong with that photo. Could you try sending it again? 📸');
  }
}

// Process messages with friendly, bubbly responses
async function processMessage(chatId, text, userSession, message) {
    const currentState = userSession.Current_State || 'initial';
    const collectedData = JSON.parse(userSession.Collected_Data || '{}');

    switch (currentState) {
        case 'initial':
            await sendTelegramMessage(chatId, "✨ Hi there! I'm Keyly, your friendly property assistant! 🏠\n\nLet's add your amazing property to our collection! First, could you share the property's address with me? 🌟");
            await updateUserSession(chatId, 'awaiting_address', collectedData, text);
            break;

        case 'awaiting_address':
            collectedData.address = text;
            await sendTelegramMessage(chatId, "🎀 Perfect! That's a lovely location! Now, could you tell me the ZIP code? 📮");
            await updateUserSession(chatId, 'awaiting_zip', collectedData, text);
            break;

        case 'awaiting_zip':
            collectedData.zip = text;
            await sendTelegramMessage(chatId, "🌈 Great! Now, how many bedrooms does this charming property have? 🛏️");
            await updateUserSession(chatId, 'awaiting_bedrooms', collectedData, text);
            break;

        case 'awaiting_bedrooms':
            collectedData.bedrooms = parseInt(text);
            await sendTelegramMessage(chatId, "🎭 Wonderful! And how many bathrooms are there? 🚿");
            await updateUserSession(chatId, 'awaiting_bathrooms', collectedData, text);
            break;

        case 'awaiting_bathrooms':
            collectedData.bathrooms = parseInt(text);
            await sendTelegramMessage(chatId, "🌺 Fantastic! Could you tell me the size in square meters? 📏");
            await updateUserSession(chatId, 'awaiting_size', collectedData, text);
            break;

        case 'awaiting_size':
            collectedData.size = parseInt(text);
            await sendTelegramMessage(chatId, "✨ Amazing! What's the price for this lovely property? 💖");
            await updateUserSession(chatId, 'awaiting_price', collectedData, text);
            break;

        case 'awaiting_price':
            collectedData.price = parseInt(text);
            await sendTelegramMessage(chatId, "🎪 Brilliant! Now, tell me about any special amenities or features that make this property unique! ✨");
            await updateUserSession(chatId, 'awaiting_amenities', collectedData, text);
            break;

        case 'awaiting_amenities':
            collectedData.amenities = text;
            const summary = `🌟 Here's a summary of this wonderful property:

🏠 Address: ${collectedData.address}
📮 ZIP: ${collectedData.zip}
🛏️ Bedrooms: ${collectedData.bedrooms}
🚿 Bathrooms: ${collectedData.bathrooms}
📏 Size: ${collectedData.size} sqm
💖 Price: ${collectedData.price}
✨ Amenities: ${collectedData.amenities}

Is this all correct? Please reply with 'yes' to confirm or 'no' to start over! 🎀`;
            await sendTelegramMessage(chatId, summary);
            await updateUserSession(chatId, 'awaiting_confirmation', collectedData, text);
            break;

        case 'awaiting_confirmation':
            if (text.toLowerCase() === 'yes') {
                await sendTelegramMessage(chatId, "🎉 Yay! Now, let's add some beautiful photos of the property! Send me the images one by one, and type 'done' when you're finished! 📸");
                await updateUserSession(chatId, 'awaiting_images', collectedData, text);
            } else {
                await sendTelegramMessage(chatId, "🌸 No problem at all! Let's start fresh! What's the address of the property? 🏠");
                await updateUserSession(chatId, 'awaiting_address', {}, text);
            }
            break;

        case 'awaiting_images':
            if (text.toLowerCase() === 'done') {
                await addProperty({
                    telegramId: chatId.toString(),
                    ...collectedData
                });
                await sendTelegramMessage(chatId, "🎊 Wonderful! I've saved all the details of your amazing property! Need to add another one? Just let me know! 🌟");
                await updateUserSession(chatId, 'initial', {}, text);
            } else if (message && message.photo) {
                const result = await handleImage(message.photo, chatId);
                collectedData.imageUrl = collectedData.imageUrl || [];
                collectedData.imageUrl.push(result.imageUrl);
                await sendTelegramMessage(chatId, "🌈 Beautiful photo! Send more or type 'done' when you're finished! 📸");
                await updateUserSession(chatId, 'awaiting_images', collectedData, text);
            } else {
                await sendTelegramMessage(chatId, "🎀 Please send me photos of the property, or type 'done' if you're finished! 📸");
            }
            break;

        default:
            await sendTelegramMessage(chatId, "✨ Hi! I'm Keyly, your friendly property assistant! Let's start fresh! What's the address of the property you'd like to add? 🏠");
            await updateUserSession(chatId, 'awaiting_address', {}, text);
            break;
    }
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
});

// Webhook handler
app.post('/telegram-webhook', async (req, res) => {
    try {
        const update = req.body;
        if (!update || !update.message) {
            console.log('Invalid update received:', update);
            return res.sendStatus(200);
        }

        const message = update.message;
        const chatId = message.chat.id;
        const text = message.text || '';
        const messageId = message.message_id;

        // Check if we've already processed this message
        const messageKey = `${chatId}-${messageId}`;
        if (processedMessages.has(messageKey)) {
            console.log('Duplicate message detected, skipping:', messageKey);
            return res.sendStatus(200);
        }
        processedMessages.add(messageKey);

        // Clean up old message IDs (keep last 1000)
        if (processedMessages.size > 1000) {
            const oldestKey = Array.from(processedMessages)[0];
            processedMessages.delete(oldestKey);
        }

        console.log('Received message:', { chatId, text });

        // Get or create user session
        let userSession;
        try {
            userSession = await getUserSession(chatId);
        } catch (error) {
            console.error('Error getting user session:', error);
            if (error.message.includes('Airtable tables not found')) {
                await sendTelegramMessage(chatId, "✨ Hi there! I'm Keyly, your friendly property assistant! I'm just getting my workspace ready for you. Give me a moment to set things up! 🎀");
            } else {
                await sendTelegramMessage(chatId, "🌟 Oopsie! Having a little hiccup connecting. Let me fix that for you real quick! ✨");
            }
            return;
        }

        // Process the message
        try {
            await processMessage(chatId, text, userSession, message);
            res.sendStatus(200);
        } catch (error) {
            console.error('Error processing message:', error);
            await sendTelegramMessage(chatId, '🎈 Oh no! Something went a bit wonky. Let\'s try that again, shall we? 🌈');
            res.sendStatus(500);
        }
    } catch (error) {
        console.error('Error processing webhook:', error);
        if (chatId) {
            try {
                await sendTelegramMessage(chatId, "🌸 Whoopsie! I got a bit tangled up there. Let's start fresh in a moment! 🌺");
            } catch (sendError) {
                console.error('Error sending error message:', sendError);
            }
        }
        res.status(500).json({ error: '🎀 Oopsie! Something went a bit wrong. Let\'s try that again! ✨' });
    }
});

// Start server with port fallback
const startServer = (portToTry) => {
  if (portToTry > 65535) {
    console.error('❌ No available ports found. Please free up some ports or specify a different port in your .env file.');
    process.exit(1);
  }

  const server = app.listen(portToTry, () => {
    console.log(`✅ Server is running on port ${portToTry}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ Port ${portToTry} is busy, trying ${portToTry + 1}`);
      server.close();
      startServer(portToTry + 1);
    } else {
      console.error('❌ Server error:', err);
      process.exit(1);
    }
  });
};

startServer(port); 