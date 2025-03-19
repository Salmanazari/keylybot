# Telegram AI Property Bot

A Telegram bot that processes property-related messages using AI.

## Setup

1. Clone the repository:
```bash
git clone https://github.com/Salmanazari/telegram-ai-property-bot.git
cd telegram-ai-property-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```
TELEGRAM_TOKEN=your_telegram_bot_token
PORT=3000
```

4. Start the server:
```bash
npm start
```

## Development

To run the server in development mode with auto-reload:
```bash
npm run dev
```

## API Endpoints

- `GET /`: Health check endpoint
- `POST /telegram-webhook`: Telegram webhook endpoint for receiving messages

## Environment Variables

- `TELEGRAM_TOKEN`: Your Telegram bot token (required)
- `PORT`: Server port (default: 3000)

## License

ISC 