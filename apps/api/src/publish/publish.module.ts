import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PublishService } from './publish.service';
import { PublishProcessor } from './publish.processor';
import { AdapterRegistry } from './adapters/adapter.registry';
import { EBAY_CLIENT, MockEbayClient } from './adapters/ebay.client';

// PublishController is added in the next commit (Task 9) along with the
// REST + SSE endpoints; the queue + worker wiring lands here first.
@Module({
  imports: [BullModule.registerQueue({ name: 'publish' })],
  providers: [
    PublishService,
    PublishProcessor,
    AdapterRegistry,
    { provide: EBAY_CLIENT, useClass: MockEbayClient },
  ],
})
export class PublishModule {}
