/**
 * ASCII art logo for CodeHermit.
 * Based on the hermit crab with shell (</>), magnifying glass, and CodeHermit text.
 */

const LOGO_LINES = [
  '       ___/~~~~~\\___',
  '      /  </>    \\___',
  '     |   o  o   |  ()',
  '      \\   ^    /   \\',
  '       \\______/    \\/',
  ' ',
  '      CodeHermit',
];

/** Returns the ASCII logo as a string. Uses ANSI colors when stdout is a TTY. */
export function getLogo(): string {
  const useColor = process.stdout?.isTTY === true;
  if (!useColor) {
    return LOGO_LINES.join('\n');
  }
  // ANSI: orange (Hermit), green (</>), dim (Code), reset
  const orange = '\x1b[38;5;208m';
  const green = '\x1b[32m';
  const dim = '\x1b[2m';
  const reset = '\x1b[0m';

  const colored = LOGO_LINES.map((line, i) => {
    if (i === LOGO_LINES.length - 1) {
      // "CodeHermit" - Code dim, Hermit orange
      return line.replace('Code', `${dim}Code${reset}`).replace('Hermit', `${orange}Hermit${reset}`);
    }
    // </> in green
    return line.replace('</>', `${green}</>${reset}`);
  });
  return colored.join('\n');
}
