import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PublishService } from './publish.service';
import { PublishProcessor } from './publish.processor';
import { PublishController } from './publish.controller';
import { AdapterRegistry } from './adapters/adapter.registry';
import { EBAY_CLIENT, MockEbayClient } from './adapters/ebay.client';

@Module({
  imports: [BullModule.registerQueue({ name: 'publish' })],
  providers: [
    PublishService,
    PublishProcessor,
    AdapterRegistry,
    { provide: EBAY_CLIENT, useClass: MockEbayClient },
  ],
  controllers: [PublishController],
})
export class PublishModule {}
