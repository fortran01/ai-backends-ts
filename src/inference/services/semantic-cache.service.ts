import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

/**
 * Interface for cached response entries
 * 
 * Following the coding guidelines: Explicit type annotations
 */
interface CachedResponse {
  embedding: number[]; // Vector embedding from transformer model
  response: string;
  timestamp: number;
  prompt: string;
  similarity?: number;
}

/**
 * Interface for semantic cache statistics
 * 
 * Following the coding guidelines: Explicit type annotations
 */
interface SemanticCacheStats {
  hit: boolean;
  similarity: number;
  responseTime: number;
  cacheSize: number;
  threshold: number;
}

/**
 * Semantic Cache Service for LLM responses using transformer embeddings
 * 
 * This service implements semantic caching by:
 * 1. Converting prompts to vector embeddings using @xenova/transformers
 * 2. Storing embeddings and responses in memory cache
 * 3. Finding semantically similar prompts using cosine similarity
 * 4. Returning cached responses for similar prompts above threshold
 * 
 * Uses Xenova/all-MiniLM-L6-v2 model for generating embeddings
 * Following the coding guidelines: Comprehensive documentation
 */
@Injectable()
export class SemanticCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(SemanticCacheService.name);
  private cache: Map<string, CachedResponse> = new Map();
  private transformerAvailable: boolean = false;
  private readonly similarityThreshold: number = 0.85; // Higher threshold for transformer embeddings
  private readonly maxCacheSize: number = 1000;
  private readonly ttlMs: number = 3600000; // 1 hour
  private readonly modelName: string = 'Xenova/all-MiniLM-L6-v2';
  private readonly scriptPath: string = path.join(process.cwd(), 'scripts', 'semantic-embedding.mjs');

  /**
   * Generate embedding using child process
   * Uses child process to isolate ES module compatibility issues
   * 
   * @param text - Input text to generate embedding for
   * @returns Promise<number[]> - Vector embedding
   * 
   * Following the coding guidelines: Comprehensive error handling
   */
  private async generateEmbeddingWithChildProcess(text: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      // Spawn child process with ES module script
      const childProcess: ChildProcess = spawn('node', [
        this.scriptPath,
        text,
        this.modelName
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      // Collect stdout data
      childProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      // Collect stderr data
      childProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Handle process completion
      childProcess.on('close', (code: number | null) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim());
            if (result.success && result.embedding) {
              this.transformerAvailable = true;
              resolve(result.embedding);
            } else {
              reject(new Error(result.error || 'Unknown embedding error'));
            }
          } catch (parseError: unknown) {
            reject(new Error(`Failed to parse embedding result: ${parseError}`));
          }
        } else {
          this.transformerAvailable = false;
          reject(new Error(`Child process failed with code ${code}: ${stderr}`));
        }
      });

      // Handle process errors
      childProcess.on('error', (error: Error) => {
        this.transformerAvailable = false;
        reject(new Error(`Child process error: ${error.message}`));
      });

      // Set timeout for process
      setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill('SIGTERM');
          reject(new Error('Child process timeout'));
        }
      }, 30000); // 30 second timeout
    });
  }

  /**
   * Convert text to vector embedding using child process
   * Falls back to simple text-based approach if child process fails
   * 
   * @param text - Input text to convert to embedding
   * @returns Promise<number[]> - Vector embedding
   * 
   * Following the coding guidelines: Type hints for parameters and return values
   */
  private async getEmbedding(text: string): Promise<number[]> {
    try {
      // Use child process for transformer embeddings
      const embedding = await this.generateEmbeddingWithChildProcess(text);
      this.logger.log(`Generated transformer embedding with ${embedding.length} dimensions`);
      return embedding;
    } catch (error: unknown) {
      this.logger.warn('Child process embedding failed, falling back to text-based approach:', error);
      // Fallback to simple text-based embedding if child process fails
      return this.getTextBasedEmbedding(text);
    }
  }

  /**
   * Fallback text-based embedding using TF-IDF approach
   * Used when transformer model is unavailable or crashes
   * 
   * @param text - Input text to convert to embedding
   * @returns number[] - Text-based embedding vector
   */
  private getTextBasedEmbedding(text: string): number[] {
    // Simple word frequency approach as fallback
    const words: string[] = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
    
    // Create a fixed-size embedding (384 dimensions to match transformer model)
    const embedding: number[] = new Array(384).fill(0);
    
    // Simple hash-based feature mapping
    words.forEach(word => {
      const hash: number = this.simpleHash(word) % 384;
      embedding[hash] += 1;
    });
    
    // Normalize the vector
    return this.normalizeVector(embedding);
  }

  /**
   * Simple hash function for text-based embedding fallback
   * 
   * @param str - String to hash
   * @returns number - Hash value
   */
  private simpleHash(str: string): number {
    let hash: number = 0;
    for (let i = 0; i < str.length; i++) {
      const char: number = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }


  /**
   * Normalize a vector to unit length
   * 
   * @param vector - Input vector to normalize
   * @returns number[] - Normalized vector
   */
  private normalizeVector(vector: number[]): number[] {
    const magnitude: number = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
  }

  /**
   * Calculate cosine similarity between two vectors
   * 
   * @param a - First embedding vector
   * @param b - Second embedding vector
   * @returns number - Cosine similarity score (0-1)
   * 
   * Following the coding guidelines: Explicit type annotations
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct: number = 0;
    let normA: number = 0;
    let normB: number = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const similarity: number = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return Math.max(0, Math.min(1, similarity)); // Clamp to [0, 1]
  }

  /**
   * Clean expired entries from cache
   * 
   * Following the coding guidelines: Proper resource management
   */
  private cleanExpiredEntries(): void {
    const now: number = Date.now();
    const expired: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      this.cache.delete(key);
    }
  }

  /**
   * Find the most similar cached response for a given prompt
   * 
   * @param prompt - Input prompt to find similar cache entry for
   * @returns Promise<CachedResponse | null> - Most similar cached response or null
   * 
   * Following the coding guidelines: Comprehensive error handling
   */
  public async findSimilarResponse(prompt: string): Promise<CachedResponse | null> {
    if (!prompt || prompt.trim().length === 0) {
      return null;
    }

    this.cleanExpiredEntries();

    if (this.cache.size === 0) {
      return null;
    }

    try {
      const queryEmbedding: number[] = await this.getEmbedding(prompt);
      let bestMatch: CachedResponse | null = null;
      let bestSimilarity: number = 0;

      for (const entry of this.cache.values()) {
        const similarity: number = this.cosineSimilarity(queryEmbedding, entry.embedding);
        
        if (similarity > bestSimilarity && similarity >= this.similarityThreshold) {
          bestSimilarity = similarity;
          bestMatch = { ...entry, similarity };
        }
      }

      if (bestMatch) {
        this.logger.log(`Semantic cache hit: similarity=${bestSimilarity.toFixed(3)} for prompt="${prompt.substring(0, 50)}..."`);
      }

      return bestMatch;
    } catch (error: unknown) {
      this.logger.error('Error finding similar response:', error);
      return null;
    }
  }

  /**
   * Cache a new prompt-response pair with its embedding
   * 
   * @param prompt - Original prompt
   * @param response - Generated response
   * @returns Promise<void>
   * 
   * Following the coding guidelines: Proper async handling
   */
  public async cacheResponse(prompt: string, response: string): Promise<void> {
    if (!prompt || !response || prompt.trim().length === 0 || response.trim().length === 0) {
      return;
    }

    try {
      const embedding: number[] = await this.getEmbedding(prompt);
      const cacheKey: string = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      // Implement LRU eviction if cache is full
      if (this.cache.size >= this.maxCacheSize) {
        const oldestKey: string | undefined = this.cache.keys().next().value;
        if (oldestKey) {
          this.cache.delete(oldestKey);
          this.logger.log('Evicted oldest cache entry due to size limit');
        }
      }

      const cacheEntry: CachedResponse = {
        embedding,
        response,
        timestamp: Date.now(),
        prompt,
      };

      this.cache.set(cacheKey, cacheEntry);
      this.logger.log(`Cached response for prompt="${prompt.substring(0, 50)}..." (cache size: ${this.cache.size})`);
    } catch (error: unknown) {
      this.logger.error('Error caching response:', error);
      // Continue without caching to avoid breaking the main flow
    }
  }

  /**
   * Get semantic cache statistics
   * 
   * @param hit - Whether there was a cache hit
   * @param similarity - Similarity score of the match
   * @param responseTime - Response time in milliseconds
   * @returns SemanticCacheStats - Cache statistics object
   * 
   * Following the coding guidelines: Detailed documentation
   */
  public getCacheStats(hit: boolean, similarity: number, responseTime: number): SemanticCacheStats {
    return {
      hit,
      similarity,
      responseTime,
      cacheSize: this.cache.size,
      threshold: this.similarityThreshold,
    };
  }

  /**
   * Clear all cached entries
   * Primarily used for testing and maintenance
   * 
   * Following the coding guidelines: Clear method documentation
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get current cache size
   * 
   * @returns number - Number of cached entries
   */
  public getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Get model information for status reporting
   * 
   * @returns object - Model status and configuration
   */
  public getModelInfo(): { available: boolean; model: string; cacheSize: number; threshold: number } {
    return {
      available: this.transformerAvailable,
      model: this.modelName,
      cacheSize: this.cache.size,
      threshold: this.similarityThreshold
    };
  }

  /**
   * Cleanup resources on module destroy
   * 
   * Following the coding guidelines: Proper resource cleanup
   */
  public onModuleDestroy(): void {
    this.logger.log('SemanticCacheService shutting down');
    // No active resources to clean up with child process approach
  }
}