import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ClassifyRequestDto, ClassifyResponseDto } from '../dto/classify.dto';
import { firstValueFrom } from 'rxjs';

/**
 * Triton Inference Server service for high-performance model inference
 * 
 * Following the coding guidelines: Uses Triton Inference Server's HTTP/REST API
 * for production-grade model serving with dynamic batching capabilities
 */
@Injectable()
export class TritonService {
  private readonly logger = new Logger(TritonService.name);
  private readonly tritonUrl = 'http://localhost:8000';
  private readonly modelName = 'iris_onnx';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Classify iris flower using Triton Inference Server
   * 
   * @param request - Classification request with iris features
   * @returns Classification response with prediction and confidence
   */
  public async classifyIris(request: ClassifyRequestDto): Promise<ClassifyResponseDto> {
    const requestStartTime: number = Date.now();

    try {
      // Prepare Triton inference request payload
      const tritonRequest = {
        inputs: [
          {
            name: 'float_input',
            datatype: 'FP32',
            shape: [1, 4],
            data: [
              request.sepal_length,
              request.sepal_width,
              request.petal_length,
              request.petal_width
            ]
          }
        ],
        outputs: [
          {
            name: 'label'
          },
          {
            name: 'probabilities'
          }
        ]
      };

      this.logger.debug(`Sending request to Triton: ${JSON.stringify(tritonRequest)}`);

      // Make HTTP request to Triton Inference Server
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.tritonUrl}/v2/models/${this.modelName}/infer`,
          tritonRequest,
          {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        )
      );

      const responseTime: number = Date.now() - requestStartTime;

      // Extract outputs from Triton response
      const outputs = response.data.outputs;
      const labelOutput = outputs.find((output: any) => output.name === 'label');
      const probsOutput = outputs.find((output: any) => output.name === 'probabilities');

      if (!labelOutput || !probsOutput) {
        throw new InternalServerErrorException('Invalid response from Triton server');
      }

      // Parse prediction results
      const predictedIndex: number = labelOutput.data[0];
      const probabilities: number[] = probsOutput.data;
      const confidence: number = Math.max(...probabilities);

      // Map class index to class name
      const classNames: string[] = ['setosa', 'versicolor', 'virginica'];
      const predictedClass: string = classNames[predictedIndex] || 'unknown';

      this.logger.debug(`Triton prediction: class=${predictedClass}, confidence=${confidence}`);

      return {
        predicted_class: predictedClass,
        predicted_class_index: predictedIndex,
        confidence,
        probabilities,
        class_names: classNames,
        input_features: {
          sepal_length: request.sepal_length,
          sepal_width: request.sepal_width,
          petal_length: request.petal_length,
          petal_width: request.petal_width
        },
        model_info: {
          format: 'ONNX',
          version: '1',
          inference_time_ms: responseTime
        }
      };

    } catch (error: any) {
      const responseTime: number = Date.now() - requestStartTime;
      
      if (error.code === 'ECONNREFUSED') {
        this.logger.error('Triton Inference Server is not running or not accessible');
        throw new InternalServerErrorException(
          'Triton Inference Server unavailable. Please ensure Triton is running on http://localhost:8000'
        );
      }

      if (error.response?.status === 400) {
        this.logger.error(`Triton server error: ${error.response.data}`);
        throw new InternalServerErrorException(`Triton server error: ${error.response.data.error || 'Bad request'}`);
      }

      this.logger.error(`Triton inference failed: ${error.message}`);
      throw new InternalServerErrorException('Triton inference failed');
    }
  }

  /**
   * Check if Triton Inference Server is healthy and ready
   * 
   * @returns Health status information
   */
  public async checkHealth(): Promise<{ healthy: boolean; ready: boolean; error?: string }> {
    try {
      // Check if server is live
      const liveResponse = await firstValueFrom(
        this.httpService.get(`${this.tritonUrl}/v2/health/live`, { timeout: 5000 })
      );

      // Check if server is ready
      const readyResponse = await firstValueFrom(
        this.httpService.get(`${this.tritonUrl}/v2/health/ready`, { timeout: 5000 })
      );

      const healthy: boolean = liveResponse.status === 200;
      const ready: boolean = readyResponse.status === 200;

      this.logger.debug(`Triton health check: live=${healthy}, ready=${ready}`);

      return { healthy, ready };

    } catch (error: any) {
      this.logger.warn(`Triton health check failed: ${error.message}`);
      return {
        healthy: false,
        ready: false,
        error: error.code === 'ECONNREFUSED' ? 'Server not running' : error.message
      };
    }
  }

  /**
   * Get model metadata from Triton server
   * 
   * @returns Model metadata information
   */
  public async getModelMetadata(): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.tritonUrl}/v2/models/${this.modelName}`, { timeout: 10000 })
      );

      return response.data;

    } catch (error: any) {
      this.logger.error(`Failed to get model metadata: ${error.message}`);
      throw new InternalServerErrorException('Failed to retrieve model metadata from Triton');
    }
  }

  /**
   * Get Triton server status and configuration
   * 
   * @returns Server status information
   */
  public async getServerStatus(): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.tritonUrl}/v2`, { timeout: 10000 })
      );

      return response.data;

    } catch (error: any) {
      this.logger.error(`Failed to get server status: ${error.message}`);
      throw new InternalServerErrorException('Failed to retrieve server status from Triton');
    }
  }
}