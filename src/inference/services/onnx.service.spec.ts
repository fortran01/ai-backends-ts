import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { OnnxService } from './onnx.service';
import { ClassifyRequestDto } from '../dto/classify.dto';
import * as ort from 'onnxruntime-node';

// Mock onnxruntime-node
jest.mock('onnxruntime-node');

/**
 * Unit tests for OnnxService
 * 
 * Following the coding guidelines: Comprehensive test coverage for
 * ONNX model loading, inference, and error handling with mocked dependencies
 */
describe('OnnxService', () => {
  let service: OnnxService;
  let mockSession: jest.Mocked<ort.InferenceSession>;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock session
    mockSession = {
      inputNames: ['float_input'],
      outputNames: ['label', 'probabilities'],
      run: jest.fn(),
    } as any;

    // Mock InferenceSession.create
    (ort.InferenceSession.create as jest.Mock) = jest.fn();
    (ort.Tensor as any) = jest.fn().mockImplementation((type: string, data: any, shape: number[]) => ({
      type,
      data,
      dims: shape
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [OnnxService],
    }).compile();

    service = module.get<OnnxService>(OnnxService);
  });

  describe('onModuleInit', () => {
    it('should initialize successfully with valid model', async () => {
      (ort.InferenceSession.create as jest.Mock).mockResolvedValue(mockSession);

      await service.onModuleInit();

      expect(ort.InferenceSession.create).toHaveBeenCalledWith(
        expect.stringContaining('iris_classifier_improved.onnx'),
        expect.objectContaining({
          executionProviders: ['cpu'],
          graphOptimizationLevel: 'all'
        })
      );
    });

    it('should handle model loading errors gracefully', async () => {
      (ort.InferenceSession.create as jest.Mock).mockRejectedValue(new Error('Model not found'));

      // Should not throw during initialization
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe('classifyIris', () => {
    beforeEach(async () => {
      // Setup successful model loading
      (ort.InferenceSession.create as jest.Mock).mockResolvedValue(mockSession);
      await service.onModuleInit();
    });

    it('should successfully classify Setosa', async () => {
      const request: ClassifyRequestDto = {
        sepal_length: 5.1,
        sepal_width: 3.5,
        petal_length: 1.4,
        petal_width: 0.2
      };

      // Mock successful inference with Setosa prediction
      mockSession.run.mockResolvedValue({
        label: { data: new BigInt64Array([BigInt(0)]) } as any as any,
        probabilities: { data: new Float32Array([1.0, 0.0, 0.0]) } as any as any
      });

      const result = await service.classifyIris(request);

      expect(result.predicted_class).toBe('setosa');
      expect(result.predicted_class_index).toBe(0);
      expect(result.probabilities).toEqual([1.0, 0.0, 0.0]);
      expect(result.confidence).toBe(1.0);
      expect(result.class_names).toEqual(['setosa', 'versicolor', 'virginica']);
      expect(result.input_features).toEqual(request);
      expect(result.model_info.format).toBe('ONNX');
      expect(result.model_info.inference_time_ms).toBeGreaterThanOrEqual(0);
    });

    it('should successfully classify Versicolor', async () => {
      const request: ClassifyRequestDto = {
        sepal_length: 7.0,
        sepal_width: 3.2,
        petal_length: 4.7,
        petal_width: 1.4
      };

      // Mock successful inference with Versicolor prediction
      mockSession.run.mockResolvedValue({
        label: { data: new BigInt64Array([BigInt(1)]) } as any as any,
        probabilities: { data: new Float32Array([0.0, 0.73, 0.27]) } as any
      });

      const result = await service.classifyIris(request);

      expect(result.predicted_class).toBe('versicolor');
      expect(result.predicted_class_index).toBe(1);
      expect(result.probabilities[0]).toBeCloseTo(0.0);
      expect(result.probabilities[1]).toBeCloseTo(0.73);
      expect(result.probabilities[2]).toBeCloseTo(0.27);
      expect(result.confidence).toBeCloseTo(0.73);
    });

    it('should successfully classify Virginica', async () => {
      const request: ClassifyRequestDto = {
        sepal_length: 6.3,
        sepal_width: 3.3,
        petal_length: 6.0,
        petal_width: 2.5
      };

      // Mock successful inference with Virginica prediction
      mockSession.run.mockResolvedValue({
        label: { data: new BigInt64Array([BigInt(2)]) } as any as any,
        probabilities: { data: new Float32Array([0.0, 0.1, 0.9]) } as any
      });

      const result = await service.classifyIris(request);

      expect(result.predicted_class).toBe('virginica');
      expect(result.predicted_class_index).toBe(2);
      expect(result.probabilities[0]).toBeCloseTo(0.0);
      expect(result.probabilities[1]).toBeCloseTo(0.1);
      expect(result.probabilities[2]).toBeCloseTo(0.9);
      expect(result.confidence).toBeCloseTo(0.9);
    });

    it('should handle BigInt predictions correctly', async () => {
      const request: ClassifyRequestDto = {
        sepal_length: 5.0,
        sepal_width: 3.0,
        petal_length: 1.0,
        petal_width: 0.1
      };

      // Mock BigInt response (from some ONNX models)
      mockSession.run.mockResolvedValue({
        label: { data: new BigInt64Array([BigInt(0)]) } as any,
        probabilities: { data: new Float32Array([0.95, 0.03, 0.02]) } as any
      });

      const result = await service.classifyIris(request);

      expect(result.predicted_class).toBe('setosa');
      expect(result.predicted_class_index).toBe(0);
    });

    it('should throw HttpException when model is not loaded', async () => {
      // Create service without loading model
      const moduleWithoutInit: TestingModule = await Test.createTestingModule({
        providers: [OnnxService],
      }).compile();

      const serviceWithoutModel = moduleWithoutInit.get<OnnxService>(OnnxService);

      const request: ClassifyRequestDto = {
        sepal_length: 5.1,
        sepal_width: 3.5,
        petal_length: 1.4,
        petal_width: 0.2
      };

      // Mock model loading failure
      (ort.InferenceSession.create as jest.Mock).mockRejectedValue(new Error('Model file not found'));

      await expect(serviceWithoutModel.classifyIris(request))
        .rejects
        .toThrow(HttpException);

      try {
        await serviceWithoutModel.classifyIris(request);
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        expect((error as HttpException).getResponse()).toMatchObject({
          message: 'ONNX model is not available',
          error: 'Model Loading Failed',
          statusCode: 503
        });
      }
    });

    it('should throw HttpException on inference errors', async () => {
      const request: ClassifyRequestDto = {
        sepal_length: 5.1,
        sepal_width: 3.5,
        petal_length: 1.4,
        petal_width: 0.2
      };

      // Mock inference failure
      mockSession.run.mockRejectedValue(new Error('Inference failed'));

      await expect(service.classifyIris(request))
        .rejects
        .toThrow(HttpException);

      try {
        await service.classifyIris(request);
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect((error as HttpException).getResponse()).toMatchObject({
          message: 'Model inference failed',
          error: 'Inference failed',
          statusCode: 500
        });
      }
    });

    it('should create correct input tensor shape and data', async () => {
      const request: ClassifyRequestDto = {
        sepal_length: 1.1,
        sepal_width: 2.2,
        petal_length: 3.3,
        petal_width: 4.4
      };

      mockSession.run.mockResolvedValue({
        label: { data: new BigInt64Array([BigInt(0)]) } as any as any,
        probabilities: { data: new Float32Array([1.0, 0.0, 0.0]) } as any
      });

      await service.classifyIris(request);

      // Verify tensor creation
      expect(ort.Tensor).toHaveBeenCalledWith(
        'float32',
        expect.any(Float32Array),
        [1, 4]
      );

      // Verify input data
      const tensorCall = ((ort.Tensor as any) as jest.Mock).mock.calls[0];
      const inputData: Float32Array = tensorCall[1];
      const inputArray = Array.from(inputData);
      expect(inputArray[0]).toBeCloseTo(1.1);
      expect(inputArray[1]).toBeCloseTo(2.2);
      expect(inputArray[2]).toBeCloseTo(3.3);
      expect(inputArray[3]).toBeCloseTo(4.4);

      // Verify session.run was called with correct feeds
      expect(mockSession.run).toHaveBeenCalledWith({
        float_input: expect.any(Object)
      });
    });
  });

  describe('isModelReady', () => {
    it('should return false when model is not loaded', () => {
      const result: boolean = service.isModelReady();
      expect(result).toBe(false);
    });

    it('should return true when model is loaded', async () => {
      (ort.InferenceSession.create as jest.Mock).mockResolvedValue(mockSession);
      await service.onModuleInit();

      const result: boolean = service.isModelReady();
      expect(result).toBe(true);
    });
  });

  describe('getModelInfo', () => {
    it('should return correct info when model is not loaded', () => {
      const info = service.getModelInfo();

      expect(info).toMatchObject({
        loaded: false,
        path: expect.stringContaining('iris_classifier_improved.onnx'),
        inputNames: [],
        outputNames: [],
        classNames: ['setosa', 'versicolor', 'virginica'],
        format: 'ONNX'
      });
    });

    it('should return correct info when model is loaded', async () => {
      (ort.InferenceSession.create as jest.Mock).mockResolvedValue(mockSession);
      await service.onModuleInit();

      const info = service.getModelInfo();

      expect(info).toMatchObject({
        loaded: true,
        path: expect.stringContaining('iris_classifier_improved.onnx'),
        inputNames: ['float_input'],
        outputNames: ['label', 'probabilities'],
        classNames: ['setosa', 'versicolor', 'virginica'],
        format: 'ONNX'
      });
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      (ort.InferenceSession.create as jest.Mock).mockResolvedValue(mockSession);
      await service.onModuleInit();
    });

    it('should handle extreme values', async () => {
      const request: ClassifyRequestDto = {
        sepal_length: 999.99,
        sepal_width: 0.01,
        petal_length: -10.5,
        petal_width: 100.0
      };

      mockSession.run.mockResolvedValue({
        label: { data: new BigInt64Array([BigInt(1)]) } as any as any,
        probabilities: { data: new Float32Array([0.2, 0.5, 0.3]) } as any
      });

      const result = await service.classifyIris(request);

      expect(result.predicted_class).toBe('versicolor');
      expect(result.input_features).toEqual(request);
    });

    it('should handle zero probabilities', async () => {
      const request: ClassifyRequestDto = {
        sepal_length: 5.0,
        sepal_width: 3.0,
        petal_length: 1.0,
        petal_width: 0.1
      };

      mockSession.run.mockResolvedValue({
        label: { data: new BigInt64Array([BigInt(0)]) } as any as any,
        probabilities: { data: new Float32Array([0.0, 0.0, 0.0]) } as any
      });

      const result = await service.classifyIris(request);

      expect(result.confidence).toBe(0.0);
      expect(result.probabilities).toEqual([0.0, 0.0, 0.0]);
    });

    it('should handle malformed inference results', async () => {
      const request: ClassifyRequestDto = {
        sepal_length: 5.0,
        sepal_width: 3.0,
        petal_length: 1.0,
        petal_width: 0.1
      };

      // Mock malformed result
      mockSession.run.mockResolvedValue({
        label: { data: new BigInt64Array([]) } as any,
        probabilities: { data: new Float32Array([]) } as any
      });

      const result = await service.classifyIris(request);
      
      // Service should handle empty arrays gracefully
      expect(result.probabilities).toEqual([]);
      expect(result.predicted_class_index).toBeNaN();
      expect(result.predicted_class).toBeUndefined();
      expect(result.confidence).toBe(-Infinity);
    });
  });
});