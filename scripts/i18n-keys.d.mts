export function sourceFiles(dir?: string): string[];
export function extract(files: string[]): { keys: Map<string, Set<string>>; problems: string[] };
