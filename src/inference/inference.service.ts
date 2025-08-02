import { Injectable, BadRequestException } from '@nestjs/common';
import { OllamaService } from './services/ollama.service';
import { SecurityService } from './services/security.service';
import { OnnxService } from './services/onnx.service';
import { 
  GenerateRequestDto, 
  GenerateResponseDto, 
  SecureGenerateResponseDto 
} from './dto/generate.dto';
import { 
  ClassifyRequestDto, 
  ClassifyResponseDto 
} from './dto/classify.dto';

/**
 * Main inference service coordinating model operations
 * 
 * Following the coding guidelines: Orchestrates different inference
 * services with proper error handling and security measures
 */
@Injectable()
export class InferenceService {
  constructor(
    private readonly ollamaService: OllamaService,
    private readonly securityService: SecurityService,
    private readonly onnxService: OnnxService
  ) {}

  /**
   * Generate text using Ollama with basic validation
   * 
   * @param request - Generation request with prompt
   * @returns Generated text response
   */
  async generateText(request: GenerateRequestDto): Promise<GenerateResponseDto> {
    return this.ollamaService.generateText(request);
  }

  /**
   * Generate text with comprehensive security analysis and protection
   * 
   * @param request - Generation request with prompt
   * @returns Generated text response with security analysis
   * @throws BadRequestException if prompt is deemed too risky
   */
  async generateTextSecure(request: GenerateRequestDto): Promise<SecureGenerateResponseDto> {
    // Perform security analysis
    const securityAnalysis = this.securityService.analyzePrompt(request);
    
    // Block high-risk prompts
    if (this.securityService.shouldBlockPrompt(
      securityAnalysis.detectedPatterns, 
      securityAnalysis.riskLevel
    )) {
      throw new BadRequestException({
        message: 'Prompt blocked due to security concerns',
        security_analysis: {
          detected_patterns: securityAnalysis.detectedPatterns,
          original_length: securityAnalysis.originalLength,
          sanitized_length: securityAnalysis.sanitizedLength,
          risk_level: securityAnalysis.riskLevel,
          sanitization_applied: securityAnalysis.sanitizationApplied
        },
        statusCode: 400
      });
    }

    // Create secure prompt template
    const securePrompt: string = this.securityService.createSecurePrompt(
      securityAnalysis.sanitizedPrompt
    );

    // Generate text with sanitized/templated prompt
    const sanitizedRequest: GenerateRequestDto = {
      prompt: securePrompt
    };

    const response: GenerateResponseDto = await this.ollamaService.generateText(sanitizedRequest);

    // Return response with security analysis
    return {
      ...response,
      security_analysis: {
        detected_patterns: securityAnalysis.detectedPatterns,
        original_length: securityAnalysis.originalLength,
        sanitized_length: securityAnalysis.sanitizedLength,
        risk_level: securityAnalysis.riskLevel,
        sanitization_applied: securityAnalysis.sanitizationApplied
      }
    };
  }

  /**
   * Classify Iris species using ONNX model
   * 
   * @param request - Classification request with Iris features
   * @returns Comprehensive classification results
   */
  async classifyIris(request: ClassifyRequestDto): Promise<ClassifyResponseDto> {
    return this.onnxService.classifyIris(request);
  }

  /**
   * Get service status for health checks
   * 
   * @returns Service status information
   */
  async getServiceStatus(): Promise<Record<string, any>> {
    const [ollamaAvailable, onnxReady] = await Promise.all([
      this.ollamaService.isServiceAvailable(),
      Promise.resolve(this.onnxService.isModelReady())
    ]);

    return {
      ollama: {
        available: ollamaAvailable,
        endpoint: 'http://localhost:11434'
      },
      onnx: {
        ready: onnxReady,
        model_info: this.onnxService.getModelInfo()
      }
    };
  }
}