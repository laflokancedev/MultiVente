import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const;

export class CreateListingDto {
  @IsString() @MaxLength(120)
  title!: string;

  @IsString() @MaxLength(5000)
  description!: string;

  @IsInt() @Min(0)
  priceCents!: number;

  @IsOptional() @IsString() @MaxLength(3)
  currency?: string;

  @IsString() @MaxLength(60)
  category!: string;

  @IsIn(CONDITIONS)
  condition!: (typeof CONDITIONS)[number];

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
}
