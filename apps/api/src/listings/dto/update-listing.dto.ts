import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const;
const STATUSES = ['draft', 'active', 'sold', 'archived'] as const;

export class UpdateListingDto {
  @IsOptional() @IsString() @MaxLength(120)
  title?: string;

  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional() @IsInt() @Min(0)
  priceCents?: number;

  @IsOptional() @IsString() @MaxLength(3)
  currency?: string;

  @IsOptional() @IsString() @MaxLength(60)
  category?: string;

  @IsOptional() @IsIn(CONDITIONS)
  condition?: (typeof CONDITIONS)[number];

  @IsOptional() @IsString() @MaxLength(60)
  brand?: string;

  @IsOptional() @IsString() @MaxLength(40)
  color?: string;

  @IsOptional() @IsString() @MaxLength(40)
  size?: string;

  @IsOptional() @IsString() @MaxLength(120)
  location?: string;

  @IsOptional()
  shippingOptions?: unknown;

  @IsOptional() @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
