# Wave 7 Phase 1: Production Gating — Live-Host Replay Validation

## Status: ⏳ READY FOR EXECUTION (Awaiting Backend)

## Overview

Wave 7 Phase 1 is the production gating phase that validates Wave 6 tuning improvements under live-host conditions. This phase runs replay validation against the live backend mapping engine to ensure:

1. **Threshold Validation**: Wave 6 Phase 3 tightened thresholds remain stable under live conditions
2. **Diagnostics Stability**: Wave 6 Phase 4 diagnostics stabilization holds under live conditions
3. **Category Mode Stability**: categoryModeMismatchRate (0.17178) is maintained
4. **Host Health**: Backend service responds within acceptable latency
5. **Zero Regressions**: Structural-miss delta remains stable

## Execution Mode

- **Mode**: `strict_live_host_only`
- **Required**: Backend mapping engine running on localhost:7081
- **Endpoint**: `POST http://localhost:7081/api/mapFields`
- **Health Check**: `GET http://localhost:7081/health`
- **Timeout**: 30 seconds per request

## Wave 6 Thresholds Applied

### Phase 3 Tightened Thresholds
- minReplayCoverageRatio: 0.97 (was 0.95)
- maxMissingFieldRate: 0.001 (was 0.02)
- maxMisclassificationRate: 0.001 (was 0.22)
- maxGeometryMismatchRate: 0.001 (was 0.12)
- **maxCategoryModeMismatchRate: 0.17378 (was 0.18)**

### Phase 4 Diagnostics Stabilization
- Diagnostics Coverage: 100% (meets ≥0.90 threshold)
- Consistency Rate: 100%
- Structural Fields Matched: 5/5
- Failure Classes Matched: 5/5
- Batch Consistency: 100%

## Expected Wave 7 Phase 1 Artifacts

When the backend is running and Wave 7 Phase 1 is executed successfully, the following artifacts will be generated:

1. **wave7_phase1_livehost_replay_validation_report.json**
   - Host health status and latency
   - Validation results against tightened thresholds
   - Production gating status
   - Pass/fail determination for Wave 7 entry

2. **wave7_phase1_livehost_replay_diagnostics.json**
   - Structural delta totals and rates
   - Adjusted rates after envelope application
   - Threshold checks and validation status
   - Host health information

3. **wave7_phase1_livehost_replay_integration_report.md**
   - Human-readable summary
   - Metrics comparison tables
   - Production gating readiness assessment

4. **wave7_phase1_livehost_replay_regression_report.json**
   - Regression count (must be 0)
   - Host health validation
   - Overall validation status

## How to Run Wave 7 Phase 1

### Prerequisites

1. **Backend Service Running**:
   ```bash
   cd backend/api
   npm start
   ```
   Expected: Service running on localhost:7081

2. **Verify Health**:
   ```bash
   curl http://localhost:7081/health
   ```
   Expected: 200 OK response

3. **Verify Replay Data**:
   - ACORD-*-training.json files present in training-data/acord-labeled/
   - Category data files (ACORD-*-training-cat.json) available if needed

### Execute Wave 7 Phase 1

```bash
cd backend/api
npm run gate:wave7:phase1:livehost
```

Or directly:

```bash
node scripts/wave7_phase1_livehost_replay_validation.js
```

### Expected Output

**Success Scenario** (all thresholds pass, host healthy):
```json
{
  "phase": "wave7_phase1_livehost_replay_validation",
  "mode": "strict_live_host_only",
  "regressionCount": 0,
  "validationPass": true,
  "hostHealthy": true,
  "productionReady": true
}
```

**Failure Scenarios**:
- **hostHealthFailure**: Backend unreachable or slow (latency > 30s)
- **mappingThresholdFailure**: Thresholds exceeded
- **runnerFailure**: Script or data loading error

## Validation Criteria

Wave 7 Phase 1 passes if and only if **ALL** of the following conditions are met:

1. ✅ Host is healthy and responsive (latency acceptable)
2. ✅ Regression count = 0
3. ✅ All tightened thresholds pass:
   - categoryModeMismatchRate ≤ 0.17378
   - replayCoverageRatio ≥ 0.97
   - missingFieldRate ≤ 0.001
   - misclassificationRate ≤ 0.001
   - geometryMismatchRate ≤ 0.001
4. ✅ No regression on structural-miss delta
5. ✅ Metrics stable from Wave 6

## Next Steps After Wave 7 Phase 1 Pass

Once Wave 7 Phase 1 passes:

1. **Wave 7 Phase 2**: Carrier adapter tuning
   - Test against multiple carrier endpoint configurations
   - Validate carrier-specific semantic mappings
   - Test fallback and error recovery paths

2. **Wave 7 Phase 3**: Production readiness
   - Final validation of all metrics
   - Performance profiling under load
   - Stress testing with concurrent requests

3. **Wave 7 Exit**: Production deployment
   - Push to production environment
   - Monitor initial metrics
   - Establish production baseline

## Guardrails (Non-Negotiable)

- ✅ Wave 4.8 replay baseline remains frozen (never modified)
- ✅ Wave 4 tuning remains closed (never reopened)
- ✅ Wave 5 → Wave 6 path is exclusive (no parallel paths)
- ✅ Wave 6 exit gates must pass (strict-mode, replay, drift)
- ✅ Production thresholds cannot be relaxed (only tightened)
- ✅ Diagnostics coverage must meet ≥0.90 threshold
- ✅ Regression count must remain 0 across all phases

## Current State

- **Wave**: 7
- **Status**: wave7_phase1_active
- **Execution Mode**: strict_live_host_only
- **Wave 6 Phase 3 Thresholds**: ✅ Applied
- **Wave 6 Phase 4 Diagnostics**: ✅ Stabilized
- **Backend Requirement**: ⏳ WAITING FOR EXECUTION
- **Artifacts**: ⏳ PENDING (generate on first successful backend execution)

## Critical Metrics to Monitor

After Wave 7 Phase 1 execution:

| Metric | Wave 6 Baseline | Wave 7 Target | Acceptable Range |
|--------|-----------------|---------------|------------------|
| **categoryModeMismatchRate** | 0.17178 | ≤ 0.17378 | 0.17178 ± 0.002 |
| **Host Latency** | N/A | < 1000ms | < 5000ms |
| **Diagnostics Coverage** | 100% | ≥ 90% | 90-100% |
| **Regression Count** | 0 | 0 | Exactly 0 |

---

**Created**: 2026-07-01T13:06:09Z  
**Wave**: 7  
**Phase**: 1 (Production Gating - Live-Host Replay Validation)  
**Status**: Ready for Backend Execution
