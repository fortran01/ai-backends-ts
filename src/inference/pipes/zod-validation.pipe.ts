import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

/**
 * Custom validation pipe using Zod schemas
 * 
 * Following the coding guidelines: Provides comprehensive validation
 * with detailed error messages for API requests
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  /**
   * Transform and validate input data using Zod schema
   * 
   * @param value - Input data to validate
   * @param metadata - Argument metadata from NestJS
   * @returns Validated and transformed data
   * @throws BadRequestException with detailed validation errors
   */
  transform(value: any, metadata: ArgumentMetadata): any {
    try {
      const parsedValue = this.schema.parse(value);
      return parsedValue;
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages: string[] = error.errors.map((err) => {
          const path: string = err.path.join('.');
          return `${path}: ${err.message}`;
        });
        
        throw new BadRequestException({
          message: 'Validation failed',
          errors: errorMessages,
          statusCode: 400
        });
      }
      throw new BadRequestException('Validation failed');
    }
  }
}