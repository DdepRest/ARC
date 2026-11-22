export type ModelIntegrityStatus =
  | 'verified'
  | 'unverified_manual'
  | 'tampered'
  | 'missing'
  | 'unknown';

export type ModelProvenanceOrigin =
  | 'official_auto'
  | 'bundled'
  | 'manual_local';

export interface ModelFileManifest {
  name: string;
  url: string;
  size: number;
  sha256: string;
  relPath?: string;
}

export interface ModelArtifactManifest {
  manifestId: string;
  id: string;
  source: string;
  sourceUrl: string;
  revision: string;
  licenseUrl: string;
  locale: string;
  engineCompatibility: string[];
  files: ModelFileManifest[];
}

export interface ModelIntegrityRecord {
  status: ModelIntegrityStatus;
  algorithm: 'sha256';
  verifiedAt?: string;
  reason?: string;
  runtimeValidated?: boolean;
  files?: Record<string, { size: number; sha256: string }>;
}

export interface ModelProvenanceRecord {
  origin: ModelProvenanceOrigin;
  source?: string;
  repoUrl?: string;
  revision?: string;
  manifestId?: string;
  licenseUrl?: string;
  downloadedAt?: string;
  digestPrefix?: string;
}

export interface ModelVerificationSummary {
  integrity: ModelIntegrityRecord;
  provenance: ModelProvenanceRecord;
}

export interface DownloadMetaFile {
  source?: string;
  sourceId?: string;
  repoUrl?: string;
  modelUrl?: string;
  revision?: string;
  manifestId?: string;
  licenseUrl?: string;
  description?: string;
  modelFile?: string;
  tokensFile?: string;
  checksum?: string;
  downloadedAt?: string;
  status?: string;
  verified?: boolean;
  verifiedAt?: string;
  incompatible?: boolean;
  integrity?: ModelIntegrityRecord;
  provenance?: ModelProvenanceRecord;
  files?: Record<string, { size: number; sha256?: string; expectedSize?: number; downloadedAt?: string }>;
}

export interface PythonBundleFileSpec {
  name: string;
  size: number;
  sha256: string;
  critical: boolean;
}

export interface PythonBundleIntegrityReport {
  state: 'READY' | 'ERROR';
  verifiedAt: string;
  failedFiles: Array<{
    name: string;
    reason: 'missing' | 'size_mismatch' | 'hash_mismatch' | 'read_error';
    expectedSha256: string;
    actualSha256?: string | null;
    expectedSize: number;
    actualSize?: number | null;
  }>;
  modelFile?: {
    path: string;
    status: ModelIntegrityStatus;
    sha256Prefix?: string;
    reason?: string;
  };
  reason?: string;
}
