import { Module } from '@nestjs/common';
import { FormatTranslatorService } from './format-translator.service';

@Module({
  providers: [FormatTranslatorService],
  exports: [FormatTranslatorService],
})
export class FormatTranslatorModule {}
