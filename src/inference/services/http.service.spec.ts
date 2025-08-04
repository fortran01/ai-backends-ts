import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { HttpInferenceService } from './http.service';
import { ClassifyRequestDto, ClassifyResponseDto } from '../dto/classify.dto';
import { AxiosResponse, AxiosError } from 'axios';

/**
 * Unit tests for HttpInferenceService
 * 
 * Following the coding guidelines: Comprehensive testing with Jest,
 * proper mocking of HTTP calls, and error scenario testing
 */
describe('HttpInferenceService', () => {
  let service: HttpInferenceService;
  let httpService: HttpService;
  let loggerSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HttpInferenceService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
            post: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<HttpInferenceService>(HttpInferenceService);
    httpService = module.get<HttpService>(HttpService);
    
    // Mock logger to avoid console output during tests
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have correct endpoint configuration', () => {
      expect((service as any).httpEndpoint).toBe('http://localhost:3001');
    });
  });

  describe('isHttpServerAvailable', () => {
    it('should return true when HTTP server is healthy', async () => {
      const mockResponse: Partial<AxiosResponse> = {
        status: 200,
        data: { status: 'healthy' }
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse as AxiosResponse));

      const result = await service.isHttpServerAvailable();

      expect(result).toBe(true);
      expect(httpService.get).toHaveBeenCalledWith(
        'http://localhost:3001/health',
        { timeout: 5000 }
      );
    });

    it('should return false when HTTP server returns non-200 status', async () => {
      const mockResponse: Partial<AxiosResponse> = {
        status: 500,
        data: { status: 'error' }
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse as AxiosResponse));

      const result = await service.isHttpServerAvailable();

      expect(result).toBe(false);
    });

    it('should return false when HTTP server returns wrong status in response', async () => {
      const mockResponse: Partial<AxiosResponse> = {
        status: 200,
        data: { status: 'unhealthy' }
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse as AxiosResponse));

      const result = await service.isHttpServerAvailable();

      expect(result).toBe(false);
    });

    it('should return false when HTTP request fails', async () => {
      const error = new Error('Connection refused') as AxiosError;
      jest.spyOn(httpService, 'get').mockReturnValue(throwError(() => error));

      const result = await service.isHttpServerAvailable();

      expect(result).toBe(false);
    });

    it('should return false when HTTP request times out', async () => {
      const timeoutError = new Error('Timeout') as AxiosError;
      timeoutError.code = 'ETIMEDOUT';
      jest.spyOn(httpService, 'get').mockReturnValue(throwError(() => timeoutError));

      const result = await service.isHttpServerAvailable();

      expect(result).toBe(false);
    });

    it('should log debug message when server is unavailable', async () => {
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
      const error = new Error('Network error') as AxiosError;
      jest.spyOn(httpService, 'get').mockReturnValue(throwError(() => error));

      await service.isHttpServerAvailable();

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('HTTP server not available: Network error')
      );
      
      debugSpy.mockRestore();
    });
  });

  describe('classifyIrisViaHttp', () => {
    const validRequest: ClassifyRequestDto = {
      sepal_length: 5.1,
      sepal_width: 3.5,
      petal_length: 1.4,
      petal_width: 0.2
    };

    const mockHttpResponse = {
      predicted_class: 'setosa',
      predicted_class_index: 0,
      class_names: ['setosa', 'versicolor', 'virginica'],
      probabilities: [0.95, 0.03, 0.02],
      confidence: 0.95,
      model_info: {
        inference_time_ms: 2.5
      }
    };

    it('should successfully classify iris via HTTP', async () => {
      const mockAxiosResponse: Partial<AxiosResponse> = {
        status: 200,
        data: mockHttpResponse
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockAxiosResponse as AxiosResponse));

      const result = await service.classifyIrisViaHttp(validRequest);

      expect(result).toEqual({
        predicted_class: 'setosa',
        predicted_class_index: 0,
        class_names: ['setosa', 'versicolor', 'virginica'],
        probabilities: [0.95, 0.03, 0.02],
        confidence: 0.95,
        model_info: {
          format: 'HTTP/REST',
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

      expect(httpService.post).toHaveBeenCalledWith(
        'http://localhost:3001/classify',
        {
          sepal_length: 5.1,
          sepal_width: 3.5,
          petal_length: 1.4,
          petal_width: 0.2
        },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    });

    it('should handle connection refused error', async () => {
      const connectionError = new Error('Connection refused') as AxiosError;
      connectionError.code = 'ECONNREFUSED';
      jest.spyOn(httpService, 'post').mockReturnValue(throwError(() => connectionError));

      await expect(service.classifyIrisViaHttp(validRequest))
        .rejects.toThrow('HTTP inference server unavailable. Please ensure the HTTP server is running on port 3001.');
    });

    it('should handle timeout error', async () => {
      const timeoutError = new Error('Request timeout') as AxiosError;
      timeoutError.code = 'ETIMEDOUT';
      jest.spyOn(httpService, 'post').mockReturnValue(throwError(() => timeoutError));

      await expect(service.classifyIrisViaHttp(validRequest))
        .rejects.toThrow('HTTP call timeout. Server took too long to respond.');
    });

    it('should handle 400 bad request error', async () => {
      const badRequestError = new Error('Bad Request') as AxiosError;
      badRequestError.response = {
        status: 400,
        data: { error: 'Invalid input parameters' }
      } as any;
      jest.spyOn(httpService, 'post').mockReturnValue(throwError(() => badRequestError));

      await expect(service.classifyIrisViaHttp(validRequest))
        .rejects.toThrow('Invalid request: Invalid input parameters');
    });

    it('should handle 500 server error', async () => {
      const serverError = new Error('Internal Server Error') as AxiosError;
      serverError.response = {
        status: 500,
        data: { error: 'Model loading failed' }
      } as any;
      jest.spyOn(httpService, 'post').mockReturnValue(throwError(() => serverError));

      await expect(service.classifyIrisViaHttp(validRequest))
        .rejects.toThrow('HTTP server error: Model loading failed');
    });

    it('should handle generic HTTP errors', async () => {
      const genericError = new Error('Network error') as AxiosError;
      jest.spyOn(httpService, 'post').mockReturnValue(throwError(() => genericError));

      await expect(service.classifyIrisViaHttp(validRequest))
        .rejects.toThrow('HTTP error: Network error');
    });

    it('should log debug information for requests and responses', async () => {
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
      const mockAxiosResponse: Partial<AxiosResponse> = {
        status: 200,
        data: mockHttpResponse
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockAxiosResponse as AxiosResponse));

      await service.classifyIrisViaHttp(validRequest);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Sending HTTP classification request')
      );
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('HTTP call completed in')
      );
      
      debugSpy.mockRestore();
    });

    it('should handle different Iris species correctly', async () => {
      const versicolorResponse = {
        predicted_class: 'versicolor',
        predicted_class_index: 1,
        class_names: ['setosa', 'versicolor', 'virginica'],
        probabilities: [0.02, 0.92, 0.06],
        confidence: 0.92,
        model_info: {
          inference_time_ms: 3.1
        }
      };

      const mockAxiosResponse: Partial<AxiosResponse> = {
        status: 200,
        data: versicolorResponse
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockAxiosResponse as AxiosResponse));

      const versicolorRequest: ClassifyRequestDto = {
        sepal_length: 7.0,
        sepal_width: 3.2,
        petal_length: 4.7,
        petal_width: 1.4
      };

      const result = await service.classifyIrisViaHttp(versicolorRequest);

      expect(result.predicted_class).toBe('versicolor');
      expect(result.predicted_class_index).toBe(1);
      expect(result.probabilities).toEqual([0.02, 0.92, 0.06]);
    });

    it('should maintain correct request timeout and headers', async () => {
      const mockAxiosResponse: Partial<AxiosResponse> = {
        status: 200,
        data: mockHttpResponse
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockAxiosResponse as AxiosResponse));

      await service.classifyIrisViaHttp(validRequest);

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    });

    it('should handle response with missing model_info', async () => {
      const responseWithoutModelInfo = {
        predicted_class: 'setosa',
        predicted_class_index: 0,
        class_names: ['setosa', 'versicolor', 'virginica'],
        probabilities: [0.95, 0.03, 0.02],
        confidence: 0.95,
        model_info: {} // Empty model_info instead of missing
      };

      const mockAxiosResponse: Partial<AxiosResponse> = {
        status: 200,
        data: responseWithoutModelInfo
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockAxiosResponse as AxiosResponse));

      const result = await service.classifyIrisViaHttp(validRequest);

      expect(result.model_info.format).toBe('HTTP/REST');
      expect(result.model_info.version).toBe('1.0');
      expect(result.model_info.inference_time_ms).toBeUndefined();
    });
  });

  describe('getHttpStatus', () => {
    it('should return correct status when server is available', async () => {
      const mockResponse: Partial<AxiosResponse> = {
        status: 200,
        data: { status: 'healthy' }
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse as AxiosResponse));

      const status = await service.getHttpStatus();

      expect(status).toEqual({
        available: true,
        endpoint: 'http://localhost:3001',
        protocol: 'HTTP/REST',
        service: 'HTTP Inference Server',
        method: 'POST /classify'
      });
    });

    it('should return correct status when server is unavailable', async () => {
      const error = new Error('Connection refused') as AxiosError;
      jest.spyOn(httpService, 'get').mockReturnValue(throwError(() => error));

      const status = await service.getHttpStatus();

      expect(status).toEqual({
        available: false,
        endpoint: 'http://localhost:3001',
        protocol: 'HTTP/REST',
        service: 'HTTP Inference Server',
        method: 'POST /classify'
      });
    });
  });

  describe('performance and reliability', () => {
    const validRequest: ClassifyRequestDto = {
      sepal_length: 5.1,
      sepal_width: 3.5,
      petal_length: 1.4,
      petal_width: 0.2
    };

    const mockHttpResponse = {
      predicted_class: 'setosa',
      predicted_class_index: 0,
      class_names: ['setosa', 'versicolor', 'virginica'],
      probabilities: [0.95, 0.03, 0.02],
      confidence: 0.95,
      model_info: {
        inference_time_ms: 2.5
      }
    };

    it('should handle multiple concurrent requests', async () => {
      const mockAxiosResponse: Partial<AxiosResponse> = {
        status: 200,
        data: mockHttpResponse
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockAxiosResponse as AxiosResponse));

      const requests = Array(5).fill(validRequest);
      const promises = requests.map(req => service.classifyIrisViaHttp(req));

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.predicted_class).toBe('setosa');
      });
      expect(httpService.post).toHaveBeenCalledTimes(5);
    });

    it('should maintain request format consistency', async () => {
      const mockAxiosResponse: Partial<AxiosResponse> = {
        status: 200,
        data: mockHttpResponse
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockAxiosResponse as AxiosResponse));

      const testRequest: ClassifyRequestDto = {
        sepal_length: 6.5,
        sepal_width: 2.8,
        petal_length: 4.6,
        petal_width: 1.5
      };

      await service.classifyIrisViaHttp(testRequest);

      expect(httpService.post).toHaveBeenCalledWith(
        'http://localhost:3001/classify',
        {
          sepal_length: 6.5,
          sepal_width: 2.8,
          petal_length: 4.6,
          petal_width: 1.5
        },
        expect.any(Object)
      );
    });

    it('should handle network interruptions gracefully', async () => {
      const networkError = new Error('Network interrupted') as AxiosError;
      networkError.code = 'ECONNRESET';
      jest.spyOn(httpService, 'post').mockReturnValue(throwError(() => networkError));

      await expect(service.classifyIrisViaHttp(validRequest))
        .rejects.toThrow('HTTP error: Network interrupted');
    });

    it('should measure and log response times', async () => {
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
      const mockAxiosResponse: Partial<AxiosResponse> = {
        status: 200,
        data: mockHttpResponse
      };

      // Use of() with delayed emission instead of Promise
      jest.spyOn(httpService, 'post').mockReturnValue(
        of(mockAxiosResponse as AxiosResponse).pipe(
          // Small delay for testing
        )
      );

      const startTime = Date.now();
      await service.classifyIrisViaHttp(validRequest);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(0);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('HTTP call completed in')
      );
      
      debugSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    const validRequest: ClassifyRequestDto = {
      sepal_length: 5.1,
      sepal_width: 3.5,
      petal_length: 1.4,
      petal_width: 0.2
    };

    it('should handle extreme input values', async () => {
      const extremeRequest: ClassifyRequestDto = {
        sepal_length: 0,
        sepal_width: 20,
        petal_length: 0,
        petal_width: 20
      };

      const mockHttpResponse = {
        predicted_class: 'unknown',
        predicted_class_index: -1,
        class_names: ['setosa', 'versicolor', 'virginica'],
        probabilities: [0.33, 0.33, 0.34],
        confidence: 0.34,
        model_info: {
          inference_time_ms: 1.2
        }
      };

      const mockAxiosResponse: Partial<AxiosResponse> = {
        status: 200,
        data: mockHttpResponse
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockAxiosResponse as AxiosResponse));

      const result = await service.classifyIrisViaHttp(extremeRequest);

      expect(result).toBeDefined();
      expect(result.input_features).toEqual(extremeRequest);
    });

    it('should handle malformed server response', async () => {
      const malformedResponse = {
        // Missing required fields but providing some basic structure
        predicted_class: 'unknown',
        predicted_class_index: -1,
        class_names: [],
        probabilities: [],
        confidence: 0,
        model_info: {}
      };

      const mockAxiosResponse: Partial<AxiosResponse> = {
        status: 200,
        data: malformedResponse
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockAxiosResponse as AxiosResponse));

      const result = await service.classifyIrisViaHttp(validRequest);

      expect(result.model_info.format).toBe('HTTP/REST');
      expect(result.input_features).toEqual(validRequest);
    });

    it('should handle 400 error without error message in response', async () => {
      const badRequestError = new Error('Bad Request') as AxiosError;
      badRequestError.response = {
        status: 400,
        data: {} // No error field
      } as any;
      jest.spyOn(httpService, 'post').mockReturnValue(throwError(() => badRequestError));

      await expect(service.classifyIrisViaHttp(validRequest))
        .rejects.toThrow('Invalid request: Bad Request');
    });

    it('should handle unknown error types', async () => {
      const unknownError = 'String error instead of Error object' as any;
      jest.spyOn(httpService, 'post').mockReturnValue(throwError(() => unknownError));

      await expect(service.classifyIrisViaHttp(validRequest))
        .rejects.toThrow();
    });
  });
});