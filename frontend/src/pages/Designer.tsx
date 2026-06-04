import { useState } from "react";
import UploadForm from "../components/UploadForm";
import { Stage, Layer, Rect, Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import { ACORD_SCHEMA } from "../data/acordSchema";

export default function Designer() {
  console.log("Designer page mounted");
  const [pages, setPages] = useState([]);
  const [images, setImages] = useState<string[]>([]);
  const [selected, setSelected] = useState<any>(null);

  // Multi-page state
  const [currentPage, setCurrentPage] = useState(0);

  // Zoom + Pan state
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Drag-and-drop mapping state
  const [mappings, setMappings] = useState<Record<string, any>>({});

  // ACORD search
  const [search, setSearch] = useState("");

  const filteredAcord = ACORD_SCHEMA.filter((item) =>
    item.label.toLowerCase().includes(search.toLowerCase()) ||
    item.description.toLowerCase().includes(search.toLowerCase())
  );

  function handleExtracted({ pages, images }) {
    setPages(pages);
    setImages(images);
    setCurrentPage(0);
    setSelected(null);
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }

  async function fetchSuggestions(line) {
    const res = await fetch("/api/suggestLabels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textBlocks: [line] })
    });

    const json = await res.json();
    setSelected({ ...line, suggestions: json.results[0] });
  }

  // Load current page image
  const [bgImage] = useImage(images[currentPage] || "");
  console.log("PDF image URL:", images[currentPage]);
  const currentLines =
    pages[currentPage]?.lines ? pages[currentPage].lines : [];

  // Handle drop onto bounding box
  function handleDrop(acordLabel: string, lineIndex: number) {
    const key = `${currentPage}-${lineIndex}`;

    setMappings((prev) => ({
      ...prev,
      [key]: { acordLabel }
    }));
  }

  async function saveMapping() {
    const payload = {
      fileName: "uploaded-form",
      mappings,
      pages,
      currentPage,
      timestamp: new Date().toISOString()
    };

    const res = await fetch("/api/saveMapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    alert("Mapping saved: " + json.blobName);
  }

  async function loadMapping() {
    const fileName = prompt("Enter mapping name (without .json):");
    if (!fileName) return;

    const res = await fetch(`/api/loadMapping?fileName=${fileName}`);
    const json = await res.json();

    if (json.error) {
      alert("Error loading mapping: " + json.error);
      return;
    }

    // Restore state
    setMappings(json.mappings || {});
    setPages(json.pages || []);
    setCurrentPage(json.currentPage || 0);
    setSelected(null);

    alert("Mapping loaded successfully. Re-upload the same PDF to restore images.");
  }

  async function exportAcordXml() {
    const payload = { mappings, pages };

    const res = await fetch("/api/exportAcordXml", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const xml = await res.text();

    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "acord.xml";
    a.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* LEFT SIDEBAR: Page thumbnails */}
      <div
        style={{
          width: 150,
          background: "#fafafa",
          borderRight: "1px solid #ccc",
          overflowY: "auto",
          padding: 10
        }}
      >
        <h4>Pages</h4>
        {images.map((img, idx) => (
          <div
            key={idx}
            onClick={() => {
              setCurrentPage(idx);
              setSelected(null);
              setScale(1);
              setPosition({ x: 0, y: 0 });
            }}
            style={{
              marginBottom: 10,
              cursor: "pointer",
              border: idx === currentPage ? "2px solid blue" : "1px solid #ccc",
              padding: 2
            }}
          >
            <img src={img} alt={`Page ${idx + 1}`} style={{ width: "100%" }} />
            <div style={{ textAlign: "center", fontSize: 12 }}>
              Page {idx + 1}
            </div>
          </div>
        ))}
      </div>

      {/* MIDDLE: Canvas */}
      <div style={{ flex: 1, background: "#f0f0f0" }}>
        <UploadForm onExtracted={handleExtracted} />

        <Stage
          width={1200}
          height={1600}
          scaleX={scale}
          scaleY={scale}
          x={position.x}
          y={position.y}
          draggable
          onWheel={(e) => {
            e.evt.preventDefault();

            const scaleBy = 1.05;
            const oldScale = scale;

            const mousePointTo = {
              x: (e.evt.x - position.x) / oldScale,
              y: (e.evt.y - position.y) / oldScale
            };

            const newScale =
              e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

            setScale(newScale);

            setPosition({
              x: e.evt.x - mousePointTo.x * newScale,
              y: e.evt.y - mousePointTo.y * newScale
            });
          }}
          onDragMove={(e) => {
            setPosition({
              x: e.target.x(),
              y: e.target.y()
            });
          }}
          onDragEnd={(e) => {
            setPosition({
              x: e.target.x(),
              y: e.target.y()
            });
          }}
        >
          <Layer>
            {/* Background PDF page */}
            {bgImage && <KonvaImage image={bgImage} x={0} y={0} />}

            {/* Bounding boxes */}
            {currentLines.map((line, i) => {
              const x = line.boundingBox[0].x;
              const y = line.boundingBox[0].y;
              const width = line.boundingBox[1].x - line.boundingBox[0].x;
              const height = line.boundingBox[3].y - line.boundingBox[0].y;

              const key = `${currentPage}-${i}`;
              const mapped = mappings[key];

              return (
                <Rect
                  key={i}
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={
                    mapped
                      ? "rgba(0,255,0,0.25)"
                      : selected === line
                      ? "rgba(0,0,255,0.2)"
                      : "rgba(0,0,0,0.1)"
                  }
                  stroke={mapped ? "green" : "blue"}
                  onClick={() => setSelected(line)}
                  onDragOver={(e) => e.evt.preventDefault()}
                  onDrop={(e) => {
                    const acordLabel = e.evt.dataTransfer.getData("text/plain");
                    handleDrop(acordLabel, i);
                  }}
                />
              );
            })}
          </Layer>
        </Stage>
      </div>

      {/* RIGHT SIDEBAR */}
      <div
        style={{
          width: 350,
          padding: 20,
          background: "#fff",
          borderLeft: "1px solid #ccc",
          overflowY: "auto"
        }}
      >
        <button
          onClick={saveMapping}
          style={{
            width: "100%",
            padding: 10,
            marginBottom: 10,
            background: "#0078d4",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer"
          }}
        >
          Save Mapping
        </button>

        <button
          onClick={loadMapping}
          style={{
            width: "100%",
            padding: 10,
            marginBottom: 10,
            background: "#444",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer"
          }}
        >
          Load Mapping
        </button>

        <button
          onClick={exportAcordXml}
          style={{
            width: "100%",
            padding: 10,
            marginBottom: 20,
            background: "#008000",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer"
          }}
        >
          Export ACORD XML
        </button>

        <h3>ACORD Schema</h3>

        <input
          type="text"
          placeholder="Search ACORD fields..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: 8,
            marginBottom: 10,
            border: "1px solid #ccc",
            borderRadius: 4
          }}
        />

        <div style={{ maxHeight: 250, overflowY: "auto", marginBottom: 20 }}>
          {filteredAcord.map((item) => (
            <div
              key={item.label}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", item.label);
              }}
              style={{
                padding: 8,
                marginBottom: 6,
                background: "#eee",
                borderRadius: 4,
                cursor: "grab"
              }}
            >
              <strong>{item.label}</strong>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {item.description}
              </div>
            </div>
          ))}
        </div>

        <hr />

        <h3>Field Details</h3>

        {selected ? (
          <>
            <p>
              <strong>Text:</strong> {selected.content}
            </p>
            <button onClick={() => fetchSuggestions(selected)}>
              Suggest ACORD Labels
            </button>

            {selected.suggestions && (
              <>
                <h4>Suggestions</h4>
                <ul>
                  {selected.suggestions.candidates.map((c) => (
                    <li key={c.label}>
                      {c.label} ({Math.round(c.confidence * 100)}%)
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <p>Select a field on the form</p>
        )}
      </div>
    </div>
  );
}
