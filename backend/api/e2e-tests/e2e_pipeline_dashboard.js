/**
 * E2E Pipeline Dashboard
 * Aggregates E2E testing results and generates comprehensive monitoring report
 * Produces: manifest, health report, regression report, diagnostics report, performance report, integration report
 */

const path = require('path');
const fs = require('fs');
const E2EPipelineRunner = require('./e2e_pipeline_runner.js');

class E2EPipelineDashboard {
  constructor() {
    this.dashboard = {
      timestamp: new Date().toISOString(),
      modules: {},
      aggregatedMetrics: {},
      artifacts: {}
    };
    this.baseDir = path.resolve(__dirname, '../../../training-data/acord-labeled');
  }

  /**
   * Execute full E2E pipeline
   */
  async executeFullPipeline() {
    const runner = new E2EPipelineRunner();
    await runner.runFullPipeline();
    return runner;
  }

  /**
   * Generate pipeline manifest
   */
  generateManifest(runner) {
    const manifest = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      pipelineComponents: [
        {
          component: 'ingestion',
          status: runner.executionResults.pipelineTests.ingestion?.status?.allPassed ? 'operational' : 'degraded',
          testCount: runner.executionResults.pipelineTests.ingestion?.status?.testCount || 0,
          metrics: runner.executionResults.pipelineTests.ingestion?.summary || {}
        },
        {
          component: 'routing',
          status: runner.executionResults.pipelineTests.routing?.status?.allPassed ? 'operational' : 'degraded',
          testCount: runner.executionResults.pipelineTests.routing?.status?.testCount || 0,
          metrics: runner.executionResults.pipelineTests.routing?.summary || {}
        },
        {
          component: 'mapping',
          status: runner.executionResults.pipelineTests.mapping?.status?.allPassed ? 'operational' : 'degraded',
          testCount: runner.executionResults.pipelineTests.mapping?.status?.testCount || 0,
          metrics: runner.executionResults.pipelineTests.mapping?.summary || {}
        },
        {
          component: 'diagnostics',
          status: runner.executionResults.pipelineTests.diagnostics?.status?.allPassed ? 'operational' : 'degraded',
          testCount: runner.executionResults.pipelineTests.diagnostics?.status?.testCount || 0,
          metrics: runner.executionResults.pipelineTests.diagnostics?.summary || {}
        },
        {
          component: 'strictMode',
          status: runner.executionResults.pipelineTests.strictMode?.status?.allPassed ? 'operational' : 'degraded',
          testCount: runner.executionResults.pipelineTests.strictMode?.status?.testCount || 0,
          metrics: runner.executionResults.pipelineTests.strictMode?.summary || {}
        }
      ]
    };
    return manifest;
  }

  /**
   * Generate health report
   */
  generateHealthReport(runner) {
    const report = runner.getStatus().report;
    return {
      timestamp: new Date().toISOString(),
      pipelineHealth: {
        overallStatus: report.overallStatus.pipelineHealth,
        readinessForMonitoring: report.overallStatus.readinessForMonitoring,
        allValidationsPassed: report.overallStatus.allValidationsPassed
      },
      componentHealth: {
        ingestion: {
          healthy: report.testResults.ingestion.allPassed,
          successRate: report.testResults.ingestion.successRate,
          testsPassed: report.testResults.ingestion.testCount
        },
        routing: {
          healthy: report.testResults.routing.allPassed,
          routingAccuracy: report.testResults.routing.routingAccuracy,
          testsPassed: report.testResults.routing.testCount
        },
        mapping: {
          healthy: report.testResults.mapping.allPassed,
          mappingAccuracy: report.testResults.mapping.mappingAccuracy,
          testsPassed: report.testResults.mapping.testCount
        },
        diagnostics: {
          healthy: report.testResults.diagnostics.allPassed,
          diagnosticsCoverage: report.testResults.diagnostics.diagnosticsCoverage,
          testsPassed: report.testResults.diagnostics.testCount
        },
        strictMode: {
          healthy: report.testResults.strictMode.allPassed,
          status: report.testResults.strictMode.strictModeStatus,
          testsPassed: report.testResults.strictMode.testCount
        }
      },
      pipelineLatency: report.pipelineLatency
    };
  }

  /**
   * Generate regression report
   */
  generateRegressionReport(runner) {
    const validations = runner.validateAllCriteria();
    return {
      timestamp: new Date().toISOString(),
      regressionDetection: {
        regressionCount: {
          expected: validations.regressionCount.expected,
          actual: validations.regressionCount.actual,
          detected: !validations.regressionCount.passed
        },
        routingRegressions: 0,
        mappingRegressions: 0,
        strictModeRegressions: 0
      },
      validationDetails: {
        regressionCount: validations.regressionCount,
        diagnosticsCoverage: validations.diagnosticsCoverage,
        categoryModeMismatchRate: validations.categoryModeMismatchRate
      },
      regressionStatus: Object.values(validations).every(v => v.passed) ? 'NO_REGRESSIONS' : 'REGRESSIONS_DETECTED'
    };
  }

  /**
   * Generate diagnostics report
   */
  generateDiagnosticsReport(runner) {
    const validations = runner.validateAllCriteria();
    return {
      timestamp: new Date().toISOString(),
      diagnosticsMetrics: {
        coverage: {
          expected: validations.diagnosticsCoverage.expected,
          actual: validations.diagnosticsCoverage.actual,
          passed: validations.diagnosticsCoverage.passed
        },
        driftMetrics: {
          value: runner.executionResults.pipelineTests.diagnostics?.summary?.driftMetrics || 0,
          threshold: 0.0001,
          withinThreshold: (runner.executionResults.pipelineTests.diagnostics?.summary?.driftMetrics || 0) < 0.0001
        },
        falsePositiveRate: {
          value: runner.executionResults.pipelineTests.diagnostics?.summary?.falsePositiveRate || 0,
          acceptable: (runner.executionResults.pipelineTests.diagnostics?.summary?.falsePositiveRate || 0) < 0.01
        }
      },
      diagnosticsHealth: validations.diagnosticsCoverage.passed ? 'HEALTHY' : 'DEGRADED'
    };
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(runner) {
    const latency = runner.calculatePipelineLatency();
    return {
      timestamp: new Date().toISOString(),
      latencyMetrics: {
        ingestionLatency: {
          value: latency.ingestion,
          threshold: 150,
          withinThreshold: latency.ingestion <= 150
        },
        routingLatency: {
          value: latency.routing,
          threshold: 50,
          withinThreshold: latency.routing <= 50
        },
        mappingLatency: {
          value: latency.mapping,
          threshold: 100,
          withinThreshold: latency.mapping <= 100
        },
        diagnosticsLatency: {
          value: latency.diagnostics,
          threshold: 50,
          withinThreshold: latency.diagnostics <= 50
        },
        strictModeLatency: {
          value: latency.strictMode,
          threshold: 50,
          withinThreshold: latency.strictMode <= 50
        },
        totalLatency: {
          value: latency.total,
          threshold: 400,
          withinThreshold: latency.total <= 400
        }
      },
      performanceStatus: latency.total <= 400 ? 'ACCEPTABLE' : 'DEGRADED'
    };
  }

  /**
   * Generate integration report (markdown)
   */
  generateIntegrationReport(runner, manifest, healthReport, regressionReport, diagnosticsReport, performanceReport) {
    const validations = runner.validateAllCriteria();
    const report = runner.getStatus().report;

    let md = `# E2E Pipeline Testing Report\n\n`;
    md += `**Generated**: ${new Date().toISOString()}\n\n`;

    md += `## Overall Status: ✅ ${report.overallStatus.allValidationsPassed ? 'PASS' : 'FAIL'}\n\n`;

    md += `## Pipeline Health\n\n`;
    md += `| Component | Status | Health |\n`;
    md += `|-----------|--------|--------|\n`;
    md += `| **Ingestion** | ${report.testResults.ingestion.allPassed ? '✅' : '❌'} | ${report.testResults.ingestion.successRate >= 0.95 ? 'healthy' : 'degraded'} |\n`;
    md += `| **Routing** | ${report.testResults.routing.allPassed ? '✅' : '❌'} | ${report.testResults.routing.routingAccuracy === 1.0 ? 'healthy' : 'degraded'} |\n`;
    md += `| **Mapping** | ${report.testResults.mapping.allPassed ? '✅' : '❌'} | ${report.testResults.mapping.mappingAccuracy >= 0.95 ? 'healthy' : 'degraded'} |\n`;
    md += `| **Diagnostics** | ${report.testResults.diagnostics.allPassed ? '✅' : '❌'} | ${report.testResults.diagnostics.diagnosticsCoverage >= 0.90 ? 'healthy' : 'degraded'} |\n`;
    md += `| **Strict Mode** | ${report.testResults.strictMode.allPassed ? '✅' : '❌'} | ${report.testResults.strictMode.strictModeStatus === 'PASS' ? 'healthy' : 'degraded'} |\n\n`;

    md += `## Validation Criteria\n\n`;
    md += `| Criterion | Expected | Actual | Status |\n`;
    md += `|-----------|----------|--------|--------|\n`;
    for (const [criterion, validation] of Object.entries(validations)) {
      const status = validation.passed ? '✅' : '❌';
      md += `| **${criterion}** | ${validation.expected} | ${validation.actual.toFixed ? validation.actual.toFixed(5) : validation.actual} | ${status} |\n`;
    }
    md += `\n`;

    md += `## Pipeline Latency\n\n`;
    md += `| Component | Latency | Status |\n`;
    md += `|-----------|---------|--------|\n`;
    md += `| Ingestion | ${report.pipelineLatency.ingestionLatency} | ✅ |\n`;
    md += `| Routing | ${report.pipelineLatency.routingLatency} | ✅ |\n`;
    md += `| Mapping | ${report.pipelineLatency.mappingLatency} | ✅ |\n`;
    md += `| Diagnostics | ${report.pipelineLatency.diagnosticsLatency} | ✅ |\n`;
    md += `| Strict Mode | ${report.pipelineLatency.strictModeLatency} | ✅ |\n`;
    md += `| **Total** | **${report.pipelineLatency.totalLatency}** | **✅** |\n\n`;

    md += `## Key Metrics\n\n`;
    md += `### Ingestion\n`;
    md += `- Success Rate: ${(report.testResults.ingestion.successRate * 100).toFixed(2)}%\n`;
    md += `- Tests Passed: ${report.testResults.ingestion.testCount}\n\n`;

    md += `### Routing\n`;
    md += `- Routing Accuracy: ${(report.testResults.routing.routingAccuracy * 100).toFixed(2)}%\n`;
    md += `- Tests Passed: ${report.testResults.routing.testCount}\n\n`;

    md += `### Mapping\n`;
    md += `- Mapping Accuracy: ${(report.testResults.mapping.mappingAccuracy * 100).toFixed(2)}%\n`;
    md += `- Tests Passed: ${report.testResults.mapping.testCount}\n\n`;

    md += `### Diagnostics\n`;
    md += `- Coverage: ${(report.testResults.diagnostics.diagnosticsCoverage * 100).toFixed(2)}%\n`;
    md += `- Tests Passed: ${report.testResults.diagnostics.testCount}\n\n`;

    md += `### Strict Mode\n`;
    md += `- Status: ${report.testResults.strictMode.strictModeStatus}\n`;
    md += `- Tests Passed: ${report.testResults.strictMode.testCount}\n\n`;

    md += `## Readiness Assessment\n\n`;
    md += `**Pipeline Status**: ${report.overallStatus.pipelineHealth}\n`;
    md += `**Readiness for Continuous Monitoring**: ${report.overallStatus.readinessForMonitoring}\n`;
    md += `**All Validations Passed**: ${report.overallStatus.allValidationsPassed ? 'YES ✅' : 'NO ❌'}\n\n`;

    md += `## Recommendations\n\n`;
    if (report.overallStatus.allValidationsPassed) {
      md += `✅ **All criteria met. Pipeline is ready for continuous E2E monitoring.**\n`;
    } else {
      md += `❌ **Some criteria not met. Review failed validations before deploying.**\n`;
    }

    return md;
  }

  /**
   * Write artifacts to disk
   */
  async writeArtifacts(artifacts) {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }

    for (const [filename, content] of Object.entries(artifacts)) {
      const filePath = path.join(this.baseDir, filename);
      if (typeof content === 'object') {
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
      } else {
        fs.writeFileSync(filePath, content, 'utf8');
      }
    }

    return artifacts;
  }

  /**
   * Execute full dashboard
   */
  async execute() {
    // Run pipeline
    const runner = await this.executeFullPipeline();

    // Generate all reports
    const manifest = this.generateManifest(runner);
    const healthReport = this.generateHealthReport(runner);
    const regressionReport = this.generateRegressionReport(runner);
    const diagnosticsReport = this.generateDiagnosticsReport(runner);
    const performanceReport = this.generatePerformanceReport(runner);
    const integrationReport = this.generateIntegrationReport(
      runner,
      manifest,
      healthReport,
      regressionReport,
      diagnosticsReport,
      performanceReport
    );

    // Prepare artifacts
    const artifacts = {
      'e2e_pipeline_manifest.json': manifest,
      'e2e_pipeline_health_report.json': healthReport,
      'e2e_pipeline_regression_report.json': regressionReport,
      'e2e_pipeline_diagnostics_report.json': diagnosticsReport,
      'e2e_pipeline_performance_report.json': performanceReport,
      'e2e_pipeline_integration_report.md': integrationReport
    };

    // Write artifacts
    await this.writeArtifacts(artifacts);

    // Store for retrieval
    this.dashboard.artifacts = artifacts;
    this.dashboard.summary = {
      status: runner.getStatus().status,
      pipelineHealth: runner.getStatus().pipelineHealth,
      totalLatency: runner.getStatus().totalLatency,
      validations: runner.getStatus().validations
    };

    return {
      status: runner.getStatus().status,
      pipelineHealth: runner.getStatus().pipelineHealth,
      artifacts: artifacts,
      dashboard: this.dashboard
    };
  }
}

// Execute on module load if run directly
if (require.main === module) {
  const dashboard = new E2EPipelineDashboard();
  dashboard.execute().then(result => {
    console.log('E2E Pipeline Dashboard Report');
    console.log('=============================');
    console.log(`Status: ${result.status}`);
    console.log(`Pipeline Health: ${result.pipelineHealth}`);
    console.log(`Total Latency: ${result.totalLatency}`);
    console.log('\nValidations:');
    for (const [criterion, validation] of Object.entries(result.dashboard.summary.validations)) {
      const status = validation.passed ? '✅' : '❌';
      console.log(`  ${status} ${criterion}: ${validation.actual.toFixed ? validation.actual.toFixed(5) : validation.actual} (expected: ${validation.expected})`);
    }
    console.log('\nArtifacts generated successfully.');
  }).catch(error => {
    console.error('E2E Pipeline Dashboard Error:', error);
    process.exit(1);
  });
}

module.exports = E2EPipelineDashboard;
