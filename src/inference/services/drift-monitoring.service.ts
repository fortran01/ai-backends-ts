import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';
import { ClassifyRequestDto, ClassifyResponseDto } from '../dto/classify.dto';

/**
 * Drift monitoring service for production model surveillance
 * 
 * Following the coding guidelines: Integrates with ai-backends-py Flask app
 * for comprehensive drift monitoring using Evidently AI while maintaining
 * TypeScript-native logging capabilities
 */
@Injectable()
export class DriftMonitoringService {
  private readonly logger: Logger = new Logger(DriftMonitoringService.name);
  private readonly dataDir: string = path.join(process.cwd(), 'data');
  private readonly productionLogPath: string = path.join(this.dataDir, 'production_requests.csv');
  private readonly referenceDataPath: string = path.join(this.dataDir, 'reference_data.csv');
  private readonly pythonFlaskUrl: string = 'http://localhost:5001';

  constructor(private readonly httpService: HttpService) {
    this.ensureDataDirectory();
    this.createReferenceDataset();
    this.syncDataWithPythonService();
  }

  /**
   * Ensure data directory exists for logging production requests
   */
  private ensureDataDirectory(): void {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
        this.logger.log('Created data directory for production monitoring');
      }
    } catch (error: unknown) {
      this.logger.error('Failed to create data directory', error);
    }
  }

  /**
   * Create reference dataset from Iris training data for drift comparison
   * 
   * Generates baseline statistics for comparison with production data
   */
  private createReferenceDataset(): void {
    try {
      if (!fs.existsSync(this.referenceDataPath)) {
        // Iris dataset reference data (same as used in model training)
        const referenceData: Array<Record<string, unknown>> = [
          // Setosa samples
          { sepal_length: 5.1, sepal_width: 3.5, petal_length: 1.4, petal_width: 0.2, target: 0, predicted_class: 0, confidence: 0.95 },
          { sepal_length: 4.9, sepal_width: 3.0, petal_length: 1.4, petal_width: 0.2, target: 0, predicted_class: 0, confidence: 0.97 },
          { sepal_length: 4.7, sepal_width: 3.2, petal_length: 1.3, petal_width: 0.2, target: 0, predicted_class: 0, confidence: 0.96 },
          // Versicolor samples
          { sepal_length: 7.0, sepal_width: 3.2, petal_length: 4.7, petal_width: 1.4, target: 1, predicted_class: 1, confidence: 0.89 },
          { sepal_length: 6.4, sepal_width: 3.2, petal_length: 4.5, petal_width: 1.5, target: 1, predicted_class: 1, confidence: 0.92 },
          { sepal_length: 6.9, sepal_width: 3.1, petal_length: 4.9, petal_width: 1.5, target: 1, predicted_class: 1, confidence: 0.88 },
          // Virginica samples
          { sepal_length: 6.3, sepal_width: 3.3, petal_length: 6.0, petal_width: 2.5, target: 2, predicted_class: 2, confidence: 0.94 },
          { sepal_length: 5.8, sepal_width: 2.7, petal_length: 5.1, petal_width: 1.9, target: 2, predicted_class: 2, confidence: 0.91 },
          { sepal_length: 7.1, sepal_width: 3.0, petal_length: 5.9, petal_width: 2.1, target: 2, predicted_class: 2, confidence: 0.93 }
        ];

        // Create CSV header
        const csvHeader: string = 'timestamp,sepal_length,sepal_width,petal_length,petal_width,target,predicted_class,confidence';
        const csvRows: string[] = [csvHeader];

        // Convert reference data to CSV rows
        referenceData.forEach((row: Record<string, unknown>) => {
          const csvRow: string = `${new Date().toISOString()},${row.sepal_length},${row.sepal_width},${row.petal_length},${row.petal_width},${row.target},${row.predicted_class},${row.confidence}`;
          csvRows.push(csvRow);
        });

        fs.writeFileSync(this.referenceDataPath, csvRows.join('\n'));
        this.logger.log('Created reference dataset for drift monitoring');
      }
    } catch (error: unknown) {
      this.logger.error('Failed to create reference dataset', error);
    }
  }

  /**
   * Sync data bidirectionally with Python Flask service for comprehensive monitoring
   */
  private async syncDataWithPythonService(): Promise<void> {
    try {
      const pythonDataDir: string = path.join(process.cwd(), '..', 'ai-backends-py', 'data');
      const pythonProductionLogPath: string = path.join(pythonDataDir, 'production_requests.csv');
      
      if (!fs.existsSync(pythonDataDir)) {
        this.logger.warn('Python service data directory not found, skipping sync');
        return;
      }

      // First: Send TypeScript data to Python service (if TypeScript has newer data)
      if (fs.existsSync(this.productionLogPath)) {
        try {
          const tsStats = fs.statSync(this.productionLogPath);
          const pyStats = fs.existsSync(pythonProductionLogPath) ? fs.statSync(pythonProductionLogPath) : null;
          
          // If TypeScript file is newer or Python file doesn't exist, copy TS -> Python
          if (!pyStats || tsStats.mtime > pyStats.mtime) {
            fs.copyFileSync(this.productionLogPath, pythonProductionLogPath);
            this.logger.debug('Synced TypeScript production data to Python service');
          }
        } catch (error: unknown) {
          this.logger.warn('Failed to sync TypeScript data to Python service', error);
        }
      }

      // Second: Get updated data from Python service (including shifted requests)
      if (fs.existsSync(pythonProductionLogPath)) {
        try {
          const pyStats = fs.statSync(pythonProductionLogPath);
          const tsStats = fs.existsSync(this.productionLogPath) ? fs.statSync(this.productionLogPath) : null;
          
          // If Python file is newer or has more content, copy Python -> TypeScript
          if (!tsStats || pyStats.mtime > tsStats.mtime || pyStats.size > tsStats.size) {
            fs.copyFileSync(pythonProductionLogPath, this.productionLogPath);
            this.logger.log('Synced updated production data from Python service (including shifted requests)');
          }
        } catch (error: unknown) {
          this.logger.warn('Failed to sync data from Python service', error);
        }
      }
    } catch (error: unknown) {
      this.logger.warn('Could not sync data with Python service', error);
    }
  }

  /**
   * Log classification request and response for production monitoring
   * 
   * @param request - Classification request with Iris features
   * @param response - Classification response with predictions and confidence
   */
  public async logClassificationRequest(request: ClassifyRequestDto, response: ClassifyResponseDto): Promise<void> {
    try {
      const timestamp: string = new Date().toISOString();
      const csvRow: string = `${timestamp},${request.sepal_length},${request.sepal_width},${request.petal_length},${request.petal_width},${response.predicted_class_index},${response.predicted_class_index},${response.confidence}`;

      // Check if file exists and add header if needed
      if (!fs.existsSync(this.productionLogPath)) {
        const csvHeader: string = 'timestamp,sepal_length,sepal_width,petal_length,petal_width,target,predicted_class,confidence';
        fs.writeFileSync(this.productionLogPath, csvHeader + '\n');
        this.logger.log('Created production requests log file');
      }

      // Append new request data
      fs.appendFileSync(this.productionLogPath, csvRow + '\n');
      this.logger.debug(`Logged classification request: ${response.predicted_class} (confidence: ${response.confidence})`);
      
      // Sync with Python service after logging
      await this.syncDataWithPythonService();
    } catch (error: unknown) {
      this.logger.error('Failed to log classification request', error);
    }
  }

  /**
   * Generate drift report using Evidently AI via Python Flask service
   * 
   * @param limit - Number of recent requests to analyze (default: 100)
   * @returns Drift analysis results and recommendations
   */
  public async generateDriftReport(limit: number = 100): Promise<Record<string, unknown>> {
    try {
      // Sync data with Python service before analysis
      await this.syncDataWithPythonService();

      // Call Python Flask service drift-report endpoint
      const response = await firstValueFrom(
        this.httpService.get(`${this.pythonFlaskUrl}/api/v1/drift-report`, {
          timeout: 30000,
          params: { limit: limit }
        })
      );

      this.logger.log('Successfully generated drift report via Python Flask service');
      return response.data;
      
    } catch (error: unknown) {
      this.logger.error('Failed to generate drift report via Python Flask service', error);
      
      // Check if it's a connection error
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return {
          error: 'Python Flask service unavailable',
          details: `Could not connect to ${this.pythonFlaskUrl}`,
          recommendation: 'Start the Python Flask service: cd ../ai-backends-py && python app.py',
          fallback_note: 'The Python service provides comprehensive drift monitoring with Evidently AI'
        };
      }

      // Return error response from Python service if available
      if (error.response?.data) {
        return error.response.data;
      }

      return {
        error: 'Drift analysis failed',
        details: error.message || 'Unknown error',
        recommendation: 'Check if Python Flask service is running on port 5001'
      };
    }
  }

  /**
   * Call drift simulation endpoint in Python Flask service
   * 
   * @param request - Original classification request 
   * @returns Drift simulation results from Python service
   */
  public async generateDriftSimulation(request: ClassifyRequestDto): Promise<Record<string, unknown>> {
    try {
      // Sync data with Python service
      await this.syncDataWithPythonService();

      // Call Python Flask service drift simulation endpoint
      const response = await firstValueFrom(
        this.httpService.post(`${this.pythonFlaskUrl}/api/v1/classify-shifted`, request, {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json'
          }
        })
      );

      this.logger.log('Successfully generated drift simulation via Python Flask service');
      return response.data;
      
    } catch (error: unknown) {
      this.logger.error('Failed to generate drift simulation via Python Flask service', error);
      
      // Check if it's a connection error
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return {
          error: 'Python Flask service unavailable',
          details: `Could not connect to ${this.pythonFlaskUrl}`,
          recommendation: 'Start the Python Flask service: cd ../ai-backends-py && python app.py',
          fallback_note: 'The Python service provides comprehensive drift simulation'
        };
      }

      // Return error response from Python service if available
      if (error.response?.data) {
        return error.response.data;
      }

      return {
        error: 'Drift simulation failed',
        details: error.message || 'Unknown error',
        recommendation: 'Check if Python Flask service is running on port 5001'
      };
    }
  }

  /**
   * Create shifted classification request for drift simulation
   * 
   * @param request - Original classification request
   * @returns Shifted request with systematic bias for drift demonstration
   */
  public createShiftedRequest(request: ClassifyRequestDto): {
    shifted_request: ClassifyRequestDto;
    bias_applied: Record<string, unknown>;
  } {
    // Apply systematic bias to simulate data drift
    const shiftedRequest: ClassifyRequestDto = {
      sepal_length: request.sepal_length + 1.5, // Additive bias
      sepal_width: request.sepal_width,
      petal_length: request.petal_length,
      petal_width: request.petal_width * 1.3  // Multiplicative bias
    };

    const biasApplied = {
      sepal_length: {
        original: request.sepal_length,
        shifted: shiftedRequest.sepal_length,
        bias_type: 'additive',
        bias_amount: 1.5
      },
      petal_width: {
        original: request.petal_width,
        shifted: shiftedRequest.petal_width,
        bias_type: 'multiplicative',
        bias_factor: 1.3
      },
      unchanged_features: ['sepal_width', 'petal_length']
    };

    return {
      shifted_request: shiftedRequest,
      bias_applied: biasApplied
    };
  }

  /**
   * Get production monitoring statistics
   * 
   * @returns Current monitoring status and metrics
   */
  public getMonitoringStats(): Record<string, unknown> {
    try {
      const stats = {
        data_directory: this.dataDir,
        production_log: {
          exists: fs.existsSync(this.productionLogPath),
          path: this.productionLogPath,
          sample_count: 0
        },
        reference_data: {
          exists: fs.existsSync(this.referenceDataPath),
          path: this.referenceDataPath,
          sample_count: 0
        },
        monitoring_active: true
      };

      // Count production samples
      if (fs.existsSync(this.productionLogPath)) {
        const productionData: string = fs.readFileSync(this.productionLogPath, 'utf8');
        const lines: string[] = productionData.split('\n').filter(line => line.trim() !== '');
        stats.production_log.sample_count = Math.max(0, lines.length - 1); // Exclude header
      }

      // Count reference samples
      if (fs.existsSync(this.referenceDataPath)) {
        const referenceData: string = fs.readFileSync(this.referenceDataPath, 'utf8');
        const lines: string[] = referenceData.split('\n').filter(line => line.trim() !== '');
        stats.reference_data.sample_count = Math.max(0, lines.length - 1); // Exclude header
      }

      return stats;
    } catch (error: unknown) {
      this.logger.error('Failed to get monitoring stats', error);
      return {
        error: 'Failed to retrieve monitoring statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}