# Markdown to Google Docs Converter - Firebase Function

This Firebase Function converts Markdown content to Google Docs while preserving formatting like headings, bold text, italic text, and lists.

## Prerequisites

- [Bun](https://bun.sh) 1.0.0 or later
- Firebase CLI (`bun install -g firebase-tools`)
- A Google Cloud Project with the Google Docs API enabled
- Firebase project initialized

## Setup

1. Install dependencies:
```bash
bun install
```

2. Login to Firebase:
```bash
firebase login
```

3. Initialize Firebase project (if not already done):
```bash
firebase init functions
```

4. Set up Google Cloud OAuth 2.0 credentials:
   - Go to the [Google Cloud Console](https://console.cloud.google.com)
   - Enable the Google Docs API
   - Create OAuth 2.0 credentials
   - Download the credentials and save them as `credentials.json`

## Development

1. Start the development server with hot reload:
```bash
bun run dev
```

2. Start the Firebase emulator:
```bash
bun run serve
```

This will:
- Build the TypeScript code
- Start the Firebase emulator suite
- Make the function available at `http://localhost:5001/<your-project>/us-central1/mdToGoogleDoc`

3. Watch for changes during development:
```bash
bun run build:watch
```

## Testing the Function

Send a POST request to the endpoint with:

```json
{
  "output": "# Your Markdown Content\n\nSome **bold** and *italic* text",
  "fileName": "My Document"
}
```

Headers:
- `Content-Type: application/json`
- `Authorization: Bearer YOUR_GOOGLE_OAUTH_TOKEN`

## Deployment

Deploy to Firebase:
```bash
bun run deploy
```

This will:
1. Build the TypeScript code
2. Deploy the function to Firebase
3. Provide you with the production URL

## Environment Variables

The function uses the following environment variables:
- `PORT`: (Optional) Port number for local development (default: 5001)

## Error Handling

The function returns appropriate HTTP status codes:
- 200: Success
- 400: Invalid request (missing markdown content)
- 401: Missing or invalid authorization
- 500: Server error

## Limitations

- The function requires a valid Google OAuth 2.0 token with access to Google Docs
- Markdown features supported:
  - Headings (H1-H6)
  - Bold text
  - Italic text
  - Unordered lists
  - Paragraphs with spacing

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License.
