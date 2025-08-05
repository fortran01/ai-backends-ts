import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { InferenceController } from './inference.controller';
import { InferenceService } from './inference.service';
import { OllamaService } from './services/ollama.service';
import { SecurityService } from './services/security.service';
import { OnnxService } from './services/onnx.service';
import { MemoryService } from './services/memory.service';
import { GrpcService } from './services/grpc.service';
import { HttpInferenceService } from './services/http.service';
import { SemanticCacheService } from './services/semantic-cache.service';
import { DriftMonitoringService } from './services/drift-monitoring.service';
import { MlflowService } from './services/mlflow.service';

/**
 * Inference module containing all model serving functionality
 * 
 * Following the coding guidelines: Proper module organization
 * with dependency injection for all services
 */
@Module({
  imports: [
    HttpModule.register({
      timeout: 30000, // 30 second timeout for Ollama API calls
      maxRedirects: 5,
    }),
    CacheModule.register({
      ttl: 3600000, // 1 hour TTL in milliseconds
      max: 1000, // Maximum number of items to store
      isGlobal: false, // Module-specific cache
    }),
  ],
  controllers: [InferenceController],
  providers: [
    InferenceService,
    OllamaService,
    SecurityService,
    OnnxService,
    MemoryService,
    GrpcService,
    HttpInferenceService,
    SemanticCacheService,
    DriftMonitoringService,
    MlflowService,
  ],
  exports: [
    InferenceService, // Export for use in other modules if needed
    SemanticCacheService, // Export for use in other modules if needed
  ],
})
export class InferenceModule {}