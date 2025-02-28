import type { Token, Tokens } from 'marked';
import type { FormattedRange } from '../types';

export function formatMarkdownToken(tokens: Token[]): any[] {
  const requests: any[] = [];
  let currentIndex = 1;  // Start at 1 since index 0 is reserved

  for (const token of tokens) {
    const tokenText = 'text' in token ? token.text : '';
    
    switch (token.type) {
      case 'heading': {
        // Handle section headers with quotes
        const text = token.text.replace(/^["']|["']$/g, '');
        requests.push({
          insertText: {
            location: { index: currentIndex },
            text: text + '\n',
          },
        });

        // Apply heading style
        requests.push({
          updateParagraphStyle: {
            range: {
              startIndex: currentIndex,
              endIndex: currentIndex + text.length,
            },
            paragraphStyle: {
              namedStyleType: `HEADING_${token.depth}`,
              spaceAbove: { magnitude: 10, unit: 'PT' },
              spaceBelow: { magnitude: 5, unit: 'PT' },
            },
            fields: 'namedStyleType,spaceAbove,spaceBelow',
          },
        });

        requests.push({
          updateTextStyle: {
            range: {
              startIndex: currentIndex,
              endIndex: currentIndex + text.length,
            },
            textStyle: { bold: true },
            fields: 'bold',
          },
        });

        currentIndex += text.length + 1;
        break;
      }

      case 'paragraph': {
        const rawText = token.raw;
        const cleanText = token.text;
        let textToInsert = cleanText;
        
        requests.push({
          insertText: {
            location: { index: currentIndex },
            text: textToInsert + '\n',
          },
        });

        const boldRanges = findFormattedRanges(rawText, '\\*\\*([^*]+)\\*\\*');
        const italicRanges = findFormattedRanges(rawText, '\\*([^*]+)\\*');

        // Apply bold formatting
        for (const bold of boldRanges) {
          const startPos = getCleanTextPosition(bold.index, bold.text, [...boldRanges, ...italicRanges]);
          if (startPos >= 0 && startPos + bold.length <= textToInsert.length) {
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
          if (startPos >= 0 && startPos + italic.length <= textToInsert.length) {
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

        requests.push({
          updateParagraphStyle: {
            range: {
              startIndex: currentIndex,
              endIndex: currentIndex + textToInsert.length,
            },
            paragraphStyle: {
              spaceAbove: { magnitude: 5, unit: 'PT' },
              spaceBelow: { magnitude: 5, unit: 'PT' },
              lineSpacing: 115
            },
            fields: 'spaceAbove,spaceBelow,lineSpacing',
          },
        });

        currentIndex += textToInsert.length + 1;
        break;
      }

      case 'list': {
        for (const item of token.items) {
          const itemText = item.text;
          requests.push({
            insertText: {
              location: { index: currentIndex },
              text: itemText + '\n',
            },
          });

          requests.push({
            createParagraphBullets: {
              range: {
                startIndex: currentIndex,
                endIndex: currentIndex + itemText.length,
              },
              bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
            },
          });

          requests.push({
            updateParagraphStyle: {
              range: {
                startIndex: currentIndex,
                endIndex: currentIndex + itemText.length,
              },
              paragraphStyle: {
                indentStart: { magnitude: 36, unit: 'PT' },
                spaceAbove: { magnitude: 2, unit: 'PT' },
                spaceBelow: { magnitude: 2, unit: 'PT' },
              },
              fields: 'indentStart,spaceAbove,spaceBelow',
            },
          });

          currentIndex += itemText.length + 1;
        }
        break;
      }
    }
  }

  return requests;
}

// Helper function to find formatted ranges
function findFormattedRanges(text: string, pattern: string): FormattedRange[] {
  const ranges: FormattedRange[] = [];
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

// Helper function to calculate clean text position
function getCleanTextPosition(originalIndex: number, matchText: string, ranges: FormattedRange[]): number {
  let position = originalIndex;
  
  // Count markdown symbols before this position
  for (const range of ranges) {
    if (range.index < originalIndex) {
      position -= range.fullMatch.length - range.length;
    }
  }
  
  return Math.max(0, position);
} 