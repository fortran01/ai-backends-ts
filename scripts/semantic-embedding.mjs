/**
 * Standalone ES module script for semantic embeddings using @xenova/transformers
 * 
 * This script runs as a separate process to handle ES module compatibility
 * and prevent potential crashes from affecting the main application.
 * 
 * Usage: node scripts/semantic-embedding.mjs "text to embed" "model-name"
 */

import { pipeline, env } from '@xenova/transformers';

let pipelineInstance = null;

/**
 * Initialize the transformer pipeline
 * 
 * @param {string} modelName - Name of the model to load
 * @returns {Promise<void>}
 */
async function initializePipeline(modelName) {
  if (pipelineInstance) {
    return;
  }

  try {
    // Configure environment for Node.js
    env.allowLocalModels = false;
    env.cacheDir = './.cache';
    
    console.error(`Loading transformer model: ${modelName}`);
    
    // Initialize pipeline
    pipelineInstance = await pipeline('feature-extraction', modelName, {
      quantized: false,
    });
    
    console.error('Transformer pipeline initialized successfully');
  } catch (error) {
    console.error('Failed to initialize transformer pipeline:', error.message);
    process.exit(1);
  }
}

/**
 * Generate embedding for text
 * 
 * @param {string} text - Input text to generate embedding for
 * @returns {Promise<number[]>} - Vector embedding
 */
async function generateEmbedding(text) {
  if (!pipelineInstance) {
    throw new Error('Pipeline not initialized');
  }

  const output = await pipelineInstance(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Main function to handle command line execution
 */
async function main() {
  try {
    const args = process.argv.slice(2);
    
    if (args.length !== 2) {
      console.error('Usage: node semantic-embedding.mjs "text to embed" "model-name"');
      process.exit(1);
    }
    
    const [text, modelName] = args;
    
    // Initialize pipeline
    await initializePipeline(modelName);
    
    // Generate embedding
    const embedding = await generateEmbedding(text);
    
    // Output embedding as JSON to stdout
    console.log(JSON.stringify({
      success: true,
      embedding: embedding,
      length: embedding.length
    }));
    
  } catch (error) {
    // Output error as JSON to stdout
    console.log(JSON.stringify({
      success: false,
      error: error.message
    }));
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  process.exit(0);
});

process.on('SIGINT', () => {
  process.exit(0);
});

// Run main function
main().catch((error) => {
  console.log(JSON.stringify({
    success: false,
    error: error.message
  }));
  process.exit(1);
});