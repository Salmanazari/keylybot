require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PORT = process.env.PORT || 3000;

if (!TELEGRAM_TOKEN) {
  console.error('TELEGRAM_TOKEN is not set in environment variables');
  process.exit(1);
}

const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Telegram bot is running' });
});

app.post('/telegram-webhook', async (req, res) => {
  try {
    const message = req.body.message;
    
    // Basic validation
    if (!message || !message.chat || !message.chat.id) {
      console.warn('Invalid message format received:', req.body);
      return res.status(400).json({ error: 'Invalid message format' });
    }

    const chatId = message.chat.id;
    const text = message.text || '';

    await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
      chat_id: chatId,
      text: `Clearly received: ${text}`
    });

    res.sendStatus(200);
  } catch (error) {
    console.error('Error processing webhook:', error.message);
    if (error.response) {
      console.error('Telegram API error:', error.response.data);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Telegram AI bot backend running on port ${PORT}`);
}); 