const test = require("node:test");
const assert = require("node:assert/strict");

function buildMockAnalysisResult() {
  return {
    pages: [
      {
        pageNumber: 1,
        width: 8.5,
        height: 11,
        unit: "inch",
        lines: [
          {
            content: "Do you have prior claims?",
            confidence: 0.98,
            polygon: [0.6, 1.0, 3.2, 1.0, 3.2, 1.2, 0.6, 1.2],
          },
          {
            content: "Estimated Payroll: ____________",
            confidence: 0.97,
            polygon: [0.6, 1.5, 4.4, 1.5, 4.4, 1.7, 0.6, 1.7],
          },
          {
            content: "Rate %: ____",
            confidence: 0.95,
            polygon: [0.6, 1.9, 2.4, 1.9, 2.4, 2.1, 0.6, 2.1],
          },
        ],
        words: [
          {
            content: "Payroll",
            confidence: 0.96,
            polygon: [1.2, 1.5, 1.8, 1.5, 1.8, 1.65, 1.2, 1.65],
          },
          {
            content: "$",
            confidence: 0.96,
            polygon: [2.0, 1.5, 2.1, 1.5, 2.1, 1.65, 2.0, 1.65],
          },
          {
            content: "Rate",
            confidence: 0.94,
            polygon: [0.65, 1.9, 1.0, 1.9, 1.0, 2.05, 0.65, 2.05],
          },
        ],
        selectionMarks: [
          {
            state: "selected",
            confidence: 0.93,
            polygon: [0.6, 2.4, 0.75, 2.4, 0.75, 2.55, 0.6, 2.55],
          },
        ],
      },
    ],
    tables: [
      {
        rowCount: 2,
        columnCount: 2,
        boundingRegions: [
          {
            pageNumber: 1,
            polygon: [0.5, 3.0, 5.5, 3.0, 5.5, 4.2, 0.5, 4.2],
          },
        ],
        cells: [
          {
            rowIndex: 0,
            columnIndex: 0,
            content: "Class Code",
            boundingRegions: [
              {
                pageNumber: 1,
                polygon: [0.5, 3.0, 2.5, 3.0, 2.5, 3.4, 0.5, 3.4],
              },
            ],
          },
          {
            rowIndex: 0,
            columnIndex: 1,
            content: "Payroll $",
            boundingRegions: [
              {
                pageNumber: 1,
                polygon: [2.5, 3.0, 5.5, 3.0, 5.5, 3.4, 2.5, 3.4],
              },
            ],
          },
          {
            rowIndex: 1,
            columnIndex: 0,
            content: "8810",
            boundingRegions: [
              {
                pageNumber: 1,
                polygon: [0.5, 3.4, 2.5, 3.4, 2.5, 3.8, 0.5, 3.8],
              },
            ],
          },
          {
            rowIndex: 1,
            columnIndex: 1,
            content: "",
            boundingRegions: [
              {
                pageNumber: 1,
                polygon: [2.5, 3.4, 5.5, 3.4, 5.5, 3.8, 2.5, 3.8],
              },
            ],
          },
        ],
      },
    ],
  };
}

function buildMockAnalysisResultNoTable() {
  return {
    pages: [
      {
        pageNumber: 1,
        width: 8.5,
        height: 11,
        unit: "inch",
        lines: [
          {
            content: "Have you filed for bankruptcy in the last 5 years?",
            confidence: 0.99,
            polygon: [0.6, 1.0, 5.6, 1.0, 5.6, 1.2, 0.6, 1.2],
          },
          {
            content: "Explain: _____________________________",
            confidence: 0.97,
            polygon: [0.6, 1.5, 5.0, 1.5, 5.0, 1.7, 0.6, 1.7],
          },
          {
            content: "If yes, provide details:",
            confidence: 0.95,
            polygon: [0.6, 1.9, 3.8, 1.9, 3.8, 2.1, 0.6, 2.1],
          },
          {
            content: "____________________________________",
            confidence: 0.95,
            polygon: [0.6, 2.2, 4.8, 2.2, 4.8, 2.35, 0.6, 2.35],
          },
        ],
        words: [
          {
            content: "bankruptcy",
            confidence: 0.96,
            polygon: [2.2, 1.0, 3.0, 1.0, 3.0, 1.15, 2.2, 1.15],
          },
          {
            content: "details",
            confidence: 0.95,
            polygon: [2.1, 1.9, 2.8, 1.9, 2.8, 2.05, 2.1, 2.05],
          },
        ],
        selectionMarks: [
          {
            state: "unselected",
            confidence: 0.92,
            polygon: [0.6, 2.7, 0.75, 2.7, 0.75, 2.85, 0.6, 2.85],
          },
        ],
      },
    ],
    tables: [],
  };
}

function makeMultipartRequest() {
  const headers = {
    get(name) {
      const key = String(name || "").toLowerCase();
      if (key === "content-type") return "multipart/form-data; boundary=fixture";
      if (key === "x-file-name") return "fixture.pdf";
      return null;
    },
  };

  const form = new FormData();
  form.append("file", new Blob([Buffer.from("%PDF-1.4 mock fixture")], { type: "application/pdf" }), "fixture.pdf");

  return {
    headers,
    formData: async () => form,
    json: async () => ({}),
  };
}

function makeContext() {
  return {
    info() {},
    log() {},
    warn() {},
    error() {},
  };
}

async function runExtractDocumentWithMockAnalysis(mockAnalysisResult) {
  const extractionModulePath = require.resolve("../dist/extraction/index.js");
  const originalExtractionModule = require(extractionModulePath);
  const previousExtractionCacheEntry = require.cache[extractionModulePath];
  require.cache[extractionModulePath] = {
    id: extractionModulePath,
    filename: extractionModulePath,
    loaded: true,
    exports: {
      ...originalExtractionModule,
      createDocumentAnalysisClient: () => ({
        beginAnalyzeDocument: async () => ({
          pollUntilDone: async () => mockAnalysisResult,
        }),
      }),
    },
  };

  const mappingModulePath = require.resolve("../dist/mapping/index.js");
  const previousMappingCacheEntry = require.cache[mappingModulePath];
  require.cache[mappingModulePath] = {
    id: mappingModulePath,
    filename: mappingModulePath,
    loaded: true,
    exports: {
      mapBlocksWithAcord: async (blocks) =>
        blocks.map((block) => ({
          blockId: block.id,
          page: block.page,
          text: block.text,
          boundingBox: block.boundingBox,
          suggestions: [],
          chosen: undefined,
        })),
    },
  };

  const extractDocumentModulePath = require.resolve("../dist/api/extractDocument.js");
  const previousExtractDocumentCacheEntry = require.cache[extractDocumentModulePath];
  delete require.cache[extractDocumentModulePath];
  const extractDocumentModule = require(extractDocumentModulePath);

  try {
    return await extractDocumentModule.extractDocument(
      makeMultipartRequest(),
      makeContext(),
    );
  } finally {
    if (previousExtractDocumentCacheEntry) {
      require.cache[extractDocumentModulePath] = previousExtractDocumentCacheEntry;
    } else {
      delete require.cache[extractDocumentModulePath];
    }
    if (previousExtractionCacheEntry) {
      require.cache[extractionModulePath] = previousExtractionCacheEntry;
    } else {
      delete require.cache[extractionModulePath];
    }
    if (previousMappingCacheEntry) {
      require.cache[mappingModulePath] = previousMappingCacheEntry;
    } else {
      delete require.cache[mappingModulePath];
    }
  }
}

test("extractDocument multipart emits strict hybrid extraction payload", async () => {
  const response = await runExtractDocumentWithMockAnalysis(buildMockAnalysisResult());

  assert.equal(response.status, 200);
  assert.ok(response.jsonBody);

  const body = response.jsonBody;
  assert.equal(body.extractionMethod, "document-intelligence-wave8");
  assert.ok(Array.isArray(body.fields));
  assert.ok(body.fields.length > 0);
  assert.ok(Array.isArray(body.fieldCatalog));
  assert.ok(body.fieldCatalog.length > 0);

  assert.ok(body.groupedStructures);
  assert.ok(Array.isArray(body.groupedStructures.tables));
  assert.ok(Array.isArray(body.groupedStructures.questionAnswerPairs));
  assert.ok(Array.isArray(body.groupedStructures.checkboxGroups));

  assert.ok(body.extractionDiagnostics);
  assert.ok(body.extractionDiagnostics.blankRegionCount >= 1);
  assert.ok(body.extractionDiagnostics.tableCellCount >= 1);

  const hasNumericLikeField = body.fields.some(
    (field) =>
      field.type === "numeric" &&
      field.metadata &&
      (field.metadata.tooltip || "").includes("currency"),
  );
  assert.equal(hasNumericLikeField, true);

  const hasQuestionPair = body.groupedStructures.questionAnswerPairs.length >= 1;
  assert.equal(hasQuestionPair, true);

  const hasCheckboxGroup = body.groupedStructures.checkboxGroups.length >= 1;
  assert.equal(hasCheckboxGroup, true);

  const hasTableSummary = body.groupedStructures.tables.some(
    (table) => table.rowCount >= 2 && table.columnCount >= 2,
  );
  assert.equal(hasTableSummary, true);
});

test("extractDocument multipart pairs questions to blank answers without table context", async () => {
  const response = await runExtractDocumentWithMockAnalysis(buildMockAnalysisResultNoTable());

  assert.equal(response.status, 200);
  assert.ok(response.jsonBody);

  const body = response.jsonBody;
  assert.equal(body.extractionMethod, "document-intelligence-wave8");
  assert.ok(Array.isArray(body.groupedStructures.tables));
  assert.equal(body.groupedStructures.tables.length, 0);

  assert.ok(Array.isArray(body.groupedStructures.questionAnswerPairs));
  assert.ok(body.groupedStructures.questionAnswerPairs.length >= 1);

  const pairedAnswerIds = new Set(
    body.groupedStructures.questionAnswerPairs.map((pair) => pair.answerFieldId),
  );
  const answerCatalogEntries = body.fieldCatalog.filter((entry) =>
    pairedAnswerIds.has(entry.id),
  );
  assert.ok(answerCatalogEntries.length >= 1);
  assert.ok(
    answerCatalogEntries.some(
      (entry) => entry.role === "question_answer_pair" || entry.role === "input",
    ),
  );

  assert.ok(body.extractionDiagnostics.blankRegionCount >= 1);
  assert.equal(body.extractionDiagnostics.tableCellCount, 0);
});
