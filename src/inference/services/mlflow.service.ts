import { Injectable, Logger, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as ort from 'onnxruntime-node';
import { spawn } from 'child_process';
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
  private readonly mlflowUrl: string = 'http://localhost:5004/api';
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
        this.httpService.get('http://localhost:5004/health', { timeout: 5000 })
      );
      return response.status === 200;
    } catch (error: unknown) {
      this.logger.warn('MLflow server is not available', error);
      return false;
    }
  }

  /**
   * List all registered models in MLflow using Python subprocess
   * Following the coding guidelines: Since REST API endpoints have routing issues,
   * bridge to Python MLflow client for reliable registry access
   * 
   * @returns Promise resolving to list of registered models
   */
  public async listRegisteredModels(): Promise<Record<string, unknown>> {
    try {
      // Use Python subprocess to access MLflow registry directly
      const pythonScript: string = `
import json
from mlflow.tracking import MlflowClient
import mlflow

try:
    mlflow.set_tracking_uri("http://localhost:5004")
    client = MlflowClient()
    models = client.search_registered_models()
    
    result = {
        "models": [
            {
                "name": model.name,
                "creation_timestamp": model.creation_timestamp,
                "last_updated_timestamp": model.last_updated_timestamp,
                "description": model.description or "",
                "aliases": [{"alias": alias_name, "version": version} for alias_name, version in (model.aliases or {}).items()],
                "latest_versions": [
                    {
                        "name": v.name,
                        "version": v.version,
                        "current_stage": v.current_stage,
                        "creation_timestamp": v.creation_timestamp,
                        "run_id": v.run_id,
                        "source": v.source,
                        "status": v.status
                    } for v in (model.latest_versions or [])
                ]
            } for model in models
        ],
        "total_count": len(models),
        "registry_status": "available"
    }
    
    print(json.dumps(result))
except Exception as e:
    error_result = {
        "error": str(e),
        "models": [],
        "total_count": 0,
        "registry_status": "error"
    }
    print(json.dumps(error_result))
`;

      const pythonPath: string = '/Users/f/Library/CloudStorage/Dropbox/Projects/Inflection Group/be3/projects/ai-backends-py/venv/bin/python';
      
      return new Promise((resolve, reject) => {
        const pythonProcess = spawn(pythonPath, ['-c', pythonScript]);
        let stdout: string = '';
        let stderr: string = '';

        pythonProcess.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        pythonProcess.on('close', (code: number) => {
          if (code === 0) {
            try {
              const result = JSON.parse(stdout);
              if (result.error) {
                this.logger.error('MLflow Python client error:', result.error);
                reject(new InternalServerErrorException({
                  message: 'Failed to connect to MLflow registry',
                  details: result.error,
                  mlflow_url: 'http://localhost:5004',
                  recommendation: 'Ensure MLflow server is running and models are registered'
                }));
              } else {
                resolve(result);
              }
            } catch (parseError: unknown) {
              this.logger.error('Failed to parse MLflow response:', parseError);
              reject(new InternalServerErrorException({
                message: 'Failed to parse MLflow registry response',
                details: parseError instanceof Error ? parseError.message : 'Unknown parse error',
                stdout: stdout,
                stderr: stderr
              }));
            }
          } else {
            this.logger.error('Python process failed:', stderr);
            reject(new InternalServerErrorException({
              message: 'Failed to execute MLflow Python client',
              details: stderr,
              exit_code: code
            }));
          }
        });
      });
    } catch (error: unknown) {
      this.logger.error('Failed to list registered models via Python bridge', error);
      throw new InternalServerErrorException({
        message: 'Failed to access MLflow registry',
        details: error instanceof Error ? error.message : 'Unknown error',
        approach: 'Python subprocess bridge'
      });
    }
  }

  /**
   * Get specific model version details from MLflow registry
   * 
   * @param modelName - Name of the registered model
   * @param version - Model version (optional, defaults to latest)
   * @param stage - Model stage or alias (optional: None, Staging, Production, Archived, or alias name)
   * @returns Promise resolving to model version details
   */
  public async getModelVersion(
    modelName: string, 
    version?: string, 
    stage?: string
  ): Promise<MLflowModelVersionResponse> {
    try {
      // If version is specified, get specific version
      if (version) {
        const response: AxiosResponse = await firstValueFrom(
          this.httpService.get(`${this.mlflowUrl}/2.0/mlflow/model-versions/get`, {
            params: {
              name: modelName,
              version: version
            },
            timeout: 10000
          })
        );
        return response.data;
      }

      // Get model info to check for aliases and latest versions
      const modelResponse: AxiosResponse = await firstValueFrom(
        this.httpService.get(`${this.mlflowUrl}/2.0/mlflow/registered-models/get`, {
          params: { name: modelName },
          timeout: 10000
        })
      );

      const registeredModel = modelResponse.data.registered_model;
      if (!registeredModel) {
        throw new NotFoundException(`Model ${modelName} not found`);
      }

      // If stage/alias is specified, try to find version by alias or stage
      if (stage && stage !== 'None') {
        // First, check if it's an alias (case-insensitive)
        const aliases = registeredModel.aliases || [];
        const targetAlias = aliases.find((alias: { alias: string; version: string }) => 
          alias.alias.toLowerCase() === stage.toLowerCase()
        );
        
        if (targetAlias) {
          // Found alias, get that specific version
          const response: AxiosResponse = await firstValueFrom(
            this.httpService.get(`${this.mlflowUrl}/2.0/mlflow/model-versions/get`, {
              params: {
                name: modelName,
                version: targetAlias.version
              },
              timeout: 10000
            })
          );
          return response.data;
        }

        // If not found as alias, check latest_versions for stage match
        const modelVersions = registeredModel.latest_versions || [];
        const stageVersion = modelVersions.find((v: { current_stage?: string }) => 
          v.current_stage && v.current_stage.toLowerCase() === stage.toLowerCase()
        );
        
        if (stageVersion) {
          return { model_version: stageVersion };
        }

        // If no alias or stage found, throw specific error
        throw new NotFoundException(
          `No version found for model ${modelName} with stage/alias '${stage}'. ` +
          `Available aliases: ${aliases.map((a: { alias: string }) => a.alias).join(', ')} ` +
          `Available stages: ${modelVersions.map((v: { current_stage?: string }) => v.current_stage).join(', ')}`
        );
      }

      // Return latest version if no stage specified
      const modelVersions = registeredModel.latest_versions || [];
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

      // Get model version details to find artifact URI and actual version number
      const modelVersion = await this.getModelVersion(modelName, versionOrStage);
      const runId: string = modelVersion.model_version.run_id;
      const actualVersion: string = modelVersion.model_version.version;

      if (!runId) {
        throw new Error(`No run ID found for model ${modelUri}`);
      }

      if (!actualVersion) {
        throw new Error(`No version found for model ${modelUri}`);
      }

      // Get the download URI for the model version artifacts using actual version number
      const downloadUriResponse: AxiosResponse = await firstValueFrom(
        this.httpService.get(`${this.mlflowUrl}/2.0/mlflow/model-versions/get-download-uri`, {
          params: {
            name: modelName,
            version: actualVersion  // Use resolved version number instead of stage/alias
          },
          timeout: 10000
        })
      );

      const artifactUri: string = downloadUriResponse.data.artifact_uri;
      this.logger.log(`Retrieved artifact URI for ${modelUri}: ${artifactUri}`);

      // Try to download via MLflow artifacts API using the artifact URI
      // The artifact URI format is typically: mlflow-artifacts:/experiment_id/models/model_id/artifacts
      const artifactUriMatch = artifactUri.match(/mlflow-artifacts:\/(.+)/);
      
      if (artifactUriMatch) {
        const artifactPath = artifactUriMatch[1];
        
        // Download model.onnx from the artifact path
        const artifactResponse: AxiosResponse = await firstValueFrom(
          this.httpService.get(`${this.mlflowUrl}/2.0/mlflow-artifacts/artifacts/${artifactPath}/model.onnx`, {
            responseType: 'arraybuffer',
            timeout: 30000
          })
        );

        // Save downloaded model to cache
        fs.writeFileSync(cachedModelPath, Buffer.from(artifactResponse.data));
        this.logger.log(`Downloaded and cached model from MLflow: ${cachedModelPath}`);
        return cachedModelPath;
      }

      // Fallback: try direct run artifacts download 
      const runArtifactResponse: AxiosResponse = await firstValueFrom(
        this.httpService.get(`${this.mlflowUrl}/2.0/mlflow-artifacts/artifacts/experiments/${runId}/artifacts/onnx_model/model.onnx`, {
          responseType: 'arraybuffer',
          timeout: 30000
        })
      );

      // Save downloaded model to cache
      fs.writeFileSync(cachedModelPath, Buffer.from(runArtifactResponse.data));
      this.logger.log(`Downloaded and cached model from run artifacts: ${cachedModelPath}`);
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

      // Construct model name
      const modelName: string = `iris-classifier-${modelFormat}`;
      
      // Get model metadata first to resolve aliases to actual version numbers
      const modelVersion = await this.getModelVersion(modelName, version, stage);
      const actualVersion: string = modelVersion.model_version.version;
      
      // Construct model URI using resolved version number for consistent artifact access
      const modelUri: string = `models:/${modelName}/${actualVersion}`;
      
      // Load model and perform inference
      const session: ort.InferenceSession = await this.loadModelFromRegistry(modelUri);
      
      // Prepare input tensor - ONNX model expects float32 despite MLflow signature showing float64
      const inputArray: Float32Array = new Float32Array([
        request.sepal_length,
        request.sepal_width,
        request.petal_length,
        request.petal_width
      ]);

      const inputTensor: ort.Tensor = new ort.Tensor('float32', inputArray, [1, 4]);
      const startTime: number = Date.now();

      // Get input and output names dynamically from the ONNX model (like Python version)
      const inputName: string = session.inputNames[0];
      const outputNames: readonly string[] = session.outputNames;

      // Run inference with dynamic input name
      this.logger.log(`Running inference with input name: ${inputName}`);
      this.logger.log(`Input tensor shape: [${inputTensor.dims.join(', ')}], type: ${inputTensor.type}`);
      
      const outputs = await session.run({ [inputName]: inputTensor });
      const inferenceTime: number = Date.now() - startTime;
      
      this.logger.log(`Inference completed in ${inferenceTime}ms`);
      this.logger.log(`Type of outputs: ${typeof outputs}`);
      this.logger.log(`Outputs is null/undefined: ${outputs == null}`);

      // Process outputs - handle different output structures with comprehensive validation
      let probabilities: Float32Array;
      let predictedClassIndex: number;

      // Following the coding guidelines: Validate tensor objects before accessing properties
      const validateTensor = (tensor: ort.Tensor | undefined, tensorName: string): { isValid: boolean; error?: string } => {
        if (!tensor) {
          return { isValid: false, error: `${tensorName} tensor is undefined or null` };
        }
        if (!tensor.data) {
          return { isValid: false, error: `${tensorName} tensor.data property is undefined` };
        }
        if (!tensor.dims || !Array.isArray(tensor.dims)) {
          return { isValid: false, error: `${tensorName} tensor.dims property is invalid` };
        }
        return { isValid: true };
      };

      // Handle tensor-only ONNX model outputs (using proper onnxruntime-node patterns)
      this.logger.log(`Available output names: ${outputNames.join(', ')}`);
      this.logger.log(`Actual output keys: ${Object.keys(outputs).join(', ')}`);
      
      // Validate outputs object first
      if (!outputs || typeof outputs !== 'object') {
        throw new Error('Session.run returned invalid outputs object');
      }
      
      // Try accessing outputs by expected names first
      let labelTensor: ort.Tensor | null = null;
      let probabilityTensor: ort.Tensor | null = null;
      
      // Check for 'label' and 'probabilities' outputs
      const labelOutput = outputs['label'] as ort.Tensor;
      const probabilityOutput = outputs['probabilities'] as ort.Tensor;
      
      if (labelOutput && probabilityOutput) {
        const labelValidation = validateTensor(labelOutput, 'label');
        const probValidation = validateTensor(probabilityOutput, 'probabilities');
        
        if (labelValidation.isValid && probValidation.isValid) {
          labelTensor = labelOutput;
          probabilityTensor = probabilityOutput;
          this.logger.log('Using direct output name access: label, probabilities');
        } else {
          this.logger.warn(`Direct name access validation failed: ${labelValidation.error ?? probValidation.error}`);
        }
      }
      
      // Fallback to output name indices if direct access failed
      if (!labelTensor || !probabilityTensor) {
        if (outputNames.length < 2) {
          throw new Error(`Model must have at least 2 outputs, found ${outputNames.length}: ${outputNames.join(', ')}`);
        }
        
        const fallbackLabelOutput = outputs[outputNames[0]] as ort.Tensor;
        const fallbackProbOutput = outputs[outputNames[1]] as ort.Tensor;
        
        const fallbackLabelValidation = validateTensor(fallbackLabelOutput, `output[${outputNames[0]}]`);
        const fallbackProbValidation = validateTensor(fallbackProbOutput, `output[${outputNames[1]}]`);
        
        if (fallbackLabelValidation.isValid && fallbackProbValidation.isValid) {
          labelTensor = fallbackLabelOutput;
          probabilityTensor = fallbackProbOutput;
          this.logger.log(`Using fallback output access by index: ${outputNames[0]}, ${outputNames[1]}`);
        } else {
          throw new Error(`All tensor validation failed. Label: ${fallbackLabelValidation.error}, Prob: ${fallbackProbValidation.error}`);
        }
      }
      
      // At this point, we have validated tensors - safe to access their data
      try {
        // Log tensor details for debugging
        this.logger.log(`Label tensor: type=${labelTensor.type}, shape=[${labelTensor.dims.join(', ')}], data_length=${labelTensor.data.length}`);
        this.logger.log(`Probability tensor: type=${probabilityTensor.type}, shape=[${probabilityTensor.dims.join(', ')}], data_length=${probabilityTensor.data.length}`);
        
        // Extract predicted class index with comprehensive type handling
        const rawPrediction = labelTensor.data[0];
        if (rawPrediction === undefined || rawPrediction === null) {
          throw new Error('Label tensor data[0] is undefined or null');
        }
        
        predictedClassIndex = typeof rawPrediction === 'bigint' 
          ? Number(rawPrediction) 
          : Math.floor(rawPrediction as number);
        
        // Validate predicted class index
        if (isNaN(predictedClassIndex) || predictedClassIndex < 0) {
          throw new Error(`Invalid predicted class index: ${predictedClassIndex}`);
        }
        
        // Extract probabilities with validation
        const probabilityData = probabilityTensor.data;
        if (!probabilityData || probabilityData.length === 0) {
          throw new Error('Probability tensor data is empty or undefined');
        }
        
        probabilities = probabilityData as Float32Array;
        
        // Validate probabilities array
        if (probabilities.length === 0) {
          throw new Error('Probabilities array is empty');
        }
        
      } catch (dataAccessError: unknown) {
        const errorMessage = dataAccessError instanceof Error ? dataAccessError.message : 'Unknown tensor data access error';
        this.logger.error('Tensor data access failed:', errorMessage);
        throw new Error(`Tensor data access failed: ${errorMessage}`);
      }
      
      this.logger.log(`Predicted class index: ${predictedClassIndex}`);
      this.logger.log(`Probabilities: [${Array.from(probabilities).map(p => p.toFixed(4)).join(', ')}]`);
      
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