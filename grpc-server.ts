import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as ort from 'onnxruntime-node';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Standalone gRPC server for Iris classification using ONNX Runtime
 * 
 * Following the coding guidelines: Comprehensive error handling,
 * proper TypeScript typing, and production-ready logging
 */

// Load the protobuf definition
const PROTO_PATH: string = path.join(__dirname, 'proto', 'inference.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const inferenceProto = grpc.loadPackageDefinition(packageDefinition).inference as any;

// ONNX model path
const MODEL_PATH: string = path.join(__dirname, 'models', 'iris_classifier.onnx');

// Global ONNX inference session
let inferenceSession: ort.InferenceSession | null = null;

// Iris class names
const CLASS_NAMES: string[] = ['setosa', 'versicolor', 'virginica'];

/**
 * Load and initialize the ONNX model
 */
async function initializeModel(): Promise<void> {
  try {
    if (!fs.existsSync(MODEL_PATH)) {
      throw new Error(`ONNX model not found at path: ${MODEL_PATH}`);
    }

    console.log(`Loading ONNX model from: ${MODEL_PATH}`);
    inferenceSession = await ort.InferenceSession.create(MODEL_PATH);
    console.log('ONNX model loaded successfully');
    console.log('Input names:', inferenceSession.inputNames);
    console.log('Output names:', inferenceSession.outputNames);
  } catch (error: unknown) {
    console.error('Failed to load ONNX model:', error);
    process.exit(1);
  }
}

/**
 * Perform Iris classification inference
 */
async function performInference(features: number[]): Promise<{
  predictedClass: number;
  className: string;
  probabilities: number[];
  confidence: number;
}> {
  if (!inferenceSession) {
    throw new Error('ONNX model not initialized');
  }

  try {
    // Prepare input tensor (1x4 float32 array)
    const inputTensor = new ort.Tensor('float32', features, [1, 4]);
    const feeds: Record<string, ort.Tensor> = {};
    feeds[inferenceSession.inputNames[0]] = inputTensor;

    // Run inference
    const startTime: number = Date.now();
    const results = await inferenceSession.run(feeds);
    const inferenceTime: number = Date.now() - startTime;

    // Extract predictions and probabilities
    const outputTensor = results[inferenceSession.outputNames[0]];
    const probabilities = Array.from(outputTensor.data as Float32Array);
    
    // Find predicted class (highest probability)
    const predictedClass: number = probabilities.indexOf(Math.max(...probabilities));
    const className: string = CLASS_NAMES[predictedClass];
    const confidence: number = Math.max(...probabilities);

    console.log(`Inference completed in ${inferenceTime}ms - Predicted: ${className} (${confidence.toFixed(4)})`);

    return {
      predictedClass,
      className,
      probabilities,
      confidence
    };
  } catch (error: unknown) {
    console.error('Inference error:', error);
    throw new Error(`Inference failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * gRPC service implementation for Iris classification
 */
const inferenceServiceImpl = {
  classify: async (call: any, callback: any): Promise<void> => {
    try {
      const request = call.request;
      console.log('Received classification request:', request);

      // Validate input features
      const features: number[] = [
        request.sepal_length,
        request.sepal_width,
        request.petal_length,
        request.petal_width
      ];

      // Validate feature ranges (basic biological constraints)
      for (const feature of features) {
        if (typeof feature !== 'number' || isNaN(feature) || feature < 0 || feature > 20) {
          const error = new Error(`Invalid feature value: ${feature}. Must be a number between 0 and 20.`);
          return callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: error.message
          });
        }
      }

      // Perform inference
      const startTime: number = Date.now();
      const result = await performInference(features);
      const totalTime: number = Date.now() - startTime;

      // Prepare response
      const response = {
        predicted_class: result.predictedClass,
        class_name: result.className,
        probabilities: result.probabilities,
        confidence: result.confidence,
        model_info: `ONNX RandomForest Classifier (${CLASS_NAMES.length} classes)`,
        inference_time_ms: totalTime
      };

      console.log('Sending response:', response);
      callback(null, response);
    } catch (error: unknown) {
      console.error('Classification error:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }
};

/**
 * Start the gRPC server
 */
async function startServer(): Promise<void> {
  try {
    // Initialize ONNX model first
    await initializeModel();

    // Create gRPC server
    const server = new grpc.Server();

    // Add the inference service
    server.addService(inferenceProto.InferenceService.service, inferenceServiceImpl);

    // Bind server to port
    const port: string = '0.0.0.0:50051';
    server.bindAsync(port, grpc.ServerCredentials.createInsecure(), (error: Error | null, port: number) => {
      if (error) {
        console.error('Failed to bind gRPC server:', error);
        process.exit(1);
      }

      console.log(`gRPC server started on port ${port}`);
      console.log('Service: InferenceService');
      console.log('Method: Classify');
      console.log('Ready to receive requests...');

      // Start the server
      server.start();
    });

    // Graceful shutdown handling
    process.on('SIGINT', () => {
      console.log('\nReceived SIGINT, shutting down gracefully...');
      server.tryShutdown((error?: Error) => {
        if (error) {
          console.error('Error during server shutdown:', error);
          process.exit(1);
        }
        console.log('gRPC server shut down successfully');
        process.exit(0);
      });
    });

  } catch (error: unknown) {
    console.error('Failed to start gRPC server:', error);
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  console.log('Starting gRPC Inference Server...');
  console.log('Model:', MODEL_PATH);
  console.log('Proto:', PROTO_PATH);
  startServer().catch((error: unknown) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { startServer };