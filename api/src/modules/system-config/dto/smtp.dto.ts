import { IsString, IsNumberString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSmtpDto {
  @ApiProperty() @IsString() server!: string;
  @ApiProperty() @IsNumberString() port!: string;
  @ApiProperty() @IsString() user!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() password?: string;
  @ApiProperty() @IsIn(['TLS', 'SSL', 'NONE']) encryption!: string;
}
