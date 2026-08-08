import * as path from "node:path";

const terminalColors = [
  "terminal.ansiGreen",
  "terminal.ansiBlue",
  "terminal.ansiMagenta",
  "terminal.ansiYellow",
  "terminal.ansiRed",
  "terminal.ansiWhite",
  "terminal.ansiBrightYellow",
  "terminal.ansiBrightRed",
  "terminal.ansiBlack",
] as const;

export function terminalColor(
  worktreePath: string,
  history: readonly (string | null)[],
  discriminators: readonly {
    readonly path: string;
    readonly name: string;
  }[],
): string | undefined {
  const discriminator = discriminators.find(
    (candidate) => path.resolve(candidate.path) === path.resolve(worktreePath),
  );
  if (!discriminator) return undefined;

  const index = history.indexOf(discriminator.name);
  return index < 0 ? undefined : terminalColors[index % terminalColors.length];
}
