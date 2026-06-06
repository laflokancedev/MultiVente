import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PublishService } from './publish.service';

@Processor('publish')
export class PublishProcessor extends WorkerHost {
  constructor(private publish: PublishService) {
    super();
  }

  async process(job: Job<{ publicationId: string }>): Promise<void> {
    await this.publish.processPublication(job.data.publicationId);
  }
}
