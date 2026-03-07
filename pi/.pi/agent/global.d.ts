declare module "picomatch" {
  type Matcher = (input: string) => boolean;
  interface PicomatchOptions {
    dot?: boolean;
    nocase?: boolean;
    contains?: boolean;
    ignore?: string[];
  }
  export default function picomatch(patterns: string | string[], options?: PicomatchOptions): Matcher;
}

declare module "bun:test" {
  export const describe: (name: string, fn: () => void | Promise<void>) => void;
  export const test: (name: string, fn: () => void | Promise<void>) => void;
  export const expect: (...args: any[]) => any;
  export const beforeEach: (fn: () => void | Promise<void>) => void;
  export const afterEach: (fn: () => void | Promise<void>) => void;
}

declare const Bun: {
  spawn(args: string[], options: {
    cwd?: string;
    stdout?: "pipe" | "inherit";
    stderr?: "pipe" | "inherit";
  }): {
    stdout: ReadableStream<Uint8Array> | null;
    stderr: ReadableStream<Uint8Array> | null;
    exited: Promise<number>;
  };
  write(path: string, data: string | Uint8Array): Promise<number>;
  sleep(ms: number): Promise<void>;
};

interface ImportMeta {
  dir: string;
}
