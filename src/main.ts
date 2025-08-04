import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Bootstrap the NestJS application
 * 
 * Following the coding guidelines: Sets up global validation,
 * Swagger documentation, and starts the server on port 3000
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  
  // Set global API prefix
  app.setGlobalPrefix('api');
  
  // Enable API versioning with URI-based versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  
  // Enable global validation using class-validator
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Setup Swagger/OpenAPI documentation
  const config = new DocumentBuilder()
    .setTitle('AI Backends API')
    .setDescription('TypeScript/NestJS implementation of AI model serving with security demonstrations')
    .setVersion('1.0')
    .addTag('inference', 'Model inference endpoints')
    .addTag('health', 'Health check endpoints')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port: number = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Swagger documentation available at: http://localhost:${port}/api/docs`);
}

bootstrap();