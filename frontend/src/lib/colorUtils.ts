/**
 * Simple utility to generate lighter/darker shades from a hex color.
 * Works similarly to Tailwind's color palette generator.
 */

// Convert hex to rgb
function hexToRgb(hex: string) {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  }
  return { r, g, b };
}

// Convert rgb to hex
function rgbToHex({ r, g, b }: { r: number, g: number, b: number }) {
  const toHex = (n: number) => {
    const hex = Math.max(0, Math.min(255, Math.round(n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Mix two colors (weight 0 to 1, where 1 gives 100% color2)
function mixColors(color1: {r: number, g: number, b: number}, color2: {r: number, g: number, b: number}, weight: number) {
  return {
    r: color1.r * (1 - weight) + color2.r * weight,
    g: color1.g * (1 - weight) + color2.g * weight,
    b: color1.b * (1 - weight) + color2.b * weight,
  };
}

export function generateTailwindPalette(baseHex: string) {
  const baseRgb = hexToRgb(baseHex);
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 15, g: 23, b: 42 }; // slate-900

  return {
    50: rgbToHex(mixColors(baseRgb, white, 0.9)),
    100: rgbToHex(mixColors(baseRgb, white, 0.8)),
    200: rgbToHex(mixColors(baseRgb, white, 0.6)),
    300: rgbToHex(mixColors(baseRgb, white, 0.4)),
    400: rgbToHex(mixColors(baseRgb, white, 0.2)),
    500: baseHex,
    600: rgbToHex(mixColors(baseRgb, black, 0.2)),
    700: rgbToHex(mixColors(baseRgb, black, 0.4)),
    800: rgbToHex(mixColors(baseRgb, black, 0.6)),
    900: rgbToHex(mixColors(baseRgb, black, 0.8)),
  };
}
