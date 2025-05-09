import { Document, Paragraph, TextRun, HeadingLevel, Packer, Table, TableRow, TableCell, BorderStyle, ImageRun } from 'docx';
import { marked } from 'marked';
import type { Tokens } from 'marked';
import { Buffer } from 'buffer';

const headingLevelMap = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6
};

// Helper function to process text with formatting
function processFormattedText(text: string): TextRun[] {
  // Process bold, italic, and code formatting
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
  return parts.filter(part => part.trim() !== '').map((part: string) => {
    // Bold: **text**
    if (part.startsWith('**') && part.endsWith('**')) {
      return new TextRun({
        text: part.slice(2, -2),
        bold: true,
        font: 'Arial',
        size: 24
      });
    }
    // Italic: *text*
    else if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
      return new TextRun({
        text: part.slice(1, -1),
        italics: true,
        font: 'Arial',
        size: 24
      });
    }
    // Code: `text`
    else if (part.startsWith('`') && part.endsWith('`')) {
      return new TextRun({
        text: part.slice(1, -1),
        font: 'Courier New',
        size: 24
      });
    }
    // Regular text
    else {
      return new TextRun({
        text: part,
        font: 'Arial',
        size: 24
      });
    }
  });
}

// Types d'images supportés par docx
type SupportedImageType = 'jpg' | 'png' | 'gif' | 'bmp' | 'svg';

// Fonction pour valider et normaliser le type d'image
function normalizeImageType(type: string): SupportedImageType {
  const normalizedType = type.toLowerCase();
  if (normalizedType === 'jpeg') return 'jpg';
  if (['jpg', 'png', 'gif', 'bmp', 'svg'].includes(normalizedType)) {
    return normalizedType as SupportedImageType;
  }
  return 'png'; // Type par défaut si non supporté
}

// Fonction pour extraire les images en base64 du texte
function extractBase64Images(text: string): { text: string, images: { base64: string, position: number, type: SupportedImageType }[] } {
  const images: { base64: string, position: number, type: SupportedImageType }[] = [];
  const regex = /data:image\/(jpeg|jpg|png|gif|bmp|svg);base64,([^"\s]+)/g;
  let match;
  let processedText = text;

  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0];
    const imageType = match[1].toLowerCase();
    const position = match.index;
    
    images.push({
      base64: fullMatch,
      position: position,
      type: normalizeImageType(imageType)
    });
    
    // Remplacer l'image par un espace pour maintenir la position
    processedText = processedText.replace(fullMatch, ' ');
  }

  return { text: processedText, images };
}

// Fonction pour convertir une chaîne base64 en Buffer
function base64ToBuffer(base64String: string): Uint8Array {
  const base64Data = base64String.split(',')[1];
  return new Uint8Array(Buffer.from(base64Data, 'base64'));
}

export async function convertMarkdownToDocx(markdownContent: string): Promise<Buffer> {
  try {
    // Log sample of the markdown for debugging
    console.info('Input markdown sample:', {
      sample: markdownContent.substring(0, Math.min(200, markdownContent.length)),
      length: markdownContent.length
    });

    // Parse markdown to tokens
    const tokens = marked.lexer(markdownContent);
    console.info(`Parsed ${tokens.length} markdown tokens`);
    
    // Debug first few tokens to understand the structure
    if (tokens.length > 0) {
      console.info('First token types:', {
        types: tokens.slice(0, Math.min(5, tokens.length)).map(t => t.type)
      });
    }
    
    const children: Paragraph[] = [];
    let lastTokenType: string | null = null;
    let consecutiveBreaks = 0;
    
    for (const token of tokens) {
      console.info(`Processing token type: ${token.type}`);

      // Handle spacing between different content types
      if (lastTokenType && lastTokenType !== token.type) {
        if (token.type === 'space') {
          consecutiveBreaks++;
          // Only add extra space if we haven't added too many breaks already
          if (consecutiveBreaks <= 1) {
            children.push(
              new Paragraph({
                spacing: {
                  before: 80,
                  after: 80
                }
              })
            );
          }
        } else {
          consecutiveBreaks = 0;
        }
      }

      switch (token.type) {
        case 'heading': {
          consecutiveBreaks = 0;
          const headingToken = token as Tokens.Heading;
          
          children.push(
            new Paragraph({
              text: headingToken.text,
              heading: headingLevelMap[headingToken.depth as keyof typeof headingLevelMap],
              spacing: {
                before: 200,
                after: 100
              }
            })
          );
          break;
        }

        case 'paragraph': {
          consecutiveBreaks = 0;
          const paragraphToken = token as Tokens.Paragraph;
          
          // Extraire les images du texte
          const { text, images } = extractBase64Images(paragraphToken.text);
          
          // Traiter le texte formaté
          const runs = processFormattedText(text);
          
          // Créer un tableau pour stocker tous les éléments du paragraphe
          const paragraphElements: (TextRun | ImageRun)[] = [];
          
          // Ajouter les runs de texte
          paragraphElements.push(...runs);
          
          // Ajouter les images
          for (const image of images) {
            try {
              const imageBuffer = base64ToBuffer(image.base64);
              paragraphElements.push(
                new ImageRun({
                  data: imageBuffer,
                  transformation: {
                    width: 400,
                    height: 300
                  },
                  type: image.type,
                  fallback: {
                    type: image.type,
                    data: imageBuffer
                  }
                })
              );
            } catch (error) {
              console.error('Error processing image:', error);
            }
          }

          children.push(
            new Paragraph({
              children: paragraphElements,
              spacing: {
                before: 60,
                after: 60,
                line: 300,
                lineRule: 'auto'
              }
            })
          );
          break;
        }

        case 'list': {
          consecutiveBreaks = 0;
          const listToken = token as Tokens.List;
          
          let isFirstItem = true;
          for (const item of listToken.items) {
            // Process formatted text in list items
            const runs = processFormattedText(item.text);

            children.push(
              new Paragraph({
                children: runs,
                bullet: {
                  level: 0
                },
                spacing: {
                  before: isFirstItem ? 80 : 40,
                  after: 40,
                  line: 300,
                  lineRule: 'auto'
                },
                indent: {
                  left: 720,
                  hanging: 360
                }
              })
            );
            isFirstItem = false;
          }
          break;
        }
        
        case 'blockquote': {
          consecutiveBreaks = 0;
          const blockquoteToken = token as Tokens.Blockquote;
          
          // Process each item in the blockquote
          for (const quoteToken of blockquoteToken.tokens) {
            if (quoteToken.type === 'paragraph') {
              const paraToken = quoteToken as Tokens.Paragraph;
              const runs = processFormattedText(paraToken.text);
              
              children.push(
                new Paragraph({
                  children: runs,
                  spacing: {
                    before: 60,
                    after: 60,
                    line: 300,
                    lineRule: 'auto'
                  },
                  indent: {
                    left: 720
                  },
                  border: {
                    left: {
                      color: "AAAAAA",
                      space: 15,
                      style: BorderStyle.SINGLE,
                      size: 15
                    }
                  }
                })
              );
            }
          }
          break;
        }
        
        case 'code': {
          consecutiveBreaks = 0;
          const codeToken = token as Tokens.Code;
          
          // Create a code block with monospace font using a TextRun
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: codeToken.text,
                  font: 'Courier New',
                  size: 20
                })
              ],
              spacing: {
                before: 80,
                after: 80,
                line: 300,
                lineRule: 'auto'
              },
              shading: {
                type: "clear",
                fill: "F5F5F5"
              }
            })
          );
          break;
        }
        
        case 'hr': {
          consecutiveBreaks = 0;
          // Add a horizontal rule
          children.push(
            new Paragraph({
              border: {
                bottom: {
                  color: "AAAAAA",
                  space: 1,
                  style: BorderStyle.SINGLE,
                  size: 1
                }
              },
              spacing: {
                before: 120,
                after: 120
              }
            })
          );
          break;
        }
        
        case 'table': {
          consecutiveBreaks = 0;
          const tableToken = token as Tokens.Table;
          
          // Create table rows
          const rows: TableRow[] = [];
          
          // Add header row
          const headerCells = tableToken.header.map((cell: { text: string }) => {
            return new TableCell({
              children: [new Paragraph({
                children: processFormattedText(cell.text),
                spacing: { before: 40, after: 40 }
              })],
              shading: {
                fill: "EEEEEE"
              }
            });
          });
          rows.push(new TableRow({ children: headerCells }));
          
          // Add data rows
          for (const row of tableToken.rows) {
            const rowCells = row.map((cell: { text: string }) => {
              return new TableCell({
                children: [new Paragraph({
                  children: processFormattedText(cell.text),
                  spacing: { before: 40, after: 40 }
                })]
              });
            });
            rows.push(new TableRow({ children: rowCells }));
          }
          
          // Add table to document
          const table = new Table({
            rows,
            width: {
              size: 100,
              type: "pct"
            }
          });
          
          children.push(new Paragraph({ children: [table] }));
          break;
        }

        case 'space':
          // Don't reset consecutiveBreaks here
          break;

        default:
          console.info(`Unhandled token type: ${token.type}`);
          consecutiveBreaks = 0;
          break;
      }

      lastTokenType = token.type;
    }

    // Create document with some basic styling
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: 'Arial',
              size: 24
            }
          },
          heading1: {
            run: {
              size: 32,
              bold: true,
              color: "000000",
              font: 'Arial'
            },
            paragraph: {
              spacing: {
                before: 200,
                after: 100,
                line: 300,
                lineRule: 'auto'
              }
            }
          },
          heading2: {
            run: {
              size: 28,
              bold: true,
              color: "000000",
              font: 'Arial'
            },
            paragraph: {
              spacing: {
                before: 160,
                after: 80,
                line: 300,
                lineRule: 'auto'
              }
            }
          },
          heading3: {
            run: {
              size: 24,
              bold: true,
              color: "000000",
              font: 'Arial'
            },
            paragraph: {
              spacing: {
                before: 120,
                after: 60,
                line: 300,
                lineRule: 'auto'
              }
            }
          }
        },
        paragraphStyles: [
          {
            id: "codeStyle",
            name: "Code Style",
            basedOn: "Normal",
            run: {
              font: "Courier New",
              size: 20
            },
            paragraph: {
              spacing: {
                before: 80,
                after: 80,
                line: 300,
                lineRule: 'auto'
              }
            }
          }
        ]
      },
      sections: [{
        properties: {},
        children: children
      }],
    });

    console.info(`Generated DOCX with ${children.length} paragraphs`);
    
    // Generate buffer
    return await Packer.toBuffer(doc);
  } catch (error) {
    console.error('Error converting markdown to docx:', error);
    throw error;
  }
} 
