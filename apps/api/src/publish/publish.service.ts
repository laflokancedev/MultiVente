import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import type { AssistedPayload, Marketplace } from '@multimarket/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AdapterRegistry } from './adapters/adapter.registry';
import type { ListingForAdapter } from './adapters/adapter';

@Injectable()
export class PublishService {
  constructor(
    private prisma: PrismaService,
    private registry: AdapterRegistry,
    @InjectQueue('publish') private queue: Queue,
  ) {}

  private async ownedListing(userId: string, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { photos: { orderBy: { order: 'asc' } } },
    } as any);
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.userId !== userId) throw new ForbiddenException('Not your listing');
    return listing;
  }

  private toAdapterInput(listing: any): ListingForAdapter {
    return {
      title: listing.title,
      description: listing.description,
      priceCents: listing.priceCents,
      currency: listing.currency,
      category: listing.category,
      condition: listing.condition,
      brand: listing.brand ?? null,
      color: listing.color ?? null,
      size: listing.size ?? null,
      location: listing.location ?? null,
      photoUrls: (listing.photos ?? []).map((p: any) => p.url),
    };
  }

  async publishEverywhere(userId: string, listingId: string, marketplaces: Marketplace[]) {
    await this.ownedListing(userId, listingId);
    const created = [];
    for (const marketplace of marketplaces) {
      const adapter = this.registry.get(marketplace);
      const pub = await this.prisma.publication.upsert({
        where: { listingId_marketplace: { listingId, marketplace } },
        create: { listingId, marketplace, mode: adapter.mode, status: 'pending', error: null, externalId: null, externalUrl: null },
        update: { mode: adapter.mode, status: 'pending', error: null, externalId: null, externalUrl: null },
      });
      await this.queue.add('publish', { publicationId: pub.id });
      created.push(pub);
    }
    return created;
  }

  async processPublication(publicationId: string) {
    const pub = await this.prisma.publication.findUnique({ where: { id: publicationId } });
    if (!pub) throw new NotFoundException('Publication not found');
    const listing = await this.prisma.listing.findUnique({
      where: { id: pub.listingId },
      include: { photos: { orderBy: { order: 'asc' } } },
    } as any);
    const adapter = this.registry.get(pub.marketplace as Marketplace);
    try {
      const mapped = adapter.mapListing(this.toAdapterInput(listing));
      if (adapter.mode === 'auto' && adapter.publish) {
        const result = await adapter.publish(mapped);
        return this.prisma.publication.update({
          where: { id: publicationId },
          data: { status: 'published', externalId: result.externalId, externalUrl: result.externalUrl, publishedAt: new Date(), error: null },
        });
      }
      return this.prisma.publication.update({
        where: { id: publicationId },
        data: { status: 'awaiting_user', error: null },
      });
    } catch (err) {
      return this.prisma.publication.update({
        where: { id: publicationId },
        data: { status: 'failed', error: (err as Error).message },
      });
    }
  }

  async getPublications(userId: string, listingId: string) {
    await this.ownedListing(userId, listingId);
    return this.prisma.publication.findMany({ where: { listingId } });
  }

  async getAssisted(userId: string, publicationId: string): Promise<AssistedPayload> {
    const pub = await this.prisma.publication.findUnique({ where: { id: publicationId } });
    if (!pub) throw new NotFoundException('Publication not found');
    const listing = await this.ownedListing(userId, pub.listingId);
    const adapter = this.registry.get(pub.marketplace as Marketplace);
    if (!adapter.buildAssistedPayload) throw new NotFoundException('Not an assisted marketplace');
    return adapter.buildAssistedPayload(adapter.mapListing(this.toAdapterInput(listing)));
  }

  async markPosted(userId: string, publicationId: string, externalUrl?: string) {
    const pub = await this.prisma.publication.findUnique({ where: { id: publicationId } });
    if (!pub) throw new NotFoundException('Publication not found');
    await this.ownedListing(userId, pub.listingId); // throws 404/403
    if (pub.status !== 'awaiting_user') {
      throw new ConflictException('Publication is not awaiting user action');
    }
    return this.prisma.publication.update({
      where: { id: publicationId },
      data: { status: 'published', externalUrl: externalUrl ?? null, publishedAt: new Date(), error: null },
    });
  }
}
