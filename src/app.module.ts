import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InferenceModule } from './inference/inference.module';

/**
 * Root application module
 * 
 * Following the coding guidelines: Imports all necessary modules
 * including HTTP module for external API calls and InferenceModule
 * for model serving functionality
 */
@Module({
  imports: [
    HttpModule.register({
      timeout: 30000, // 30 second timeout for external API calls
      maxRedirects: 5,
    }),
    InferenceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}