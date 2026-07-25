import { AcordOntologyPanel } from "../../mapping/AcordOntologyPanel";
import { CalibrationDashboard } from "../../mapping/CalibrationDashboard";
import { CarrierSemanticAdapterPanel } from "../../mapping/CarrierSemanticAdapterPanel";
import { FormFamilyPanel } from "../../mapping/FormFamilyPanel";
import { RiskDecisionIntelligencePanel } from "../../mapping/RiskDecisionIntelligencePanel";
import { SemanticConflictsPanel } from "../../mapping/SemanticConflictsPanel";
import { SemanticFusionPanel } from "../../mapping/SemanticFusionPanel";
import { SemanticGraphExplorerPanel } from "../../mapping/SemanticGraphExplorerPanel";
import { SemanticMemoryPanel } from "../../mapping/SemanticMemoryPanel";
import { SubmissionPackagePanel } from "../../mapping/SubmissionPackagePanel";
import { UnderwritingRuleAlignmentPanel } from "../../mapping/UnderwritingRuleAlignmentPanel";
import DesignerBindingsPanel from "./DesignerBindingsPanel";
import DesignerPropertiesPanel from "./DesignerPropertiesPanel";

export function DesignerRightPanel() {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#64748b",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Field
      </div>
      <DesignerPropertiesPanel />
      <DesignerBindingsPanel />
      <details
        open
        style={{
          border: "1px solid #d9e2ec",
          borderRadius: 12,
          background: "#f8fafc",
          padding: 12,
        }}
      >
        <summary
          style={{
            cursor: "pointer",
            fontWeight: 700,
            color: "#0f172a",
          }}
        >
          Advanced
        </summary>
        <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
          <AcordOntologyPanel />
          <FormFamilyPanel />
          <CalibrationDashboard />
          <SemanticConflictsPanel />
          <SemanticFusionPanel />
          <SemanticGraphExplorerPanel />
          <CarrierSemanticAdapterPanel />
          <UnderwritingRuleAlignmentPanel />
          <RiskDecisionIntelligencePanel />
          <SubmissionPackagePanel />
          <SemanticMemoryPanel />
        </div>
      </details>
    </div>
  );
}

export default DesignerRightPanel;
