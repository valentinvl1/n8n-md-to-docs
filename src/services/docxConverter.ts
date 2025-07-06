import { Document, Paragraph, TextRun, HeadingLevel, Packer, Table, TableRow, TableCell, BorderStyle, ImageRun, Footer, Header, PageNumber } from 'docx';
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
  // Remplacer les balises <br> par des retours à la ligne
  text = text.replace(/<br\s*\/?>/gi, '\n');
  
  // Split text by newlines first
  const lines = text.split('\n');
  const runs: TextRun[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Process bold, italic, and code formatting for each line
    const parts = line.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    const lineRuns = parts.filter(part => part.trim() !== '').map((part: string) => {
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

    runs.push(...lineRuns);

    // Add a line break after each line except the last one
    if (i < lines.length - 1) {
      runs.push(new TextRun({
        text: '\n',
        break: 1
      }));
    }
  }

  return runs;
}

// Types d'images supportés par docx
type SupportedImageType = 'jpg' | 'png' | 'gif' | 'bmp' | 'svg';
type FallbackImageType = 'jpg' | 'png' | 'gif' | 'bmp';

// Fonction pour valider et normaliser le type d'image
function normalizeImageType(type: string): SupportedImageType {
  const normalizedType = type.toLowerCase();
  if (normalizedType === 'jpeg') return 'jpg';
  if (['jpg', 'png', 'gif', 'bmp', 'svg'].includes(normalizedType)) {
    return normalizedType as SupportedImageType;
  }
  return 'png'; // Type par défaut si non supporté
}

// Fonction pour obtenir le type de fallback
function getFallbackType(type: SupportedImageType): FallbackImageType {
  return type === 'svg' ? 'png' : type;
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

// Fonction pour calculer les dimensions de l'image en préservant les proportions
function calculateImageDimensions(base64String: string, maxWidth: number = 400): { width: number, height: number } {
  try {
    const base64Data = base64String.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Lire les dimensions de l'image
    let width = 0;
    let height = 0;
    
    // Pour JPEG
    if (base64String.includes('image/jpeg')) {
      let i = 0;
      while (i < buffer.length) {
        if (buffer[i] === 0xFF && buffer[i + 1] === 0xC0) {
          height = buffer.readUInt16BE(i + 5);
          width = buffer.readUInt16BE(i + 7);
          break;
        }
        i++;
      }
    }
    // Pour PNG
    else if (base64String.includes('image/png')) {
      width = buffer.readUInt32BE(16);
      height = buffer.readUInt32BE(20);
    }
    // Pour GIF
    else if (base64String.includes('image/gif')) {
      width = buffer.readUInt16LE(6);
      height = buffer.readUInt16LE(8);
    }
    
    // Si les dimensions n'ont pas pu être lues, utiliser les dimensions par défaut
    if (width === 0 || height === 0) {
      return { width: maxWidth, height: maxWidth * 0.75 };
    }
    
    // Calculer les nouvelles dimensions en préservant les proportions
    const ratio = height / width;
    const newWidth = Math.min(width, maxWidth);
    const newHeight = Math.round(newWidth * ratio);
    
    return { width: newWidth, height: newHeight };
  } catch (error) {
    console.error('Error calculating image dimensions:', error);
    return { width: maxWidth, height: maxWidth * 0.75 };
  }
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
          // Add a paragraph break for each double newline in markdown
          if (consecutiveBreaks >= 2) {
            children.push(
              new Paragraph({
                spacing: {
                  before: 200,
                  after: 200
                }
              })
            );
            consecutiveBreaks = 0;
          }
        } else {
          // Reset consecutive breaks when we encounter non-space content
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
              const dimensions = calculateImageDimensions(image.base64);
              
              // Créer un paragraphe centré pour l'image
              children.push(
                new Paragraph({
                  children: [
                    new ImageRun({
                      data: imageBuffer,
                      transformation: {
                        width: dimensions.width,
                        height: dimensions.height
                      },
                      type: image.type,
                      fallback: {
                        type: getFallbackType(image.type),
                        data: imageBuffer
                      }
                    })
                  ],
                  alignment: 'center',
                  spacing: {
                    before: 120,
                    after: 120
                  }
                })
              );
            } catch (error) {
              console.error('Error processing image:', error);
            }
          }

          // Ajouter le paragraphe avec un espacement approprié
          children.push(
            new Paragraph({
              children: paragraphElements,
              spacing: {
                before: 40,
                after: 40,
                line: 360,
                lineRule: 'exact'
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
        headers: {
          default: new Header({
            children: [new Paragraph({ text: '' })]
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: 'center',
                children: [
                  new TextRun('Page '),
                  PageNumber.CURRENT,
                  new TextRun(' / '),
                  PageNumber.TOTAL_PAGES,
                ],
              }),
            ],
          }),
        },
        children: children,
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
