# Keyly - Telegram AI Property Bot

A friendly, AI-powered Telegram bot that helps collect and manage property information with a bubbly personality! 🏠✨

## Features

- 🏡 Property Information Collection
- 📸 Image Processing & Analysis
- 🗣️ Voice Note Transcription
- 📄 PDF Document Processing
- 🔄 Airtable Integration
- ☁️ Cloudinary Image Storage
- 🤖 OpenAI GPT-4 Vision Integration

## Environment Variables

Create a `.env` file with the following variables:

```env
TELEGRAM_TOKEN=your_telegram_token
PORT=3001
OPENAI_API_KEY=your_openai_api_key
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
AIRTABLE_API_KEY=your_airtable_api_key
AIRTABLE_BASE_ID=your_airtable_base_id
```

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Create `.env` file with required variables
4. Set up Airtable base with required tables
5. Run the bot: `npm run dev`

## Airtable Setup

Create two tables in your Airtable base:

### Properties Table
- Telegram_ID (Single line text)
- User_Name (Single line text)
- Property_Type (Single line text)
- Address (Single line text)
- ZIP (Single line text)
- Size_sqm (Number)
- Bedrooms (Number)
- Bathrooms (Number)
- Price (Number)
- Amenities (Long text)
- Image_URL (Single line text)
- SEO_Meta_Title (Single line text)
- SEO_Meta_Desc (Long text)
- SEO_URL_Slug (Single line text)
- SEO_Keywords (Long text)
- Created_At (Date)
- Updated_At (Date)

### User Sessions Table
- Telegram_ID (Single line text)
- Current_State (Single line text)
- Collected_Data (Long text)
- Last_Message (Single line text)
- Created_At (Date)
- Last_Updated (Date)

## Deployment

This bot is configured for deployment on Vercel. Simply connect your GitHub repository to Vercel and add the environment variables in the Vercel dashboard.

## License

MIT 