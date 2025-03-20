# Telegram AI Property Bot

A Telegram bot that helps collect and analyze property information using AI. The bot can process text messages, images, PDFs, and voice notes to extract property details and store them in Google Sheets.

## Features

- Property data collection with guided conversation
- Image analysis using GPT-4 Vision
- PDF document processing
- Voice note transcription using Whisper
- Data storage in Google Sheets
- Cloudinary image storage
- Session management for multi-step conversations
- Rate limiting and error handling

## Prerequisites

- Node.js (v14 or higher)
- Telegram Bot Token
- OpenAI API Key
- Cloudinary Account
- Google Cloud Project with Sheets API enabled
- Google Sheets Spreadsheet

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```plaintext
# Telegram Bot Token
TELEGRAM_TOKEN=your_telegram_bot_token

# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Google Sheets Configuration
GOOGLE_SHEETS_CREDENTIALS=path/to/your/credentials.json
GOOGLE_SHEETS_ID=your_spreadsheet_id
```

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/telegram-ai-property-bot.git
   cd telegram-ai-property-bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up Google Cloud Project:
   - Create a new project in Google Cloud Console
   - Enable Google Sheets API
   - Create service account credentials
   - Download the credentials JSON file
   - Create a Google Spreadsheet and share it with the service account email
   - Add the spreadsheet ID to your environment variables

4. Set up Cloudinary:
   - Create a Cloudinary account
   - Get your cloud name, API key, and API secret
   - Add them to your environment variables

5. Set up Telegram Bot:
   - Create a new bot with @BotFather
   - Get the bot token
   - Add it to your environment variables

6. Set up OpenAI:
   - Get an API key from OpenAI
   - Add it to your environment variables

## Google Sheets Structure

The bot uses two sheets in your Google Spreadsheet:

1. **Properties Sheet**:
   - Timestamp
   - Address
   - ZIP
   - Bedrooms
   - Bathrooms
   - Square Meters
   - Price
   - Description
   - Property ID
   - Image URLs

2. **Sessions Sheet**:
   - Chat ID
   - Current State
   - Collected Data (JSON)
   - Last Update Timestamp

## Usage

1. Start the server:
   ```bash
   npm start
   ```

2. For development with auto-reload:
   ```bash
   npm run dev
   ```

3. Set up your Telegram webhook:
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_SERVER_URL>/telegram-webhook
   ```

4. Start chatting with your bot in Telegram!

## Conversation Flow

1. Bot asks for property address
2. Bot asks for ZIP code
3. Bot asks for number of bedrooms
4. Bot asks for number of bathrooms
5. Bot asks for square meters
6. Bot asks for price
7. Bot asks for additional details
8. Bot shows summary and asks for confirmation
9. If confirmed, bot asks for property images
10. User can send multiple images
11. User types "done" when finished

## Error Handling

The bot includes comprehensive error handling:
- Rate limiting (100 requests per 15 minutes)
- Retry logic for external API calls
- Session timeout (30 minutes)
- Input validation
- Error messages to users
- Detailed error logging

## Security

- Environment variables for sensitive data
- Rate limiting to prevent abuse
- Input validation and sanitization
- Secure file handling
- Session management

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the ISC License. 