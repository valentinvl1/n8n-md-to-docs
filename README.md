# Markdown to Google Docs Converter

A Firebase function that converts Markdown content to Google Docs format, maintaining proper formatting and styling.

## Overview

This project provides a serverless function that takes Markdown content and converts it into a beautifully formatted Google Doc. It handles various Markdown elements including:

- Headings (H1-H6)
- Paragraphs with proper spacing
- Lists with proper indentation
- Bold text formatting
- Multiple line breaks
- Consistent font styling and sizing

## Demo

Watch how the converter works in this demonstration:

[![Markdown to Google Docs Converter Demo](https://img.youtube.com/vi/r2HdgJiCInA/0.jpg)](https://youtu.be/r2HdgJiCInA)

## Features

- Serverless architecture using Firebase Functions
- OAuth2 authentication for Google Docs API
- Clean and consistent document formatting
- Maintains document hierarchy and styling
- Handles complex Markdown structures

## Installation

1. Clone the repository
2. Install dependencies:
```bash
bun install
```
3. Set up Firebase:
```bash
firebase login
firebase init functions
```

## Usage

Deploy the function to Firebase:
```bash
bun run build && firebase deploy --only functions
```

The function will be available at your Firebase Functions URL. Send a POST request with:
- Markdown content in the request body
- Valid Google OAuth2 token in the Authorization header
- Optional filename parameter

## Author

This project is maintained by [Aemal Sayer](https://aemalsayer.com), a freelance AI engineer based in Berlin, Germany. With over 23 years of software development experience, including 8 years in ML/AI and 2 years specializing in AI Agents development, Aemal works with industry leaders like Klarna, Siemens, and Allianz to deliver transformative AI solutions.

### Get in Touch
- Website: [aemalsayer.com](https://aemalsayer.com)
- Location: Berlin, Germany

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
