import { Test, TestingModule } from '@nestjs/testing';
import { HttpModule, HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus } from '@nestjs/common';
import { OllamaService } from './ollama.service';
import { GenerateRequestDto } from '../dto/generate.dto';
import { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';

/**
 * Unit tests for OllamaService
 * 
 * Following the coding guidelines: Comprehensive test coverage for
 * HTTP-based model inference with proper mocking and error handling
 */
describe('OllamaService', () => {
  let service: OllamaService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      providers: [OllamaService],
    }).compile();

    service = module.get<OllamaService>(OllamaService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateText', () => {
    it('should successfully generate text with valid response', async () => {
      const request: GenerateRequestDto = {
        prompt: 'What is machine learning?'
      };

      const mockResponse: AxiosResponse = {
        data: {
          response: 'Machine learning is a subset of artificial intelligence...',
          model: 'tinyllama',
          created_at: '2025-08-02T20:00:00.000Z',
          done: true
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockResponse));

      const result = await service.generateText(request);

      expect(result.response).toBe('Machine learning is a subset of artificial intelligence...');
      expect(result.model).toBe('tinyllama');
      expect(result.done).toBe(true);
      expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/); // ISO timestamp format

      expect(httpService.post).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        {
          model: 'tinyllama',
          prompt: 'What is machine learning?',
          stream: false
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        }
      );
    });

    it('should handle short prompts correctly', async () => {
      const request: GenerateRequestDto = {
        prompt: 'Hi'
      };

      const mockResponse: AxiosResponse = {
        data: {
          response: 'Hello! How can I help you today?',
          model: 'tinyllama',
          created_at: '2025-08-02T20:00:00.000Z',
          done: true
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockResponse));

      const result = await service.generateText(request);

      expect(result.response).toBe('Hello! How can I help you today?');
      expect(httpService.post).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          prompt: 'Hi'
        }),
        expect.any(Object)
      );
    });

    it('should handle long prompts correctly', async () => {
      const longPrompt: string = 'a'.repeat(500);
      const request: GenerateRequestDto = {
        prompt: longPrompt
      };

      const mockResponse: AxiosResponse = {
        data: {
          response: 'This is a response to a long prompt.',
          model: 'tinyllama',
          created_at: '2025-08-02T20:00:00.000Z',
          done: true
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockResponse));

      const result = await service.generateText(request);

      expect(result.response).toBe('This is a response to a long prompt.');
      expect(httpService.post).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          prompt: longPrompt
        }),
        expect.any(Object)
      );
    });

    it('should throw HttpException on HTTP connection errors', async () => {
      const request: GenerateRequestDto = {
        prompt: 'Test prompt'
      };

      const connectionError = {
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED 127.0.0.1:11434',
        response: undefined
      };

      jest.spyOn(httpService, 'post').mockReturnValue(throwError(() => connectionError));

      await expect(service.generateText(request))
        .rejects
        .toThrow(HttpException);

      try {
        await service.generateText(request);
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        expect((error as HttpException).getResponse()).toMatchObject({
          message: 'Ollama service is not running. Please start Ollama and ensure TinyLlama model is available.',
          error: 'Service Unavailable',
          statusCode: 503
        });
      }
    });

    it('should throw HttpException on HTTP timeout', async () => {
      const request: GenerateRequestDto = {
        prompt: 'Test prompt'
      };

      const timeoutError = {
        code: 'ETIMEDOUT',
        message: 'timeout of 30000ms exceeded',
        response: undefined
      };

      jest.spyOn(httpService, 'post').mockReturnValue(throwError(() => timeoutError));

      await expect(service.generateText(request))
        .rejects
        .toThrow(HttpException);

      try {
        await service.generateText(request);
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect((error as HttpException).getResponse()).toMatchObject({
          message: 'Text generation failed',
          error: 'timeout of 30000ms exceeded',
          statusCode: 500
        });
      }
    });

    it('should throw HttpException on HTTP 404 model not found', async () => {
      const request: GenerateRequestDto = {
        prompt: 'Test prompt'
      };

      const notFoundError = {
        response: {
          status: 404,
          data: { error: 'model not found' }
        },
        message: 'Request failed with status code 404'
      };

      jest.spyOn(httpService, 'post').mockReturnValue(throwError(() => notFoundError));

      await expect(service.generateText(request))
        .rejects
        .toThrow(HttpException);

      try {
        await service.generateText(request);
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect((error as HttpException).getResponse()).toMatchObject({
          message: "Model 'tinyllama' not found. Please run: ollama pull tinyllama",
          error: 'Model Not Found',
          statusCode: 404
        });
      }
    });

    it('should throw HttpException on HTTP 500 server error', async () => {
      const request: GenerateRequestDto = {
        prompt: 'Test prompt'
      };

      const serverError = {
        response: {
          status: 500,
          data: { error: 'internal server error' }
        },
        message: 'Request failed with status code 500'
      };

      jest.spyOn(httpService, 'post').mockReturnValue(throwError(() => serverError));

      await expect(service.generateText(request))
        .rejects
        .toThrow(HttpException);

      try {
        await service.generateText(request);
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect((error as HttpException).getResponse()).toMatchObject({
          message: 'Text generation failed',
          error: 'Request failed with status code 500',
          statusCode: 500
        });
      }
    });

    it('should handle malformed response data', async () => {
      const request: GenerateRequestDto = {
        prompt: 'Test prompt'
      };

      const mockResponse: AxiosResponse = {
        data: {
          // Missing required fields
          model: 'tinyllama',
          done: true
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockResponse));

      const result = await service.generateText(request);

      // Should handle missing fields gracefully
      expect(result.model).toBe('tinyllama');
      expect(result.done).toBe(true);
      expect(result.response).toBe(''); // Service returns empty string for missing response
    });

    it('should handle special characters in prompts', async () => {
      const request: GenerateRequestDto = {
        prompt: 'What about émojis 🤖 and special chars: ñáéíóú & symbols ¿¡'
      };

      const mockResponse: AxiosResponse = {
        data: {
          response: 'I can handle special characters and emojis just fine!',
          model: 'tinyllama',
          created_at: '2025-08-02T20:00:00.000Z',
          done: true
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockResponse));

      const result = await service.generateText(request);

      expect(result.response).toBe('I can handle special characters and emojis just fine!');
      expect(httpService.post).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          prompt: 'What about émojis 🤖 and special chars: ñáéíóú & symbols ¿¡'
        }),
        expect.any(Object)
      );
    });
  });

  describe('isAvailable', () => {
    it('should return true when Ollama is available', async () => {
      const mockResponse: AxiosResponse = {
        data: { status: 'ok' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));

      const result: boolean = await service.isAvailable();

      expect(result).toBe(true);
      expect(httpService.get).toHaveBeenCalledWith(
        'http://localhost:11434/api/version',
        { timeout: 5000 }
      );
    });

    it('should return false when Ollama is not available', async () => {
      const connectionError = {
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED 127.0.0.1:11434'
      };

      jest.spyOn(httpService, 'get').mockReturnValue(throwError(() => connectionError));

      const result: boolean = await service.isAvailable();

      expect(result).toBe(false);
    });

    it('should return false on timeout', async () => {
      const timeoutError = {
        code: 'ETIMEDOUT',
        message: 'timeout of 5000ms exceeded'
      };

      jest.spyOn(httpService, 'get').mockReturnValue(throwError(() => timeoutError));

      const result: boolean = await service.isAvailable();

      expect(result).toBe(false);
    });

    it('should return false on HTTP errors', async () => {
      const httpError = {
        response: {
          status: 500,
          data: { error: 'server error' }
        }
      };

      jest.spyOn(httpService, 'get').mockReturnValue(throwError(() => httpError));

      const result: boolean = await service.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should use correct default configuration', () => {
      // Test that service uses expected default values
      const request: GenerateRequestDto = {
        prompt: 'Test'
      };

      const mockResponse: AxiosResponse = {
        data: {
          response: 'Response',
          model: 'tinyllama',
          created_at: '2025-08-02T20:00:00.000Z',
          done: true
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockResponse));

      service.generateText(request);

      expect(httpService.post).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          model: 'tinyllama',
          stream: false
        }),
        expect.objectContaining({
          timeout: 30000,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty response', async () => {
      const request: GenerateRequestDto = {
        prompt: 'Test prompt'
      };

      const mockResponse: AxiosResponse = {
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockResponse));

      const result = await service.generateText(request);

      expect(result.model).toBe('tinyllama');
      expect(result.response).toBe('');
      expect(result.done).toBe(true);
    });

    it('should handle null response data', async () => {
      const request: GenerateRequestDto = {
        prompt: 'Test prompt'
      };

      const mockResponse: AxiosResponse = {
        data: null,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockResponse));

      await expect(service.generateText(request))
        .rejects
        .toThrow(HttpException);
    });

    it('should handle network errors without response', async () => {
      const request: GenerateRequestDto = {
        prompt: 'Test prompt'
      };

      const networkError = new Error('Network Error');

      jest.spyOn(httpService, 'post').mockReturnValue(throwError(() => networkError));

      await expect(service.generateText(request))
        .rejects
        .toThrow(HttpException);

      try {
        await service.generateText(request);
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      }
    });
  });
});