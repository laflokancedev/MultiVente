import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get()
  stats(@Req() req: any) {
    return this.dashboard.getStats(req.user.id);
  }
}
