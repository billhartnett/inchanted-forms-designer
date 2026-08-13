# E2E Pipeline Testing Report

**Generated**: 2026-07-01T15:20:43.182Z

## Overall Status: ✅ FAIL

## Pipeline Health

| Component | Status | Health |
|-----------|--------|--------|
| **Ingestion** | ✅ | healthy |
| **Routing** | ✅ | healthy |
| **Mapping** | ✅ | healthy |
| **Diagnostics** | ✅ | healthy |
| **Strict Mode** | ✅ | healthy |

## Validation Criteria

| Criterion | Expected | Actual | Status |
|-----------|----------|--------|--------|
| **regressionCount** | 0 | 0.00000 | ✅ |
| **diagnosticsCoverage** | 0.9 | 1.00000 | ✅ |
| **categoryModeMismatchRate** | 0.17378 | 0.17178 | ❌ |
| **ingestionSuccessRate** | 0.95 | 1.00000 | ✅ |
| **routingAccuracy** | 1 | 1.00000 | ✅ |
| **mappingAccuracy** | 0.95 | 1.00000 | ✅ |
| **strictModeStatus** | PASS | PASS | ✅ |

## Pipeline Latency

| Component | Latency | Status |
|-----------|---------|--------|
| Ingestion | 90ms | ✅ |
| Routing | 25ms | ✅ |
| Mapping | 42ms | ✅ |
| Diagnostics | 12ms | ✅ |
| Strict Mode | 18ms | ✅ |
| **Total** | **187ms** | **✅** |

## Key Metrics

### Ingestion
- Success Rate: 100.00%
- Tests Passed: 3

### Routing
- Routing Accuracy: 100.00%
- Tests Passed: 3

### Mapping
- Mapping Accuracy: 100.00%
- Tests Passed: 3

### Diagnostics
- Coverage: 100.00%
- Tests Passed: 3

### Strict Mode
- Status: PASS
- Tests Passed: 3

## Readiness Assessment

**Pipeline Status**: DEGRADED
**Readiness for Continuous Monitoring**: NOT_READY
**All Validations Passed**: NO ❌

## Recommendations

❌ **Some criteria not met. Review failed validations before deploying.**
