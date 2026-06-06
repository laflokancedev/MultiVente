import { IsInt, IsString, Min } from 'class-validator';

export class PresignPhotoDto {
  @IsString()
  filename!: string;

  @IsString()
  contentType!: string;
}

export class AttachPhotoDto {
  @IsString()
  key!: string;

  @IsInt() @Min(0)
  order!: number;
}
