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

// Chat request schema for stateful conversation
export const ChatRequestSchema = z.object({
  prompt: z.string()
    .min(1, 'Prompt cannot be empty')
    .max(500, 'Prompt cannot exceed 500 characters')
    .transform(str => str.trim()),
  session_id: z.string()
    .min(1, 'Session ID cannot be empty')
    .max(100, 'Session ID cannot exceed 100 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Session ID must contain only alphanumeric characters, underscores, and hyphens')
});

export type ChatRequestDto = z.infer<typeof ChatRequestSchema>;

/**
 * Request DTO for stateful chat endpoint
 * 
 * Used for /api/v1/chat with conversation memory
 */
export class ChatRequestDtoClass implements ChatRequestDto {
  @ApiProperty({
    description: 'Text prompt for the conversation',
    example: 'What is machine learning?',
    minLength: 1,
    maxLength: 500
  })
  public prompt!: string;

  @ApiProperty({
    description: 'Unique session identifier for conversation memory',
    example: 'user-123-session',
    minLength: 1,
    maxLength: 100,
    pattern: '^[a-zA-Z0-9_-]+$'
  })
  public session_id!: string;
}

// Chat response schema with conversation memory metrics
export const ChatResponseSchema = z.object({
  response: z.string(),
  model: z.string(),
  created_at: z.string(),
  done: z.boolean(),
  session_id: z.string(),
  conversation_stats: z.object({
    message_count: z.number(),
    memory_size: z.number(),
    context_length: z.number()
  })
});

export type ChatResponseDto = z.infer<typeof ChatResponseSchema>;

/**
 * Response DTO for stateful chat endpoint with conversation metrics
 */
export class ChatResponseDtoClass implements ChatResponseDto {
  @ApiProperty({
    description: 'Generated response from the conversation model',
    example: 'Machine learning is a method of data analysis...'
  })
  public response!: string;

  @ApiProperty({
    description: 'Model used for generation',
    example: 'tinyllama'
  })
  public model!: string;

  @ApiProperty({
    description: 'Timestamp when response was created',
    example: '2024-01-15T10:30:00.000Z'
  })
  public created_at!: string;

  @ApiProperty({
    description: 'Whether response generation is complete',
    example: true
  })
  public done!: boolean;

  @ApiProperty({
    description: 'Session identifier for this conversation',
    example: 'user-123-session'
  })
  public session_id!: string;

  @ApiProperty({
    description: 'Conversation memory statistics',
    type: 'object',
    properties: {
      message_count: { type: 'number', example: 5 },
      memory_size: { type: 'number', example: 1024 },
      context_length: { type: 'number', example: 256 }
    }
  })
  public conversation_stats!: {
    message_count: number;
    memory_size: number;
    context_length: number;
  };
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