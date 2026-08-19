const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildHybridFieldExtraction,
  buildRp9GeneralInformationGroups,
  buildRp9PremisesGroups,
  buildRp9ProducerGroups,
  buildRp9QuestionGroups,
  toPixelBox,
} = require("../dist/extraction/hybridFieldExtraction.js");
const { boundsFromPolygon } = require("../dist/extraction/bboxNormalization.js");
const { mapFields } = require("../dist/api/mapFields.js");

test("builds RP-9 Producer clusters and indices from ACORD 125 page-one cues", () => {
  const labels = [
    ["agent", "AGENT NAME", 20],
    ["address", "ADDRESS", 50],
    ["city", "CITY", 70],
    ["state", "STATE", 90],
    ["zip", "ZIP CODE", 110],
    ["phone", "PHONE", 130],
    ["fax", "FAX", 150],
    ["email", "E-MAIL ADDRESS", 170],
    ["code", "CODE", 190],
    ["sub-code", "SUB CODE", 210],
    ["customer", "AGENCY CUSTOMER ID", 230],
    ["bill", "AGENCY BILL", 250],
  ];
  const catalog = labels.map(([id, label, y]) => ({
    id, page: 1, role: "input", valueType: "text", text: label,
    semanticLabel: label, boundingBox: { x: 20, y, width: 120, height: 16 },
    semanticValueRegion: { x: 150, y, width: 180, height: 16 },
    source: "blank_detector", confidence: 0.99,
  }));
  const groups = buildRp9ProducerGroups(catalog);
  assert.equal(groups.some((group) => group.label === "ProducerInformation"), true);
  for (const label of ["ProducerContact", "ProducerAddress", "ProducerCodes", "ProducerCustomerId"]) {
    assert.equal(groups.some((group) => group.label === label), true, label);
  }
  assert.equal(catalog.every((entry) => entry.semanticRole === "Producer"), true);
  assert.deepEqual([...new Set(catalog.map((entry) => entry.producerIndex))], [0]);
});

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
  const question = result.fieldCatalog.find((entry) => entry.role === "question");
  const input = result.fieldCatalog.find((entry) => entry.role === "input" && entry.source === "blank_detector");
  const checkbox = result.fieldCatalog.find((entry) => entry.role === "checkbox");
  const leftCell = result.fieldCatalog.find((entry) => entry.tableId === "table-1" && entry.rowIndex === 1 && entry.columnIndex === 0);
  const rightCell = result.fieldCatalog.find((entry) => entry.tableId === "table-1" && entry.rowIndex === 1 && entry.columnIndex === 1);

  assert.equal(result.fieldCatalog.some((entry) => entry.text === "APPLICANT INFORMATION"), false);
  assert.equal(input.semanticValueRegion.x >= 96, true);
  assert.equal(checkbox.boundingBox.x, 432);
  assert.equal(leftCell, undefined);
  assert.equal(rightCell, undefined);
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

test("classifies phone, fax, zip, and year labels as typed blanks and keeps same-row semantic labels", async () => {
  const lines = [
    { content: "Phone Number: __________", confidence: 0.99, boundingBox: { x: 0.5, y: 0.5, width: 2.4, height: 0.18 } },
    { content: "Fax Number: __________", confidence: 0.99, boundingBox: { x: 0.5, y: 0.72, width: 2.4, height: 0.18 } },
    { content: "ZIP Code: ______", confidence: 0.99, boundingBox: { x: 0.5, y: 0.94, width: 2.2, height: 0.18 } },
    { content: "Year Established: ____", confidence: 0.99, boundingBox: { x: 0.5, y: 1.16, width: 2.6, height: 0.18 } },
  ];

  const result = await buildHybridFieldExtraction({
    pages: [{ pageNumber: 1, width: 8.5, height: 11, unit: "inch", lines }],
  });

  const phoneInput = result.fieldCatalog.find((entry) => entry.semanticLabel === "Phone Number" && entry.role === "input");
  const faxInput = result.fieldCatalog.find((entry) => entry.semanticLabel === "Fax Number" && entry.role === "input");
  const zipInput = result.fieldCatalog.find((entry) => entry.semanticLabel === "ZIP Code" && entry.role === "input");
  const yearInput = result.fieldCatalog.find((entry) => entry.semanticLabel === "Year Established" && entry.role === "input");

  assert.equal(phoneInput.valueType, "numeric");
  assert.equal(faxInput.valueType, "numeric");
  assert.equal(zipInput.valueType, "numeric");
  assert.equal(yearInput.valueType, "numeric");
  assert.equal(result.groupedStructures.labelInputPairs.length, 4);
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
  assert.equal(result.groupedStructures.semanticGroups.length, labels.length);

  for (const pair of result.groupedStructures.labelInputPairs) {
    const label = result.fieldCatalog.find((entry) => entry.id === pair.labelBlockId);
    const input = result.fieldCatalog.find((entry) => entry.id === pair.inputBlockId);
    const labelBlock = result.blocks.find((entry) => entry.id === pair.labelBlockId);
    const inputBlock = result.blocks.find((entry) => entry.id === pair.inputBlockId);
    assert.equal(label.role, "label");
    assert.equal(input.role, "input");
    assert.equal(label.groupId, pair.id);
    assert.equal(input.groupId, pair.id);
    assert.deepEqual(input.semanticGroupIds, [`table-1-row-${input.rowIndex + 1}`]);
    assert.equal(labelBlock, undefined);
    assert.deepEqual(inputBlock.boundingBox, input.semanticValueRegion);
    assert.deepEqual(input.labelBoundingBox, label.boundingBox);
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
    assert.equal(labelMapping, undefined);
    assert.equal(inputMapping.semanticRole, "input");
    assert.deepEqual(inputMapping.labelBoundingBox, result.fieldCatalog
      .find((entry) => entry.id === pair.labelBlockId).boundingBox);
    assert.equal(inputMapping.suggestions.length > 0, true);
    assert.equal(response.jsonBody.mappedFields.some((entry) => entry.blockId === pair.inputBlockId), true);
    assert.equal(response.jsonBody.mappedFields.some((entry) => entry.blockId === pair.labelBlockId), false);
  }
  const topCodeFor = (labelText) => {
    const pair = result.groupedStructures.labelInputPairs.find((entry) => {
      const label = result.fieldCatalog.find((candidate) => candidate.id === entry.labelBlockId);
      return label?.text === labelText;
    });
    return response.jsonBody.mappedFields.find((entry) => entry.blockId === pair.inputBlockId)
      .suggestions[0].acordCode;
  };
  assert.equal(topCodeFor("Producer Name:"), "Producer_FullName");
  assert.equal(topCodeFor("Company:"), "Insurer_FullName");
  assert.equal(topCodeFor("Underwriter:"), "Insurer_Underwriter_FullName");
  assert.equal(topCodeFor("Applicant Name:"), "NamedInsured_FullName");
  assert.equal(topCodeFor("Mailing Address:"), "NamedInsured_MailingAddress_LineOne");
  assert.equal(topCodeFor("Email:"), "NamedInsured_Primary_EmailAddress");
  assert.equal(topCodeFor("Carrier:"), "Insurer_FullName");
  assert.equal(topCodeFor("Phone:"), "NamedInsured_Primary_PhoneNumber");
});

test("classifies typed blanks and preserves directional Yes/No choice groups", async () => {
  const result = await buildHybridFieldExtraction({
    pages: [{
      pageNumber: 1,
      width: 816,
      height: 1056,
      unit: "pixel",
      lines: [
        { content: "Phone: __________", confidence: 0.99, boundingBox: { x: 40, y: 80, width: 220, height: 18 } },
        { content: "Effective Date: __________", confidence: 0.99, boundingBox: { x: 40, y: 120, width: 260, height: 18 } },
        { content: "Premium: $__________", confidence: 0.99, boundingBox: { x: 40, y: 160, width: 240, height: 18 } },
        { content: "Ownership: __________%", confidence: 0.99, boundingBox: { x: 40, y: 200, width: 240, height: 18 } },
        { content: "YES", confidence: 0.99, boundingBox: { x: 130, y: 400, width: 35, height: 18 } },
        { content: "NO", confidence: 0.99, boundingBox: { x: 230, y: 400, width: 28, height: 18 } },
      ],
    }],
    rawResult: {
      pages: [{
        pageNumber: 1,
        unit: "pixel",
        selectionMarks: [
          { state: "unselected", confidence: 0.99, polygon: [
            { x: 105, y: 400 }, { x: 121, y: 400 }, { x: 121, y: 416 }, { x: 105, y: 416 },
          ] },
          { state: "selected", confidence: 0.99, polygon: [
            { x: 205, y: 400 }, { x: 221, y: 400 }, { x: 221, y: 416 }, { x: 205, y: 416 },
          ] },
        ],
      }],
    },
  });

  const typed = Object.fromEntries(
    result.fieldCatalog
      .filter((entry) => entry.source === "blank_detector")
      .map((entry) => [entry.semanticLabel, entry.valueType]),
  );
  assert.equal(typed.Phone, "numeric");
  assert.equal(typed["Effective Date"], "date");
  assert.equal(typed.Premium, "currency");
  assert.equal(typed.Ownership, "percentage");

  const checkboxGroup = result.groupedStructures.checkboxGroups.find((group) =>
    group.checkboxFieldIds.length === 2
  );
  assert.deepEqual(checkboxGroup.labels, ["YES", "NO"]);
  const semanticGroup = result.groupedStructures.semanticGroups.find((group) =>
    group.id === checkboxGroup.id
  );
  assert.equal(semanticGroup.kind, "yes-no");
  assert.deepEqual(semanticGroup.fieldIds, checkboxGroup.checkboxFieldIds);
  for (const fieldId of checkboxGroup.checkboxFieldIds) {
    const entry = result.fieldCatalog.find((candidate) => candidate.id === fieldId);
    assert.equal(entry.semanticGroupIds.includes(checkboxGroup.id), true);
  }
});

test("groups adjacent address fields without replacing label/value pair identity", async () => {
  const result = await buildHybridFieldExtraction({
    pages: [{
      pageNumber: 1,
      width: 816,
      height: 1056,
      unit: "pixel",
      lines: [
        { content: "Mailing Address: __________", confidence: 0.99, boundingBox: { x: 40, y: 80, width: 320, height: 18 } },
        { content: "City: __________", confidence: 0.99, boundingBox: { x: 40, y: 112, width: 200, height: 18 } },
        { content: "State: __________", confidence: 0.99, boundingBox: { x: 260, y: 112, width: 160, height: 18 } },
        { content: "ZIP: __________", confidence: 0.99, boundingBox: { x: 440, y: 112, width: 150, height: 18 } },
      ],
    }],
  });

  const addressGroup = result.groupedStructures.semanticGroups.find((group) =>
    group.kind === "address-block"
  );
  assert.equal(addressGroup.fieldIds.length, 4);
  for (const fieldId of addressGroup.fieldIds) {
    const entry = result.fieldCatalog.find((candidate) => candidate.id === fieldId);
    const pair = result.groupedStructures.labelInputPairs.find((candidate) =>
      candidate.inputBlockId === fieldId
    );
    assert.equal(entry.semanticGroupIds.includes(addressGroup.id), true);
    assert.equal(entry.groupId, pair.id);
  }
});

test("keeps questions as labels and promotes only fillable DI cell regions", async () => {
  const result = await buildHybridFieldExtraction({
    pages: [{
      pageNumber: 1,
      width: 816,
      height: 1056,
      unit: "pixel",
      lines: [{
        content: "Do you use subcontractors?",
        confidence: 0.99,
        boundingBox: { x: 20, y: 100, width: 220, height: 16 },
      }, {
        content: "Applicant Name:",
        confidence: 0.99,
        boundingBox: { x: 20, y: 200, width: 110, height: 16 },
      }, {
        content: "CONTRACTOR INFORMATION",
        confidence: 0.99,
        boundingBox: { x: 20, y: 300, width: 240, height: 18 },
      }, {
        content: "fragmented hallucinated wording over answer one",
        confidence: 0.45,
        boundingBox: { x: 20, y: 270, width: 280, height: 8 },
      }, {
        content: "fragmented hallucinated wording over answer two",
        confidence: 0.42,
        boundingBox: { x: 20, y: 282, width: 280, height: 8 },
      }, {
        content: "orphan scan artifact",
        confidence: 0.31,
        boundingBox: { x: 500, y: 500, width: 100, height: 8 },
      }, {
        content: "Yes",
        confidence: 0.99,
        boundingBox: { x: 620, y: 500, width: 24, height: 8 },
      }],
    }],
    rawResult: {
      tables: [{
        rowCount: 3,
        columnCount: 2,
        boundingRegions: [{ pageNumber: 1 }],
        cells: [{
          rowIndex: 0,
          columnIndex: 0,
          content: "Applicant Name:",
          boundingRegions: [{ pageNumber: 1, polygon: [
            { x: 20, y: 195 }, { x: 500, y: 195 },
            { x: 500, y: 225 }, { x: 20, y: 225 },
          ] }],
        }, {
          rowIndex: 1,
          columnIndex: 1,
          content: "Printed instructions",
          boundingRegions: [{ pageNumber: 1, polygon: [
            { x: 20, y: 240 }, { x: 300, y: 240 },
            { x: 300, y: 260 }, { x: 20, y: 260 },
          ] }],
        }, {
          rowIndex: 2,
          columnIndex: 1,
          content: "",
          boundingRegions: [{ pageNumber: 1, polygon: [
            { x: 20, y: 270 }, { x: 300, y: 270 },
            { x: 300, y: 290 }, { x: 20, y: 290 },
          ] }],
        }],
      }],
    },
  });

  const question = result.fieldCatalog.find((entry) => entry.text === "Do you use subcontractors?");
  const questionPair = result.groupedStructures.labelInputPairs.find(
    (pair) => pair.labelBlockId === question.id,
  );
  const questionAnswer = result.fieldCatalog.find((entry) => entry.id === questionPair.inputBlockId);
  const mixedPair = result.groupedStructures.labelInputPairs.find((pair) => {
    const label = result.fieldCatalog.find((entry) => entry.id === pair.labelBlockId);
    return label?.text === "Applicant Name:";
  });
  const textOnlyCell = result.fieldCatalog.find((entry) => entry.text === "Printed instructions");
  const blankOnlyCell = result.fieldCatalog.find(
    (entry) => entry.source === "di_table_cell" && entry.text === "" && entry.role === "table-cell",
  );
  const fieldIds = new Set(result.fields.map((field) => field.id));

  assert.equal(question.role, "question");
  assert.equal(Boolean(questionPair), true);
  assert.equal(fieldIds.has(question.id), false);
  assert.equal(fieldIds.has(questionAnswer.id), true);
  assert.equal(Boolean(mixedPair), true);
  assert.equal(fieldIds.has(mixedPair.labelBlockId), false);
  assert.equal(fieldIds.has(mixedPair.inputBlockId), true);
  assert.equal(textOnlyCell, undefined);
  assert.equal(
    result.fieldCatalog.some((entry) => /fragmented hallucinated wording/.test(entry.text)),
    false,
  );
  assert.equal(result.fieldCatalog.some((entry) => entry.text === "orphan scan artifact"), false);
  assert.equal(result.fieldCatalog.some((entry) => entry.text === "Yes"), false);
  assert.equal(blankOnlyCell, undefined);
  assert.equal(
    result.fieldCatalog
      .filter((entry) => ["input", "value-region", "checkbox", "table-cell"].includes(entry.role))
      .every((entry) => fieldIds.has(entry.id)),
    true,
  );
});

test("does not promote question text as an input when an explicit checkbox occupies the region", async () => {
  const result = await buildHybridFieldExtraction({
    pages: [{
      pageNumber: 1,
      width: 816,
      height: 1056,
      unit: "pixel",
      lines: [{
        content: "1. IS A FORMAL SAFETY PROGRAM IN OPERATION?",
        confidence: 0.99,
        boundingBox: { x: 20, y: 100, width: 500, height: 20 },
      }],
    }],
    rawResult: {
      pages: [{
        pageNumber: 1,
        unit: "pixel",
        selectionMarks: [{
          state: "unselected",
          confidence: 0.99,
          polygon: [
            { x: 470, y: 102 }, { x: 482, y: 102 },
            { x: 482, y: 114 }, { x: 470, y: 114 },
          ],
        }],
      }],
    },
  });

  const questionInputs = result.fields.filter((field) =>
    field.type !== "checkbox" &&
    /SAFETY PROGRAM IN OPERATION\?/.test(field.semanticLabel || field.text),
  );
  assert.equal(questionInputs.length, 0);
  assert.equal(result.fields.filter((field) => field.type === "checkbox").length, 1);
});

test("promotes typed numeric, dollar, and percentage blanks without section text", async () => {
  const result = await buildHybridFieldExtraction({
    pages: [{
      pageNumber: 1,
      width: 816,
      height: 1056,
      unit: "pixel",
      lines: [{
        content: "MARKEL INSURANCE COMPANY",
        confidence: 0.99,
        boundingBox: { x: 20, y: 20, width: 260, height: 18 },
      }, {
        content: "Agency Name and Address:",
        confidence: 0.99,
        boundingBox: { x: 20, y: 60, width: 180, height: 16 },
      }, {
        content: "Overall Operations",
        confidence: 0.99,
        boundingBox: { x: 20, y: 100, width: 180, height: 18 },
      }, {
        content: "FEIN: ___",
        confidence: 0.99,
        boundingBox: { x: 20, y: 150, width: 40, height: 4 },
      }, {
        content: "$ _______",
        confidence: 0.99,
        boundingBox: { x: 20, y: 180, width: 90, height: 12 },
      }, {
        content: "___ %",
        confidence: 0.99,
        boundingBox: { x: 20, y: 210, width: 32, height: 4 },
      }, {
        content: "__________",
        confidence: 0.99,
        boundingBox: { x: 20, y: 240, width: 100, height: 4 },
      }],
    }],
    rawResult: {
      tables: [{
        rowCount: 4,
        columnCount: 1,
        boundingRegions: [{ pageNumber: 1 }],
        cells: [{
          rowIndex: 0,
          columnIndex: 0,
          content: "Employees: ___",
          boundingRegions: [{ pageNumber: 1, polygon: [
            { x: 20, y: 300 }, { x: 84, y: 300 },
            { x: 84, y: 304 }, { x: 20, y: 304 },
          ] }],
        }, {
          rowIndex: 1,
          columnIndex: 0,
          content: "Payroll $ _______",
          boundingRegions: [{ pageNumber: 1, polygon: [
            { x: 20, y: 330 }, { x: 180, y: 330 },
            { x: 180, y: 344 }, { x: 20, y: 344 },
          ] }],
        }, {
          rowIndex: 2,
          columnIndex: 0,
          content: "Rate ___ %",
          boundingRegions: [{ pageNumber: 1, polygon: [
            { x: 20, y: 370 }, { x: 70, y: 370 },
            { x: 70, y: 374 }, { x: 20, y: 374 },
          ] }],
        }, {
          rowIndex: 3,
          columnIndex: 0,
          content: "Printed instructions only",
          boundingRegions: [{ pageNumber: 1, polygon: [
            { x: 20, y: 400 }, { x: 220, y: 400 },
            { x: 220, y: 416 }, { x: 20, y: 416 },
          ] }],
        }],
      }, {
        rowCount: 2,
        columnCount: 1,
        boundingRegions: [{ pageNumber: 1 }],
        cells: [{
          rowIndex: 0,
          columnIndex: 0,
          content: "FEIN",
          boundingRegions: [{ pageNumber: 1, polygon: [
            { x: 300, y: 300 }, { x: 330, y: 300 },
            { x: 330, y: 304 }, { x: 300, y: 304 },
          ] }],
        }, {
          rowIndex: 1,
          columnIndex: 0,
          content: "",
          boundingRegions: [{ pageNumber: 1, polygon: [
            { x: 300, y: 320 }, { x: 330, y: 320 },
            { x: 330, y: 324 }, { x: 300, y: 324 },
          ] }],
        }],
      }],
    },
  });

  const fieldEntries = result.fields.map((field) =>
    result.fieldCatalog.find((entry) => entry.id === field.id),
  );
  const fein = fieldEntries.find((entry) => entry.semanticLabel === "FEIN");
  const dollarFields = fieldEntries.filter((entry) => entry.valueType === "currency");
  const percentageFields = fieldEntries.filter((entry) => entry.valueType === "percentage");
  const employees = fieldEntries.find((entry) => entry.semanticLabel === "Employees");
  const agency = fieldEntries.find((entry) => entry.semanticLabel === "Agency Name and Address");
  const blankNumericCell = fieldEntries.find((entry) =>
    entry.role === "table-cell" && entry.semanticLabel === "FEIN",
  );

  assert.ok(fein, JSON.stringify(fieldEntries.map((entry) => ({
    label: entry.semanticLabel,
    valueType: entry.valueType,
    box: entry.boundingBox,
  }))));
  assert.equal(fein.valueType, "numeric");
  assert.equal(fein.boundingBox.width >= 12 && fein.boundingBox.width <= 40, true);
  assert.equal(fein.boundingBox.width >= 6 && fein.boundingBox.width <= 64, true);
  assert.equal(fein.boundingBox.height >= 8, true);
  assert.equal(employees.valueType, "numeric");
  assert.equal(employees.boundingBox.height >= 8, true);
  assert.equal(agency.role, "input");
  assert.ok(blankNumericCell, JSON.stringify({
    catalog: result.fieldCatalog.filter((entry) => entry.semanticLabel === "FEIN"),
    fieldIds: result.fields.map((field) => field.id),
  }));
  assert.equal(blankNumericCell.valueType, "numeric");
  assert.equal(blankNumericCell.boundingBox.width, 30);
  assert.equal(blankNumericCell.boundingBox.height, 8);
  assert.equal(dollarFields.length, 2);
  assert.equal(dollarFields.every((entry) => entry.role === "value-region"), true);
  assert.equal(percentageFields.length, 2);
  assert.equal(percentageFields.every((entry) => entry.role === "input"), true);
  assert.equal(fieldEntries.some((entry) => entry.text === "$" || entry.text === "%"), false);
  assert.equal(fieldEntries.some((entry) => entry.text === "Overall Operations"), false);
  assert.equal(fieldEntries.some((entry) => /MARKEL INSURANCE COMPANY/.test(entry.text)), false);
  assert.equal(fieldEntries.some((entry) => entry.text === "Printed instructions only"), false);
  assert.equal(fieldEntries.some((entry) => entry.text === "__________"), false);

  const response = await mapFields({
    json: async () => ({
      documentId: "typed-inline-blanks",
      blocks: result.blocks,
      fieldCatalog: result.fieldCatalog,
      groupedStructures: result.groupedStructures,
      deterministic: true,
    }),
  }, { warn() {}, error() {} });
  const mappedIds = new Set(response.jsonBody.mappedFields.map((entry) => entry.blockId));
  assert.equal(fieldEntries.every((entry) => mappedIds.has(entry.id)), true);
  assert.equal(
    response.jsonBody.mappedFields.every((entry) =>
      !["section-label", "header", "title"].includes(entry.semanticRole)
    ),
    true,
  );
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
  assert.equal(
    [applicant, mailing, agent].every((entry) => mappedIds.has(entry.id)),
    true,
    JSON.stringify({
      required: [applicant.id, mailing.id, agent.id],
      mapped: [...mappedIds],
    }),
  );
  assert.equal(mappedIds.has(operations.id), true);
  for (let leftIndex = 0; leftIndex < response.jsonBody.mappedFields.length; leftIndex += 1) {
    const left = response.jsonBody.mappedFields[leftIndex].semanticValueRegion;
    for (let rightIndex = leftIndex + 1; rightIndex < response.jsonBody.mappedFields.length; rightIndex += 1) {
      const right = response.jsonBody.mappedFields[rightIndex].semanticValueRegion;
      const overlapWidth = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
      const overlapHeight = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
      assert.equal(overlapWidth * overlapHeight, 0);
    }
  }
  const topCode = (entry) => response.jsonBody.mappedFields
    .find((mapping) => mapping.blockId === entry.id)
    .suggestions[0].acordCode;
  const topProjection = (entry) => response.jsonBody.mappedFields
    .find((mapping) => mapping.blockId === entry.id)
    .suggestions[0].rp8;
  assert.equal(topCode(applicant), "NamedInsured_FullName");
  assert.equal(topProjection(applicant).semanticIdentity, "Applicant:identity.name");
  assert.equal(topCode(mailing), "GeneralInfo.MailingAddress.Line1");
  assert.equal(topProjection(mailing).ontologyScope, "canonical");
  assert.equal(topCode(agent), "Producer_FullName");
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
  assert.equal(response.jsonBody.mappedFields.some((entry) => entry.blockId === "question-1"), false);
  assert.equal(response.jsonBody.mappedFields.some((entry) => entry.blockId === "value-1"), true);
});

test("mapping flow applies strict role, geometry, artifact, and overlap promotion rules", async () => {
  const entries = [
    ["paired-input", "input", 20, 20, 180, 16, "Applicant Name"],
    ["value", "value-region", 20, 50, 300, 90, "Mailing Address"],
    ["checkbox", "checkbox", 20, 150, 20, 20, "Yes"],
    ["blank-cell", "table-cell", 20, 180, 180, 16, ""],
    ["question", "question", 20, 210, 220, 16, "Do you use subcontractors?"],
    ["title", "title", 20, 240, 220, 16, "APPLICATION"],
    ["header", "header", 20, 270, 220, 16, "ACORD 125"],
    ["footer", "footer", 20, 300, 220, 16, "Page 1"],
    ["section", "section-label", 20, 330, 220, 16, "GENERAL INFORMATION"],
    ["ocr", "ocr-text", 20, 360, 220, 16, "scan artifact"],
    ["label", "label", 20, 390, 220, 16, "Applicant Name:"],
    ["text-cell", "table-cell", 20, 420, 180, 16, "Printed cell text"],
    ["narrow", "input", 20, 450, 19, 16, "Narrow"],
    ["short", "input", 20, 480, 180, 5, "Short"],
    ["tall", "input", 20, 510, 180, 61, "Tall"],
    ["decorative", "input", 20, 580, 180, 16, "---------"],
    ["overlap-a", "input", 20, 610, 180, 16, "Overlap A"],
    ["overlap-b", "input", 100, 610, 180, 16, "Overlap B"],
    ["paired-overlap", "input", 20, 640, 180, 16, "Phone"],
    ["unpaired-overlap", "input", 100, 640, 180, 16, "OCR duplicate"],
  ];
  const fieldCatalog = entries.map(([id, role, x, y, width, height, text]) => ({
    id,
    page: 1,
    role,
    valueType: "text",
    text,
    semanticLabel: text,
    boundingBox: { x, y, width, height },
    semanticValueRegion: ["input", "value-region", "checkbox", "table-cell"].includes(role)
      ? { x, y, width, height }
      : undefined,
    source: role === "table-cell" ? "di_table_cell" : "blank_detector",
    confidence: 0.95,
  }));
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
      id: "applicant-pair",
      page: 1,
      labelBlockId: "label",
      inputBlockId: "paired-input",
    }, {
      id: "overlap-pair",
      page: 1,
      labelBlockId: "ocr",
      inputBlockId: "paired-overlap",
    }],
    tables: [],
    questionAnswerPairs: [{
      id: "question-pair",
      page: 1,
      questionFieldId: "question",
      answerFieldId: "value",
    }],
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
  assert.equal(response.jsonBody.mappings.length, 6);
  assert.deepEqual(
    response.jsonBody.mappedFields.map((entry) => entry.blockId).sort(),
    ["blank-cell", "checkbox", "overlap-a", "paired-input", "paired-overlap", "value"].sort(),
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
    boundingBox: { x: 20 + (index % 4) * 190, y: Math.floor((index % 220) / 4) * 20, width: 180, height: 16 },
    semanticValueRegion: index % 4 === 0
      ? { x: 20, y: Math.floor((index % 220) / 4) * 20, width: 180, height: 16 }
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

test("mapping flow ranks generic address and contractor license fields using document context", async () => {
  const fieldCatalog = [
    {
      id: "producer-anchor",
      page: 1,
      role: "label",
      valueType: "label",
      text: "AGENT NAME",
      boundingBox: { x: 20, y: 20, width: 100, height: 16 },
      source: "di_line",
      confidence: 0.99,
      semanticLabel: "AGENT NAME",
    },
    {
      id: "producer-city",
      page: 1,
      role: "input",
      valueType: "text",
      text: "CITY",
      boundingBox: { x: 120, y: 70, width: 120, height: 18 },
      semanticValueRegion: { x: 120, y: 70, width: 120, height: 18 },
      source: "blank_detector",
      confidence: 0.95,
      semanticLabel: "CITY",
    },
    {
      id: "insured-anchor",
      page: 1,
      role: "label",
      valueType: "label",
      text: "NAME OF FIRST NAMED INSURED",
      boundingBox: { x: 20, y: 220, width: 200, height: 16 },
      source: "di_line",
      confidence: 0.99,
      semanticLabel: "NAME OF FIRST NAMED INSURED",
    },
    {
      id: "insured-city",
      page: 1,
      role: "input",
      valueType: "text",
      text: "CITY",
      boundingBox: { x: 120, y: 270, width: 120, height: 18 },
      semanticValueRegion: { x: 120, y: 270, width: 120, height: 18 },
      source: "blank_detector",
      confidence: 0.95,
      semanticLabel: "CITY",
    },
    {
      id: "licensed",
      page: 1,
      role: "input",
      valueType: "text",
      text: "Licensed?",
      boundingBox: { x: 120, y: 420, width: 80, height: 18 },
      semanticValueRegion: { x: 120, y: 420, width: 80, height: 18 },
      source: "blank_detector",
      confidence: 0.95,
      semanticLabel: "Licensed?",
    },
  ];
  const blocks = fieldCatalog.filter((entry) => entry.semanticValueRegion).map((entry) => ({
    id: entry.id,
    page: entry.page,
    type: "text",
    text: entry.text,
    boundingBox: entry.boundingBox,
    confidence: entry.confidence,
  }));
  const response = await mapFields({
    json: async () => ({
      documentId: "contextual-ranking",
      sourceDocumentName: "Markel-Contractors-Supp.pdf",
      blocks,
      fieldCatalog,
      groupedStructures: {},
      deterministic: true,
    }),
  }, { warn() {}, error() {} });
  const topCode = (id) => response.jsonBody.mappedFields
    .find((mapping) => mapping.blockId === id)
    .suggestions[0].acordCode;
  assert.equal(topCode("producer-city"), "Producer_MailingAddress_CityName");
  assert.equal(topCode("insured-city"), "GeneralInfo.MailingAddress.City");
  assert.equal(
    response.jsonBody.mappedFields
      .find((mapping) => mapping.blockId === "insured-city")
      .suggestions[0].rp8.ontologyScope,
    "canonical",
  );
  assert.equal(topCode("licensed"), "ContractorsUnderwriting_LicenseNumberIdentifier");
});

test("builds RP-9 Premises, General Information, Question, and YesNo clusters with evidence indices", () => {
  const entry = (id, page, label, y, role = "input") => ({
    id, page, role, valueType: role === "checkbox" ? "checkbox" : "text", text: label,
    semanticLabel: label, boundingBox: { x: 20, y, width: 180, height: 16 },
    semanticValueRegion: { x: 220, y, width: 180, height: 16 }, source: role === "checkbox" ? "selection_mark" : "blank_detector", confidence: 0.99,
  });
  const catalog = [
    entry("premises", 5, "PREMISES #", 20), entry("street", 5, "STREET ADDRESS", 40),
    entry("construction", 5, "CONSTRUCTION TYPE", 60), entry("fire", 5, "FIRE DISTRICT/CODE NUMBER", 80),
    entry("boiler-question", 5, "HEATING BOILER ON PREMISES?", 100, "question"),
    entry("yes", 5, "YES", 120, "checkbox"), entry("no", 5, "NO", 120, "checkbox"),
    entry("general-question", 1, "1. ANY CATASTROPHE EXPOSURE?", 200, "question"),
    entry("operations", 1, "NATURE OF BUSINESS - DESCRIPTION OF OPERATIONS", 240),
  ];
  const checkboxGroups = [{ id: "yn", page: 5, checkboxFieldIds: ["yes", "no"], labels: ["YES", "NO"] }];
  const premises = buildRp9PremisesGroups(catalog);
  const questions = buildRp9QuestionGroups(catalog, checkboxGroups);
  const general = buildRp9GeneralInformationGroups(catalog);
  assert.deepEqual([...new Set(premises.map((group) => group.label))].sort(), ["PremisesAddress", "PremisesConstruction", "PremisesFire", "PremisesInformation"].sort());
  assert.equal(questions.some((group) => group.label === "Question"), true);
  assert.equal(questions.some((group) => group.label === "YesNo"), true);
  assert.equal(general.some((group) => group.label === "GeneralInformation"), true);
  assert.deepEqual({ premisesIndex: catalog[1].premisesIndex, locationIndex: catalog[1].locationIndex }, { premisesIndex: 0, locationIndex: 0 });
  assert.equal(catalog.find((item) => item.id === "general-question").questionIndex, 0);
  assert.equal(catalog.find((item) => item.id === "yes").yesNoIndex, 0);
  assert.equal(catalog.find((item) => item.id === "boiler-question").semanticSection, "premises-information");
});

test("emits every RP-9 General Information question anchor as a mapping block", async () => {
  const previous = {
    SEMANTIC_BASELINE: process.env.SEMANTIC_BASELINE,
    DEPLOYMENT_ENVIRONMENT: process.env.DEPLOYMENT_ENVIRONMENT,
  };
  process.env.SEMANTIC_BASELINE = "RP-9";
  process.env.DEPLOYMENT_ENVIRONMENT = "staging";
  try {
    const result = await buildHybridFieldExtraction({ pages: [{
      pageNumber: 1, width: 8.5, height: 11, unit: "inch",
      lines: [
        { content: "1. ANY CATASTROPHE EXPOSURE?", confidence: 0.99, boundingBox: { x: 1, y: 1, width: 3, height: 0.2 } },
        { content: "2. IS A FORMAL SAFETY PROGRAM IN OPERATION?", confidence: 0.99, boundingBox: { x: 1, y: 2, width: 4, height: 0.2 } },
        { content: "3. ANY EXPOSURE TO FLAMMABLES, EXPLOSIVES, CHEMICALS?", confidence: 0.99, boundingBox: { x: 1, y: 3, width: 5, height: 0.2 } },
      ],
    }] });
    const questions = result.fieldCatalog.filter((entry) => entry.semanticCluster === "Question" || entry.semanticCluster === "YesNoQuestion");
    const blockIds = new Set(result.blocks.map((block) => block.id));
    assert.equal(new Set(questions.map((entry) => entry.semanticLabel)).size, 3);
    assert.equal(questions.length, 6);
    assert.equal(questions.every((entry) => blockIds.has(entry.id)), true);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});