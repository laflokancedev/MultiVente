import { BadRequestException, Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MARKETPLACES, type Marketplace } from '@multimarket/shared';
import { AccountsService } from './accounts.service';

const MARKETPLACE_IDS = MARKETPLACES.map((m) => m.id);

class SetConnectedDto {
  @IsBoolean()
  connected!: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private accounts: AccountsService) {}

  @Get()
  list(@Req() req: any) {
    return this.accounts.list(req.user.id);
  }

  @Patch(':marketplace')
  setConnected(@Req() req: any, @Param('marketplace') marketplace: string, @Body() dto: SetConnectedDto) {
    if (!MARKETPLACE_IDS.includes(marketplace as Marketplace)) {
      throw new BadRequestException('Unknown marketplace');
    }
    return this.accounts.setConnected(req.user.id, marketplace as Marketplace, dto.connected);
  }
}
