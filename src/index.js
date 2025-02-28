import { google } from 'googleapis';
import { marked } from 'marked';
import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3040;

// Middleware
app.use(express.json());
app.use(cors());

async function convertMarkdownToGoogleDoc(markdownContent, accessToken, fileName = 'Converted from Markdown') {
  try {
    // Create OAuth2 client with the access token only
    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: accessToken,
      token_type: 'Bearer'
    });

    const docs = google.docs({ 
      version: 'v1', 
      auth
    });
    
    console.log('Creating document:', { fileName, tokenPrefix: accessToken.substring(0, 10) + '...' });
    
    // Parse the markdown
    const tokens = marked.lexer(markdownContent);
    
    const createResponse = await docs.documents.create({
      requestBody: {
        title: fileName,
      }
    });

    const documentId = createResponse.data.documentId;
    console.log('Document created with ID:', documentId);

    const requests = [];
    let currentIndex = 1;  // Start at 1 since index 0 is reserved

    for (const token of tokens) {
      switch (token.type) {
        case 'heading':
          requests.push({
            insertText: {
              location: { index: currentIndex },
              text: token.text + '\n',
            },
          });
          requests.push({
            updateParagraphStyle: {
              range: {
                startIndex: currentIndex,
                endIndex: currentIndex + token.text.length,
              },
              paragraphStyle: {
                namedStyleType: `HEADING_${token.depth}`,
              },
              fields: 'namedStyleType',
            },
          });
          currentIndex += token.text.length + 1;
          break;

        case 'paragraph': {
          // Get the raw text and tokens
          const rawText = token.raw;
          const cleanText = token.text;
          
          const insertRequest = {
            insertText: {
              location: { index: currentIndex },
              text: cleanText + '\n',
            },
          };
          requests.push(insertRequest);

          // Helper function to find all matches with their positions
          function findFormattedRanges(text, pattern) {
            const ranges = [];
            let match;
            const regex = new RegExp(pattern, 'g');
            while ((match = regex.exec(text)) !== null) {
              ranges.push({
                text: match[1],
                index: match.index,
                length: match[1].length,
                fullMatch: match[0]
              });
            }
            return ranges;
          }

          // Find all bold and italic ranges
          const boldRanges = findFormattedRanges(rawText, '\\*\\*([^*]+)\\*\\*');
          const italicRanges = findFormattedRanges(rawText, '\\*([^*]+)\\*');

          // Calculate actual positions in clean text
          function getCleanTextPosition(originalIndex, matchText, ranges) {
            let position = originalIndex;
            
            // Count markdown symbols before this position
            for (const range of ranges) {
              if (range.index < originalIndex) {
                // For bold (**) subtract 4, for italic (*) subtract 2
                position -= range.fullMatch.length - range.length;
              }
            }
            
            return Math.max(0, position);
          }

          // Apply bold formatting
          for (const bold of boldRanges) {
            const startPos = getCleanTextPosition(bold.index, bold.text, [...boldRanges, ...italicRanges]);
            if (startPos >= 0 && startPos + bold.length <= cleanText.length) {
              requests.push({
                updateTextStyle: {
                  range: {
                    startIndex: currentIndex + startPos,
                    endIndex: currentIndex + startPos + bold.length,
                  },
                  textStyle: { bold: true },
                  fields: 'bold',
                },
              });
            }
          }

          // Apply italic formatting
          for (const italic of italicRanges) {
            const startPos = getCleanTextPosition(italic.index, italic.text, [...boldRanges, ...italicRanges]);
            if (startPos >= 0 && startPos + italic.length <= cleanText.length) {
              requests.push({
                updateTextStyle: {
                  range: {
                    startIndex: currentIndex + startPos,
                    endIndex: currentIndex + startPos + italic.length,
                  },
                  textStyle: { italic: true },
                  fields: 'italic',
                },
              });
            }
          }

          currentIndex += cleanText.length + 1;
          break;
        }

        case 'list':
          for (const item of token.items) {
            requests.push({
              insertText: {
                location: { index: currentIndex },
                text: item.text + '\n',
              },
            });
            requests.push({
              createParagraphBullets: {
                range: {
                  startIndex: currentIndex,
                  endIndex: currentIndex + item.text.length,
                },
                bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
              },
            });
            currentIndex += item.text.length + 1;
          }
          break;
      }
    }

    // Apply the formatting
    console.log('Applying formatting with requests:', requests.length);
    
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests },
    });

    const documentUrl = `https://docs.google.com/document/d/${documentId}`;
    console.log('Document formatted successfully:', documentUrl);

    return {
      documentId,
      url: documentUrl,
    };
  } catch (error) {
    console.error('Error in document creation:', {
      message: error.message,
      status: error.status || error.code,
      details: error.errors || error.stack
    });
    throw error;
  }
}

// POST endpoint for markdown to Google Doc conversion
app.post('/mdToGoogleDoc', async (req, res) => {
  try {
    console.log('Received request:', {
      body: req.body,
      headers: {
        ...req.headers,
        authorization: req.headers.authorization ? `${req.headers.authorization.substring(0, 20)}...` : undefined
      }
    });

    // Handle array of requests
    const requests = Array.isArray(req.body) ? req.body : [req.body];
    console.log(`Processing ${requests.length} request(s)`);
    
    const results = await Promise.all(requests.map(async (request, index) => {
      // Extract request data
      const markdownContent = request.output;
      const authHeader = req.headers.authorization;
      const fileName = request.fileName || 'Converted from Markdown';
      
      console.log(`Request ${index + 1} validation:`, {
        hasMarkdown: !!markdownContent,
        contentLength: markdownContent?.length,
        hasAuthHeader: !!authHeader,
        fileName
      });

      // Validate markdown content
      if (!markdownContent) {
        console.error(`Request ${index + 1}: Missing markdown content`);
        return {
          error: 'Missing required field: output',
          status: 400,
          request: {
            ...request,
            output: undefined // Don't log the full content in error
          }
        };
      }

      // Validate authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error(`Request ${index + 1}: Invalid authorization`);
        return {
          error: 'Missing or invalid authorization header',
          status: 401
        };
      }

      const accessToken = authHeader.split(' ')[1];

      try {
        console.log(`Request ${index + 1}: Starting conversion for "${fileName}"`);
        const result = await convertMarkdownToGoogleDoc(markdownContent, accessToken, fileName);
        console.log(`Request ${index + 1}: Conversion successful:`, result);
        
        return {
          ...result,
          status: 200,
          fileName,
          webhookUrl: request.webhookUrl,
          executionMode: request.executionMode
        };
      } catch (error) {
        console.error(`Request ${index + 1}: Conversion failed:`, {
          error: error.message,
          status: error.status || error.code,
          details: error.errors || error.stack
        });
        
        return {
          error: 'Failed to convert markdown to Google Doc',
          details: error.message,
          status: error.status || 500
        };
      }
    }));

    // Send response
    if (results.length === 1) {
      const result = results[0];
      console.log('Sending single response:', {
        ...result,
        documentContent: undefined // Don't log document content
      });
      return res.status(result.status).json(result);
    }

    console.log('Sending multiple responses:', results.length);
    res.json(results);

  } catch (error) {
    console.error('Fatal error processing requests:', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Failed to process requests',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    details: err.message
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 