export interface ActiveJob {
  kill: () => void;
}

export class JobManager {
  private activeJobs = new Map<string, ActiveJob>();

  register(projectId: string, killFn: () => void): void {
    this.activeJobs.set(projectId, { kill: killFn });
  }

  unregister(projectId: string): void {
    this.activeJobs.delete(projectId);
  }

  cancel(projectId: string): boolean {
    const job = this.activeJobs.get(projectId);
    if (!job) return false;
    try {
      job.kill();
    } finally {
      this.activeJobs.delete(projectId);
    }
    return true;
  }

  has(projectId: string): boolean {
    return this.activeJobs.has(projectId);
  }
}

export const jobManager = new JobManager();
