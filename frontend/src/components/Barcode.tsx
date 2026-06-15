import React from 'react';

interface BarcodeProps {
  value: string;
  height?: number;
  showText?: boolean;
}

const CODE39_PATTERNS: Record<string, string> = {
  '0': 'NNNWWNWNN', '1': 'WNNWNNNNW', '2': 'NNWWNNNNW', '3': 'WNWWNNNNN',
  '4': 'NNNWNNWNW', '5': 'WNNWNNWNN', '6': 'NNWWNNWNN', '7': 'NNNWNNNNW',
  '8': 'WNNWNNNNN', '9': 'NNWWNNNNN', 'A': 'WNNNNWNNW', 'B': 'NNWNNWNNW',
  'C': 'WNWNNWNNN', 'D': 'NNNNWWNNW', 'E': 'WNNNWWNNN', 'F': 'NNWNWWNNN',
  'G': 'NNNNNWWNW', 'H': 'WNNNNWWNN', 'I': 'NNWNNWWNN', 'J': 'NNNNWWWNN',
  'K': 'WNNNNNNWW', 'L': 'NNWNNNNWW', 'M': 'WNWNNNNWN', 'N': 'NNNNWNNWW',
  'O': 'WNNNWNNWN', 'P': 'NNWNWNNWN', 'Q': 'NNNNNNWWW', 'R': 'WNNNNNWWN',
  'S': 'NNWNNNWWN', 'T': 'NNNNWNWWN', 'U': 'WWNNNNNNW', 'V': 'NWWNNNNNW',
  'W': 'WWWNNNNNN', 'X': 'NWNNWNNNW', 'Y': 'WWNNWNNNN', 'Z': 'NWWNWNNNN',
  '-': 'NWNNNNWNW', '.': 'WWNNNNWNN', ' ': 'NWWNNNWNN', '*': 'NWNNWNNNN',
  '$': 'NWNWNWNNN', '/': 'NWNWNNNWN', '+': 'NWNNNWNWN', '%': 'NNWNWNWNN'
};

export default function Barcode({ value, height = 50, showText = true }: BarcodeProps) {
  // Preprocess value: uppercase and filter characters to match Code 39 alphabet
  const sanitized = value.toUpperCase().replace(/[^0-9A-Z\-\.\ \$\/\+\%]/g, '');
  if (!sanitized) return null;

  // Code 39 requires start/stop characters '*'
  const fullString = `*${sanitized}*`;

  // Draw parameters
  const narrowWidth = 1.5;
  const wideWidth = 4;
  const gapWidth = 1.5;

  let currentX = 10;
  const bars: { x: number; width: number }[] = [];

  for (let c = 0; c < fullString.length; c++) {
    const char = fullString[c];
    const pattern = CODE39_PATTERNS[char];

    if (!pattern) continue;

    for (let i = 0; i < 9; i++) {
      const isBar = i % 2 === 0;
      const isWide = pattern[i] === 'W';
      const width = isWide ? wideWidth : narrowWidth;

      if (isBar) {
        bars.push({ x: currentX, width });
      }

      currentX += width;
    }
    // Inter-character gap
    currentX += gapWidth;
  }

  const svgWidth = currentX + 10;
  const svgHeight = height + (showText ? 20 : 5);

  return (
    <div className="flex flex-col items-center justify-center bg-white p-1 rounded">
      <svg
        width="100%"
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="max-w-full"
      >
        <g fill="black">
          {bars.map((bar, idx) => (
            <rect
              key={idx}
              x={bar.x}
              y={5}
              width={bar.width}
              height={height}
            />
          ))}
        </g>
        {showText && (
          <text
            x={svgWidth / 2}
            y={height + 17}
            textAnchor="middle"
            style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 'bold', letterSpacing: '2px' }}
          >
            {sanitized}
          </text>
        )}
      </svg>
    </div>
  );
}
