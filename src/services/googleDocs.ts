import { google } from 'googleapis';
import { logger } from 'firebase-functions/v2';
import type { GoogleDocResponse } from '../types';
import { convertMarkdownToDocx } from './docxConverter';
import { Readable } from 'stream';

export async function convertMarkdownToGoogleDoc(
  markdownContent: string, 
  accessToken: string, 
  fileName: string = 'Converted from Markdown'
): Promise<GoogleDocResponse> {
  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: accessToken,
      token_type: 'Bearer'
    });

    // First convert markdown to docx using pandoc
    const docxBuffer = await convertMarkdownToDocx(markdownContent);

    // Initialize Google Drive API
    const drive = google.drive({ 
      version: 'v3', 
      auth 
    });

    logger.info('Uploading document:', { fileName, tokenPrefix: accessToken.substring(0, 10) + '...' });
    
    // Create a readable stream from the buffer
    const stream = Readable.from(docxBuffer);

    // Upload the docx file to Google Drive
    const fileMetadata = {
      name: fileName,
      mimeType: 'application/vnd.google-apps.document' // This converts to Google Docs format
    };

    const media = {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: stream
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id'
    });

    const documentId = response.data.id;
    if (!documentId) {
      throw new Error('Failed to create document: No document ID returned');
    }

    const documentUrl = `https://docs.google.com/document/d/${documentId}`;
    logger.info('Document created successfully:', documentUrl);

    return {
      documentId,
      url: documentUrl,
      status: 200,
      fileName
    };
  } catch (error: any) {
    logger.error('Error in document creation:', {
      message: error.message,
      status: error.status || error.code,
      details: error.errors || error.stack
    });
    throw error;
  }
} 