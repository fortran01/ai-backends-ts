import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Zod schemas for Iris classification endpoints
 * 
 * Following the coding guidelines: Comprehensive input validation
 * with biological range checking and detailed error messages
 */

// Iris features validation schema
export const ClassifyRequestSchema = z.object({
  sepal_length: z.number()
    .min(0.0, 'Sepal length must be non-negative')
    .max(10.0, 'Sepal length must be reasonable (≤10.0 cm)')
    .refine(val => !isNaN(val), 'Sepal length must be a valid number'),
  
  sepal_width: z.number()
    .min(0.0, 'Sepal width must be non-negative')
    .max(10.0, 'Sepal width must be reasonable (≤10.0 cm)')
    .refine(val => !isNaN(val), 'Sepal width must be a valid number'),
  
  petal_length: z.number()
    .min(0.0, 'Petal length must be non-negative')
    .max(10.0, 'Petal length must be reasonable (≤10.0 cm)')
    .refine(val => !isNaN(val), 'Petal length must be a valid number'),
  
  petal_width: z.number()
    .min(0.0, 'Petal width must be non-negative')
    .max(10.0, 'Petal width must be reasonable (≤10.0 cm)')
    .refine(val => !isNaN(val), 'Petal width must be a valid number')
});

export type ClassifyRequestDto = z.infer<typeof ClassifyRequestSchema>;

/**
 * Request DTO for Iris classification
 * 
 * Accepts the four standard Iris features for species prediction
 */
export class ClassifyRequestDtoClass implements ClassifyRequestDto {
  @ApiProperty({
    description: 'Sepal length in centimeters',
    example: 5.1,
    minimum: 0.0,
    maximum: 10.0
  })
  public sepal_length!: number;

  @ApiProperty({
    description: 'Sepal width in centimeters',
    example: 3.5,
    minimum: 0.0,
    maximum: 10.0
  })
  public sepal_width!: number;

  @ApiProperty({
    description: 'Petal length in centimeters',
    example: 1.4,
    minimum: 0.0,
    maximum: 10.0
  })
  public petal_length!: number;

  @ApiProperty({
    description: 'Petal width in centimeters',
    example: 0.2,
    minimum: 0.0,
    maximum: 10.0
  })
  public petal_width!: number;
}

// Classification response schema
export const ClassifyResponseSchema = z.object({
  predicted_class: z.string(),
  predicted_class_index: z.number().int().min(0).max(2),
  probabilities: z.array(z.number().min(0).max(1)).length(3),
  confidence: z.number().min(0).max(1),
  class_names: z.array(z.string()).length(3),
  input_features: z.object({
    sepal_length: z.number(),
    sepal_width: z.number(),
    petal_length: z.number(),
    petal_width: z.number()
  }),
  model_info: z.object({
    format: z.string(),
    version: z.string(),
    inference_time_ms: z.number()
  })
});

export type ClassifyResponseDto = z.infer<typeof ClassifyResponseSchema>;

/**
 * Response DTO for Iris classification with comprehensive prediction details
 */
export class ClassifyResponseDtoClass implements ClassifyResponseDto {
  @ApiProperty({
    description: 'Predicted Iris species name',
    example: 'setosa',
    enum: ['setosa', 'versicolor', 'virginica']
  })
  public predicted_class!: string;

  @ApiProperty({
    description: 'Predicted class index (0=setosa, 1=versicolor, 2=virginica)',
    example: 0,
    minimum: 0,
    maximum: 2
  })
  public predicted_class_index!: number;

  @ApiProperty({
    description: 'Prediction probabilities for each class [setosa, versicolor, virginica]',
    example: [0.95, 0.03, 0.02],
    type: 'array',
    items: { type: 'number', minimum: 0, maximum: 1 }
  })
  public probabilities!: number[];

  @ApiProperty({
    description: 'Confidence score (highest probability)',
    example: 0.95,
    minimum: 0,
    maximum: 1
  })
  public confidence!: number;

  @ApiProperty({
    description: 'All available class names',
    example: ['setosa', 'versicolor', 'virginica']
  })
  public class_names!: string[];

  @ApiProperty({
    description: 'Echo of input features for verification',
    type: 'object',
    properties: {
      sepal_length: { type: 'number', example: 5.1 },
      sepal_width: { type: 'number', example: 3.5 },
      petal_length: { type: 'number', example: 1.4 },
      petal_width: { type: 'number', example: 0.2 }
    }
  })
  public input_features!: {
    sepal_length: number;
    sepal_width: number;
    petal_length: number;
    petal_width: number;
  };

  @ApiProperty({
    description: 'Model metadata and performance information',
    type: 'object',
    properties: {
      format: { type: 'string', example: 'ONNX' },
      version: { type: 'string', example: '1.0' },
      inference_time_ms: { type: 'number', example: 2.5 }
    }
  })
  public model_info!: {
    format: string;
    version: string;
    inference_time_ms: number;
  };
}