import { ObjectId } from 'mongodb';

// ═══════════════════════════════════════════════════════════
// Snapshot Model - Metadata only (holders in separate collection)
// ═══════════════════════════════════════════════════════════

export type SnapshotStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface SnapshotMetadata {
  fetchDurationMs: number;
  apiCallCount: number;
  referencedFrom?: string;  // If this snapshot references another week's data
  duplicatedFrom?: string;  // If this snapshot was duplicated for dev testing
}

export interface SnapshotProgress {
  fetchedCount: number;
  insertedCount: number;
  estimatedTotal?: number;  // Estimated total holders (for progress %)
  lastCursor: string | null;
  lastUpdated: Date;
  startedAt: Date;
  jobId?: string;  // BullMQ job ID processing this snapshot
}

export interface Snapshot {
  _id?: ObjectId;
  weekId: string;
  timestamp: Date;
  totalHolders: number;
  totalBalance: string;
  metadata?: SnapshotMetadata;
  progress?: SnapshotProgress;
  status: SnapshotStatus;
  error?: string | undefined;
  createdAt: Date;
  updatedAt?: Date;
  completedAt?: Date;
}

export interface CreateSnapshotInput {
  weekId: string;
  timestamp?: Date;
}

export interface UpdateSnapshotInput {
  totalHolders?: number;
  totalBalance?: string;
  metadata?: Partial<SnapshotMetadata>;
  status?: SnapshotStatus;
  error?: string;
  completedAt?: Date;
}

// ═══════════════════════════════════════════════════════════
// Factory functions
// ═══════════════════════════════════════════════════════════

export function createSnapshot(input: CreateSnapshotInput): Snapshot {
  return {
    weekId: input.weekId,
    timestamp: input.timestamp ?? new Date(),
    totalHolders: 0,
    totalBalance: '0',
    metadata: {
      fetchDurationMs: 0,
      apiCallCount: 0,
    },
    status: 'pending',
    createdAt: new Date(),
  };
}
