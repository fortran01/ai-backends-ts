import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTOs for Phase 4: Model Lifecycle Management & Monitoring
 * 
 * Following the coding guidelines: Comprehensive validation with Zod schemas
 * and detailed OpenAPI documentation for drift monitoring and MLflow integration
 */

// Drift Report Request Schema
export const DriftReportRequestSchema = z.object({
  limit: z.number().int().min(1).max(1000).optional().default(100)
});

export type DriftReportRequestDto = z.infer<typeof DriftReportRequestSchema>;

// MLflow Registry Request Schema  
export const MLflowRegistryRequestSchema = z.object({
  sepal_length: z.number().min(0).max(10).describe('Sepal length in centimeters'),
  sepal_width: z.number().min(0).max(10).describe('Sepal width in centimeters'),
  petal_length: z.number().min(0).max(10).describe('Petal length in centimeters'),
  petal_width: z.number().min(0).max(10).describe('Petal width in centimeters'),
  model_format: z.enum(['sklearn', 'onnx']).optional().default('onnx'),
  version: z.string().optional().describe('Model version (e.g., "1", "2")'),
  stage: z.enum(['None', 'Staging', 'Production', 'Archived']).optional().describe('Model stage')
});

export type MLflowRegistryRequestDto = z.infer<typeof MLflowRegistryRequestSchema>;

// Drift Simulation Request Schema
export const DriftSimulationRequestSchema = z.object({
  sepal_length: z.number().min(0).max(10).describe('Sepal length in centimeters'),
  sepal_width: z.number().min(0).max(10).describe('Sepal width in centimeters'), 
  petal_length: z.number().min(0).max(10).describe('Petal length in centimeters'),
  petal_width: z.number().min(0).max(10).describe('Petal width in centimeters')
});

export type DriftSimulationRequestDto = z.infer<typeof DriftSimulationRequestSchema>;

/**
 * API Request DTO Classes with OpenAPI documentation
 */

export class DriftReportRequest {
  @ApiProperty({
    description: 'Number of recent requests to analyze for drift detection',
    example: 100,
    minimum: 1,
    maximum: 1000,
    required: false,
    default: 100
  })
  limit?: number = 100;
}

export class MLflowRegistryRequest {
  @ApiProperty({
    description: 'Sepal length measurement in centimeters',
    example: 5.1,
    minimum: 0,
    maximum: 10
  })
  sepal_length!: number;

  @ApiProperty({
    description: 'Sepal width measurement in centimeters',
    example: 3.5,
    minimum: 0,
    maximum: 10
  })
  sepal_width!: number;

  @ApiProperty({
    description: 'Petal length measurement in centimeters',
    example: 1.4,
    minimum: 0,
    maximum: 10
  })
  petal_length!: number;

  @ApiProperty({
    description: 'Petal width measurement in centimeters',
    example: 0.2,
    minimum: 0,
    maximum: 10
  })
  petal_width!: number;

  @ApiProperty({
    description: 'Model format to use from registry',
    example: 'onnx',
    enum: ['sklearn', 'onnx'],
    required: false,
    default: 'onnx'
  })
  model_format?: string = 'onnx';

  @ApiProperty({
    description: 'Specific model version to use (e.g., "1", "2")',
    example: '1',
    required: false
  })
  version?: string;

  @ApiProperty({
    description: 'Model stage to use from registry',
    example: 'Production',
    enum: ['None', 'Staging', 'Production', 'Archived'],
    required: false
  })
  stage?: string;
}

export class DriftSimulationRequest {
  @ApiProperty({
    description: 'Sepal length measurement in centimeters',
    example: 5.1,
    minimum: 0,
    maximum: 10
  })
  sepal_length!: number;

  @ApiProperty({
    description: 'Sepal width measurement in centimeters',
    example: 3.5,
    minimum: 0,
    maximum: 10
  })
  sepal_width!: number;

  @ApiProperty({
    description: 'Petal length measurement in centimeters',
    example: 1.4,
    minimum: 0,
    maximum: 10
  })
  petal_length!: number;

  @ApiProperty({
    description: 'Petal width measurement in centimeters',
    example: 0.2,
    minimum: 0,
    maximum: 10
  })
  petal_width!: number;
}

/**
 * Response DTO Classes with OpenAPI documentation
 */

export class DriftReportResponse {
  @ApiProperty({
    description: 'Drift analysis results from statistical tests',
    example: {
      overall_drift_score: 0.15,
      drift_severity: 'low',
      significant_drifts: 0,
      total_features: 4,
      feature_analysis: {
        sepal_length: {
          ks_statistic: 0.1,
          p_value: 0.85,
          drift_score: 0.2,
          is_significant: false,
          drift_detected: false
        }
      }
    }
  })
  drift_analysis!: Record<string, unknown>;

  @ApiProperty({
    description: 'Data summary for the analysis',
    example: {
      reference_samples: 9,
      production_samples: 15,
      analysis_limit: 100
    }
  })
  data_summary!: Record<string, unknown>;

  @ApiProperty({
    description: 'Recommendations based on drift analysis',
    example: ['✅ Data distribution is stable', 'Continue normal monitoring']
  })
  recommendations!: string[];

  @ApiProperty({
    description: 'Monitoring status and alert levels',
    example: {
      level: 'normal',
      requires_attention: false
    }
  })
  monitoring_status!: Record<string, unknown>;
}

export class MLflowRegistryResponse {
  @ApiProperty({
    description: 'Predicted Iris species class name',
    example: 'setosa'
  })
  predicted_class!: string;

  @ApiProperty({
    description: 'Predicted class index (0=setosa, 1=versicolor, 2=virginica)',
    example: 0
  })
  predicted_class_index!: number;

  @ApiProperty({
    description: 'Classification probabilities for each class',
    example: [0.95, 0.03, 0.02]
  })
  probabilities!: number[];

  @ApiProperty({
    description: 'Confidence score (highest probability)',
    example: 0.95
  })
  confidence!: number;

  @ApiProperty({
    description: 'Available class names',
    example: ['setosa', 'versicolor', 'virginica']
  })
  class_names!: string[];

  @ApiProperty({
    description: 'Input features used for classification',
    example: {
      sepal_length: 5.1,
      sepal_width: 3.5,
      petal_length: 1.4,
      petal_width: 0.2
    }
  })
  input_features!: Record<string, number>;

  @ApiProperty({
    description: 'Model information and performance metrics',
    example: {
      format: 'ONNX',
      inference_time_ms: 2.5,
      source: 'MLflow Registry'
    }
  })
  model_info!: Record<string, unknown>;

  @ApiProperty({
    description: 'MLflow registry metadata',
    example: {
      model_uri: 'models:/iris-classifier-onnx/1',
      model_name: 'iris-classifier-onnx',
      version: '1',
      stage: 'Production',
      run_id: 'abc123',
      creation_timestamp: 1642689000000
    }
  })
  registry_metadata!: Record<string, unknown>;
}

export class DriftSimulationResponse {
  @ApiProperty({
    description: 'Original classification results',
    example: {
      predicted_class: 'setosa',
      predicted_class_index: 0,
      probabilities: [0.95, 0.03, 0.02],
      confidence: 0.95
    }
  })
  original_prediction!: Record<string, unknown>;

  @ApiProperty({
    description: 'Classification results with applied bias',
    example: {
      predicted_class: 'versicolor',
      predicted_class_index: 1,
      probabilities: [0.12, 0.78, 0.10],
      confidence: 0.78
    }
  })
  shifted_prediction!: Record<string, unknown>;

  @ApiProperty({
    description: 'Details of the systematic bias applied',
    example: {
      sepal_length: {
        original: 5.1,
        shifted: 6.6,
        bias_type: 'additive',
        bias_amount: 1.5
      },
      petal_width: {
        original: 0.2,
        shifted: 0.26,
        bias_type: 'multiplicative',
        bias_factor: 1.3
      }
    }
  })
  bias_applied!: Record<string, unknown>;

  @ApiProperty({
    description: 'Analysis of prediction changes due to drift',
    example: {
      prediction_changed: true,
      confidence_change: -0.17,
      class_shift: 'setosa -> versicolor',
      drift_impact: 'significant'
    }
  })
  drift_analysis!: Record<string, unknown>;
}

export class MonitoringStatsResponse {
  @ApiProperty({
    description: 'Data directory path',
    example: '/app/data'
  })
  data_directory!: string;

  @ApiProperty({
    description: 'Production log file information',
    example: {
      exists: true,
      path: '/app/data/production_requests.csv',
      sample_count: 25
    }
  })
  production_log!: Record<string, unknown>;

  @ApiProperty({
    description: 'Reference data information',
    example: {
      exists: true,
      path: '/app/data/reference_data.csv',
      sample_count: 9
    }
  })
  reference_data!: Record<string, unknown>;

  @ApiProperty({
    description: 'Monitoring system status',
    example: true
  })
  monitoring_active!: boolean;
}