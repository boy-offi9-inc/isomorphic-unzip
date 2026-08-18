export type WhatYouNeed = (string | RegExp | ((entryName: string) => boolean))[];

export type UnzipInput = string | Buffer | Uint8Array | ArrayBuffer | Blob;

export type UnzipCallback = (
  err: Error | null,
  buffers?: Record<string, Buffer | Uint8Array>
) => void;

export class Unzip {
  constructor(input: UnzipInput);
  getBuffer(whatYouNeed: WhatYouNeed, callback: UnzipCallback): void;
  getBufferAsync(whatYouNeed: WhatYouNeed): Promise<Record<string, Buffer | Uint8Array>>;
  getEntries(): Promise<string[]>;
}

declare const _default: typeof Unzip;
export default _default;
