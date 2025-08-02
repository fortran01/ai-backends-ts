#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Command } from 'commander';

/**
 * Batch inference script for processing multiple prompts
 * 
 * Following the coding guidelines: Standalone NestJS-style script
 * with comprehensive CLI interface and error handling
 */

interface BatchRequest {
  id: string;
  prompt: string;
  metadata?: Record<string, any>;
}

interface BatchResult {
  id: string;
  prompt: string;
  response: string;
  success: boolean;
  error?: string;
  timestamp: string;
  response_time_ms: number;
  metadata?: Record<string, any>;
}

interface BatchStatistics {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  success_rate: number;
  total_time_ms: number;
  average_response_time_ms: number;
  throughput_requests_per_second: number;
}

class BatchInferenceProcessor {
  private readonly baseUrl: string;
  private readonly delayBetweenRequests: number;
  private readonly timeoutMs: number;

  constructor(
    baseUrl: string = 'http://localhost:3000',
    delayMs: number = 1000,
    timeoutMs: number = 30000
  ) {
    this.baseUrl = baseUrl;
    this.delayBetweenRequests = delayMs;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Load prompts from text file (one prompt per line)
   * 
   * @param filePath - Path to text file with prompts
   * @returns Array of batch requests
   */
  private loadPromptsFromText(filePath: string): BatchRequest[] {
    const content: string = fs.readFileSync(filePath, 'utf-8');
    const lines: string[] = content.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    return lines.map((prompt, index) => ({
      id: `prompt_${index + 1}`,
      prompt
    }));
  }

  /**
   * Load prompts from CSV file with metadata
   * 
   * @param filePath - Path to CSV file
   * @returns Array of batch requests
   */
  private loadPromptsFromCsv(filePath: string): BatchRequest[] {
    const content: string = fs.readFileSync(filePath, 'utf-8');
    const lines: string[] = content.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      throw new Error('CSV file is empty');
    }

    // Parse header
    const header: string[] = lines[0].split(',').map(col => col.trim());
    const promptIndex: number = header.findIndex(col => 
      col.toLowerCase() === 'prompt' || col.toLowerCase() === 'text'
    );

    if (promptIndex === -1) {
      throw new Error('CSV file must have a "prompt" or "text" column');
    }

    // Parse data rows
    return lines.slice(1).map((line, index) => {
      const values: string[] = line.split(',').map(val => val.trim());
      const prompt: string = values[promptIndex] || '';
      
      // Extract metadata from other columns
      const metadata: Record<string, any> = {};
      header.forEach((col, colIndex) => {
        if (colIndex !== promptIndex && values[colIndex]) {
          metadata[col] = values[colIndex];
        }
      });

      return {
        id: `csv_row_${index + 1}`,
        prompt,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined
      };
    }).filter(req => req.prompt.length > 0);
  }

  /**
   * Process a single prompt through the API
   * 
   * @param request - Batch request to process
   * @returns Processing result
   */
  private async processPrompt(request: BatchRequest): Promise<BatchResult> {
    const startTime: number = Date.now();
    
    try {
      console.log(`Processing: ${request.id} - "${request.prompt.substring(0, 50)}..."`);
      
      const response = await axios.post(
        `${this.baseUrl}/api/v1/generate`,
        { prompt: request.prompt },
        {
          timeout: this.timeoutMs,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const responseTime: number = Date.now() - startTime;
      const responseText: string = response.data.response || '';

      console.log(`✓ Completed: ${request.id} (${responseTime}ms)`);

      return {
        id: request.id,
        prompt: request.prompt,
        response: responseText,
        success: true,
        timestamp: new Date().toISOString(),
        response_time_ms: responseTime,
        metadata: request.metadata
      };

    } catch (error: any) {
      const responseTime: number = Date.now() - startTime;
      const errorMessage: string = error.response?.data?.message || error.message || 'Unknown error';
      
      console.log(`✗ Failed: ${request.id} - ${errorMessage}`);

      return {
        id: request.id,
        prompt: request.prompt,
        response: '',
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
        response_time_ms: responseTime,
        metadata: request.metadata
      };
    }
  }

  /**
   * Calculate batch processing statistics
   * 
   * @param results - Array of batch results
   * @param totalTimeMs - Total processing time
   * @returns Statistics summary
   */
  private calculateStatistics(results: BatchResult[], totalTimeMs: number): BatchStatistics {
    const successful: BatchResult[] = results.filter(r => r.success);
    const failed: BatchResult[] = results.filter(r => !r.success);
    
    const totalRequests: number = results.length;
    const successfulRequests: number = successful.length;
    const failedRequests: number = failed.length;
    const successRate: number = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;
    
    const averageResponseTime: number = successful.length > 0 
      ? successful.reduce((sum, r) => sum + r.response_time_ms, 0) / successful.length 
      : 0;
    
    const throughput: number = totalTimeMs > 0 ? (successfulRequests / totalTimeMs) * 1000 : 0;

    return {
      total_requests: totalRequests,
      successful_requests: successfulRequests,
      failed_requests: failedRequests,
      success_rate: parseFloat(successRate.toFixed(2)),
      total_time_ms: totalTimeMs,
      average_response_time_ms: parseFloat(averageResponseTime.toFixed(2)),
      throughput_requests_per_second: parseFloat(throughput.toFixed(2))
    };
  }

  /**
   * Process batch of prompts with rate limiting and error recovery
   * 
   * @param requests - Array of batch requests
   * @param outputPath - Path to save results
   */
  async processBatch(requests: BatchRequest[], outputPath: string): Promise<void> {
    console.log(`\n🚀 Starting batch processing of ${requests.length} prompts...`);
    console.log(`📊 Rate limiting: ${this.delayBetweenRequests}ms delay between requests`);
    console.log(`⏰ Timeout: ${this.timeoutMs}ms per request\n`);

    const results: BatchResult[] = [];
    const startTime: number = Date.now();

    for (let i = 0; i < requests.length; i++) {
      const request: BatchRequest = requests[i];
      const result: BatchResult = await this.processPrompt(request);
      results.push(result);

      // Add delay between requests (except for the last one)
      if (i < requests.length - 1) {
        await new Promise(resolve => setTimeout(resolve, this.delayBetweenRequests));
      }
    }

    const totalTime: number = Date.now() - startTime;
    const statistics: BatchStatistics = this.calculateStatistics(results, totalTime);

    // Save results to output file
    const output = {
      metadata: {
        generated_at: new Date().toISOString(),
        total_prompts: requests.length,
        base_url: this.baseUrl,
        delay_between_requests_ms: this.delayBetweenRequests,
        timeout_ms: this.timeoutMs
      },
      statistics,
      results
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    // Print summary
    console.log('\n📈 Batch Processing Summary:');
    console.log(`   Total Requests: ${statistics.total_requests}`);
    console.log(`   Successful: ${statistics.successful_requests} (${statistics.success_rate}%)`);
    console.log(`   Failed: ${statistics.failed_requests}`);
    console.log(`   Total Time: ${(statistics.total_time_ms / 1000).toFixed(1)}s`);
    console.log(`   Average Response Time: ${statistics.average_response_time_ms}ms`);
    console.log(`   Throughput: ${statistics.throughput_requests_per_second} req/sec`);
    console.log(`\n💾 Results saved to: ${outputPath}\n`);
  }

  /**
   * Load requests from input file (auto-detects format)
   * 
   * @param inputPath - Path to input file (.txt or .csv)
   * @returns Array of batch requests
   */
  loadRequests(inputPath: string): BatchRequest[] {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    const extension: string = path.extname(inputPath).toLowerCase();
    
    switch (extension) {
      case '.txt':
        return this.loadPromptsFromText(inputPath);
      case '.csv':
        return this.loadPromptsFromCsv(inputPath);
      default:
        throw new Error(`Unsupported file format: ${extension}. Supported formats: .txt, .csv`);
    }
  }
}

// CLI Application
async function main(): Promise<void> {
  const program = new Command();
  
  program
    .name('batch-inference')
    .description('Process multiple prompts through AI inference API')
    .version('1.0.0');

  program
    .requiredOption('-i, --input <path>', 'Input file path (.txt or .csv)')
    .requiredOption('-o, --output <path>', 'Output JSON file path')
    .option('-u, --url <url>', 'Base URL for the API', 'http://localhost:3000')
    .option('-d, --delay <ms>', 'Delay between requests in milliseconds', '1000')
    .option('-t, --timeout <ms>', 'Request timeout in milliseconds', '30000')
    .action(async (options) => {
      try {
        const processor = new BatchInferenceProcessor(
          options.url,
          parseInt(options.delay),
          parseInt(options.timeout)
        );

        const requests: BatchRequest[] = processor.loadRequests(options.input);
        await processor.processBatch(requests, options.output);
        
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
      }
    });

  await program.parseAsync();
}

// Only run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}