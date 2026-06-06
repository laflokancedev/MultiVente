import { Body, Controller, Get, Param, Post, Req, Sse, UseGuards } from '@nestjs/common';
import { IsArray, IsIn } from 'class-validator';
import { interval, switchMap, map, takeWhile, type Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Marketplace } from '@multimarket/shared';
import { PublishService } from './publish.service';

class PublishDto {
  @IsArray()
  @IsIn(['EBAY', 'VINTED', 'LEBONCOIN'], { each: true })
  marketplaces!: Marketplace[];
}

const TERMINAL = ['published', 'failed', 'sold', 'expired', 'awaiting_user'];

@UseGuards(JwtAuthGuard)
@Controller()
export class PublishController {
  constructor(private publish: PublishService) {}

  @Post('listings/:id/publish')
  publishEverywhere(@Req() req: any, @Param('id') id: string, @Body() dto: PublishDto) {
    return this.publish.publishEverywhere(req.user.id, id, dto.marketplaces);
  }

  @Get('listings/:id/publications')
  list(@Req() req: any, @Param('id') id: string) {
    return this.publish.getPublications(req.user.id, id);
  }

  @Get('publications/:pubId/assisted')
  assisted(@Req() req: any, @Param('pubId') pubId: string) {
    return this.publish.getAssisted(req.user.id, pubId);
  }

  @Sse('listings/:id/publications/stream')
  stream(@Req() req: any, @Param('id') id: string): Observable<{ data: unknown }> {
    return interval(1000).pipe(
      switchMap(() => this.publish.getPublications(req.user.id, id)),
      map((pubs) => ({ data: pubs })),
      takeWhile(
        (msg) => !(msg.data as any[]).every((p) => TERMINAL.includes(p.status)),
        true,
      ),
    );
  }
}
