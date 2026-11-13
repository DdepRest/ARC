export interface DownloadState {
  modelName: string;
  bytesDone: number;
  totalBytes: number;
  isDownloading: boolean;
}

export type DownloadProgressCallback = (loaded: number, total: number, file: string) => void;
