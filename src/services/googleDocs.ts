import { google } from 'googleapis';
import { logger } from 'firebase-functions/v2';
import { marked } from 'marked';
import type { Token } from 'marked';
import type { GoogleDocResponse } from '../types';
import { formatMarkdownToken } from '../utils/markdownFormatter.js';

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

    const docs = google.docs({ 
      version: 'v1', 
      auth
    });
    
    logger.info('Creating document:', { fileName, tokenPrefix: accessToken.substring(0, 10) + '...' });
    
    // Parse the markdown with specific options
    const tokens = marked.lexer(markdownContent, {
      gfm: true,
      breaks: true
    });
    
    const createResponse = await docs.documents.create({
      requestBody: {
        title: fileName,
      }
    });

    const documentId = createResponse.data.documentId;
    if (!documentId) {
      throw new Error('Failed to create document: No document ID returned');
    }
    logger.info('Document created with ID:', documentId);

    const requests = formatMarkdownToken(tokens);
    logger.info('Applying formatting with requests:', requests.length);
    
    await docs.documents.batchUpdate({
      documentId: documentId,
      requestBody: {
        requests
      }
    });

    const documentUrl = `https://docs.google.com/document/d/${documentId}`;
    logger.info('Document formatted successfully:', documentUrl);

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