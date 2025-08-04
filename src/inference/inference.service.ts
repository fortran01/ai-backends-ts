import { Injectable, BadRequestException } from '@nestjs/common';
import { OllamaService } from './services/ollama.service';
import { SecurityService } from './services/security.service';
import { OnnxService } from './services/onnx.service';
import { MemoryService } from './services/memory.service';
import { GrpcService } from './services/grpc.service';
import { HttpInferenceService } from './services/http.service';
import { 
  GenerateRequestDto, 
  GenerateResponseDto, 
  SecureGenerateResponseDto,
  ChatRequestDto,
  ChatResponseDto
} from './dto/generate.dto';
import { 
  ClassifyRequestDto, 
  ClassifyResponseDto 
} from './dto/classify.dto';
import { SerializationChallengeResponseDto } from './dto/performance.dto';

/**
 * Main inference service coordinating model operations
 * 
 * Following the coding guidelines: Orchestrates different inference
 * services with proper error handling and security measures
 */
@Injectable()
export class InferenceService {
  constructor(
    private readonly ollamaService: OllamaService,
    private readonly securityService: SecurityService,
    private readonly onnxService: OnnxService,
    private readonly memoryService: MemoryService,
    private readonly grpcService: GrpcService,
    private readonly httpInferenceService: HttpInferenceService
  ) {}

  /**
   * Generate text using Ollama with basic validation
   * 
   * @param request - Generation request with prompt
   * @returns Generated text response
   */
  public async generateText(request: GenerateRequestDto): Promise<GenerateResponseDto> {
    return this.ollamaService.generateText(request);
  }

  /**
   * Stateful chat with conversation memory using LangChain
   * 
   * @param request - Chat request with prompt and session ID
   * @returns Chat response with conversation context and statistics
   */
  public async chat(request: ChatRequestDto): Promise<ChatResponseDto> {
    // Build conversation history with structured messages for TinyLlama
    const conversationHistory = this.memoryService.buildConversationHistory(
      request.session_id,
      request.prompt
    );

    // Format chat template following TinyLlama's expected format
    const formattedPrompt: string = this.memoryService.formatChatTemplate(conversationHistory);

    // Generate response using Ollama with conversation context
    const generateRequest: GenerateRequestDto = {
      prompt: formattedPrompt
    };

    const response: GenerateResponseDto = await this.ollamaService.generateText(generateRequest);

    // Save conversation turn to memory
    this.memoryService.saveConversation(
      request.session_id,
      request.prompt,
      response.response
    );

    // Get conversation statistics
    const conversationStats = this.memoryService.getConversationStats(request.session_id);

    // Clean up old sessions periodically
    this.memoryService.cleanupOldSessions(100);

    return {
      response: response.response,
      model: response.model,
      created_at: response.created_at,
      done: response.done,
      session_id: request.session_id,
      conversation_stats: conversationStats
    };
  }

  /**
   * Generate text with comprehensive security analysis and protection
   * 
   * @param request - Generation request with prompt
   * @returns Generated text response with security analysis
   * @throws BadRequestException if prompt is deemed too risky
   */
  public async generateTextSecure(request: GenerateRequestDto): Promise<SecureGenerateResponseDto> {
    // Perform security analysis
    const securityAnalysis = this.securityService.analyzePrompt(request);
    
    // Block high-risk prompts
    if (this.securityService.shouldBlockPrompt(
      securityAnalysis.detectedPatterns, 
      securityAnalysis.riskLevel
    )) {
      throw new BadRequestException({
        message: 'Prompt blocked due to security concerns',
        security_analysis: {
          detected_patterns: securityAnalysis.detectedPatterns,
          original_length: securityAnalysis.originalLength,
          sanitized_length: securityAnalysis.sanitizedLength,
          risk_level: securityAnalysis.riskLevel,
          sanitization_applied: securityAnalysis.sanitizationApplied
        },
        statusCode: 400
      });
    }

    // Create secure prompt template
    const securePrompt: string = this.securityService.createSecurePrompt(
      securityAnalysis.sanitizedPrompt
    );

    // Generate text with sanitized/templated prompt
    const sanitizedRequest: GenerateRequestDto = {
      prompt: securePrompt
    };

    const response: GenerateResponseDto = await this.ollamaService.generateText(sanitizedRequest);

    // Return response with security analysis
    return {
      ...response,
      security_analysis: {
        detected_patterns: securityAnalysis.detectedPatterns,
        original_length: securityAnalysis.originalLength,
        sanitized_length: securityAnalysis.sanitizedLength,
        risk_level: securityAnalysis.riskLevel,
        sanitization_applied: securityAnalysis.sanitizationApplied
      }
    };
  }

  /**
   * Classify Iris species using ONNX model
   * 
   * @param request - Classification request with Iris features
   * @returns Comprehensive classification results
   */
  public async classifyIris(request: ClassifyRequestDto): Promise<ClassifyResponseDto> {
    return this.onnxService.classifyIris(request);
  }

  /**
   * Classify Iris species using HTTP server
   * 
   * @param request - Classification request with Iris features
   * @returns Classification results from HTTP server
   */
  public async classifyIrisViaHttp(request: ClassifyRequestDto): Promise<ClassifyResponseDto> {
    return this.httpInferenceService.classifyIrisViaHttp(request);
  }

  /**
   * Classify Iris species using gRPC server
   * 
   * @param request - Classification request with Iris features
   * @returns Classification results from gRPC server
   */
  public async classifyIrisViaGrpc(request: ClassifyRequestDto): Promise<ClassifyResponseDto> {
    return this.grpcService.classifyIrisViaGrpc(request);
  }

  /**
   * Performance comparison between REST and gRPC protocols
   * 
   * @param request - Classification request with Iris features
   * @param iterations - Number of iterations for performance testing (1-100)
   * @returns Detailed performance analysis comparing REST vs gRPC
   */
  public async performanceComparison(
    request: ClassifyRequestDto, 
    iterations: number = 10
  ): Promise<{
    iterations: number;
    rest_performance: {
      total_time_ms: number;
      average_time_ms: number;
      fastest_ms: number;
      slowest_ms: number;
      success_rate: number;
    };
    grpc_performance: {
      total_time_ms: number;
      average_time_ms: number;
      fastest_ms: number;
      slowest_ms: number;
      success_rate: number;
    };
    performance_analysis: {
      speedup_factor: number;
      grpc_faster: boolean;
      time_saved_ms: number;
      throughput_improvement: number;
    };
    sample_results: {
      rest_result: ClassifyResponseDto | null;
      grpc_result: ClassifyResponseDto | null;
    };
  }> {
    // Validate iterations
    const validIterations: number = Math.max(1, Math.min(100, Math.floor(iterations)));

    // Performance tracking arrays
    const restTimes: number[] = [];
    const grpcTimes: number[] = [];
    let restSuccesses: number = 0;
    let grpcSuccesses: number = 0;
    let sampleRestResult: ClassifyResponseDto | null = null;
    let sampleGrpcResult: ClassifyResponseDto | null = null;

    // Perform REST performance testing (via HTTP server for fair comparison)
    for (let i = 0; i < validIterations; i++) {
      try {
        const startTime: number = Date.now();
        const result: ClassifyResponseDto = await this.httpInferenceService.classifyIrisViaHttp(request);
        const endTime: number = Date.now();
        
        restTimes.push(endTime - startTime);
        restSuccesses++;
        
        if (i === 0) sampleRestResult = result;
      } catch (error: unknown) {
        restTimes.push(0); // Record failure as 0ms for averaging
      }
    }

    // Perform gRPC performance testing
    for (let i = 0; i < validIterations; i++) {
      try {
        const startTime: number = Date.now();
        const result: ClassifyResponseDto = await this.grpcService.classifyIrisViaGrpc(request);
        const endTime: number = Date.now();
        
        grpcTimes.push(endTime - startTime);
        grpcSuccesses++;
        
        if (i === 0) sampleGrpcResult = result;
      } catch (error: unknown) {
        grpcTimes.push(0); // Record failure as 0ms for averaging
      }
    }

    // Calculate REST performance metrics
    const restTotalTime: number = restTimes.reduce((sum, time) => sum + time, 0);
    const restValidTimes: number[] = restTimes.filter(time => time > 0);
    const restAverageTime: number = restValidTimes.length > 0 ? restTotalTime / restValidTimes.length : 0;
    const restFastest: number = restValidTimes.length > 0 ? Math.min(...restValidTimes) : 0;
    const restSlowest: number = restValidTimes.length > 0 ? Math.max(...restValidTimes) : 0;

    // Calculate gRPC performance metrics
    const grpcTotalTime: number = grpcTimes.reduce((sum, time) => sum + time, 0);
    const grpcValidTimes: number[] = grpcTimes.filter(time => time > 0);
    const grpcAverageTime: number = grpcValidTimes.length > 0 ? grpcTotalTime / grpcValidTimes.length : 0;
    const grpcFastest: number = grpcValidTimes.length > 0 ? Math.min(...grpcValidTimes) : 0;
    const grpcSlowest: number = grpcValidTimes.length > 0 ? Math.max(...grpcValidTimes) : 0;

    // Calculate performance analysis
    const speedupFactor: number = restAverageTime > 0 && grpcAverageTime > 0 
      ? restAverageTime / grpcAverageTime 
      : 1;
    const grpcFaster: boolean = grpcAverageTime < restAverageTime && grpcAverageTime > 0;
    const timeSaved: number = Math.abs(restAverageTime - grpcAverageTime);
    const throughputImprovement: number = grpcFaster ? ((speedupFactor - 1) * 100) : 0;

    return {
      iterations: validIterations,
      rest_performance: {
        total_time_ms: restTotalTime,
        average_time_ms: Math.round(restAverageTime * 100) / 100,
        fastest_ms: restFastest,
        slowest_ms: restSlowest,
        success_rate: Math.round((restSuccesses / validIterations) * 100 * 100) / 100
      },
      grpc_performance: {
        total_time_ms: grpcTotalTime,
        average_time_ms: Math.round(grpcAverageTime * 100) / 100,
        fastest_ms: grpcFastest,
        slowest_ms: grpcSlowest,
        success_rate: Math.round((grpcSuccesses / validIterations) * 100 * 100) / 100
      },
      performance_analysis: {
        speedup_factor: Math.round(speedupFactor * 100) / 100,
        grpc_faster: grpcFaster,
        time_saved_ms: Math.round(timeSaved * 100) / 100,
        throughput_improvement: Math.round(throughputImprovement * 100) / 100
      },
      sample_results: {
        rest_result: sampleRestResult,
        grpc_result: sampleGrpcResult
      }
    };
  }

  /**
   * Demonstrate TypeScript/JavaScript serialization challenges
   * 
   * @param request - Classification request with Iris features
   * @returns Classification results with complex serialization demonstrations
   */
  public async serializationChallenge(request: ClassifyRequestDto): Promise<SerializationChallengeResponseDto> {
    // Get basic classification result
    const baseResult: ClassifyResponseDto = await this.onnxService.classifyIris(request);

    // Create complex data structures to demonstrate serialization challenges
    const bigIntDemo: bigint = BigInt('12345678901234567890');
    const undefinedValue: undefined = undefined;
    const customDate: Date = new Date();
    const buffer: Buffer = Buffer.from('Hello TypeScript serialization!', 'utf8');
    
    // Complex nested structure with various data types
    const complexObject = {
      nested: {
        deeply: {
          embedded: {
            array: [1, 2, 3, bigIntDemo, null, undefinedValue],
            map: new Map([['key1', 'value1'], ['key2', '42']]),
            set: new Set([1, 2, 3, 'unique']),
            date: customDate,
            regexp: /test-pattern/gi,
            buffer: buffer,
            function: (): string => 'this function cannot serialize',
            symbol: Symbol('test-symbol')
          }
        }
      }
    };

    // Custom JSON serialization with replacer function
    const customReplacer = (key: string, value: unknown): unknown => {
      // Handle BigInt serialization
      if (typeof value === 'bigint') {
        return `BigInt(${value.toString()})`;
      }
      
      // Handle undefined values
      if (value === undefined) {
        return null;
      }
      
      // Handle Date objects
      if (value instanceof Date) {
        return value.toISOString();
      }
      
      // Handle Buffer objects
      if (Buffer.isBuffer(value)) {
        return `Buffer(${value.toString('base64')})`;
      }
      
      // Handle Map objects
      if (value instanceof Map) {
        return Object.fromEntries(value);
      }
      
      // Handle Set objects
      if (value instanceof Set) {
        return Array.from(value);
      }
      
      // Handle RegExp objects
      if (value instanceof RegExp) {
        return value.toString();
      }
      
      // Handle functions
      if (typeof value === 'function') {
        return `[Function: ${value.name || 'anonymous'}]`;
      }
      
      // Handle symbols
      if (typeof value === 'symbol') {
        return value.toString();
      }
      
      return value;
    };

    // Calculate original size (approximate) using custom replacer
    const originalSizeApprox: number = JSON.stringify({
      ...baseResult,
      complex_demo: complexObject
    }, customReplacer).length;

    // Serialize with custom replacer
    const serializedData: string = JSON.stringify({
      ...baseResult,
      complex_demo: complexObject
    }, customReplacer, 2);

    const serializedSize: number = serializedData.length;
    const compressionRatio: number = serializedSize / originalSizeApprox;

    // Prepare serialization demonstrations
    const serializationDemo = {
      big_int_demo: `BigInt(${bigIntDemo.toString()}) -> "${bigIntDemo.toString()}"`,
      undefined_handling: 'undefined values converted to null in JSON',
      custom_object_demo: {
        original_map: 'Map cannot serialize directly',
        converted_map: Object.fromEntries(complexObject.nested.deeply.embedded.map),
        original_set: 'Set cannot serialize directly',
        converted_set: Array.from(complexObject.nested.deeply.embedded.set)
      },
      date_serialization: customDate.toISOString(),
      buffer_handling: `Buffer converted to base64: ${buffer.toString('base64')}`,
      complex_nested_structure: {
        serialization_note: 'Complex objects require custom handling',
        function_handling: '[Function: anonymous]',
        symbol_handling: Symbol('test-symbol').toString(),
        regexp_handling: complexObject.nested.deeply.embedded.regexp.toString()
      }
    };

    return {
      predicted_class: baseResult.predicted_class_index,
      class_name: baseResult.predicted_class,
      probabilities: baseResult.probabilities,
      confidence: baseResult.confidence,
      model_info: {
        loaded: true,
        path: '/app/models/iris_classifier.onnx',
        class_names: baseResult.class_names,
        description: 'Iris species classification model trained on the famous iris dataset'
      },
      inference_time_ms: baseResult.model_info.inference_time_ms,
      input_features: baseResult.input_features,
      serialization_demo: serializationDemo,
      serialization_info: {
        original_size_bytes: originalSizeApprox,
        serialized_size_bytes: serializedSize,
        compression_ratio: Math.round(compressionRatio * 100) / 100,
        serialization_method: 'Custom JSON with replacer function'
      }
    };
  }

  /**
   * Get service status for health checks
   * 
   * @returns Service status information
   */
  public async getServiceStatus(): Promise<Record<string, unknown>> {
    const [ollamaAvailable, onnxReady, grpcStatus, httpStatus] = await Promise.all([
      this.ollamaService.isServiceAvailable(),
      Promise.resolve(this.onnxService.isModelReady()),
      this.grpcService.getGrpcStatus(),
      this.httpInferenceService.getHttpStatus()
    ]);

    return {
      ollama: {
        available: ollamaAvailable,
        endpoint: 'http://localhost:11434'
      },
      onnx: {
        ready: onnxReady,
        model_info: this.onnxService.getModelInfo()
      },
      grpc: grpcStatus,
      http: httpStatus
    };
  }
}