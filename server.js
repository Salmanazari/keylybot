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

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use('/telegram-webhook', limiter);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Telegram AI Property Bot is running' });
});

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
    throw new Error('Failed to process PDF');
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
    throw new Error('Failed to process voice note');
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
    throw new Error('Failed to process image');
  }
}

// Telegram webhook endpoint with improved error handling
app.post('/telegram-webhook', upload.single('document'), async (req, res) => {
  try {
    const message = req.body.message;
    if (!message) {
      console.error('No message in request body');
      return res.sendStatus(400);
    }

    const chatId = message.chat.id;
    const userText = message.text || '';

    // Handle different message types
    if (message.photo) {
      let session = await getUserSession(chatId);
      let collectedData = session ? JSON.parse(session['Collected Data']) : {};
      let currentState = session ? session['Current State'] : null;

      if (currentState === 'awaiting_images' && collectedData.propertyId) {
        const processedContent = await handleImage(message.photo, collectedData.propertyId);
        await sendTelegramMessage(chatId, `📸 Image added successfully! You can send more images or type "done" when finished.`);
        return res.sendStatus(200);
      } else {
        const processedContent = await handleImage(message.photo);
        await sendTelegramMessage(chatId, `📸 Here's what I found in the image:\n${processedContent.analysis}`);
        return res.sendStatus(200);
      }
    } else if (message.document && message.document.mime_type === 'application/pdf') {
      const processedContent = await handlePDF(message.document);
      await sendTelegramMessage(chatId, `🗃️ Here's what I found in the PDF:\n${processedContent}`);
      return res.sendStatus(200);
    } else if (message.voice) {
      const processedContent = await handleVoiceNote(message.voice);
      await sendTelegramMessage(chatId, `🎙️ Here's what you said:\n${processedContent}`);
      return res.sendStatus(200);
    }

    // Handle text messages with session management
    let session = await getUserSession(chatId);
    let collectedData = session ? JSON.parse(session['Collected Data']) : {};
    let currentState = session ? session['Current State'] : null;
    let botReply = '';

    // Handle confirmation responses
    if (currentState === 'awaiting_confirmation') {
      if (userText.toLowerCase() === 'yes') {
        if (!collectedData.address || !collectedData.zip) {
          throw new Error('Missing required property data');
        }

        const propertyId = `PROP-${Date.now()}`;
        await addProperty({
          ...collectedData,
          propertyId
        });
        
        collectedData.propertyId = propertyId;
        currentState = 'awaiting_images';
        botReply = '✅ Great! Your property has been saved.\n\n' +
                  '📸 Now you can send me photos of the property.\n' +
                  'Send as many photos as you want, and type "done" when finished.';
      } else if (userText.toLowerCase() === 'no') {
        collectedData = {};
        currentState = null;
        botReply = '🔄 Let\'s start over. What\'s the property address?';
      } else {
        botReply = 'Please respond with Yes or No.';
      }
    } else if (currentState === 'awaiting_images') {
      if (userText.toLowerCase() === 'done') {
        collectedData = {};
        currentState = null;
        botReply = '✨ Perfect! All your property information and images have been saved. What would you like to do next?';
      } else {
        botReply = '📸 Send me photos of the property, or type "done" when finished.';
      }
    } else {
      // Handle property data collection
      if (!collectedData.address) {
        botReply = '🏠 What\'s the property address?';
        currentState = 'awaiting_address';
      } else if (!collectedData.zip) {
        collectedData.address = userText;
        botReply = '📍 What\'s the ZIP code?';
        currentState = 'awaiting_zip';
      } else if (!collectedData.bedrooms) {
        collectedData.zip = userText;
        botReply = '🛏️ How many bedrooms?';
        currentState = 'awaiting_bedrooms';
      } else if (!collectedData.bathrooms) {
        collectedData.bedrooms = userText;
        botReply = '🚿 How many bathrooms?';
        currentState = 'awaiting_bathrooms';
      } else if (!collectedData.squareMeters) {
        collectedData.bathrooms = userText;
        botReply = '📏 What\'s the total square meters?';
        currentState = 'awaiting_square_meters';
      } else if (!collectedData.price) {
        collectedData.squareMeters = userText;
        botReply = '💰 What\'s the asking price?';
        currentState = 'awaiting_price';
      } else if (!collectedData.description) {
        collectedData.price = userText;
        botReply = '📝 Any additional details about the property?';
        currentState = 'awaiting_description';
      } else {
        collectedData.description = userText;
        botReply = `Here's what I've collected:\n\n` +
                  `🏠 Address: ${collectedData.address}\n` +
                  `📍 ZIP: ${collectedData.zip}\n` +
                  `🛏️ Bedrooms: ${collectedData.bedrooms}\n` +
                  `🚿 Bathrooms: ${collectedData.bathrooms}\n` +
                  `📏 Square Meters: ${collectedData.squareMeters}\n` +
                  `💰 Price: ${collectedData.price}\n` +
                  `📝 Description: ${collectedData.description}\n\n` +
                  `Is this information correct? [Yes/No]`;
        currentState = 'awaiting_confirmation';
      }
    }

    // Update session
    await updateUserSession(chatId, currentState, collectedData, botReply);

    // Send response
    await sendTelegramMessage(chatId, botReply);
    res.sendStatus(200);
  } catch (error) {
    console.error('Error processing webhook:', error);
    try {
      await sendTelegramMessage(chatId, '❌ Sorry, something went wrong. Please try again later.');
    } catch (sendError) {
      console.error('Error sending error message:', sendError);
    }
    res.sendStatus(500);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 