import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './storage/storage.module';
import { ListingsModule } from './listings/listings.module';
import { PublishModule } from './publish/publish.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    PrismaModule,
    AuthModule,
    StorageModule,
    ListingsModule,
    PublishModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
