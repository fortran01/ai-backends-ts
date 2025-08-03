import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { InferenceController } from './inference.controller';
import { InferenceService } from './inference.service';
import { OllamaService } from './services/ollama.service';
import { SecurityService } from './services/security.service';
import { OnnxService } from './services/onnx.service';
import { MemoryService } from './services/memory.service';
import { GrpcService } from './services/grpc.service';

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
  ],
  controllers: [InferenceController],
  providers: [
    InferenceService,
    OllamaService,
    SecurityService,
    OnnxService,
    MemoryService,
    GrpcService,
  ],
  exports: [
    InferenceService, // Export for use in other modules if needed
  ],
})
export class InferenceModule {}