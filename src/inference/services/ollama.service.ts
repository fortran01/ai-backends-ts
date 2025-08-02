import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { GenerateRequestDto, GenerateResponseDto } from '../dto/generate.dto';

/**
 * Service for interacting with Ollama API
 * 
 * Following the coding guidelines: Handles external API communication
 * with proper error handling, timeout management, and logging
 */
@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  private readonly ollamaBaseUrl: string = 'http://localhost:11434';
  private readonly modelName: string = 'tinyllama';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Generate text using Ollama's TinyLlama model
   * 
   * @param request - Generation request containing prompt
   * @returns Generated text response from the model
   * @throws HttpException for API errors, timeouts, or connection issues
   */
  async generateText(request: GenerateRequestDto): Promise<GenerateResponseDto> {
    try {
      this.logger.log(`Generating text for prompt: "${request.prompt.substring(0, 50)}..."`);
      
      const startTime: number = Date.now();
      
      const response = await firstValueFrom(
        this.httpService.post(`${this.ollamaBaseUrl}/api/generate`, {
          model: this.modelName,
          prompt: request.prompt,
          stream: false // Get complete response at once
        }, {
          timeout: 30000, // 30 second timeout
          headers: {
            'Content-Type': 'application/json'
          }
        })
      );

      const duration: number = Date.now() - startTime;
      this.logger.log(`Text generation completed in ${duration}ms`);

      // Transform Ollama response to our standard format
      const ollamaResponse = response.data;
      
      return {
        response: ollamaResponse.response || '',
        model: this.modelName,
        created_at: new Date().toISOString(),
        done: ollamaResponse.done || true
      };
      
    } catch (error: any) {
      this.logger.error(`Ollama API error: ${error.message}`, error.stack);
      
      if (error.code === 'ECONNREFUSED') {
        throw new HttpException({
          message: 'Ollama service is not running. Please start Ollama and ensure TinyLlama model is available.',
          error: 'Service Unavailable',
          statusCode: 503
        }, HttpStatus.SERVICE_UNAVAILABLE);
      }
      
      if (error.code === 'ENOTFOUND') {
        throw new HttpException({
          message: 'Could not connect to Ollama service. Please check the service is running on localhost:11434.',
          error: 'Service Unavailable',
          statusCode: 503
        }, HttpStatus.SERVICE_UNAVAILABLE);
      }
      
      if (error.response?.status === 404) {
        throw new HttpException({
          message: `Model '${this.modelName}' not found. Please run: ollama pull ${this.modelName}`,
          error: 'Model Not Found',
          statusCode: 404
        }, HttpStatus.NOT_FOUND);
      }
      
      throw new HttpException({
        message: 'Text generation failed',
        error: error.message || 'Internal Server Error',
        statusCode: error.response?.status || 500
      }, error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Check if Ollama service is available and model is loaded
   * 
   * @returns True if service is available, false otherwise
   */
  async isServiceAvailable(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.ollamaBaseUrl}/api/tags`, {
          timeout: 5000
        })
      );
      
      const models = response.data.models || [];
      const hasModel: boolean = models.some((model: any) => 
        model.name?.includes(this.modelName)
      );
      
      return response.status === 200 && hasModel;
    } catch (error: any) {
      this.logger.warn(`Ollama service check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if Ollama service is available (simpler version for status checks)
   * 
   * @returns True if service is available, false otherwise
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.ollamaBaseUrl}/api/version`, {
          timeout: 5000
        })
      );
      
      return response.status === 200;
    } catch (error: any) {
      this.logger.warn(`Ollama availability check failed: ${error.message}`);
      return false;
    }
  }
}