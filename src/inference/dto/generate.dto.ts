import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Zod schemas for generation endpoints with comprehensive validation
 * 
 * Following the coding guidelines: Uses Zod for runtime validation
 * and proper TypeScript typing for all request/response models
 */

// Base generation request schema
export const GenerateRequestSchema = z.object({
  prompt: z.string()
    .min(1, 'Prompt cannot be empty')
    .max(500, 'Prompt cannot exceed 500 characters')
    .transform(str => str.trim())
});

export type GenerateRequestDto = z.infer<typeof GenerateRequestSchema>;

/**
 * Request DTO for text generation endpoints
 * 
 * Used for both /api/v1/generate and /api/v1/generate-secure
 */
export class GenerateRequestDtoClass implements GenerateRequestDto {
  @ApiProperty({
    description: 'Text prompt for the language model',
    example: 'Explain the concept of machine learning in simple terms',
    minLength: 1,
    maxLength: 500
  })
  public prompt!: string;
}

// Generation response schema
export const GenerateResponseSchema = z.object({
  response: z.string(),
  model: z.string(),
  created_at: z.string(),
  done: z.boolean()
});

export type GenerateResponseDto = z.infer<typeof GenerateResponseSchema>;

/**
 * Response DTO for generation endpoints
 */
export class GenerateResponseDtoClass implements GenerateResponseDto {
  @ApiProperty({
    description: 'Generated text response from the model',
    example: 'Machine learning is a subset of artificial intelligence...'
  })
  public response!: string;

  @ApiProperty({
    description: 'Model used for generation',
    example: 'tinyllama'
  })
  public model!: string;

  @ApiProperty({
    description: 'Timestamp when generation was created',
    example: '2024-01-15T10:30:00.000Z'
  })
  public created_at!: string;

  @ApiProperty({
    description: 'Whether generation is complete',
    example: true
  })
  public done!: boolean;
}

// Secure generation response schema with security metrics
export const SecureGenerateResponseSchema = z.object({
  response: z.string(),
  model: z.string(),
  created_at: z.string(),
  done: z.boolean(),
  security_analysis: z.object({
    detected_patterns: z.array(z.string()),
    original_length: z.number(),
    sanitized_length: z.number(),
    risk_level: z.enum(['low', 'medium', 'high']),
    sanitization_applied: z.boolean()
  })
});

export type SecureGenerateResponseDto = z.infer<typeof SecureGenerateResponseSchema>;

/**
 * Response DTO for secure generation endpoint with security analysis
 */
export class SecureGenerateResponseDtoClass implements SecureGenerateResponseDto {
  @ApiProperty({
    description: 'Generated text response from the model',
    example: 'Machine learning is a subset of artificial intelligence...'
  })
  public response!: string;

  @ApiProperty({
    description: 'Model used for generation',
    example: 'tinyllama'
  })
  public model!: string;

  @ApiProperty({
    description: 'Timestamp when generation was created',
    example: '2024-01-15T10:30:00.000Z'
  })
  public created_at!: string;

  @ApiProperty({
    description: 'Whether generation is complete',
    example: true
  })
  public done!: boolean;

  @ApiProperty({
    description: 'Security analysis of the input prompt',
    type: 'object',
    properties: {
      detected_patterns: {
        type: 'array',
        items: { type: 'string' },
        example: ['ignore instructions', 'act as']
      },
      original_length: { type: 'number', example: 45 },
      sanitized_length: { type: 'number', example: 42 },
      risk_level: { type: 'string', enum: ['low', 'medium', 'high'], example: 'medium' },
      sanitization_applied: { type: 'boolean', example: true }
    }
  })
  public security_analysis!: {
    detected_patterns: string[];
    original_length: number;
    sanitized_length: number;
    risk_level: 'low' | 'medium' | 'high';
    sanitization_applied: boolean;
  };
}