import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export class HrWebhookPayloadDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  title?: string;
}

export class HrWebhookEventDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsIn(['employee.onboarded', 'employee.offboarded', 'employee.transferred'])
  type: 'employee.onboarded' | 'employee.offboarded' | 'employee.transferred';

  @ValidateNested()
  @Type(() => HrWebhookPayloadDto)
  payload: HrWebhookPayloadDto;
}
