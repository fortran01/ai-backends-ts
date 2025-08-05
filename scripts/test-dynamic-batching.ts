#!/usr/bin/env ts-node

import axios from 'axios';
import { performance } from 'perf_hooks';

/**
 * TypeScript Dynamic Batching Performance Demo
 * 
 * Following the coding guidelines: Demonstrates Triton Inference Server's
 * dynamic batching capabilities with comprehensive performance analysis
 */

interface IrisFeatures {
  sepal_length: number;
  sepal_width: number;
  petal_length: number;
  petal_width: number;
}

interface ClassificationResult {
  predicted_class: string;
  confidence: number;
  inference_time_ms: number;
  method: string;
}

interface PerformanceMetrics {
  method: string;
  total_requests: number;
  success_count: number;
  average_response_time: number;
  requests_per_second: number;
  total_time_seconds: number;
  error_count: number;
}

class TritonBatchingDemo {
  private readonly tritonUrl = 'http://localhost:8000';
  private readonly nestJsUrl = 'http://localhost:3000';
  private readonly sampleData: IrisFeatures[] = [
    { sepal_length: 5.1, sepal_width: 3.5, petal_length: 1.4, petal_width: 0.2 }, // setosa
    { sepal_length: 7.0, sepal_width: 3.2, petal_length: 4.7, petal_width: 1.4 }, // versicolor
    { sepal_length: 6.3, sepal_width: 3.3, petal_length: 6.0, petal_width: 2.5 }, // virginica
    { sepal_length: 4.9, sepal_width: 3.0, petal_length: 1.4, petal_width: 0.2 }, // setosa
    { sepal_length: 6.4, sepal_width: 3.2, petal_length: 4.5, petal_width: 1.5 }, // versicolor
    { sepal_length: 5.8, sepal_width: 2.7, petal_length: 5.1, petal_width: 1.9 }, // virginica
    { sepal_length: 5.4, sepal_width: 3.9, petal_length: 1.7, petal_width: 0.4 }, // setosa
    { sepal_length: 5.7, sepal_width: 2.8, petal_length: 4.1, petal_width: 1.3 }, // versicolor
  ];

  /**
   * Test direct ONNX inference (sequential requests)
   */
  public async testDirectOnnxSequential(requestCount: number): Promise<PerformanceMetrics> {
    console.log(`\n🔍 Testing Direct ONNX (Sequential) - ${requestCount} requests`);
    
    const startTime: number = performance.now();
    const results: ClassificationResult[] = [];
    let errorCount = 0;

    for (let i = 0; i < requestCount; i++) {
      const sample: IrisFeatures = this.sampleData[i % this.sampleData.length];
      
      try {
        const requestStart: number = performance.now();
        
        const response = await axios.post(`${this.nestJsUrl}/api/v1/classify`, sample, {
          timeout: 30000
        });
        
        const requestEnd: number = performance.now();
        
        results.push({
          predicted_class: response.data.predicted_class,
          confidence: response.data.confidence,
          inference_time_ms: requestEnd - requestStart,
          method: 'Direct ONNX (Sequential)'
        });
        
      } catch (error) {
        errorCount++;
        console.error(`Request ${i + 1} failed:`, (error as any).message);
      }
    }

    const endTime: number = performance.now();
    const totalTimeSeconds: number = (endTime - startTime) / 1000;
    const averageResponseTime: number = results.length > 0 
      ? results.reduce((sum, r) => sum + r.inference_time_ms, 0) / results.length 
      : 0;
    
    return {
      method: 'Direct ONNX (Sequential)',
      total_requests: requestCount,
      success_count: results.length,
      average_response_time: averageResponseTime,
      requests_per_second: results.length / totalTimeSeconds,
      total_time_seconds: totalTimeSeconds,
      error_count: errorCount
    };
  }

  /**
   * Test direct ONNX inference (concurrent requests)
   */
  public async testDirectOnnxConcurrent(requestCount: number): Promise<PerformanceMetrics> {
    console.log(`\n🔍 Testing Direct ONNX (Concurrent) - ${requestCount} requests`);
    
    const startTime: number = performance.now();
    const promises: Promise<ClassificationResult | null>[] = [];

    for (let i = 0; i < requestCount; i++) {
      const sample: IrisFeatures = this.sampleData[i % this.sampleData.length];
      
      const promise = this.makeOnnxRequest(sample, i + 1);
      promises.push(promise);
    }

    const results: (ClassificationResult | null)[] = await Promise.all(promises);
    const endTime: number = performance.now();

    const successfulResults: ClassificationResult[] = results.filter(r => r !== null) as ClassificationResult[];
    const errorCount: number = results.filter(r => r === null).length;
    const totalTimeSeconds: number = (endTime - startTime) / 1000;
    const averageResponseTime: number = successfulResults.length > 0 
      ? successfulResults.reduce((sum, r) => sum + r.inference_time_ms, 0) / successfulResults.length 
      : 0;
    
    return {
      method: 'Direct ONNX (Concurrent)',
      total_requests: requestCount,
      success_count: successfulResults.length,
      average_response_time: averageResponseTime,
      requests_per_second: successfulResults.length / totalTimeSeconds,
      total_time_seconds: totalTimeSeconds,
      error_count: errorCount
    };
  }

  /**
   * Test Triton inference (sequential requests)
   */
  public async testTritonSequential(requestCount: number): Promise<PerformanceMetrics> {
    console.log(`\n🔍 Testing Triton (Sequential) - ${requestCount} requests`);
    
    const startTime: number = performance.now();
    const results: ClassificationResult[] = [];
    let errorCount = 0;

    for (let i = 0; i < requestCount; i++) {
      const sample: IrisFeatures = this.sampleData[i % this.sampleData.length];
      
      try {
        const requestStart: number = performance.now();
        
        const response = await axios.post(`${this.nestJsUrl}/api/v1/classify-triton`, sample, {
          timeout: 30000
        });
        
        const requestEnd: number = performance.now();
        
        results.push({
          predicted_class: response.data.predicted_class,
          confidence: response.data.confidence,
          inference_time_ms: requestEnd - requestStart,
          method: 'Triton (Sequential)'
        });
        
      } catch (error) {
        errorCount++;
        console.error(`Request ${i + 1} failed:`, (error as any).message);
      }
    }

    const endTime: number = performance.now();
    const totalTimeSeconds: number = (endTime - startTime) / 1000;
    const averageResponseTime: number = results.length > 0 
      ? results.reduce((sum, r) => sum + r.inference_time_ms, 0) / results.length 
      : 0;
    
    return {
      method: 'Triton (Sequential)',
      total_requests: requestCount,
      success_count: results.length,
      average_response_time: averageResponseTime,
      requests_per_second: results.length / totalTimeSeconds,
      total_time_seconds: totalTimeSeconds,
      error_count: errorCount
    };
  }

  /**
   * Test Triton inference (concurrent requests - demonstrates dynamic batching)
   */
  public async testTritonConcurrent(requestCount: number): Promise<PerformanceMetrics> {
    console.log(`\n🔍 Testing Triton (Concurrent - Dynamic Batching) - ${requestCount} requests`);
    
    const startTime: number = performance.now();
    const promises: Promise<ClassificationResult | null>[] = [];

    for (let i = 0; i < requestCount; i++) {
      const sample: IrisFeatures = this.sampleData[i % this.sampleData.length];
      
      const promise = this.makeTritonRequest(sample, i + 1);
      promises.push(promise);
    }

    const results: (ClassificationResult | null)[] = await Promise.all(promises);
    const endTime: number = performance.now();

    const successfulResults: ClassificationResult[] = results.filter(r => r !== null) as ClassificationResult[];
    const errorCount: number = results.filter(r => r === null).length;
    const totalTimeSeconds: number = (endTime - startTime) / 1000;
    const averageResponseTime: number = successfulResults.length > 0 
      ? successfulResults.reduce((sum, r) => sum + r.inference_time_ms, 0) / successfulResults.length 
      : 0;
    
    return {
      method: 'Triton (Concurrent - Dynamic Batching)',
      total_requests: requestCount,
      success_count: successfulResults.length,
      average_response_time: averageResponseTime,
      requests_per_second: successfulResults.length / totalTimeSeconds,
      total_time_seconds: totalTimeSeconds,
      error_count: errorCount
    };
  }

  /**
   * Make individual ONNX request with error handling
   */
  private async makeOnnxRequest(sample: IrisFeatures, requestId: number): Promise<ClassificationResult | null> {
    try {
      const requestStart: number = performance.now();
      
      const response = await axios.post(`${this.nestJsUrl}/api/v1/classify`, sample, {
        timeout: 30000
      });
      
      const requestEnd: number = performance.now();
      
      return {
        predicted_class: response.data.predicted_class,
        confidence: response.data.confidence,
        inference_time_ms: requestEnd - requestStart,
        method: 'Direct ONNX (Concurrent)'
      };
      
    } catch (error) {
      console.error(`ONNX Request ${requestId} failed:`, (error as any).message);
      return null;
    }
  }

  /**
   * Make individual Triton request with error handling
   */
  private async makeTritonRequest(sample: IrisFeatures, requestId: number): Promise<ClassificationResult | null> {
    try {
      const requestStart: number = performance.now();
      
      const response = await axios.post(`${this.nestJsUrl}/api/v1/classify-triton`, sample, {
        timeout: 30000
      });
      
      const requestEnd: number = performance.now();
      
      return {
        predicted_class: response.data.predicted_class,
        confidence: response.data.confidence,
        inference_time_ms: requestEnd - requestStart,
        method: 'Triton (Concurrent - Dynamic Batching)'
      };
      
    } catch (error) {
      console.error(`Triton Request ${requestId} failed:`, (error as any).message);
      return null;
    }
  }

  /**
   * Print performance comparison table
   */
  private printPerformanceComparison(metrics: PerformanceMetrics[]): void {
    console.log('\n📊 Performance Comparison Results');
    console.log('=' .repeat(120));
    console.log('| Method'.padEnd(35) + '| Requests'.padEnd(12) + '| Success'.padEnd(10) + '| Avg Time (ms)'.padEnd(15) + '| RPS'.padEnd(12) + '| Total Time (s)'.padEnd(16) + '| Errors'.padEnd(8) + '|');
    console.log('|' + '-'.repeat(34) + '|' + '-'.repeat(11) + '|' + '-'.repeat(9) + '|' + '-'.repeat(14) + '|' + '-'.repeat(11) + '|' + '-'.repeat(15) + '|' + '-'.repeat(7) + '|');

    metrics.forEach(metric => {
      console.log(
        `| ${metric.method.padEnd(33)}` +
        `| ${metric.total_requests.toString().padEnd(10)}` +
        `| ${metric.success_count.toString().padEnd(8)}` +
        `| ${metric.average_response_time.toFixed(2).padEnd(12)}` +
        `| ${metric.requests_per_second.toFixed(2).padEnd(10)}` +
        `| ${metric.total_time_seconds.toFixed(2).padEnd(14)}` +
        `| ${metric.error_count.toString().padEnd(6)}|`
      );
    });

    console.log('=' .repeat(120));

    // Calculate and display performance benefits
    const directConcurrent = metrics.find(m => m.method === 'Direct ONNX (Concurrent)');
    const tritonConcurrent = metrics.find(m => m.method === 'Triton (Concurrent - Dynamic Batching)');

    if (directConcurrent && tritonConcurrent && directConcurrent.requests_per_second > 0) {
      const speedupFactor: number = tritonConcurrent.requests_per_second / directConcurrent.requests_per_second;
      const latencyImprovement: number = ((directConcurrent.average_response_time - tritonConcurrent.average_response_time) / directConcurrent.average_response_time) * 100;

      console.log('\n🚀 Dynamic Batching Benefits:');
      console.log(`   • Throughput Improvement: ${speedupFactor.toFixed(2)}x faster (${tritonConcurrent.requests_per_second.toFixed(2)} vs ${directConcurrent.requests_per_second.toFixed(2)} RPS)`);
      console.log(`   • Latency ${latencyImprovement > 0 ? 'Reduction' : 'Increase'}: ${Math.abs(latencyImprovement).toFixed(1)}% (${tritonConcurrent.average_response_time.toFixed(2)} vs ${directConcurrent.average_response_time.toFixed(2)} ms)`);
      console.log(`   • Success Rate: ${((tritonConcurrent.success_count / tritonConcurrent.total_requests) * 100).toFixed(1)}% vs ${((directConcurrent.success_count / directConcurrent.total_requests) * 100).toFixed(1)}%`);
    }
  }

  /**
   * Check service availability before running tests
   */
  private async checkServiceAvailability(): Promise<{ nestjs: boolean; triton: boolean }> {
    const nestjsAvailable = await this.checkNestJsAvailability();
    const tritonAvailable = await this.checkTritonAvailability();

    return { nestjs: nestjsAvailable, triton: tritonAvailable };
  }

  private async checkNestJsAvailability(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.nestJsUrl}/api/v1/health`, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  private async checkTritonAvailability(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.tritonUrl}/v2/health/live`, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Run complete performance comparison
   */
  public async runPerformanceComparison(requestCount: number = 20): Promise<void> {
    console.log('🎯 Triton Dynamic Batching Performance Demo');
    console.log('============================================');
    console.log(`Request Count: ${requestCount}`);
    console.log(`Sample Data: ${this.sampleData.length} different iris flower measurements`);
    
    // Check service availability
    const availability = await this.checkServiceAvailability();
    
    if (!availability.nestjs) {
      console.error('❌ NestJS server is not available. Please start with: npm run start:dev');
      return;
    }

    if (!availability.triton) {
      console.error('❌ Triton Inference Server is not available. Please start with Docker:');
      console.error('   docker run --rm -p8000:8000 -p8001:8001 -p8002:8002 \\');
      console.error('     -v $(pwd)/triton_model_repository:/models \\');
      console.error('     nvcr.io/nvidia/tritonserver:latest \\');
      console.error('     tritonserver --model-repository=/models');
      return;
    }

    console.log('✅ Both services are available. Starting performance tests...\n');

    const allMetrics: PerformanceMetrics[] = [];

    try {
      // Test Direct ONNX (Sequential)
      const directSequential = await this.testDirectOnnxSequential(requestCount);
      allMetrics.push(directSequential);

      // Test Direct ONNX (Concurrent)
      const directConcurrent = await this.testDirectOnnxConcurrent(requestCount);
      allMetrics.push(directConcurrent);

      // Test Triton (Sequential)
      const tritonSequential = await this.testTritonSequential(requestCount);
      allMetrics.push(tritonSequential);

      // Test Triton (Concurrent - Dynamic Batching)
      const tritonConcurrent = await this.testTritonConcurrent(requestCount);
      allMetrics.push(tritonConcurrent);

    } catch (error) {
      console.error('Performance test failed:', (error as any).message);
      return;
    }

    // Print comprehensive results
    this.printPerformanceComparison(allMetrics);

    console.log('\n📝 Educational Insights:');
    console.log('   • Sequential requests process one at a time (baseline performance)');
    console.log('   • Concurrent requests leverage parallelism and system resources');
    console.log('   • Triton\'s dynamic batching groups concurrent requests automatically');
    console.log('   • Dynamic batching reduces per-request overhead and improves GPU utilization');
    console.log('   • Performance benefits scale with request concurrency and model complexity');
  }
}

// Main execution
async function main(): Promise<void> {
  const requestCount: number = process.argv[2] ? parseInt(process.argv[2], 10) : 20;
  
  if (isNaN(requestCount) || requestCount < 1 || requestCount > 100) {
    console.error('Usage: ts-node test-dynamic-batching.ts [request_count]');
    console.error('Request count must be between 1 and 100');
    process.exit(1);
  }

  const demo = new TritonBatchingDemo();
  await demo.runPerformanceComparison(requestCount);
}

if (require.main === module) {
  main().catch(console.error);
}

export { TritonBatchingDemo };