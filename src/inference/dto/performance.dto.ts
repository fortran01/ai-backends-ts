import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTOs for performance comparison and serialization challenge endpoints
 * 
 * Following the coding guidelines: Uses Zod for runtime validation
 * and proper TypeScript typing for all request/response models
 */

// Performance comparison request schema
export const PerformanceComparisonRequestSchema = z.object({
  sepal_length: z.number()
    .min(0, 'Sepal length must be non-negative')
    .max(20, 'Sepal length must be realistic (max 20cm)'),
  sepal_width: z.number()
    .min(0, 'Sepal width must be non-negative')
    .max(20, 'Sepal width must be realistic (max 20cm)'),
  petal_length: z.number()
    .min(0, 'Petal length must be non-negative')
    .max(20, 'Petal length must be realistic (max 20cm)'),
  petal_width: z.number()
    .min(0, 'Petal width must be non-negative')
    .max(20, 'Petal width must be realistic (max 20cm)'),
  iterations: z.number()
    .int('Iterations must be an integer')
    .min(1, 'At least 1 iteration required')
    .max(100, 'Maximum 100 iterations allowed')
    .optional()
    .default(10)
});

export type PerformanceComparisonRequestDto = z.infer<typeof PerformanceComparisonRequestSchema>;

/**
 * Request DTO for performance comparison endpoint
 */
export class PerformanceComparisonRequestDtoClass implements PerformanceComparisonRequestDto {
  @ApiProperty({
    description: 'Sepal length measurement in centimeters',
    example: 5.1,
    minimum: 0,
    maximum: 20
  })
  public sepal_length!: number;

  @ApiProperty({
    description: 'Sepal width measurement in centimeters',
    example: 3.5,
    minimum: 0,
    maximum: 20
  })
  public sepal_width!: number;

  @ApiProperty({
    description: 'Petal length measurement in centimeters',
    example: 1.4,
    minimum: 0,
    maximum: 20
  })
  public petal_length!: number;

  @ApiProperty({
    description: 'Petal width measurement in centimeters',
    example: 0.2,
    minimum: 0,
    maximum: 20
  })
  public petal_width!: number;

  @ApiProperty({
    description: 'Number of iterations for performance testing',
    example: 10,
    minimum: 1,
    maximum: 100,
    required: false,
    default: 10
  })
  public iterations!: number;
}

// Serialization challenge response schema
export const SerializationChallengeResponseSchema = z.object({
  predicted_class: z.number(),
  class_name: z.string(),
  probabilities: z.array(z.number()),
  confidence: z.number(),
  model_info: z.object({
    loaded: z.boolean(),
    path: z.string(),
    class_names: z.array(z.string()),
    description: z.string()
  }),
  inference_time_ms: z.number(),
  input_features: z.object({
    sepal_length: z.number(),
    sepal_width: z.number(),
    petal_length: z.number(),
    petal_width: z.number()
  }),
  serialization_demo: z.object({
    big_int_demo: z.string(),
    undefined_handling: z.string(),
    custom_object_demo: z.record(z.unknown()),
    date_serialization: z.string(),
    buffer_handling: z.string(),
    complex_nested_structure: z.record(z.unknown())
  }),
  serialization_info: z.object({
    original_size_bytes: z.number(),
    serialized_size_bytes: z.number(),
    compression_ratio: z.number(),
    serialization_method: z.string()
  })
});

export type SerializationChallengeResponseDto = z.infer<typeof SerializationChallengeResponseSchema>;

// Performance comparison response schema
export const PerformanceComparisonResponseSchema = z.object({
  iterations: z.number(),
  rest_performance: z.object({
    total_time_ms: z.number(),
    average_time_ms: z.number(),
    fastest_ms: z.number(),
    slowest_ms: z.number(),
    success_rate: z.number()
  }),
  grpc_performance: z.object({
    total_time_ms: z.number(),
    average_time_ms: z.number(),
    fastest_ms: z.number(),
    slowest_ms: z.number(),
    success_rate: z.number()
  }),
  performance_analysis: z.object({
    speedup_factor: z.number(),
    grpc_faster: z.boolean(),
    time_saved_ms: z.number(),
    throughput_improvement: z.number()
  }),
  sample_results: z.object({
    rest_result: z.unknown().nullable(),
    grpc_result: z.unknown().nullable()
  })
});

export type PerformanceComparisonResponseDto = z.infer<typeof PerformanceComparisonResponseSchema>;

/**
 * Response DTO for serialization challenge endpoint
 */
export class SerializationChallengeResponseDtoClass implements SerializationChallengeResponseDto {
  @ApiProperty({
    description: 'Predicted class index',
    example: 0
  })
  public predicted_class!: number;

  @ApiProperty({
    description: 'Predicted class name',
    example: 'setosa'
  })
  public class_name!: string;

  @ApiProperty({
    description: 'Class probabilities array',
    example: [0.95, 0.03, 0.02]
  })
  public probabilities!: number[];

  @ApiProperty({
    description: 'Prediction confidence score',
    example: 0.95
  })
  public confidence!: number;

  @ApiProperty({
    description: 'Model information object',
    type: 'object',
    additionalProperties: true
  })
  public model_info!: {
    loaded: boolean;
    path: string;
    class_names: string[];
    description: string;
  };

  @ApiProperty({
    description: 'Inference time in milliseconds',
    example: 2.5
  })
  public inference_time_ms!: number;

  @ApiProperty({
    description: 'Input features used for prediction',
    type: 'object',
    additionalProperties: true
  })
  public input_features!: {
    sepal_length: number;
    sepal_width: number;
    petal_length: number;
    petal_width: number;
  };

  @ApiProperty({
    description: 'Serialization challenge demonstrations',
    type: 'object',
    properties: {
      big_int_demo: { type: 'string', example: 'BigInt(12345678901234567890) -> "12345678901234567890"' },
      undefined_handling: { type: 'string', example: 'undefined values converted to null' },
      custom_object_demo: { type: 'object', additionalProperties: true },
      date_serialization: { type: 'string', example: '2024-01-15T10:30:00.000Z' },
      buffer_handling: { type: 'string', example: 'Buffer converted to base64 string' },
      complex_nested_structure: { type: 'object', additionalProperties: true }
    }
  })
  public serialization_demo!: {
    big_int_demo: string;
    undefined_handling: string;
    custom_object_demo: Record<string, unknown>;
    date_serialization: string;
    buffer_handling: string;
    complex_nested_structure: Record<string, unknown>;
  };

  @ApiProperty({
    description: 'Serialization metadata and statistics',
    type: 'object',
    properties: {
      original_size_bytes: { type: 'number', example: 1024 },
      serialized_size_bytes: { type: 'number', example: 512 },
      compression_ratio: { type: 'number', example: 0.5 },
      serialization_method: { type: 'string', example: 'Custom JSON with replacer function' }
    }
  })
  public serialization_info!: {
    original_size_bytes: number;
    serialized_size_bytes: number;
    compression_ratio: number;
    serialization_method: string;
  };
}