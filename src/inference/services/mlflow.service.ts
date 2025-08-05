import { Injectable, Logger, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as ort from 'onnxruntime-node';
import { ClassifyRequestDto } from '../dto/classify.dto';

/**
 * MLflow API response interfaces
 */
interface MLflowModelVersion {
  version: string;
  current_stage: string;
  run_id: string;
  creation_timestamp: number;
  source: string;
}

interface MLflowModelVersionResponse {
  model_version: MLflowModelVersion;
}

/**
 * MLflow model registry service for centralized model lifecycle management
 * 
 * Following the coding guidelines: Demonstrates cross-language model registry
 * access patterns by integrating with MLflow's REST API while maintaining
 * TypeScript-native ONNX model loading capabilities
 */
@Injectable()
export class MlflowService {
  private readonly logger: Logger = new Logger(MlflowService.name);
  private readonly mlflowUrl: string = 'http://localhost:5000';
  private readonly modelCacheDir: string = path.join(process.cwd(), 'cached_models');
  private cachedModels: Map<string, ort.InferenceSession> = new Map();

  constructor(private readonly httpService: HttpService) {
    this.ensureModelCacheDirectory();
  }

  /**
   * Ensure model cache directory exists for downloaded models
   */
  private ensureModelCacheDirectory(): void {
    try {
      if (!fs.existsSync(this.modelCacheDir)) {
        fs.mkdirSync(this.modelCacheDir, { recursive: true });
        this.logger.log('Created model cache directory');
      }
    } catch (error: unknown) {
      this.logger.error('Failed to create model cache directory', error);
    }
  }

  /**
   * Check if MLflow server is available
   * 
   * @returns Promise resolving to availability status
   */
  public async isMLflowAvailable(): Promise<boolean> {
    try {
      const response: AxiosResponse = await firstValueFrom(
        this.httpService.get(`${this.mlflowUrl}/health`, { timeout: 5000 })
      );
      return response.status === 200;
    } catch (error: unknown) {
      this.logger.warn('MLflow server is not available', error);
      return false;
    }
  }

  /**
   * List all registered models in MLflow
   * 
   * @returns Promise resolving to list of registered models
   */
  public async listRegisteredModels(): Promise<Record<string, unknown>> {
    try {
      const response: AxiosResponse = await firstValueFrom(
        this.httpService.get(`${this.mlflowUrl}/api/2.0/mlflow/registered-models/list`, {
          timeout: 10000
        })
      );

      return {
        models: response.data.registered_models || [],
        total_count: response.data.registered_models?.length || 0,
        registry_status: 'available'
      };
    } catch (error: unknown) {
      this.logger.error('Failed to list registered models', error);
      throw new InternalServerErrorException({
        message: 'Failed to connect to MLflow registry',
        details: error instanceof Error ? error.message : 'Unknown error',
        mlflow_url: this.mlflowUrl,
        recommendation: 'Ensure MLflow server is running on http://localhost:5000'
      });
    }
  }

  /**
   * Get specific model version details from MLflow registry
   * 
   * @param modelName - Name of the registered model
   * @param version - Model version (optional, defaults to latest)
   * @param stage - Model stage (optional: None, Staging, Production, Archived)
   * @returns Promise resolving to model version details
   */
  public async getModelVersion(
    modelName: string, 
    version?: string, 
    stage?: string
  ): Promise<MLflowModelVersionResponse> {
    try {
      // If stage is specified, get model by stage
      if (stage && stage !== 'None') {
        const response: AxiosResponse = await firstValueFrom(
          this.httpService.get(`${this.mlflowUrl}/api/2.0/mlflow/model-versions/get-by-name`, {
            params: {
              name: modelName,
              stage: stage
            },
            timeout: 10000
          })
        );
        return response.data;
      }

      // If version is specified, get specific version
      if (version) {
        const response: AxiosResponse = await firstValueFrom(
          this.httpService.get(`${this.mlflowUrl}/api/2.0/mlflow/model-versions/get`, {
            params: {
              name: modelName,
              version: version
            },
            timeout: 10000
          })
        );
        return response.data;
      }

      // Get latest version
      const listResponse: AxiosResponse = await firstValueFrom(
        this.httpService.get(`${this.mlflowUrl}/api/2.0/mlflow/registered-models/get`, {
          params: { name: modelName },
          timeout: 10000
        })
      );

      const modelVersions = listResponse.data.registered_model?.latest_versions || [];
      if (modelVersions.length === 0) {
        throw new NotFoundException(`No versions found for model ${modelName}`);
      }

      // Return latest version
      return { model_version: modelVersions[0] };
    } catch (error: unknown) {
      this.logger.error(`Failed to get model version for ${modelName}`, error);
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException({
        message: 'Failed to retrieve model version from MLflow registry',
        model_name: modelName,
        version: version,
        stage: stage,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Download model artifacts from MLflow registry
   * 
   * @param modelUri - MLflow model URI (e.g., "models:/iris-classifier-onnx/1")
   * @returns Promise resolving to local model file path
   */
  public async downloadModelArtifacts(modelUri: string): Promise<string> {
    try {
      // Parse model URI to extract model name and version
      const uriMatch = modelUri.match(/models:\/([^/]+)\/(.+)/);
      if (!uriMatch) {
        throw new Error(`Invalid model URI format: ${modelUri}`);
      }

      const [, modelName, versionOrStage] = uriMatch;
      const cachedModelPath: string = path.join(this.modelCacheDir, `${modelName}_${versionOrStage}.onnx`);

      // Check if model is already cached
      if (fs.existsSync(cachedModelPath)) {
        this.logger.log(`Using cached model: ${cachedModelPath}`);
        return cachedModelPath;
      }

      // Get model version details to find artifact URI
      const modelVersion = await this.getModelVersion(modelName, versionOrStage);
      const artifactUri: string = modelVersion.model_version.source || '';

      if (!artifactUri) {
        throw new Error(`No artifact URI found for model ${modelUri}`);
      }

      // For local MLflow setup, artifacts are typically file:// URIs
      if (artifactUri.startsWith('file://')) {
        const localPath: string = artifactUri.replace('file://', '');
        const onnxModelPath: string = path.join(localPath, 'model.onnx');
        
        if (fs.existsSync(onnxModelPath)) {
          // Copy to cache
          fs.copyFileSync(onnxModelPath, cachedModelPath);
          this.logger.log(`Downloaded and cached model: ${cachedModelPath}`);
          return cachedModelPath;
        }
      }

      // Fallback: try to download via MLflow artifacts API
      const artifactResponse: AxiosResponse = await firstValueFrom(
        this.httpService.get(`${this.mlflowUrl}/get-artifact`, {
          params: {
            path: 'model.onnx',
            run_uuid: modelVersion.model_version.run_id
          },
          responseType: 'arraybuffer',
          timeout: 30000
        })
      );

      // Save downloaded model to cache
      fs.writeFileSync(cachedModelPath, Buffer.from(artifactResponse.data));
      this.logger.log(`Downloaded and cached model from MLflow: ${cachedModelPath}`);
      return cachedModelPath;

    } catch (error: unknown) {
      this.logger.error(`Failed to download model artifacts for ${modelUri}`, error);
      throw new InternalServerErrorException({
        message: 'Failed to download model from MLflow registry',
        model_uri: modelUri,
        details: error instanceof Error ? error.message : 'Unknown error',
        recommendation: 'Check MLflow server status and model availability'
      });
    }
  }

  /**
   * Load ONNX model from MLflow registry
   * 
   * @param modelUri - MLflow model URI
   * @returns Promise resolving to ONNX inference session
   */
  public async loadModelFromRegistry(modelUri: string): Promise<ort.InferenceSession> {
    try {
      // Check if model is already loaded in cache
      if (this.cachedModels.has(modelUri)) {
        this.logger.log(`Using cached ONNX session for ${modelUri}`);
        return this.cachedModels.get(modelUri)!;
      }

      // Download model artifacts
      const modelPath: string = await this.downloadModelArtifacts(modelUri);

      // Load ONNX model
      const session: ort.InferenceSession = await ort.InferenceSession.create(modelPath);
      
      // Cache the loaded session
      this.cachedModels.set(modelUri, session);
      this.logger.log(`Loaded and cached ONNX model: ${modelUri}`);
      
      return session;
    } catch (error: unknown) {
      this.logger.error(`Failed to load model from registry: ${modelUri}`, error);
      throw new InternalServerErrorException({
        message: 'Failed to load model from MLflow registry',
        model_uri: modelUri,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Perform Iris classification using model from MLflow registry
   * 
   * @param request - Classification request with Iris features
   * @param modelFormat - Model format (sklearn or onnx, defaults to onnx)
   * @param version - Model version (optional)
   * @param stage - Model stage (optional)
   * @returns Promise resolving to classification results with registry metadata
   */
  public async classifyFromRegistry(
    request: ClassifyRequestDto,
    modelFormat: string = 'onnx',
    version?: string,
    stage?: string
  ): Promise<Record<string, unknown>> {
    try {
      // Validate model format
      if (!['sklearn', 'onnx'].includes(modelFormat)) {
        throw new Error(`Unsupported model format: ${modelFormat}. Supported formats: sklearn, onnx`);
      }

      // For TypeScript/Node.js, we only support ONNX models directly
      if (modelFormat === 'sklearn') {
        throw new Error('sklearn models require Python runtime. Use ONNX format for TypeScript/Node.js compatibility');
      }

      // Construct model URI
      const modelName: string = `iris-classifier-${modelFormat}`;
      let modelUri: string;

      if (stage && stage !== 'None') {
        modelUri = `models:/${modelName}/${stage}`;
      } else if (version) {
        modelUri = `models:/${modelName}/${version}`;
      } else {
        modelUri = `models:/${modelName}/latest`;
      }

      // Get model metadata
      const modelVersion = await this.getModelVersion(modelName, version, stage);
      
      // Load model and perform inference
      const session: ort.InferenceSession = await this.loadModelFromRegistry(modelUri);
      
      // Prepare input tensor
      const inputArray: Float32Array = new Float32Array([
        request.sepal_length,
        request.sepal_width,
        request.petal_length,
        request.petal_width
      ]);

      const inputTensor: ort.Tensor = new ort.Tensor('float32', inputArray, [1, 4]);
      const startTime: number = Date.now();

      // Run inference
      const outputs = await session.run({ float_input: inputTensor });
      const inferenceTime: number = Date.now() - startTime;

      // Process outputs
      const probabilities: Float32Array = outputs.probabilities.data as Float32Array;
      const predictedClassIndex: number = outputs.output_label.data[0] as number;
      
      const classNames: string[] = ['setosa', 'versicolor', 'virginica'];
      const predictedClass: string = classNames[predictedClassIndex];
      const confidence: number = Math.max(...Array.from(probabilities));

      // Prepare response with registry metadata
      const response: Record<string, unknown> = {
        predicted_class: predictedClass,
        predicted_class_index: predictedClassIndex,
        probabilities: Array.from(probabilities),
        confidence: Math.round(confidence * 10000) / 10000,
        class_names: classNames,
        input_features: {
          sepal_length: request.sepal_length,
          sepal_width: request.sepal_width,
          petal_length: request.petal_length,
          petal_width: request.petal_width
        },
        model_info: {
          format: 'ONNX',
          inference_time_ms: inferenceTime,
          source: 'MLflow Registry'
        },
        registry_metadata: {
          model_uri: modelUri,
          model_name: modelName,
          version: modelVersion.model_version.version || 'latest',
          stage: modelVersion.model_version.current_stage || 'None',
          run_id: modelVersion.model_version.run_id || 'unknown',
          creation_timestamp: modelVersion.model_version.creation_timestamp || null,
          source_path: modelVersion.model_version.source || 'unknown'
        }
      };

      return response;
    } catch (error: unknown) {
      this.logger.error('Failed to classify using MLflow registry model', error);
      
      if (error instanceof NotFoundException || error instanceof InternalServerErrorException) {
        throw error;
      }
      
      throw new InternalServerErrorException({
        message: 'Classification from MLflow registry failed',
        model_format: modelFormat,
        version: version,
        stage: stage,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get MLflow service status
   * 
   * @returns Promise resolving to service status information
   */
  public async getMLflowStatus(): Promise<Record<string, unknown>> {
    try {
      const isAvailable: boolean = await this.isMLflowAvailable();
      
      const status: Record<string, unknown> = {
        available: isAvailable,
        endpoint: this.mlflowUrl,
        cached_models: this.cachedModels.size,
        cache_directory: this.modelCacheDir
      };

      if (isAvailable) {
        try {
          const models = await this.listRegisteredModels();
          status.registered_models = models.total_count;
        } catch (error: unknown) {
          status.registered_models = 'unknown';
          status.registry_error = error instanceof Error ? error.message : 'Unknown error';
        }
      }

      return status;
    } catch (error: unknown) {
      this.logger.error('Failed to get MLflow status', error);
      return {
        available: false,
        endpoint: this.mlflowUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
        cached_models: this.cachedModels.size
      };
    }
  }

  /**
   * Clear model cache
   */
  public clearModelCache(): void {
    this.cachedModels.clear();
    this.logger.log('Cleared ONNX model cache');
  }
}