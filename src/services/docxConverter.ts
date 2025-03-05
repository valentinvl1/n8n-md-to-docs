import { Document, Paragraph, TextRun, HeadingLevel, Packer } from 'docx';
import { marked } from 'marked';
import { logger } from 'firebase-functions/v2';
import type { Token } from 'marked';

const headingLevelMap = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6
};

export async function convertMarkdownToDocx(markdownContent: string): Promise<Buffer> {
  try {
    // Parse markdown to tokens
    const tokens = marked.lexer(markdownContent);
    const children: Paragraph[] = [];
    let lastTokenType: string | null = null;
    let consecutiveBreaks = 0;
    
    for (const token of tokens) {
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
          children.push(
            new Paragraph({
              text: token.text,
              heading: headingLevelMap[token.depth as keyof typeof headingLevelMap],
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
          // Handle bold text
          const parts = token.text.split(/(\*\*.*?\*\*)/g);
          const runs: TextRun[] = parts.map((part: string) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return new TextRun({
                text: part.slice(2, -2),
                bold: true,
                font: 'Arial',
                size: 24
              });
            }
            return new TextRun({
              text: part,
              font: 'Arial',
              size: 24
            });
          });

          children.push(
            new Paragraph({
              children: runs,
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
          let isFirstItem = true;
          for (const item of token.items) {
            // Handle bold text in list items
            const parts = item.text.split(/(\*\*.*?\*\*)/g);
            const runs: TextRun[] = parts.map((part: string) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return new TextRun({
                  text: part.slice(2, -2),
                  bold: true,
                  font: 'Arial',
                  size: 24
                });
              }
              return new TextRun({
                text: part,
                font: 'Arial',
                size: 24
              });
            });

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

        case 'space':
          // Don't reset consecutiveBreaks here
          break;

        default:
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
        }
      },
      sections: [{
        properties: {},
        children: children
      }],
    });

    // Generate buffer
    return await Packer.toBuffer(doc);
  } catch (error) {
    logger.error('Error converting markdown to docx:', error);
    throw error;
  }
} 