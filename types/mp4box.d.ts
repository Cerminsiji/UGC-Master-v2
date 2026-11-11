declare module 'mp4box' {
  export interface MP4Track {
    id: number;
    codec: string;
    video?: {
      width: number;
      height: number;
    };
    audio?: {
      sample_rate: number;
      channel_count: number;
    };
    [key: string]: any;
  }

  export interface MP4Info {
    duration: number;
    hasMoov: boolean;
    tracks: MP4Track[];
    [key: string]: any;
  }

  export interface MP4Sample {
    data: Uint8Array;
    dts: number;
    pts: number;
    is_sync: boolean;
    [key: string]: any;
  }

  export interface MP4BoxFile {
    onReady?: (info: MP4Info) => void;
    onError?: (error: any) => void;
    onSamples?: (id: number, user: any, samples: MP4Sample[]) => void;
    appendBuffer(data: ArrayBuffer): number;
    flush(): void;
    start(): void;
    stop(): void;
    setExtractionOptions(id: number, user?: any, options?: { nbSamples?: number; rapAlignment?: boolean }): void;
    boxes: any[];
    [key: string]: any;
  }

  export function createFile(): MP4BoxFile;
  export const BoxParser: any;
  export const DataStream: any;
  export const ISOFile: any;
  export const Log: any;
}
