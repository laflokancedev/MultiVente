import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateListingInput, UpdateListingInput } from '@multimarket/shared';

const MAX_PHOTOS = 20;

@Injectable()
export class ListingsService {
  constructor(private prisma: PrismaService) {}

  create(userId: string, input: CreateListingInput) {
    return this.prisma.listing.create({
      data: {
        userId,
        title: input.title,
        description: input.description,
        priceCents: input.priceCents,
        currency: input.currency ?? 'EUR',
        category: input.category,
        condition: input.condition,
        brand: input.brand,
        color: input.color,
        size: input.size,
        location: input.location,
        shippingOptions: (input.shippingOptions ?? {}) as object,
      },
    });
  }

  listForUser(userId: string) {
    return this.prisma.listing.findMany({ where: { userId } });
  }

  async getOwned(userId: string, id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.userId !== userId) throw new ForbiddenException('Not your listing');
    return listing;
  }

  async update(userId: string, id: string, input: UpdateListingInput) {
    await this.getOwned(userId, id);
    return this.prisma.listing.update({ where: { id }, data: input as object });
  }

  async remove(userId: string, id: string) {
    await this.getOwned(userId, id);
    await this.prisma.listing.delete({ where: { id } });
    return { deleted: true };
  }

  async attachPhoto(userId: string, listingId: string, photo: { url: string; order: number }) {
    await this.getOwned(userId, listingId);
    const count = await this.prisma.listingPhoto.count({ where: { listingId } });
    if (count >= MAX_PHOTOS) throw new BadRequestException(`A listing can have at most ${MAX_PHOTOS} photos`);
    return this.prisma.listingPhoto.create({ data: { listingId, url: photo.url, order: photo.order } });
  }
}
