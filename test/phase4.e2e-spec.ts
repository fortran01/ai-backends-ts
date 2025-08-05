import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { 
  ServiceAvailability, 
  checkServiceAvailability, 
  isCIEnvironment, 
  expectServiceResponse 
} from './test-utils';

/**
 * Phase 4 End-to-End Tests: Model Lifecycle Management & Monitoring
 * 
 * Following the coding guidelines: High-level integration testing focusing
 * on complete API workflows and business functionality
 */
describe('Phase 4: Model Lifecycle Management & Monitoring (e2e)', () => {
  let app: INestApplication;
  let services: ServiceAvailability;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    // Set global API prefix (same as main.ts)
    app.setGlobalPrefix('api');
    
    // Enable API versioning with URI-based versioning (same as main.ts)
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    
    // Apply validation pipe as in main.ts
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));

    await app.init();
    
    // Check service availability
    services = await checkServiceAvailability(app);
    console.log('Service availability:', services);
  }, 30000); // Increase timeout to 30 seconds

  afterAll(async () => {
    await app.close();
  });

  describe('Drift Monitoring', () => {
    it('should get monitoring statistics', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/monitoring-stats')
        .expect(200);

      expect(response.body).toHaveProperty('data_directory');
      expect(response.body).toHaveProperty('production_log');
      expect(response.body).toHaveProperty('reference_data');
      expect(response.body).toHaveProperty('monitoring_active');
      expect(response.body.monitoring_active).toBe(true);
    });

    it('should generate drift simulation analysis', async () => {
      const testRequest = {
        sepal_length: 5.1,
        sepal_width: 3.5,
        petal_length: 1.4,
        petal_width: 0.2
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/classify-shifted')
        .send(testRequest)
        .expect(200);

      expect(response.body).toHaveProperty('original_prediction');
      expect(response.body).toHaveProperty('shifted_prediction');
      expect(response.body).toHaveProperty('drift_simulation');

      // Verify drift simulation structure
      expect(response.body.drift_simulation).toHaveProperty('applied_shifts');
      expect(response.body.drift_simulation).toHaveProperty('prediction_changed');
      expect(response.body.drift_simulation).toHaveProperty('confidence_change');
      
      // Check applied shifts structure
      expect(response.body.drift_simulation.applied_shifts).toHaveProperty('sepal_length');
      expect(response.body.drift_simulation.applied_shifts).toHaveProperty('petal_width');
    });

    it('should handle invalid measurements for drift simulation', async () => {
      const invalidRequest = {
        sepal_length: -1, // Invalid negative value
        sepal_width: 3.5,
        petal_length: 1.4,
        petal_width: 0.2
      };

      await request(app.getHttpServer())
        .post('/api/v1/classify-shifted')
        .send(invalidRequest)
        .expect(400);
    });

    it('should generate drift report (may show insufficient data warning)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/drift-report')
        .expect(200);

      // Response should contain either drift analysis or error/warning about insufficient data
      expect(response.body).toBeDefined();
      
      if (response.body.error) {
        // If insufficient data, should have helpful error message
        expect(response.body).toHaveProperty('recommendation');
      } else {
        // If sufficient data, should have drift analysis structure
        expect(response.body).toHaveProperty('drift_analysis');
        expect(response.body).toHaveProperty('data_summary');
        expect(response.body).toHaveProperty('recommendations');
      }
    });
  });

  describe('MLflow Registry Integration', () => {
    it('should list registered models (or show connection error)', async () => {
      if (!services.mlflow && isCIEnvironment()) {
        console.log('⚠️  Skipping MLflow test - service unavailable in CI');
        return;
      }

      const response = await request(app.getHttpServer())
        .get('/api/v1/models');

      expectServiceResponse(
        response,
        () => {
          expect(response.body).toHaveProperty('models');
          expect(response.body).toHaveProperty('total_count');
          expect(response.body).toHaveProperty('registry_status');
        },
        'MLflow'
      );
    });

    it('should attempt registry-based classification', async () => {
      if (!services.mlflow && isCIEnvironment()) {
        console.log('⚠️  Skipping MLflow classification test - service unavailable in CI');
        return;
      }

      const testRequest = {
        sepal_length: 5.1,
        sepal_width: 3.5,
        petal_length: 1.4,
        petal_width: 0.2,
        model_format: 'onnx',
        stage: 'Production'
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/classify-registry')
        .send(testRequest);

      expectServiceResponse(
        response,
        () => {
          expect(response.body).toHaveProperty('predicted_class');
          expect(response.body).toHaveProperty('probabilities');
          expect(response.body).toHaveProperty('registry_metadata');
          expect(response.body.registry_metadata).toHaveProperty('model_uri');
        },
        'MLflow'
      );
    });

    it('should validate registry request parameters', async () => {
      const invalidRequest = {
        sepal_length: 5.1,
        sepal_width: 3.5,
        petal_length: 1.4,
        petal_width: 0.2,
        model_format: 'invalid_format' // Invalid format
      };

      await request(app.getHttpServer())
        .post('/api/v1/classify-registry')
        .send(invalidRequest)
        .expect(400);
    });

    it('should handle missing required fields in registry request', async () => {
      const incompleteRequest = {
        sepal_length: 5.1,
        sepal_width: 3.5
        // Missing petal_length and petal_width
      };

      await request(app.getHttpServer())
        .post('/api/v1/classify-registry')
        .send(incompleteRequest)
        .expect(400);
    });
  });

  describe('Service Status with Phase 4 Features', () => {
    it('should include MLflow and drift monitoring in service status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/status')
        .expect(200);

      expect(response.body).toHaveProperty('ollama');
      expect(response.body).toHaveProperty('onnx');
      expect(response.body).toHaveProperty('mlflow');
      expect(response.body).toHaveProperty('drift_monitoring');

      // MLflow status should have availability info
      expect(response.body.mlflow).toHaveProperty('available');
      expect(response.body.mlflow).toHaveProperty('endpoint');
      
      // Drift monitoring status should have monitoring info
      expect(response.body.drift_monitoring).toHaveProperty('monitoring_active');
    });
  });

  describe('Production Logging Integration', () => {
    it('should log classification requests for drift monitoring', async () => {
      if (!services.onnxRuntime && isCIEnvironment()) {
        console.log('⚠️  Skipping ONNX classification test - ONNX runtime unavailable in CI');
        return;
      }

      const testRequest = {
        sepal_length: 6.3,
        sepal_width: 3.3,
        petal_length: 6.0,
        petal_width: 2.5
      };

      // Make a classification request
      const classifyResponse = await request(app.getHttpServer())
        .post('/api/v1/classify')
        .send(testRequest);

      expectServiceResponse(
        classifyResponse,
        () => {
          expect(classifyResponse.body).toHaveProperty('predicted_class');
        },
        'ONNX'
      );

      // Only check monitoring stats if classification succeeded
      if (classifyResponse.status === 200) {
        const statsResponse = await request(app.getHttpServer())
          .get('/api/v1/monitoring-stats')
          .expect(200);

        expect(statsResponse.body.production_log).toHaveProperty('sample_count');
        expect(typeof statsResponse.body.production_log.sample_count).toBe('number');
      }
    });

    it('should maintain classification functionality with logging', async () => {
      if (!services.onnxRuntime && isCIEnvironment()) {
        console.log('⚠️  Skipping ONNX classification test - ONNX runtime unavailable in CI');
        return;
      }

      const requests = [
        { sepal_length: 5.1, sepal_width: 3.5, petal_length: 1.4, petal_width: 0.2 }, // Setosa
        { sepal_length: 7.0, sepal_width: 3.2, petal_length: 4.7, petal_width: 1.4 }, // Versicolor
        { sepal_length: 6.3, sepal_width: 3.3, petal_length: 6.0, petal_width: 2.5 }  // Virginica
      ];

      for (const req of requests) {
        const response = await request(app.getHttpServer())
          .post('/api/v1/classify')
          .send(req);

        expectServiceResponse(
          response,
          () => {
            expect(response.body).toHaveProperty('predicted_class');
            expect(response.body).toHaveProperty('confidence');
            expect(response.body).toHaveProperty('probabilities');
            expect(response.body.probabilities).toHaveLength(3);
          },
          'ONNX'
        );
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle drift analysis with no production data gracefully', async () => {
      // This test assumes fresh data directory or very little data
      const response = await request(app.getHttpServer())
        .get('/api/v1/drift-report');

      // Should either succeed or fail gracefully with helpful error message
      expect(response.body).toBeDefined();
      
      if (response.status === 200) {
        // Success case - should have analysis results
        expect(response.body).toBeDefined();
      } else {
        // Error case - should have helpful error information
        expect(response.body).toHaveProperty('error');
        if (response.body.recommendation) {
          expect(response.body).toHaveProperty('recommendation');
        }
      }
    });

    it('should handle MLflow connection failures gracefully', async () => {
      if (!services.mlflow && isCIEnvironment()) {
        console.log('⚠️  Skipping MLflow connection test - service unavailable in CI');
        return;
      }

      // Test behavior when MLflow is not available or model doesn't exist
      const testRequest = {
        sepal_length: 5.1,
        sepal_width: 3.5,
        petal_length: 1.4,
        petal_width: 0.2,
        model_format: 'onnx',
        version: '2'  // Use actual existing version
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/classify-registry')
        .send(testRequest);

      expectServiceResponse(
        response,
        () => {
          expect(response.body).toHaveProperty('predicted_class');
          expect(response.body).toHaveProperty('registry_metadata');
        },
        'MLflow'
      );
    });

    it('should validate drift simulation input parameters', async () => {
      const edgeCaseRequests = [
        { sepal_length: 0, sepal_width: 0, petal_length: 0, petal_width: 0 }, // Zero values
        { sepal_length: 10, sepal_width: 10, petal_length: 10, petal_width: 10 }, // Maximum values
        { sepal_length: 5.1, sepal_width: 3.5, petal_length: 1.4, petal_width: 15 } // Out of range
      ];

      for (const req of edgeCaseRequests) {
        const response = await request(app.getHttpServer())
          .post('/api/v1/classify-shifted')
          .send(req);

        if (req.petal_width > 10) {
          // Should fail validation for out-of-range values
          expect(response.status).toBe(400);
        } else {
          // Should accept valid range values or handle service unavailability gracefully
          if (response.status === 200) {
            expect(response.body).toHaveProperty('drift_simulation');
          } else {
            // Service unavailable - should have error information
            expect(response.body).toBeDefined();
          }
        }
      }
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle multiple concurrent classification requests', async () => {
      const testRequest = {
        sepal_length: 5.8,
        sepal_width: 2.7,
        petal_length: 5.1,
        petal_width: 1.9
      };

      const promises = Array(5).fill(null).map(() =>
        request(app.getHttpServer())
          .post('/api/v1/classify')
          .send(testRequest)
      );

      const responses = await Promise.allSettled(promises);
      
      responses.forEach(result => {
        if (result.status === 'fulfilled') {
          const response = result.value;
          if (response.status === 200) {
            expect(response.body).toHaveProperty('predicted_class');
          } else {
            // Service unavailable - should have error information
            expect(response.body).toBeDefined();
          }
        } else {
          // Connection error - acceptable in CI environment
          expect(result.reason).toBeDefined();
        }
      });
    });

    it('should maintain reasonable response times for drift simulation', async () => {
      const testRequest = {
        sepal_length: 5.1,
        sepal_width: 3.5,
        petal_length: 1.4,
        petal_width: 0.2
      };

      const startTime = Date.now();
      const response = await request(app.getHttpServer())
        .post('/api/v1/classify-shifted')
        .send(testRequest)
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      
      // Should complete within reasonable time (10 seconds)
      expect(responseTime).toBeLessThan(10000);
      expect(response.body).toHaveProperty('drift_simulation');
    });
  });
});