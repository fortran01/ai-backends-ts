import express from 'express';
import * as ort from 'onnxruntime-node';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Standalone HTTP server for Iris classification using ONNX Runtime
 * 
 * Following the coding guidelines: Comprehensive error handling,
 * proper TypeScript typing, and production-ready logging
 */

// Express app setup
const app = express();
app.use(express.json());

// ONNX model path
const MODEL_PATH: string = path.join(__dirname, 'models', 'iris_classifier_improved.onnx');

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

    // Extract predictions and probabilities from improved model
    // Output 0: label (class index), Output 1: probabilities (array)
    const labelOutput = results[inferenceSession.outputNames[0]];
    const probabilityOutput = results[inferenceSession.outputNames[1]];
    
    // Get predicted class index (convert BigInt to number if needed)
    const rawPrediction = labelOutput.data[0];
    const predictedClass: number = typeof rawPrediction === 'bigint' 
      ? Number(rawPrediction) 
      : Math.floor(rawPrediction as number);
    const className: string = CLASS_NAMES[predictedClass];
    
    // Get probabilities from second output
    const probabilities: number[] = Array.from(probabilityOutput.data as Float32Array);
    const confidence: number = Math.max(...probabilities);

    console.log(`HTTP Inference completed in ${inferenceTime}ms - Predicted: ${className} (${confidence.toFixed(4)})`);

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
 * Health check endpoint
 */
app.get('/health', (req: express.Request, res: express.Response) => {
  res.json({
    status: 'healthy',
    service: 'HTTP Inference Server',
    model: 'iris_classifier_improved.onnx',
    modelLoaded: inferenceSession !== null,
    timestamp: new Date().toISOString()
  });
});

/**
 * Classification endpoint
 */
app.post('/classify', async (req: express.Request, res: express.Response) => {
  try {
    const { sepal_length, sepal_width, petal_length, petal_width } = req.body;

    // Validate input features
    const features: number[] = [sepal_length, sepal_width, petal_length, petal_width];

    // Validate feature ranges (basic biological constraints)
    for (const feature of features) {
      if (typeof feature !== 'number' || isNaN(feature) || feature < 0 || feature > 20) {
        return res.status(400).json({
          error: `Invalid feature value: ${feature}. Must be a number between 0 and 20.`,
          code: 'INVALID_INPUT'
        });
      }
    }

    // Perform inference
    const startTime: number = Date.now();
    const result = await performInference(features);
    const totalTime: number = Date.now() - startTime;

    // Prepare response
    const response = {
      predicted_class: result.className,
      predicted_class_index: result.predictedClass,
      class_names: CLASS_NAMES,
      probabilities: result.probabilities,
      confidence: result.confidence,
      model_info: {
        format: 'HTTP/ONNX',
        version: '1.0',
        inference_time_ms: totalTime
      },
      input_features: {
        sepal_length,
        sepal_width,
        petal_length,
        petal_width
      }
    };

    console.log('Sending HTTP response:', response);
    res.json(response);
  } catch (error: unknown) {
    console.error('Classification error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
      code: 'INFERENCE_ERROR'
    });
  }
});

/**
 * Start the HTTP server
 */
async function startServer(): Promise<void> {
  try {
    // Initialize ONNX model first
    await initializeModel();

    // Start HTTP server
    const port: number = 3001;
    app.listen(port, '0.0.0.0', () => {
      console.log(`HTTP Inference Server started on port ${port}`);
      console.log('Endpoints:');
      console.log('  GET  /health - Health check');
      console.log('  POST /classify - Iris classification');
      console.log('Ready to receive requests...');
    });

    // Graceful shutdown handling
    process.on('SIGINT', () => {
      console.log('\nReceived SIGINT, shutting down gracefully...');
      process.exit(0);
    });

  } catch (error: unknown) {
    console.error('Failed to start HTTP server:', error);
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  console.log('Starting HTTP Inference Server...');
  console.log('Model:', MODEL_PATH);
  startServer().catch((error: unknown) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { startServer };