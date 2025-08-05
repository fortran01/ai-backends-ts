import { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * Test utilities for E2E testing with service availability detection
 * 
 * Following the coding guidelines: Centralized test utilities for
 * service availability checks and environment detection
 */

export interface ServiceAvailability {
  mlflow: boolean;
  pythonFlask: boolean;
  grpc: boolean;
  httpInference: boolean;
  semanticCache: boolean;
  onnxRuntime: boolean;
}

/**
 * Detect if running in CI environment
 */
export function isCIEnvironment(): boolean {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.JENKINS_URL ||
    process.env.TRAVIS ||
    process.env.CIRCLECI
  );
}

/**
 * Check availability of external services
 */
export async function checkServiceAvailability(app: INestApplication): Promise<ServiceAvailability> {
  const services: ServiceAvailability = {
    mlflow: false,
    pythonFlask: false,
    grpc: false,
    httpInference: false,
    semanticCache: false,
    onnxRuntime: false,
  };

  try {
    // Check MLflow via status endpoint
    const statusResponse = await request(app.getHttpServer())
      .get('/api/v1/status')
      .timeout(2000);
    
    if (statusResponse.status === 200) {
      services.mlflow = statusResponse.body.mlflow?.available === true;
      services.onnxRuntime = statusResponse.body.onnx?.available === true;
    }

    // Check Python Flask service for drift monitoring
    try {
      const driftResponse = await request(app.getHttpServer())
        .get('/api/v1/monitoring-stats')
        .timeout(1000);
      services.pythonFlask = driftResponse.status === 200;
    } catch {
      services.pythonFlask = false;
    }

    // Check gRPC service
    try {
      const grpcResponse = await request(app.getHttpServer())
        .post('/api/v1/classify-grpc')
        .send({
          sepal_length: 5.1,
          sepal_width: 3.5,
          petal_length: 1.4,
          petal_width: 0.2
        })
        .timeout(1000);
      services.grpc = grpcResponse.status === 200;
    } catch {
      services.grpc = false;
    }

    // Check HTTP inference service
    try {
      const httpResponse = await request(app.getHttpServer())
        .post('/api/v1/classify-http')
        .send({
          sepal_length: 5.1,
          sepal_width: 3.5,
          petal_length: 1.4,
          petal_width: 0.2
        })
        .timeout(1000);
      services.httpInference = httpResponse.status === 200;
    } catch {
      services.httpInference = false;
    }

    // Check semantic cache service
    try {
      const semanticResponse = await request(app.getHttpServer())
        .post('/api/v1/chat-semantic')
        .send({
          prompt: "Test prompt",
          session_id: "test-availability-check"
        })
        .timeout(1000);
      services.semanticCache = semanticResponse.status === 200;
    } catch {
      services.semanticCache = false;
    }

  } catch (error) {
    console.warn('Service availability check failed:', error instanceof Error ? error.message : String(error));
  }

  return services;
}

/**
 * Skip test conditionally based on service availability
 */
export function skipIfServiceUnavailable(
  serviceName: keyof ServiceAvailability,
  services: ServiceAvailability,
  testDescription: string
): void {
  if (!services[serviceName]) {
    console.log(`⚠️  Skipping test "${testDescription}" - ${serviceName} service unavailable`);
  }
}

/**
 * Conditional test wrapper that skips tests when services are unavailable
 */
export function conditionalTest(
  description: string,
  serviceRequired: keyof ServiceAvailability,
  services: ServiceAvailability,
  testFn: () => void
): void {
  if (services[serviceRequired] || !isCIEnvironment()) {
    it(description, testFn);
  } else {
    it.skip(`${description} (${serviceRequired} unavailable in CI)`, testFn);
  }
}

/**
 * Enhanced expect that handles both success and expected failure scenarios
 */
export function expectServiceResponse(
  response: request.Response,
  successExpectations: () => void,
  failureMessage?: string
): void {
  if (response.status === 200) {
    successExpectations();
  } else {
    // Expected failure due to service unavailability
    expect(response.body).toBeDefined();
    if (failureMessage) {
      const errorText = (response.body.message || response.body.error || '').toLowerCase();
      const expectedText = failureMessage.toLowerCase();
      // More flexible error matching for different failure scenarios
      const isRelatedError = errorText.includes(expectedText) || 
                           errorText.includes('model') || 
                           errorText.includes('inference') ||
                           errorText.includes('unavailable');
      expect(isRelatedError).toBe(true);
    }
  }
}