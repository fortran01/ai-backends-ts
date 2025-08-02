import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

/**
 * Application health check controller
 * 
 * Following the coding guidelines: Provides comprehensive health
 * monitoring endpoint with dependency status checks
 */
@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Health check endpoint to verify service status
   * 
   * @returns Health status object with service dependencies
   */
  @Get('health')
  @ApiOperation({ 
    summary: 'Health check endpoint',
    description: 'Verifies that the service is running and can reach external dependencies'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2024-01-15T10:30:00.000Z' },
        uptime: { type: 'number', example: 12345.678 },
        dependencies: {
          type: 'object',
          properties: {
            ollama: { type: 'string', example: 'connected' }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 503, 
    description: 'Service is unhealthy or dependencies are unreachable' 
  })
  async getHealth(): Promise<Record<string, any>> {
    return this.appService.getHealth();
  }
}