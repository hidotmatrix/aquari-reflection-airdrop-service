import { ObjectId } from 'mongodb';

// ═══════════════════════════════════════════════════════════
// Job Model - Unified job tracking for all async operations
// ═══════════════════════════════════════════════════════════

export type JobType = 'snapshot' | 'calculation' | 'airdrop' | 'full-flow';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface JobLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  data?: Record<string, unknown>;
}

export interface JobProgress {
  current: number;
  total: number;
  percentage: number;
  stage: string;
}

export interface Job {
  _id?: ObjectId;
  type: JobType;
  weekId: string;
  status: JobStatus;
  progress?: JobProgress;
  logs: JobLog[];
  result?: Record<string, unknown>;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateJobInput {
  type: JobType;
  weekId: string;
}

// ═══════════════════════════════════════════════════════════
// Factory function
// ═══════════════════════════════════════════════════════════

export function createJob(input: CreateJobInput): Job {
  return {
    type: input.type,
    weekId: input.weekId,
    status: 'pending',
    logs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
