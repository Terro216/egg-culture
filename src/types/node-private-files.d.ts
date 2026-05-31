declare const process: {
  cwd(): string;
};

declare module "node:fs/promises" {
  export function readFile(path: string): Promise<Uint8Array>;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
}
