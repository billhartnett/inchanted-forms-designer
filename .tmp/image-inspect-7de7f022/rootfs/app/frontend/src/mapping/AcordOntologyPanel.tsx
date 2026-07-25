import { useMemo, useState } from "react";
import {
  getAcordOntology,
  validateOntologySelection,
} from "../../../shared/src/acord/ontology";
import { useMappingStore, useSelectedFieldMapping } from "../state";

function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function AcordOntologyPanel() {
  const selectedMapping = useSelectedFieldMapping();
  const documentId = useMappingStore((state) => state.documentId || "current-document");
  const mappingsById = useMappingStore((state) => state.mappings);
  const [status, setStatus] = useState<string | null>(null);

  const ontology = useMemo(() => getAcordOntology(), []);

  const selectedCodes = useMemo(
    () =>
      Object.values(mappingsById)
        .map((record) =>
          record.mapping.chosen?.acordCode ||
          record.mapping.suggestions[0]?.acordCode ||
          "",
        )
        .filter((item) => Boolean(item)),
    [mappingsById],
  );

  const validation = useMemo(
    () => validateOntologySelection(selectedCodes),
    [selectedCodes],
  );

  const chosenCode = selectedMapping?.chosenCandidate?.acordCode;
  const node = chosenCode ? ontology.nodes[chosenCode] : undefined;

  const generateOntologyReport = () => {
    const report = {
      documentId,
      ontologyId: ontology.ontologyId,
      ontologyVersion: ontology.version,
      ontologyHash: ontology.hash,
      selectedCodeCount: selectedCodes.length,
      selectedCodes: [...selectedCodes].sort((a, b) => a.localeCompare(b)),
      validation,
      selectedNode: node,
      generatedAt: new Date().toISOString(),
    };
    downloadJson(`${documentId}.ontology-report.json`, report);
    setStatus("Ontology report generated.");
  };

  return (
    <section
      style={{
        border: "1px solid #d9e2ec",
        borderRadius: 12,
        padding: 12,
        background: "#f8fafc",
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>ACORD ontology</h3>
        <button type="button" onClick={generateOntologyReport}>
          Generate Ontology Report
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Ontology {ontology.ontologyId} v{ontology.version} • hash {ontology.hash}
      </div>

      <div style={{ fontSize: 12, color: validation.valid ? "#166534" : "#991b1b" }}>
        Validation: {validation.valid ? "valid" : `${validation.issues.length} issues`}
      </div>

      {validation.issues.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#7f1d1d" }}>
          {validation.issues.slice(0, 6).map((issue) => (
            <li key={`${issue.type}:${issue.acordCode}:${issue.relatedCode || ""}`}>
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      {node ? (
        <div style={{ display: "grid", gap: 4, fontSize: 12, color: "#334155" }}>
          <div style={{ fontWeight: 600 }}>Selected code: {node.acordCode}</div>
          <div>Sections: {node.sections.join(" • ") || "none"}</div>
          <div>Groups: {node.groups.join(" • ") || "none"}</div>
          <div>Parents: {node.parentCodes.join(" • ") || "none"}</div>
          <div>Children: {node.childCodes.join(" • ") || "none"}</div>
          <div>Required siblings: {node.requiredSiblingCodes.join(" • ") || "none"}</div>
          <div>Mutually exclusive: {node.mutuallyExclusiveCodes.join(" • ") || "none"}</div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "#475569" }}>
          Select a mapped field to inspect ontology relationships.
        </div>
      )}

      {status ? <div style={{ fontSize: 12, color: "#334155" }}>{status}</div> : null}
    </section>
  );
}
