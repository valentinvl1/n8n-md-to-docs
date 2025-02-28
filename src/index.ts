import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import express from 'express';
import cors from 'cors';
import type { Request, Response } from 'express';
import type { MarkdownRequest, GoogleDocResponse, ErrorResponse } from './types';
import { convertMarkdownToGoogleDoc } from './services/googleDocs';

const app = express();

// Middleware
app.use(express.json());
app.use(cors({ origin: true }));

app.post('/', async (req: Request, res: Response) => {
  try {
    logger.info('Received request:', {
      body: req.body,
      headers: {
        ...req.headers,
        authorization: req.headers.authorization ? `${req.headers.authorization.substring(0, 20)}...` : undefined
      }
    });

    // Handle array of requests
    const requests: MarkdownRequest[] = Array.isArray(req.body) ? req.body : [req.body];
    logger.info(`Processing ${requests.length} request(s)`);
    
    const results = await Promise.all(requests.map(async (request, index) => {
      // Extract request data
      const markdownContent = request.output;
      const authHeader = req.headers.authorization;
      const fileName = request.fileName || 'Converted from Markdown';
      
      logger.info(`Request ${index + 1} validation:`, {
        hasMarkdown: !!markdownContent,
        contentLength: markdownContent?.length,
        hasAuthHeader: !!authHeader,
        fileName
      });

      // Validate markdown content
      if (!markdownContent) {
        logger.error(`Request ${index + 1}: Missing markdown content`);
        return {
          error: 'Missing required field: output',
          status: 400,
          request: {
            ...request,
            output: undefined
          }
        } as ErrorResponse;
      }

      // Validate authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.error(`Request ${index + 1}: Invalid authorization`);
        return {
          error: 'Missing or invalid authorization header',
          status: 401
        } as ErrorResponse;
      }

      const accessToken = authHeader.split(' ')[1];

      try {
        logger.info(`Request ${index + 1}: Starting conversion for "${fileName}"`);
        const result = await convertMarkdownToGoogleDoc(markdownContent, accessToken, fileName);
        logger.info(`Request ${index + 1}: Conversion successful:`, result);
        
        return {
          ...result,
          webhookUrl: request.webhookUrl,
          executionMode: request.executionMode
        } as GoogleDocResponse;
      } catch (error: any) {
        logger.error(`Request ${index + 1}: Conversion failed:`, {
          error: error.message,
          status: error.status || error.code,
          details: error.errors || error.stack
        });
        
        return {
          error: 'Failed to convert markdown to Google Doc',
          details: error.message,
          status: error.status || 500
        } as ErrorResponse;
      }
    }));

    // Send response
    if (results.length === 1) {
      const result = results[0];
      logger.info('Sending single response:', {
        ...result,
        documentContent: undefined
      });
      return res.status(result.status).json(result);
    }

    logger.info('Sending multiple responses:', results.length);
    res.json(results);

  } catch (error: any) {
    logger.error('Fatal error processing requests:', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Failed to process requests',
      details: error.message
    } as ErrorResponse);
  }
});

export const mdToGoogleDoc = onRequest(app); 