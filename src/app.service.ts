import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Application service for core functionality
 * 
 * Following the coding guidelines: Implements health checking
 * with proper error handling and external dependency monitoring
 */
@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Perform comprehensive health check including external dependencies
   * 
   * @returns Health status object with dependency information
   * @throws HttpException 503 if critical dependencies are unreachable
   */
  public async getHealth(): Promise<Record<string, unknown>> {
    const healthData: Record<string, unknown> = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      dependencies: {} as Record<string, string>
    };

    try {
      // Check Ollama API connectivity
      const ollamaResponse = await firstValueFrom(
        this.httpService.get('http://localhost:11434/api/tags', {
          timeout: 5000
        })
      );
      
      (healthData.dependencies as Record<string, string>).ollama = ollamaResponse.status === 200 ? 'connected' : 'unreachable';
    } catch (error: unknown) {
      (healthData.dependencies as Record<string, string>).ollama = 'unreachable';
      healthData.status = 'degraded';
      
      // Log the error for monitoring
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Ollama health check failed: ${errorMessage}`);
    }

    // If critical dependencies are down, return 503
    if ((healthData.dependencies as Record<string, string>).ollama === 'unreachable') {
      throw new HttpException({
        ...healthData,
        status: 'unhealthy',
        message: 'Critical dependencies are unreachable'
      }, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return healthData;
  }
}