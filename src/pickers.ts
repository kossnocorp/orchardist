export interface WorktreePickerIdentity {
  readonly path: string;
  readonly name: string;
  readonly symbol?: string;
}

export interface WorktreePickerItem {
  readonly label: string;
  readonly description: string;
  readonly path: string;
}

export function worktreePickerItems(
  identities: readonly WorktreePickerIdentity[],
  visualsEnabled: boolean,
): readonly WorktreePickerItem[] {
  return identities.map(({ path, name, symbol }) => ({
    label: visualsEnabled && symbol ? `${symbol} ${name}` : name,
    description: path,
    path,
  }));
}
