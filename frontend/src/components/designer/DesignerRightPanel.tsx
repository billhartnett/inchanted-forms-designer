import { useState } from "react";
import { AcordOntologyPanel } from "../../mapping/AcordOntologyPanel";
import { CalibrationDashboard } from "../../mapping/CalibrationDashboard";
import { FormFamilyPanel } from "../../mapping/FormFamilyPanel";
import { RiskDecisionIntelligencePanel } from "../../mapping/RiskDecisionIntelligencePanel";
import { SubmissionPackagePanel } from "../../mapping/SubmissionPackagePanel";
import { UnderwritingRuleAlignmentPanel } from "../../mapping/UnderwritingRuleAlignmentPanel";
import DesignerBindingsPanel from "./DesignerBindingsPanel";
import DesignerPropertiesPanel from "./DesignerPropertiesPanel";

const WAVE13_2_DISABLE_SEMANTIC_PANELS = true;

export function DesignerRightPanel() {
  const [activeTab, setActiveTab] = useState<"core" | "experimental">("core");

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
        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("core")}
            style={{
              border: activeTab === "core" ? "1px solid #1d4ed8" : "1px solid #cbd5e1",
              borderRadius: 999,
              padding: "0.25rem 0.65rem",
              background: activeTab === "core" ? "#dbeafe" : "#ffffff",
              color: activeTab === "core" ? "#1e3a8a" : "#334155",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Core
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("experimental")}
            style={{
              border:
                activeTab === "experimental" ? "1px solid #7c2d12" : "1px solid #cbd5e1",
              borderRadius: 999,
              padding: "0.25rem 0.65rem",
              background: activeTab === "experimental" ? "#ffedd5" : "#ffffff",
              color: activeTab === "experimental" ? "#9a3412" : "#334155",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Experimental
          </button>
        </div>
        <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
          {activeTab === "core" ? (
            <>
              <AcordOntologyPanel />
              <FormFamilyPanel />
              <CalibrationDashboard />
              {WAVE13_2_DISABLE_SEMANTIC_PANELS ? (
                <div
                  style={{
                    border: "1px solid #dbeafe",
                    borderRadius: 10,
                    background: "#eff6ff",
                    color: "#1e3a8a",
                    fontSize: 12,
                    padding: 10,
                  }}
                >
                  Wave-13.2 deployment mode: semantic panel stack is disabled.
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div
                style={{
                  border: "1px solid #fed7aa",
                  borderRadius: 10,
                  background: "#fff7ed",
                  color: "#9a3412",
                  fontSize: 12,
                  padding: 10,
                }}
              >
                Legacy controls are moved here for Release 1 testing focus.
              </div>
              <UnderwritingRuleAlignmentPanel />
              <RiskDecisionIntelligencePanel />
              <SubmissionPackagePanel />
            </>
          )}
        </div>
      </details>
    </div>
  );
}

export default DesignerRightPanel;
