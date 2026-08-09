const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildHybridFieldExtraction,
  toPixelBox,
} = require("../dist/extraction/hybridFieldExtraction.js");
const { boundsFromPolygon } = require("../dist/extraction/bboxNormalization.js");
const { mapFields } = require("../dist/api/mapFields.js");

test("normalizes every DI geometry source with the same page transform", async () => {
  assert.deepEqual(
    boundsFromPolygon([{ x: 1, y: 2 }, { x: 1.2, y: 2.1 }]),
    { x: 1, y: 2, width: 0.19999999999999996, height: 0.10000000000000009 },
  );
  assert.deepEqual(
    toPixelBox({ x: 1, y: 2, width: 3, height: 4 }, "inch"),
    { x: 96, y: 192, width: 288, height: 384 },
  );

  const pages = [
    {
      pageNumber: 1,
      width: 8.5,
      height: 11,
      unit: "inch",
      lines: [
        {
          content: "APPLICANT INFORMATION",
          confidence: 0.99,
          boundingBox: { x: 1, y: 0.5, width: 2, height: 0.3 },
        },
        {
          content: "Named insured: __________",
          confidence: 0.98,
          boundingBox: { x: 1, y: 1.5, width: 4, height: 0.25 },
        },
        {
          content: "Do you hire subcontractors?",
          confidence: 0.97,
          boundingBox: { x: 1, y: 2.5, width: 3, height: 0.25 },
        },
      ],
    },
  ];
  const rawResult = {
    pages: [
      {
        pageNumber: 1,
        unit: "inch",
        selectionMarks: [
          {
            state: "selected",
            confidence: 0.96,
            polygon: [
              { x: 4.5, y: 2.5 },
              { x: 4.7, y: 2.5 },
              { x: 4.7, y: 2.7 },
              { x: 4.5, y: 2.7 },
            ],
          },
        ],
      },
    ],
    tables: [
      {
        rowCount: 2,
        columnCount: 2,
        boundingRegions: [{ pageNumber: 1 }],
        cells: [
          {
            rowIndex: 0,
            columnIndex: 0,
            content: "Trade",
            boundingRegions: [{ pageNumber: 1, polygon: [
              { x: 1, y: 4 }, { x: 3, y: 4 }, { x: 3, y: 4.4 }, { x: 1, y: 4.4 },
            ] }],
          },
          {
            rowIndex: 0,
            columnIndex: 1,
            content: "Receipts",
            boundingRegions: [{ pageNumber: 1, polygon: [
              { x: 3, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 4.4 }, { x: 3, y: 4.4 },
            ] }],
          },
          {
            rowIndex: 1,
            columnIndex: 0,
            content: "Electrical",
            boundingRegions: [{ pageNumber: 1, polygon: [
              { x: 1, y: 4.4 }, { x: 3, y: 4.4 }, { x: 3, y: 4.8 }, { x: 1, y: 4.8 },
            ] }],
          },
          {
            rowIndex: 1,
            columnIndex: 1,
            content: "$125000",
            boundingRegions: [{ pageNumber: 1, polygon: [
              { x: 3, y: 4.4 }, { x: 5, y: 4.4 }, { x: 5, y: 4.8 }, { x: 3, y: 4.8 },
            ] }],
          },
        ],
      },
    ],
  };

  const result = await buildHybridFieldExtraction({ pages, rawResult });
  const title = result.fieldCatalog.find((entry) => entry.role === "title");
  const question = result.fieldCatalog.find((entry) => entry.role === "question");
  const input = result.fieldCatalog.find((entry) => entry.role === "input" && entry.source === "blank_detector");
  const checkbox = result.fieldCatalog.find((entry) => entry.role === "checkbox");
  const leftCell = result.fieldCatalog.find((entry) => entry.tableId === "table-1" && entry.rowIndex === 1 && entry.columnIndex === 0);
  const rightCell = result.fieldCatalog.find((entry) => entry.tableId === "table-1" && entry.rowIndex === 1 && entry.columnIndex === 1);

  assert.equal(title.boundingBox.x, 96);
  assert.equal(input.semanticValueRegion.x >= 96, true);
  assert.equal(checkbox.boundingBox.x, 432);
  assert.equal(leftCell.boundingBox.x, 96);
  assert.equal(rightCell.boundingBox.x, 288);
  assert.equal(leftCell.boundingBox.y, rightCell.boundingBox.y);
  assert.equal(leftCell.boundingBox.x < rightCell.boundingBox.x, true);
  assert.equal(question.pairedAnswerId.length > 0, true);
  assert.equal(result.groupedStructures.tables[0].rowCount, 2);
  assert.equal(result.groupedStructures.checkboxGroups.length, 1);
  assert.equal(
    result.fields.every((field) => {
      const entry = result.fieldCatalog.find((candidate) => candidate.id === field.id);
      return ["input", "checkbox", "select", "table-cell", "value-region"].includes(entry.role);
    }),
    true,
  );
  assert.equal(result.diagnostics.semanticFieldCount, result.fieldCatalog.length);
});

test("splits business labels and adjacent blank boxes into semantic labels and inputs", async () => {
  const labels = [
    "Producer Name:",
    "Agency Name:",
    "Company:",
    "Underwriter:",
    "Applicant Name:",
    "Mailing Address:",
    "Email:",
    "Carrier:",
    "Phone:",
  ];
  const lines = labels.map((content, index) => ({
    content,
    confidence: 0.99,
    boundingBox: { x: 0.5, y: 0.5 + index * 0.4, width: 1.25, height: 0.15 },
  }));
  const cells = labels.flatMap((content, index) => {
    const top = 0.45 + index * 0.4;
    const labelCell = {
        rowIndex: index,
        columnIndex: 0,
        content,
        confidence: 0.98,
        boundingRegions: [{ pageNumber: 1, polygon: [
          { x: 0.4, y: top }, { x: index === labels.length - 1 ? 6 : 2, y: top },
          { x: index === labels.length - 1 ? 6 : 2, y: top + 0.3 }, { x: 0.4, y: top + 0.3 },
        ] }],
      };
    return index === labels.length - 1 ? [labelCell] : [
      labelCell,
      {
        rowIndex: index,
        columnIndex: 1,
        content: "",
        confidence: 0.98,
        boundingRegions: [{ pageNumber: 1, polygon: [
          { x: 2, y: top }, { x: 6, y: top },
          { x: 6, y: top + 0.3 }, { x: 2, y: top + 0.3 },
        ] }],
      },
    ];
  });
  const result = await buildHybridFieldExtraction({
    pages: [{ pageNumber: 1, width: 8.5, height: 11, unit: "inch", lines }],
    rawResult: {
      tables: [{
        rowCount: labels.length,
        columnCount: 2,
        boundingRegions: [{ pageNumber: 1 }],
        cells,
      }],
    },
  });

  assert.equal(result.groupedStructures.labelInputPairs.length, labels.length);
  assert.equal(result.fields.length, labels.length);
  assert.equal(result.fieldCatalog.filter((entry) => entry.role === "label").length, labels.length);
  assert.equal(result.fieldCatalog.filter((entry) => entry.role === "input").length, labels.length);
  assert.equal(result.fieldCatalog.filter((entry) => entry.role === "table-cell").length, 0);

  for (const pair of result.groupedStructures.labelInputPairs) {
    const label = result.fieldCatalog.find((entry) => entry.id === pair.labelBlockId);
    const input = result.fieldCatalog.find((entry) => entry.id === pair.inputBlockId);
    const labelBlock = result.blocks.find((entry) => entry.id === pair.labelBlockId);
    const inputBlock = result.blocks.find((entry) => entry.id === pair.inputBlockId);
    assert.equal(label.role, "label");
    assert.equal(input.role, "input");
    assert.equal(label.groupId, pair.id);
    assert.equal(input.groupId, pair.id);
    assert.equal(labelBlock.boundingBox.x, label.boundingBox.x);
    assert.deepEqual(inputBlock.boundingBox, input.semanticValueRegion);
    assert.equal(input.boundingBox.x >= label.boundingBox.x + label.boundingBox.width, true);
    assert.equal(input.text, label.semanticLabel);
  }

  const producerPair = result.groupedStructures.labelInputPairs[0];
  const producerInput = result.fieldCatalog.find((entry) => entry.id === producerPair.inputBlockId);
  assert.equal(producerInput.boundingBox.x, 192);
  assert.equal(producerInput.boundingBox.width, 384);

  const response = await mapFields({
    json: async () => ({
      documentId: "business-contact-fields",
      blocks: result.blocks,
      fieldCatalog: result.fieldCatalog,
      groupedStructures: result.groupedStructures,
      deterministic: true,
    }),
  }, { warn() {}, error() {} });
  assert.equal(response.status, 200);
  assert.equal(response.jsonBody.mappings.length, result.blocks.length);
  assert.equal(response.jsonBody.mappedFields.length, labels.length);
  for (const pair of result.groupedStructures.labelInputPairs) {
    const labelMapping = response.jsonBody.mappings.find((entry) => entry.blockId === pair.labelBlockId);
    const inputMapping = response.jsonBody.mappings.find((entry) => entry.blockId === pair.inputBlockId);
    assert.equal(labelMapping.semanticRole, "label");
    assert.equal(inputMapping.semanticRole, "input");
    assert.equal(inputMapping.suggestions.length > 0, true);
    assert.equal(response.jsonBody.mappedFields.some((entry) => entry.blockId === pair.inputBlockId), true);
    assert.equal(response.jsonBody.mappedFields.some((entry) => entry.blockId === pair.labelBlockId), false);
  }
});

test("classifies real-form horizontal, vertical, and multiline blank geometry", async () => {
  const pages = [{
    pageNumber: 1,
    width: 8.5,
    height: 11,
    unit: "inch",
    lines: [
      { content: "Applicant's Name:", confidence: 0.99, boundingBox: { x: 0.4966, y: 3.3468, width: 1.1365, height: 0.1575 } },
      { content: "Location Address:", confidence: 0.99, boundingBox: { x: 4.6177, y: 3.3516, width: 1.1365, height: 0.1432 } },
      { content: "Mailing Address:", confidence: 0.99, boundingBox: { x: 0.4966, y: 3.5903, width: 1.0363, height: 0.148 } },
      { content: "1. Time in business:", confidence: 0.99, boundingBox: { x: 0.5014, y: 4.3876, width: 1.3275, height: 0.148 } },
      { content: "Agent Name:", confidence: 0.99, boundingBox: { x: 0.5, y: 5, width: 1.2, height: 0.15 } },
      { content: "Operations Description:", confidence: 0.99, boundingBox: { x: 0.5, y: 6, width: 2.8, height: 0.15 } },
    ],
  }];
  const rawResult = {
    tables: [{
      rowCount: 2,
      columnCount: 1,
      boundingRegions: [{ pageNumber: 1 }],
      cells: [
        {
          rowIndex: 0,
          columnIndex: 0,
          content: "Agent Name:",
          boundingRegions: [{ pageNumber: 1, polygon: [
            { x: 0.4, y: 4.95 }, { x: 3, y: 4.95 }, { x: 3, y: 5.25 }, { x: 0.4, y: 5.25 },
          ] }],
        },
        {
          rowIndex: 1,
          columnIndex: 0,
          content: "",
          boundingRegions: [{ pageNumber: 1, polygon: [
            { x: 0.4, y: 5.25 }, { x: 3, y: 5.25 }, { x: 3, y: 5.55 }, { x: 0.4, y: 5.55 },
          ] }],
        },
        {
          rowIndex: 2,
          columnIndex: 0,
          content: "Operations Description:",
          boundingRegions: [{ pageNumber: 1, polygon: [
            { x: 0.4, y: 5.95 }, { x: 3.4, y: 5.95 }, { x: 3.4, y: 7.1 }, { x: 0.4, y: 7.1 },
          ] }],
        },
      ],
    }],
  };

  const result = await buildHybridFieldExtraction({ pages, rawResult });
  const pairedInput = (text) => {
    const label = result.fieldCatalog.find((entry) => entry.source === "di_line" && entry.text === text);
    const pair = result.groupedStructures.labelInputPairs.find((entry) => entry.labelBlockId === label.id);
    return result.fieldCatalog.find((entry) => entry.id === pair.inputBlockId);
  };

  const applicant = pairedInput("Applicant's Name:");
  const mailing = pairedInput("Mailing Address:");
  const agent = pairedInput("Agent Name:");
  const operations = pairedInput("Operations Description:");
  assert.equal(applicant.role, "input");
  assert.equal(applicant.boundingBox.x > 150, true);
  assert.equal(mailing.role, "value-region");
  assert.equal(mailing.boundingBox.height > 50, true);
  assert.equal(agent.role, "input");
  assert.equal(agent.rowIndex, 1);
  assert.equal(operations.role, "value-region");

  const response = await mapFields({
    json: async () => ({
      documentId: "real-form-geometry",
      blocks: result.blocks,
      fieldCatalog: result.fieldCatalog,
      groupedStructures: result.groupedStructures,
      deterministic: true,
    }),
  }, { warn() {}, error() {} });
  const mappedIds = new Set(response.jsonBody.mappedFields.map((entry) => entry.blockId));
  assert.equal([applicant, mailing, agent, operations].every((entry) => mappedIds.has(entry.id)), true);
});

test("mapping flow preserves the Wave 9 hybrid contract", async () => {
  const fieldCatalog = [
    {
      id: "question-1",
      page: 1,
      role: "question",
      valueType: "label",
      text: "Do you use subcontractors?",
      boundingBox: { x: 20, y: 20, width: 220, height: 16 },
      source: "di_line",
      confidence: 0.98,
      semanticLabel: "Subcontractor usage question",
    },
    {
      id: "value-1",
      page: 1,
      role: "value-region",
      valueType: "text",
      text: "Subcontractor explanation",
      boundingBox: { x: 20, y: 42, width: 300, height: 40 },
      semanticValueRegion: { x: 20, y: 42, width: 300, height: 40 },
      source: "blank_detector",
      confidence: 0.95,
      semanticLabel: "Subcontractor explanation",
    },
  ];
  const blocks = fieldCatalog.map((entry) => ({
    id: entry.id,
    page: entry.page,
    type: "text",
    text: entry.text,
    boundingBox: entry.boundingBox,
    confidence: entry.confidence,
  }));
  const groupedStructures = {
    tables: [],
    labelInputPairs: [],
    questionAnswerPairs: [{
      id: "qa-1",
      page: 1,
      questionFieldId: "question-1",
      answerFieldId: "value-1",
    }],
    checkboxGroups: [],
  };
  const bboxNormalization = {
    coordinateSpace: "pixel",
    origin: "top-left",
    dpi: 96,
    pageDimensions: [{ page: 1, width: 816, height: 1056 }],
  };
  const request = {
    json: async () => ({
      documentId: "wave9-contract-test",
      blocks,
      fieldCatalog,
      groupedStructures,
      bboxNormalization,
      deterministic: true,
    }),
  };
  const context = {
    warn() {},
    error() {},
  };

  const response = await mapFields(request, context);
  assert.equal(response.status, 200);
  assert.equal(response.jsonBody.contractVersion, "wave9.hybrid.v1");
  assert.deepEqual(response.jsonBody.fieldCatalog, fieldCatalog);
  assert.deepEqual(response.jsonBody.groupedStructures, groupedStructures);
  assert.deepEqual(response.jsonBody.bboxNormalization, bboxNormalization);
  const questionMapping = response.jsonBody.mappings.find((entry) => entry.blockId === "question-1");
  const valueMapping = response.jsonBody.mappings.find((entry) => entry.blockId === "value-1");
  assert.equal(questionMapping.semanticRole, "question");
  assert.equal(valueMapping.semanticRole, "value-region");
  assert.deepEqual(valueMapping.semanticValueRegion, fieldCatalog[1].semanticValueRegion);
});

test("mapping flow promotes every business role and grouped fillable geometry", async () => {
  const roles = [
    "input", "business", "contact", "producer", "agency", "applicant",
    "company", "underwriter", "address", "email", "phone", "website",
  ];
  const fieldCatalog = roles.map((role, index) => ({
    id: `${role}-${index}`,
    page: 1,
    role,
    valueType: "text",
    text: "",
    semanticLabel: `${role} field`,
    boundingBox: { x: 20, y: 20 + index * 20, width: 180, height: 16 },
    semanticValueRegion: { x: 90, y: 20 + index * 20, width: 110, height: 16 },
    source: "blank_detector",
    confidence: 0.95,
  }));
  fieldCatalog.push({
    id: "grouped-only",
    page: 1,
    role: "label",
    valueType: "text",
    text: "",
    semanticLabel: "grouped business field",
    boundingBox: { x: 20, y: 280, width: 180, height: 16 },
    source: "blank_detector",
    confidence: 0.95,
  });
  const blocks = fieldCatalog.map((entry) => ({
    id: entry.id,
    page: entry.page,
    type: "text",
    text: "",
    boundingBox: entry.semanticValueRegion || entry.boundingBox,
    confidence: entry.confidence,
  }));
  const groupedStructures = {
    labelInputPairs: [{
      id: "business-pair",
      page: 1,
      labelBlockId: "input-label",
      inputBlockId: "grouped-only",
    }],
    tables: [],
    questionAnswerPairs: [],
    checkboxGroups: [],
  };
  const response = await mapFields({
    json: async () => ({
      documentId: "role-promotion-test",
      blocks,
      fieldCatalog,
      groupedStructures,
      deterministic: true,
    }),
  }, { warn() {}, error() {} });

  assert.equal(response.status, 200);
  assert.equal(response.jsonBody.mappings.length, blocks.length);
  assert.equal(response.jsonBody.mappedFields.length, blocks.length);
  for (const role of roles) {
    const mapping = response.jsonBody.mappedFields.find((entry) => entry.semanticRole === role);
    assert.equal(Boolean(mapping), true);
    assert.equal(mapping.text, `${role} field`);
    assert.equal(mapping.suggestions.length > 0, true);
  }
  assert.equal(
    response.jsonBody.mappedFields.some((entry) => entry.blockId === "grouped-only"),
    true,
  );
  assert.equal(
    response.jsonBody.mappedFields.every((entry) => entry.suggestions.length > 0),
    true,
  );
});

test("mapping flow handles an ACORD 125-scale hybrid catalog without the legacy embedding path", async () => {
  const fieldCatalog = Array.from({ length: 854 }, (_, index) => ({
    id: `field-${index}`,
    page: Math.floor(index / 220) + 1,
    role: index % 4 === 0 ? "input" : "label",
    valueType: index % 4 === 0 ? "text" : "label",
    text: index % 4 === 0 ? "Applicant business name" : `Semantic label ${index}`,
    semanticLabel: index % 4 === 0 ? "Applicant business name" : `Semantic label ${index}`,
    boundingBox: { x: 20, y: index % 200, width: 180, height: 16 },
    semanticValueRegion: index % 4 === 0
      ? { x: 210, y: index % 200, width: 240, height: 18 }
      : undefined,
    source: index % 4 === 0 ? "blank_detector" : "di_line",
    confidence: 0.95,
  }));
  const blocks = fieldCatalog.map((entry) => ({
    id: entry.id,
    page: entry.page,
    type: "text",
    text: entry.text,
    boundingBox: entry.boundingBox,
    confidence: entry.confidence,
  }));
  const startedAt = Date.now();
  const response = await mapFields({
    json: async () => ({
      documentId: "acord-125-scale",
      blocks,
      fieldCatalog,
      groupedStructures: {
        labelInputPairs: [],
        tables: [],
        questionAnswerPairs: [],
        checkboxGroups: [],
      },
      deterministic: true,
    }),
  }, { warn() {}, error() {} });

  assert.equal(response.status, 200);
  assert.equal(response.jsonBody.mappings.length, 854);
  assert.equal(response.jsonBody.mappedFields.length, 214);
  assert.equal(response.jsonBody.mappedFields.every((mapping) => mapping.suggestions.length > 0), true);
  assert.equal(Date.now() - startedAt < 5000, true);
});