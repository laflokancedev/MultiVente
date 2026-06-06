import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StorageService } from '../storage/storage.service';
import { ListingsService } from './listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { AttachPhotoDto, PresignPhotoDto } from './dto/attach-photo.dto';

@UseGuards(JwtAuthGuard)
@Controller('listings')
export class ListingsController {
  constructor(private listings: ListingsService, private storage: StorageService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateListingDto) {
    return this.listings.create(req.user.id, dto);
  }

  @Get()
  list(@Req() req: any) {
    return this.listings.listForUser(req.user.id);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.listings.getOwned(req.user.id, id);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateListingDto) {
    return this.listings.update(req.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.listings.remove(req.user.id, id);
  }

  @Post(':id/photos/presign')
  async presign(@Req() req: any, @Param('id') id: string, @Body() dto: PresignPhotoDto) {
    await this.listings.getOwned(req.user.id, id);
    const key = this.storage.buildKey(req.user.id, id, dto.filename);
    const uploadUrl = await this.storage.presignUpload(key, dto.contentType);
    return { uploadUrl, key, publicUrl: this.storage.publicUrl(key) };
  }

  @Post(':id/photos')
  attach(@Req() req: any, @Param('id') id: string, @Body() dto: AttachPhotoDto) {
    return this.listings.attachPhoto(req.user.id, id, {
      url: this.storage.publicUrl(dto.key),
      order: dto.order,
    });
  }
}
