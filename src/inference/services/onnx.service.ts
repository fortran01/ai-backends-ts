import { Injectable, Logger, OnModuleInit, HttpException, HttpStatus } from '@nestjs/common';
import * as ort from 'onnxruntime-node';
import * as path from 'path';
import { ClassifyRequestDto, ClassifyResponseDto } from '../dto/classify.dto';

/**
 * Service for ONNX model inference using onnxruntime-node
 * 
 * Following the coding guidelines: Implements secure model loading
 * with comprehensive error handling and performance monitoring
 */
@Injectable()
export class OnnxService implements OnModuleInit {
  private readonly logger = new Logger(OnnxService.name);
  private session: ort.InferenceSession | null = null;
  private readonly modelPath: string = path.join(process.cwd(), 'models', 'iris_classifier_improved.onnx');
  private readonly classNames: string[] = ['setosa', 'versicolor', 'virginica'];

  /**
   * Initialize the ONNX model session on module startup
   * 
   * Following the coding guidelines: Lazy loading with proper error handling
   */
  public async onModuleInit(): Promise<void> {
    try {
      await this.loadModel();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to initialize ONNX model: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
      // Don't throw here - allow the service to start and handle errors per-request
    }
  }

  /**
   * Load the ONNX model with performance optimizations
   * 
   * @throws Error if model file cannot be loaded
   */
  private async loadModel(): Promise<void> {
    if (this.session) {
      return; // Already loaded
    }

    this.logger.log(`Loading ONNX model from: ${this.modelPath}`);
    const startTime: number = Date.now();

    try {
      // Configure session options for optimal performance
      const sessionOptions: ort.InferenceSession.SessionOptions = {
        executionProviders: ['cpu'], // Use CPU provider for cross-platform compatibility
        graphOptimizationLevel: 'all',
        executionMode: 'sequential',
        enableCpuMemArena: true,
        enableMemPattern: true
      };

      this.session = await ort.InferenceSession.create(this.modelPath, sessionOptions);
      
      const loadTime: number = Date.now() - startTime;
      this.logger.log(`ONNX model loaded successfully in ${loadTime}ms`);
      
      // Log model metadata
      this.logger.log(`Model input names: ${this.session.inputNames.join(', ')}`);
      this.logger.log(`Model output names: ${this.session.outputNames.join(', ')}`);
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to load ONNX model: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
      throw new Error(`Model loading failed: ${errorMessage}`);
    }
  }

  /**
   * Perform Iris classification using the ONNX model
   * 
   * @param request - Classification request with Iris features
   * @returns Comprehensive classification results with probabilities and metadata
   * @throws HttpException for model errors or invalid inputs
   */
  public async classifyIris(request: ClassifyRequestDto): Promise<ClassifyResponseDto> {
    // Ensure model is loaded
    if (!this.session) {
      try {
        await this.loadModel();
      } catch (error: unknown) {
        throw new HttpException({
          message: 'ONNX model is not available',
          error: 'Model Loading Failed',
          statusCode: 503
        }, HttpStatus.SERVICE_UNAVAILABLE);
      }
    }

    const startTime: number = Date.now();
    
    try {
      // Prepare input tensor - ONNX expects Float32Array
      const inputData: Float32Array = new Float32Array([
        request.sepal_length,
        request.sepal_width,
        request.petal_length,
        request.petal_width
      ]);

      // Create input tensor with correct shape [1, 4] for single sample
      const inputTensor: ort.Tensor = new ort.Tensor('float32', inputData, [1, 4]);
      
      // Run inference with improved model that has tensor-only outputs
      const feeds: Record<string, ort.Tensor> = {};
      feeds[this.session!.inputNames[0]] = inputTensor;
      
      // Request all outputs since the improved model has tensor-only outputs
      const results: ort.InferenceSession.OnnxValueMapType = await this.session!.run(feeds);
      
      const inferenceTime: number = Date.now() - startTime;
      
      // Extract both label and probability outputs
      const labelOutput = results[this.session!.outputNames[0]] as ort.Tensor;
      const probabilityOutput = results[this.session!.outputNames[1]] as ort.Tensor;
      
      // Get predicted class (label output contains class index)
      // Note: ONNX model returns BigInt, need to convert to number
      const rawPrediction = labelOutput.data[0];
      const predictedIndex: number = typeof rawPrediction === 'bigint' 
        ? Number(rawPrediction) 
        : Math.floor(rawPrediction as number);
      const predictedClass: string = this.classNames[predictedIndex];
      
      // Get real probabilities from the improved model
      // The probability output is now a tensor with shape [1, 3] containing probabilities for each class
      const probabilities: number[] = Array.from(probabilityOutput.data as Float32Array);
      const confidence: number = Math.max(...probabilities);
      
      this.logger.log(`Iris classification completed in ${inferenceTime}ms. Predicted: ${predictedClass} (confidence: ${confidence.toFixed(3)})`);
      
      return {
        predicted_class: predictedClass,
        predicted_class_index: predictedIndex,
        probabilities: probabilities,
        confidence: confidence,
        class_names: [...this.classNames],
        input_features: {
          sepal_length: request.sepal_length,
          sepal_width: request.sepal_width,
          petal_length: request.petal_length,
          petal_width: request.petal_width
        },
        model_info: {
          format: 'ONNX',
          version: '1.0',
          inference_time_ms: inferenceTime
        }
      };
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`ONNX inference failed: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
      
      throw new HttpException({
        message: 'Model inference failed',
        error: errorMessage ?? 'Internal Server Error',
        statusCode: 500
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Check if the ONNX model is loaded and ready for inference
   * 
   * @returns True if model is ready, false otherwise
   */
  public isModelReady(): boolean {
    return this.session !== null;
  }

  /**
   * Get model metadata and status information
   * 
   * @returns Model information object
   */
  public getModelInfo(): Record<string, unknown> {
    return {
      loaded: this.isModelReady(),
      path: this.modelPath,
      inputNames: this.session?.inputNames ?? [],
      outputNames: this.session?.outputNames ?? [],
      classNames: this.classNames,
      format: 'ONNX'
    };
  }
}