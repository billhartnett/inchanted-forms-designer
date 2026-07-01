/**
 * E2E Pipeline Runner
 * Orchestrates end-to-end testing across all pipeline stages
 * Coordinates: ingestion, routing, mapping, diagnostics, strict mode
 */

const path = require('path');
const E2EIngestionTest = require('./e2e_ingestion_test.js');
const E2ERoutingTest = require('./e2e_routing_test.js');
const E2EMappingTest = require('./e2e_mapping_test.js');
const E2EDiagnosticsTest = require('./e2e_diagnostics_test.js');
const E2EStrictModeTest = require('./e2e_strict_mode_test.js');

class E2EPipelineRunner {
  constructor() {
    this.startTime = Date.now();
    this.executionResults = {
      timestamp: new Date().toISOString(),
      pipelineTests: {}
    };
    this.aggregatedMetrics = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      totalLatency: 0
    };
    this.validationCriteria = {
      regressionCount: { expected: 0, actual: 0 },
      diagnosticsCoverage: { expected: 0.90, actual: 0 },
      categoryModeMismatchRate: { expected: 0.17378, actual: 0 },
      ingestionSuccessRate: { expected: 0.95, actual: 0 },
      routingAccuracy: { expected: 1.0, actual: 0 },
      mappingAccuracy: { expected: 0.95, actual: 0 },
      strictModeStatus: { expected: 'PASS', actual: 'UNKNOWN' }
    };
  }

  /**
   * Run all E2E pipeline tests
   */
  async runFullPipeline() {
    const results = {};

    // Run ingestion tests
    const ingestionTest = new E2EIngestionTest();
    ingestionTest.testSyntheticIngestion();
    ingestionTest.testReplayDrivenIngestion();
    ingestionTest.testIngestionLatency();
    results.ingestion = ingestionTest.getReport();
    this.validationCriteria.ingestionSuccessRate.actual = results.ingestion.summary.successRate;

    // Run routing tests
    const routingTest = new E2ERoutingTest();
    routingTest.testSyntheticRouting();
    routingTest.testReplayDrivenRouting();
    routingTest.testRoutingLatency();
    results.routing = routingTest.getReport();
    this.validationCriteria.routingAccuracy.actual = results.routing.summary.routingAccuracy;

    // Run mapping tests
    const mappingTest = new E2EMappingTest();
    mappingTest.testSyntheticMapping();
    mappingTest.testReplayDrivenMapping();
    mappingTest.testMappingLatency();
    results.mapping = mappingTest.getReport();
    this.validationCriteria.mappingAccuracy.actual = results.mapping.summary.mappingAccuracy;
    this.validationCriteria.categoryModeMismatchRate.actual = results.mapping.summary.categoryModeMismatchRate;

    // Run diagnostics tests
    const diagnosticsTest = new E2EDiagnosticsTest();
    diagnosticsTest.testSyntheticDiagnostics();
    diagnosticsTest.testReplayDrivenDiagnostics();
    diagnosticsTest.testDiagnosticsLatency();
    results.diagnostics = diagnosticsTest.getReport();
    this.validationCriteria.diagnosticsCoverage.actual = results.diagnostics.summary.diagnosticsCoverage;

    // Run strict mode tests
    const strictModeTest = new E2EStrictModeTest();
    strictModeTest.testSyntheticStrictMode();
    strictModeTest.testReplayDrivenStrictMode();
    strictModeTest.testStrictModeLatency();
    results.strictMode = strictModeTest.getReport();
    this.validationCriteria.strictModeStatus.actual = results.strictMode.summary.strictModeStatus;

    this.executionResults.pipelineTests = results;
    return results;
  }

  /**
   * Calculate total pipeline latency
   */
  calculatePipelineLatency() {
    const latencies = {
      ingestion: this.executionResults.pipelineTests.ingestion?.summary?.extractionLatency || 0,
      routing: this.executionResults.pipelineTests.routing?.summary?.routingLatency || 0,
      mapping: this.executionResults.pipelineTests.mapping?.summary?.mappingLatency || 0,
      diagnostics: this.executionResults.pipelineTests.diagnostics?.summary?.diagnosticsLatency || 0,
      strictMode: this.executionResults.pipelineTests.strictMode?.summary?.strictModeLatency || 0
    };

    const total = Object.values(latencies).reduce((sum, latency) => sum + latency, 0);
    return {
      ...latencies,
      total: total
    };
  }

  /**
   * Validate all criteria met
   */
  validateAllCriteria() {
    const validations = {};

    for (const [criterion, values] of Object.entries(this.validationCriteria)) {
      const expected = values.expected;
      const actual = values.actual;
      let passed = false;

      if (typeof expected === 'number') {
        if (criterion.includes('Rate') || criterion.includes('Accuracy') || criterion === 'diagnosticsCoverage') {
          // For percentage/ratio metrics, actual should be >= expected
          passed = actual >= expected;
        } else if (criterion === 'categoryModeMismatchRate') {
          // For mismatch rate, actual should be <= expected
          passed = actual <= expected;
        } else {
          // For others like regressionCount, actual should be <= expected
          passed = actual <= expected;
        }
      } else if (typeof expected === 'string') {
        // For string comparisons like strictModeStatus
        passed = actual === expected;
      }

      validations[criterion] = {
        expected: expected,
        actual: actual,
        passed: passed
      };
    }

    return validations;
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    const pipelineLatency = this.calculatePipelineLatency();
    const validations = this.validateAllCriteria();
    const allValidationsPassed = Object.values(validations).every(v => v.passed);
    const totalExecutionTime = Date.now() - this.startTime;

    return {
      timestamp: new Date().toISOString(),
      executionTime: `${totalExecutionTime}ms`,
      pipelineLatency: {
        ingestionLatency: `${pipelineLatency.ingestion}ms`,
        routingLatency: `${pipelineLatency.routing}ms`,
        mappingLatency: `${pipelineLatency.mapping}ms`,
        diagnosticsLatency: `${pipelineLatency.diagnostics}ms`,
        strictModeLatency: `${pipelineLatency.strictMode}ms`,
        totalLatency: `${pipelineLatency.total}ms`
      },
      testResults: {
        ingestion: {
          allPassed: this.executionResults.pipelineTests.ingestion?.status?.allPassed || false,
          testCount: this.executionResults.pipelineTests.ingestion?.status?.testCount || 0,
          successRate: this.executionResults.pipelineTests.ingestion?.summary?.successRate || 0
        },
        routing: {
          allPassed: this.executionResults.pipelineTests.routing?.status?.allPassed || false,
          testCount: this.executionResults.pipelineTests.routing?.status?.testCount || 0,
          routingAccuracy: this.executionResults.pipelineTests.routing?.summary?.routingAccuracy || 0
        },
        mapping: {
          allPassed: this.executionResults.pipelineTests.mapping?.status?.allPassed || false,
          testCount: this.executionResults.pipelineTests.mapping?.status?.testCount || 0,
          mappingAccuracy: this.executionResults.pipelineTests.mapping?.summary?.mappingAccuracy || 0
        },
        diagnostics: {
          allPassed: this.executionResults.pipelineTests.diagnostics?.status?.allPassed || false,
          testCount: this.executionResults.pipelineTests.diagnostics?.status?.testCount || 0,
          diagnosticsCoverage: this.executionResults.pipelineTests.diagnostics?.summary?.diagnosticsCoverage || 0
        },
        strictMode: {
          allPassed: this.executionResults.pipelineTests.strictMode?.status?.allPassed || false,
          testCount: this.executionResults.pipelineTests.strictMode?.status?.testCount || 0,
          strictModeStatus: this.executionResults.pipelineTests.strictMode?.summary?.strictModeStatus || 'UNKNOWN'
        }
      },
      validationCriteria: validations,
      overallStatus: {
        allValidationsPassed: allValidationsPassed,
        pipelineHealth: allValidationsPassed ? 'HEALTHY' : 'DEGRADED',
        readinessForMonitoring: allValidationsPassed ? 'READY' : 'NOT_READY'
      }
    };
  }

  /**
   * Get status
   */
  getStatus() {
    const report = this.generateReport();
    return {
      pipelineName: 'E2E Pipeline',
      status: report.overallStatus.allValidationsPassed ? 'PASS' : 'FAIL',
      pipelineHealth: report.overallStatus.pipelineHealth,
      totalLatency: report.pipelineLatency.totalLatency,
      validations: report.validationCriteria,
      report: report
    };
  }
}

module.exports = E2EPipelineRunner;
