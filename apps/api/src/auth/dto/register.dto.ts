import { Transform } from 'class-transformer';
import { IsEmail, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
