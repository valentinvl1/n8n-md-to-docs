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
    
    for (const token of tokens) {
      switch (token.type) {
        case 'heading': {
          children.push(
            new Paragraph({
              text: token.text,
              heading: headingLevelMap[token.depth as keyof typeof headingLevelMap],
              spacing: {
                before: 200,
                after: 200
              }
            })
          );
          break;
        }

        case 'paragraph': {
          // Handle bold text
          const parts = token.text.split(/(\*\*.*?\*\*)/g);
          const runs: TextRun[] = parts.map((part: string) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return new TextRun({
                text: part.slice(2, -2),
                bold: true,
                font: 'Arial'
              });
            }
            return new TextRun({
              text: part,
              font: 'Arial'
            });
          });

          children.push(
            new Paragraph({
              children: runs,
              spacing: {
                before: 120,
                after: 120
              }
            })
          );
          break;
        }

        case 'list': {
          for (const item of token.items) {
            // Handle bold text in list items
            const parts = item.text.split(/(\*\*.*?\*\*)/g);
            const runs: TextRun[] = parts.map((part: string) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return new TextRun({
                  text: part.slice(2, -2),
                  bold: true,
                  font: 'Arial'
                });
              }
              return new TextRun({
                text: part,
                font: 'Arial'
              });
            });

            children.push(
              new Paragraph({
                children: runs,
                bullet: {
                  level: 0
                },
                spacing: {
                  before: 80,
                  after: 80
                }
              })
            );
          }
          break;
        }
      }
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
                before: 240,
                after: 120
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
                before: 240,
                after: 120
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
                before: 240,
                after: 120
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