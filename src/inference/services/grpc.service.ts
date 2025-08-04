import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { ClassifyRequestDto, ClassifyResponseDto } from '../dto/classify.dto';

// Define types for gRPC client and responses
interface GrpcClassifyRequest {
  sepal_length: number;
  sepal_width: number;
  petal_length: number;
  petal_width: number;
}

interface GrpcClassifyResponse {
  class_name: string;
  predicted_class: number;
  probabilities: number[];
  confidence: number;
  inference_time_ms?: number;
}

interface GrpcClient {
  classify: (
    request: GrpcClassifyRequest,
    options: { deadline: Date },
    callback: (error: grpc.ServiceError | null, response?: GrpcClassifyResponse) => void
  ) => void;
  waitForReady: (deadline: Date, callback: (error?: Error) => void) => void;
  close: () => void;
}

interface InferencePackage {
  InferenceService: new (address: string, credentials: grpc.ChannelCredentials) => GrpcClient;
}

/**
 * gRPC client service for high-performance inference
 * 
 * Following the coding guidelines: Proper error handling,
 * TypeScript typing, and performance monitoring
 */
@Injectable()
export class GrpcService implements OnModuleDestroy {
  private readonly logger: Logger = new Logger(GrpcService.name);
  private grpcClient: GrpcClient | null = null;
  private readonly grpcEndpoint: string = 'localhost:50051';

  constructor() {
    this.initializeGrpcClient();
  }

  /**
   * Initialize gRPC client with proper error handling
   */
  private initializeGrpcClient(): void {
    try {
      // Load the protobuf definition
      const PROTO_PATH: string = path.join(process.cwd(), 'proto', 'inference.proto');
      const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      const inferenceProto = grpc.loadPackageDefinition(packageDefinition).inference as InferencePackage;

      // Create gRPC client
      this.grpcClient = new inferenceProto.InferenceService(
        this.grpcEndpoint,
        grpc.credentials.createInsecure(),
        {
          'grpc.keepalive_time_ms': 30000,
          'grpc.keepalive_timeout_ms': 5000,
          'grpc.keepalive_permit_without_calls': true,
          'grpc.http2.max_pings_without_data': 0,
          'grpc.http2.min_time_between_pings_ms': 10000,
          'grpc.http2.min_ping_interval_without_data_ms': 300000
        }
      );

      this.logger.log(`gRPC client initialized for endpoint: ${this.grpcEndpoint}`);
    } catch (error: unknown) {
      this.logger.error('Failed to initialize gRPC client:', error);
    }
  }

  /**
   * Check if gRPC server is available
   */
  public async isGrpcServerAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.grpcClient) {
        resolve(false);
        return;
      }

      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 5);

      this.grpcClient.waitForReady(deadline, (error: Error | null) => {
        if (error) {
          this.logger.debug(`gRPC server not available: ${error.message}`);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Perform Iris classification via gRPC
   * 
   * @param request - Classification request with Iris features
   * @returns Classification results from gRPC server
   */
  public async classifyIrisViaGrpc(request: ClassifyRequestDto): Promise<ClassifyResponseDto> {
    return new Promise((resolve, reject) => {
      if (!this.grpcClient) {
        reject(new Error('gRPC client not initialized'));
        return;
      }

      const startTime: number = Date.now();

      // Prepare gRPC request
      const grpcRequest = {
        sepal_length: request.sepal_length,
        sepal_width: request.sepal_width,
        petal_length: request.petal_length,
        petal_width: request.petal_width
      };

      this.logger.debug(`Sending gRPC classification request: ${JSON.stringify(grpcRequest)}`);

      // Set call deadline (timeout)
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 10);

      // Make gRPC call
      this.grpcClient.classify(grpcRequest, { deadline }, (error: grpc.ServiceError | null, response?: GrpcClassifyResponse) => {
        const totalTime: number = Date.now() - startTime;

        if (error) {
          this.logger.error(`gRPC call failed after ${totalTime}ms:`, error);
          
          // Convert gRPC errors to appropriate HTTP errors
          if (error.code === grpc.status.UNAVAILABLE) {
            reject(new Error('gRPC server unavailable. Please ensure the gRPC server is running on port 50051.'));
          } else if (error.code === grpc.status.DEADLINE_EXCEEDED) {
            reject(new Error('gRPC call timeout. Server took too long to respond.'));
          } else if (error.code === grpc.status.INVALID_ARGUMENT) {
            reject(new Error(`Invalid request: ${error.message}`));
          } else {
            reject(new Error(`gRPC error: ${error.message}`));
          }
          return;
        }

        this.logger.debug(`gRPC call completed in ${totalTime}ms: ${JSON.stringify(response)}`);

        // Transform gRPC response to DTO format
        const result: ClassifyResponseDto = {
          predicted_class: response.class_name,
          predicted_class_index: response.predicted_class,
          class_names: ['setosa', 'versicolor', 'virginica'],
          probabilities: response.probabilities,
          confidence: response.confidence,
          model_info: {
            format: 'gRPC',
            version: '1.0',
            inference_time_ms: response.inference_time_ms
          },
          input_features: {
            sepal_length: request.sepal_length,
            sepal_width: request.sepal_width,
            petal_length: request.petal_length,
            petal_width: request.petal_width
          }
        };

        resolve(result);
      });
    });
  }

  /**
   * Get gRPC service status information
   */
  public async getGrpcStatus(): Promise<Record<string, unknown>> {
    const isAvailable: boolean = await this.isGrpcServerAvailable();
    
    return {
      available: isAvailable,
      endpoint: this.grpcEndpoint,
      protocol: 'gRPC',
      service: 'InferenceService',
      method: 'Classify'
    };
  }

  /**
   * Cleanup gRPC client on module destroy
   */
  public onModuleDestroy(): void {
    if (this.grpcClient) {
      try {
        this.grpcClient.close();
        this.logger.log('gRPC client closed');
      } catch (error: unknown) {
        this.logger.error('Error closing gRPC client:', error);
      }
    }
  }
}