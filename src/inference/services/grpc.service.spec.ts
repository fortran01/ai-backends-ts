import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { GrpcService } from './grpc.service';
import { ClassifyRequestDto, ClassifyResponseDto } from '../dto/classify.dto';
import * as grpc from '@grpc/grpc-js';

/**
 * Unit tests for GrpcService
 * 
 * Following the coding guidelines: Comprehensive testing with Jest,
 * proper mocking of external dependencies, and error scenario testing
 */
describe('GrpcService', () => {
  let service: GrpcService;
  let mockGrpcClient: any;
  let loggerSpy: jest.SpyInstance;

  beforeEach(async () => {
    // Mock gRPC client
    mockGrpcClient = {
      classify: jest.fn(),
      waitForReady: jest.fn(),
      close: jest.fn()
    };

    // Mock the gRPC modules
    jest.mock('@grpc/grpc-js');
    jest.mock('@grpc/proto-loader');

    const module: TestingModule = await Test.createTestingModule({
      providers: [GrpcService],
    }).compile();

    service = module.get<GrpcService>(GrpcService);
    
    // Mock logger to avoid console output during tests
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();

    // Replace the actual gRPC client with mock
    (service as any).grpcClient = mockGrpcClient;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should implement OnModuleDestroy', () => {
      expect(service.onModuleDestroy).toBeDefined();
      expect(typeof service.onModuleDestroy).toBe('function');
    });
  });

  describe('isGrpcServerAvailable', () => {
    it('should return true when gRPC server is available', async () => {
      mockGrpcClient.waitForReady.mockImplementation((deadline: Date, callback: Function) => {
        callback(null); // No error means server is ready
      });

      const result = await service.isGrpcServerAvailable();

      expect(result).toBe(true);
      expect(mockGrpcClient.waitForReady).toHaveBeenCalled();
    });

    it('should return false when gRPC server is not available', async () => {
      mockGrpcClient.waitForReady.mockImplementation((deadline: Date, callback: Function) => {
        callback(new Error('Connection refused'));
      });

      const result = await service.isGrpcServerAvailable();

      expect(result).toBe(false);
      expect(mockGrpcClient.waitForReady).toHaveBeenCalled();
    });

    it('should return false when gRPC client is not initialized', async () => {
      (service as any).grpcClient = null;

      const result = await service.isGrpcServerAvailable();

      expect(result).toBe(false);
    });

    it('should handle timeout correctly', async () => {
      mockGrpcClient.waitForReady.mockImplementation((deadline: Date, callback: Function) => {
        const now = new Date();
        expect(deadline.getTime()).toBeGreaterThan(now.getTime());
        expect(deadline.getTime() - now.getTime()).toBeLessThanOrEqual(5000);
        callback(new Error('Timeout'));
      });

      const result = await service.isGrpcServerAvailable();

      expect(result).toBe(false);
    });
  });

  describe('classifyIrisViaGrpc', () => {
    const validRequest: ClassifyRequestDto = {
      sepal_length: 5.1,
      sepal_width: 3.5,
      petal_length: 1.4,
      petal_width: 0.2
    };

    const mockGrpcResponse = {
      class_name: 'setosa',
      predicted_class: 0,
      probabilities: [0.95, 0.03, 0.02],
      confidence: 0.95,
      inference_time_ms: 2.5
    };

    it('should successfully classify iris via gRPC', async () => {
      mockGrpcClient.classify.mockImplementation((request: any, options: any, callback: Function) => {
        expect(request).toEqual({
          sepal_length: validRequest.sepal_length,
          sepal_width: validRequest.sepal_width,
          petal_length: validRequest.petal_length,
          petal_width: validRequest.petal_width
        });
        callback(null, mockGrpcResponse);
      });

      const result = await service.classifyIrisViaGrpc(validRequest);

      expect(result).toEqual({
        predicted_class: 'setosa',
        predicted_class_index: 0,
        class_names: ['setosa', 'versicolor', 'virginica'],
        probabilities: [0.95, 0.03, 0.02],
        confidence: 0.95,
        model_info: {
          format: 'gRPC',
          version: '1.0',
          inference_time_ms: 2.5
        },
        input_features: {
          sepal_length: 5.1,
          sepal_width: 3.5,
          petal_length: 1.4,
          petal_width: 0.2
        }
      });
    });

    it('should handle gRPC client not initialized error', async () => {
      (service as any).grpcClient = null;

      await expect(service.classifyIrisViaGrpc(validRequest))
        .rejects.toThrow('gRPC client not initialized');
    });

    it('should handle UNAVAILABLE error correctly', async () => {
      const unavailableError = {
        code: grpc.status.UNAVAILABLE,
        message: 'Connection refused'
      };

      mockGrpcClient.classify.mockImplementation((request: any, options: any, callback: Function) => {
        callback(unavailableError, null);
      });

      await expect(service.classifyIrisViaGrpc(validRequest))
        .rejects.toThrow('gRPC server unavailable. Please ensure the gRPC server is running on port 50051.');
    });

    it('should handle DEADLINE_EXCEEDED error correctly', async () => {
      const timeoutError = {
        code: grpc.status.DEADLINE_EXCEEDED,
        message: 'Deadline exceeded'
      };

      mockGrpcClient.classify.mockImplementation((request: any, options: any, callback: Function) => {
        callback(timeoutError, null);
      });

      await expect(service.classifyIrisViaGrpc(validRequest))
        .rejects.toThrow('gRPC call timeout. Server took too long to respond.');
    });

    it('should handle INVALID_ARGUMENT error correctly', async () => {
      const invalidArgError = {
        code: grpc.status.INVALID_ARGUMENT,
        message: 'Invalid input parameters'
      };

      mockGrpcClient.classify.mockImplementation((request: any, options: any, callback: Function) => {
        callback(invalidArgError, null);
      });

      await expect(service.classifyIrisViaGrpc(validRequest))
        .rejects.toThrow('Invalid request: Invalid input parameters');
    });

    it('should handle generic gRPC errors', async () => {
      const genericError = {
        code: grpc.status.INTERNAL,
        message: 'Internal server error'
      };

      mockGrpcClient.classify.mockImplementation((request: any, options: any, callback: Function) => {
        callback(genericError, null);
      });

      await expect(service.classifyIrisViaGrpc(validRequest))
        .rejects.toThrow('gRPC error: Internal server error');
    });

    it('should set correct deadline for gRPC call', async () => {
      let capturedOptions: any;
      
      mockGrpcClient.classify.mockImplementation((request: any, options: any, callback: Function) => {
        capturedOptions = options;
        callback(null, mockGrpcResponse);
      });

      await service.classifyIrisViaGrpc(validRequest);

      expect(capturedOptions.deadline).toBeDefined();
      expect(capturedOptions.deadline).toBeInstanceOf(Date);
      
      const now = new Date();
      const deadline = capturedOptions.deadline;
      const timeDiff = deadline.getTime() - now.getTime();
      expect(timeDiff).toBeGreaterThan(5000); // Should be around 10 seconds from now
      expect(timeDiff).toBeLessThan(15000); // But less than 15 seconds
    });

    it('should log debug information for requests and responses', async () => {
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
      
      mockGrpcClient.classify.mockImplementation((request: any, options: any, callback: Function) => {
        callback(null, mockGrpcResponse);
      });

      await service.classifyIrisViaGrpc(validRequest);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Sending gRPC classification request')
      );
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('gRPC call completed in')
      );
      
      debugSpy.mockRestore();
    });

    it('should handle different Iris species correctly', async () => {
      const versicolorResponse = {
        class_name: 'versicolor',
        predicted_class: 1,
        probabilities: [0.02, 0.92, 0.06],
        confidence: 0.92,
        inference_time_ms: 3.1
      };

      mockGrpcClient.classify.mockImplementation((request: any, options: any, callback: Function) => {
        callback(null, versicolorResponse);
      });

      const versicolorRequest: ClassifyRequestDto = {
        sepal_length: 7.0,
        sepal_width: 3.2,
        petal_length: 4.7,
        petal_width: 1.4
      };

      const result = await service.classifyIrisViaGrpc(versicolorRequest);

      expect(result.predicted_class).toBe('versicolor');
      expect(result.predicted_class_index).toBe(1);
      expect(result.probabilities).toEqual([0.02, 0.92, 0.06]);
    });
  });

  describe('getGrpcStatus', () => {
    it('should return correct status when server is available', async () => {
      mockGrpcClient.waitForReady.mockImplementation((deadline: Date, callback: Function) => {
        callback(null);
      });

      const status = await service.getGrpcStatus();

      expect(status).toEqual({
        available: true,
        endpoint: 'localhost:50051',
        protocol: 'gRPC',
        service: 'InferenceService',
        method: 'Classify'
      });
    });

    it('should return correct status when server is unavailable', async () => {
      mockGrpcClient.waitForReady.mockImplementation((deadline: Date, callback: Function) => {
        callback(new Error('Connection refused'));
      });

      const status = await service.getGrpcStatus();

      expect(status).toEqual({
        available: false,
        endpoint: 'localhost:50051',
        protocol: 'gRPC',
        service: 'InferenceService',
        method: 'Classify'
      });
    });
  });

  describe('onModuleDestroy', () => {
    it('should close gRPC client on module destroy', () => {
      service.onModuleDestroy();

      expect(mockGrpcClient.close).toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith('gRPC client closed');
    });

    it('should handle error during client closure', () => {
      mockGrpcClient.close.mockImplementation(() => {
        throw new Error('Close error');
      });

      expect(() => service.onModuleDestroy()).not.toThrow();
    });

    it('should handle null client gracefully', () => {
      (service as any).grpcClient = null;

      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });

  describe('performance and reliability', () => {
    const mockGrpcResponse = {
      class_name: 'setosa',
      predicted_class: 0,
      probabilities: [0.95, 0.03, 0.02],
      confidence: 0.95,
      inference_time_ms: 2.5
    };

    const validRequest: ClassifyRequestDto = {
      sepal_length: 5.1,
      sepal_width: 3.5,
      petal_length: 1.4,
      petal_width: 0.2
    };

    it('should handle multiple concurrent requests', async () => {
      mockGrpcClient.classify.mockImplementation((request: any, options: any, callback: Function) => {
        // Simulate some processing time
        setTimeout(() => callback(null, mockGrpcResponse), 10);
      });

      const requests = Array(5).fill(validRequest);
      const promises = requests.map(req => service.classifyIrisViaGrpc(req));

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.predicted_class).toBe('setosa');
      });
      expect(mockGrpcClient.classify).toHaveBeenCalledTimes(5);
    });

    it('should handle network errors gracefully', async () => {
      mockGrpcClient.classify.mockImplementation((request: any, options: any, callback: Function) => {
        callback({ code: grpc.status.UNAVAILABLE, message: 'Network error' }, null);
      });

      await expect(service.classifyIrisViaGrpc(validRequest))
        .rejects.toThrow('gRPC server unavailable');
    });

    it('should maintain correct request format', async () => {
      let capturedRequest: any;
      
      mockGrpcClient.classify.mockImplementation((request: any, options: any, callback: Function) => {
        capturedRequest = request;
        callback(null, mockGrpcResponse);
      });

      const testRequest: ClassifyRequestDto = {
        sepal_length: 6.5,
        sepal_width: 2.8,
        petal_length: 4.6,
        petal_width: 1.5
      };

      await service.classifyIrisViaGrpc(testRequest);

      expect(capturedRequest).toEqual({
        sepal_length: 6.5,
        sepal_width: 2.8,
        petal_length: 4.6,
        petal_width: 1.5
      });
    });
  });

  describe('edge cases', () => {
    const validRequest: ClassifyRequestDto = {
      sepal_length: 5.1,
      sepal_width: 3.5,
      petal_length: 1.4,
      petal_width: 0.2
    };

    const mockGrpcResponse = {
      class_name: 'setosa',
      predicted_class: 0,
      probabilities: [0.95, 0.03, 0.02],
      confidence: 0.95,
      inference_time_ms: 2.5
    };

    it('should handle response with missing fields', async () => {
      const incompleteResponse = {
        class_name: 'setosa',
        predicted_class: 0
        // Missing probabilities, confidence, inference_time_ms
      };

      mockGrpcClient.classify.mockImplementation((request: any, options: any, callback: Function) => {
        callback(null, incompleteResponse);
      });

      const result = await service.classifyIrisViaGrpc(validRequest);

      expect(result.predicted_class).toBe('setosa');
      expect(result.predicted_class_index).toBe(0);
      expect(result.probabilities).toBeUndefined();
      expect(result.confidence).toBeUndefined();
    });

    it('should handle extreme input values', async () => {
      const extremeRequest: ClassifyRequestDto = {
        sepal_length: 0,
        sepal_width: 20,
        petal_length: 0,
        petal_width: 20
      };

      mockGrpcClient.classify.mockImplementation((request: any, options: any, callback: Function) => {
        callback(null, mockGrpcResponse);
      });

      const result = await service.classifyIrisViaGrpc(extremeRequest);

      expect(result).toBeDefined();
      expect(result.input_features).toEqual(extremeRequest);
    });

    it('should handle very slow responses', async () => {
      const mockGrpcResponse = {
        class_name: 'setosa',
        predicted_class: 0,
        probabilities: [0.95, 0.03, 0.02],
        confidence: 0.95,
        inference_time_ms: 2.5
      };

      const validRequest: ClassifyRequestDto = {
        sepal_length: 5.1,
        sepal_width: 3.5,
        petal_length: 1.4,
        petal_width: 0.2
      };

      mockGrpcClient.classify.mockImplementation((request: any, options: any, callback: Function) => {
        // Simulate slow response but within deadline
        setTimeout(() => callback(null, mockGrpcResponse), 100); // Reduced time for testing
      });

      const startTime = Date.now();
      const result = await service.classifyIrisViaGrpc(validRequest);
      const endTime = Date.now();

      expect(result).toBeDefined();
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    }, 1000); // Reduced test timeout
  });
});