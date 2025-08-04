import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { ClassifyRequestDto, ClassifyResponseDto } from '../dto/classify.dto';

/**
 * HTTP client service for REST-based inference
 * 
 * Following the coding guidelines: Proper error handling,
 * TypeScript typing, and performance monitoring
 */
@Injectable()
export class HttpInferenceService {
  private readonly logger: Logger = new Logger(HttpInferenceService.name);
  private readonly httpEndpoint: string = 'http://localhost:3001';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Check if HTTP inference server is available
   */
  public async isHttpServerAvailable(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.httpEndpoint}/health`, {
          timeout: 5000
        })
      );
      return response.status === 200 && response.data.status === 'healthy';
    } catch (error: unknown) {
      this.logger.debug(`HTTP server not available: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Perform Iris classification via HTTP server
   * 
   * @param request - Classification request with Iris features
   * @returns Classification results from HTTP server
   */
  public async classifyIrisViaHttp(request: ClassifyRequestDto): Promise<ClassifyResponseDto> {
    const startTime: number = Date.now();

    try {
      // Prepare HTTP request payload
      const httpRequest = {
        sepal_length: request.sepal_length,
        sepal_width: request.sepal_width,
        petal_length: request.petal_length,
        petal_width: request.petal_width
      };

      this.logger.debug(`Sending HTTP classification request: ${JSON.stringify(httpRequest)}`);

      // Make HTTP call to inference server
      const response = await firstValueFrom(
        this.httpService.post(`${this.httpEndpoint}/classify`, httpRequest, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        })
      );

      const totalTime: number = Date.now() - startTime;
      this.logger.debug(`HTTP call completed in ${totalTime}ms: ${JSON.stringify(response.data)}`);

      // Transform HTTP response to DTO format
      const result: ClassifyResponseDto = {
        predicted_class: response.data.predicted_class,
        predicted_class_index: response.data.predicted_class_index,
        class_names: response.data.class_names,
        probabilities: response.data.probabilities,
        confidence: response.data.confidence,
        model_info: {
          format: 'HTTP/REST',
          version: '1.0',
          inference_time_ms: response.data.model_info.inference_time_ms
        },
        input_features: {
          sepal_length: request.sepal_length,
          sepal_width: request.sepal_width,
          petal_length: request.petal_length,
          petal_width: request.petal_width
        }
      };

      return result;
    } catch (error: unknown) {
      const totalTime: number = Date.now() - startTime;
      this.logger.error(`HTTP call failed after ${totalTime}ms:`, error);

      // Convert HTTP errors to appropriate error messages
      const axiosError = error as AxiosError;
      if (axiosError.code === 'ECONNREFUSED') {
        throw new Error('HTTP inference server unavailable. Please ensure the HTTP server is running on port 3001.');
      } else if (axiosError.code === 'ETIMEDOUT') {
        throw new Error('HTTP call timeout. Server took too long to respond.');
      } else if (axiosError.response?.status === 400) {
        const errorMessage: string = (axiosError.response.data as { error?: string })?.error ?? axiosError.message ?? 'Bad Request';
        throw new Error(`Invalid request: ${errorMessage}`);
      } else if (axiosError.response?.status && axiosError.response.status >= 500) {
        const errorMessage: string = (axiosError.response.data as { error?: string })?.error ?? axiosError.message ?? 'Internal Server Error';
        throw new Error(`HTTP server error: ${errorMessage}`);
      } else {
        const errorMessage = axiosError.message || (error as Error).message || 'Unknown error';
        throw new Error(`HTTP error: ${errorMessage}`);
      }
    }
  }

  /**
   * Get HTTP service status information
   */
  public async getHttpStatus(): Promise<Record<string, unknown>> {
    const isAvailable: boolean = await this.isHttpServerAvailable();
    
    return {
      available: isAvailable,
      endpoint: this.httpEndpoint,
      protocol: 'HTTP/REST',
      service: 'HTTP Inference Server',
      method: 'POST /classify'
    };
  }
}