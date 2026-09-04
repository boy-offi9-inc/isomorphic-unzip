export type WhatYouNeed = (string | RegExp | ((entryName: string) => boolean))[];

export type UnzipInput = string | Buffer | Uint8Array | ArrayBuffer | Blob;

export type UnzipCallback = (
  err: Error | null,
  buffers?: Record<string, Buffer | Uint8Array>
) => void;

export type OnProgress = (entryName: string) => void;

export class Unzip {
  constructor(input: UnzipInput);
  getBuffer(whatYouNeed: WhatYouNeed, callback: UnzipCallback, onProgress?: OnProgress): void;
  getBufferAsync(
    whatYouNeed: WhatYouNeed,
    onProgress?: OnProgress
  ): Promise<Record<string, Buffer | Uint8Array>>;
  getEntries(): Promise<string[]>;
}

export type ZipEntryValue = string | Buffer | Uint8Array | ArrayBuffer;

export interface ZipOptions {
  /** Compression level, 0 (store, no compression) to 9 (max). Defaults to fflate's default (6). */
  level?: number;
}

export type ZipCallback = (err: Error | null, bytes?: Buffer | Uint8Array) => void;

export function zipEntries(
  entries: Record<string, ZipEntryValue>,
  options: ZipOptions,
  callback: ZipCallback
): void;
export function zipEntries(
  entries: Record<string, ZipEntryValue>,
  callback: ZipCallback
): void;

export function zipEntriesAsync(
  entries: Record<string, ZipEntryValue>,
  options?: ZipOptions
): Promise<Buffer | Uint8Array>;

declare const _default: typeof Unzip & {
  zipEntries: typeof zipEntries;
  zipEntriesAsync: typeof zipEntriesAsync;
};
export default _default;
