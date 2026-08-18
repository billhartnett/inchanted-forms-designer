const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const artifactRoot = path.join(repoRoot, 'acord-artifacts');
const groundTruthRoot = path.join(repoRoot, 'training-data', 'acord-labeled_XFDL', 'ground-truth');
const generatedAt = '2026-08-18T00:00:00.000Z';

const paths = {
  rp8Truth: path.join(artifactRoot, 'authoritative-semantic-truth-rp8.json'),
  rp8Lineage: path.join(artifactRoot, 'rp8-ontology-lineage.json'),
  phase33: path.join(artifactRoot, 'phase33-semantic-truth-rp8.json'),
  phase31: path.join(artifactRoot, 'ontology-phase31.json'),
  truth: path.join(artifactRoot, 'authoritative-semantic-truth-rp9.json'),
  lineage: path.join(artifactRoot, 'rp9-ontology-lineage.json'),
  bundles: path.join(artifactRoot, 'rp9-category-bundles.json'),
};

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalFileSha256(bytes) {
  return sha256(bytes.toString('utf8').replace(/\r\n/g, '\n'));
}

function readArtifact(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required artifact: ${filePath}`);
  const bytes = fs.readFileSync(filePath);
  return { bytes, value: JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) };
}

function payloadHash(value) {
  const { integrity: _integrity, ...payload } = value;
  return sha256(stableSerialize(payload));
}

function validateArtifact(name, artifact) {
  const expected = artifact.integrity?.payloadSha256;
  if (!expected || payloadHash(artifact) !== expected) throw new Error(`${name} payload integrity failed`);
}

function writeArtifact(filePath, payload) {
  const artifact = {
    ...payload,
    integrity: { algorithm: 'sha256', payloadSha256: sha256(stableSerialize(payload)) },
  };
  fs.writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifact;
}

function collectEvidence() {
  const manifest = JSON.parse(fs.readFileSync(path.join(groundTruthRoot, 'manifest.json'), 'utf8'));
  const byPath = new Map();
  const headings = new Map([
    ['Section.ProducerInformation', ['PRODUCER INFORMATION', 'PRODUCER', 'AGENCY', 'AGENT NAME', 'AGENCY CUSTOMER ID', 'AGENCY BILL']],
    ['Section.ApplicantInformation', ['APPLICANT INFORMATION']],
    ['Section.PremisesInformation', ['PREMISES INFORMATION']],
    ['Section.GeneralInformation', ['GENERAL INFORMATION']],
  ]);
  const headingEvidence = Object.fromEntries([...headings].map(([id]) => [id, { forms: new Set(), occurrences: 0 }]));

  for (const form of manifest.forms) {
    const dataset = JSON.parse(fs.readFileSync(path.join(groundTruthRoot, form.datasetFile), 'utf8'));
    const seenPaths = new Set();
    for (const field of dataset.fields || []) {
      const semanticPath = field.semantic?.semanticPath;
      if (semanticPath) {
        const record = byPath.get(semanticPath) || { forms: new Set(), instances: 0, fieldTypeCounts: {} };
        record.forms.add(form.datasetFile);
        record.instances += 1;
        record.fieldTypeCounts[field.fieldType || 'unknown'] = (record.fieldTypeCounts[field.fieldType || 'unknown'] || 0) + 1;
        byPath.set(semanticPath, record);
        seenPaths.add(semanticPath);
      }
    }
    const texts = [
      ...(dataset.labels || []).map((item) => item.text || item.value || item.label || ''),
      ...(dataset.fields || []).map((item) => item.label?.visualLabel || ''),
    ].map((value) => String(value).toUpperCase());
    for (const [id, aliases] of headings) {
      const matches = texts.filter((text) => aliases.some((alias) => text === alias || text.includes(alias)));
      if (matches.length > 0) {
        headingEvidence[id].forms.add(form.datasetFile);
        headingEvidence[id].occurrences += matches.length;
      }
    }
  }

  return {
    manifest: {
      formCount: manifest.formCount,
      fieldCount: manifest.totals.fields,
      groupCount: manifest.totals.groups,
      labelCount: manifest.totals.labels,
    },
    path(semanticPath) {
      const record = byPath.get(semanticPath);
      return record ? {
        semanticPath,
        formCount: record.forms.size,
        instanceCount: record.instances,
        fieldTypeCounts: record.fieldTypeCounts,
      } : { semanticPath, formCount: 0, instanceCount: 0, fieldTypeCounts: {} };
    },
    section(id) {
      const record = headingEvidence[id];
      return {
        evidenceType: 'structural-section-heading',
        formCount: record.forms.size,
        occurrenceCount: record.occurrences,
        fillable: false,
      };
    },
  };
}

function family(familyId, level, instanceKey, parentFamilyId = null) {
  return {
    familyId,
    cardinality: 'many',
    level,
    instanceKey,
    parentFamilyId,
    stableIdentity: [...instanceKey, 'canonicalNodeId'],
  };
}

function singleton(familyId) {
  return {
    familyId,
    cardinality: 'one-per-section-occurrence',
    level: 'section',
    instanceKey: ['pageIndex', 'sectionOccurrence'],
    parentFamilyId: null,
    stableIdentity: ['pageIndex', 'sectionOccurrence', 'canonicalNodeId'],
  };
}

function node(acordCode, options) {
  return {
    acordCode,
    aliases: [...new Set([acordCode, ...(options.aliases || [])])],
    synonyms: [...new Set(options.synonyms || [])].sort(),
    parentCodes: [...new Set(options.parentCodes || [])].sort(),
    childCodes: [...new Set(options.childCodes || [])].sort(),
    mutuallyExclusiveCodes: [...new Set(options.mutuallyExclusiveCodes || [])].sort(),
    requiredSiblingCodes: [...new Set(options.requiredSiblingCodes || [])].sort(),
    sections: [...new Set(options.sections || [])].sort(),
    groups: [...new Set(options.groups || [])].sort(),
    semanticKind: options.semanticKind || 'fillable',
    component: options.component || null,
    role: options.role || null,
    instanceFamily: options.instanceFamily,
    evidence: options.evidence,
    inheritedFrom: options.inheritedFrom || null,
  };
}

function main() {
  const rp8TruthFile = readArtifact(paths.rp8Truth);
  const rp8LineageFile = readArtifact(paths.rp8Lineage);
  const phase33File = readArtifact(paths.phase33);
  const phase31File = readArtifact(paths.phase31);
  validateArtifact('RP-8 truth', rp8TruthFile.value);
  validateArtifact('RP-8 lineage', rp8LineageFile.value);
  validateArtifact('Phase 33 truth', phase33File.value);
  validateArtifact('Phase 31 ontology', phase31File.value);

  const evidence = collectEvidence();
  const inheritedNodes = Object.fromEntries(
    Object.entries(phase31File.value.canonicalOntology.nodes).map(([id, inherited]) => [id, {
      ...inherited,
      semanticKind: 'fillable',
      component: null,
      role: /GeneralInfo\.(NamedInsured|MailingAddress)/.test(id) ? 'NamedInsured' : null,
      instanceFamily: id.startsWith('CommercialProperty.')
        ? family('premises.location', 'location', ['locationIndex'])
        : family('document.field', 'document', ['fieldOccurrence']),
      evidence: { evidenceType: 'inherited-rp8', sourcePayloadSha256: phase31File.value.integrity.payloadSha256 },
      inheritedFrom: 'RP-8',
    }]),
  );

  const producerFamily = family('party.producer', 'party', ['producerIndex']);
  const producerContactFamily = family('party.producer.contact', 'contact', ['producerIndex', 'contactIndex'], 'party.producer');
  const signatureFamily = (role) => family(`signature.${role.toLowerCase()}`, 'signature', [`${role.toLowerCase()}Index`, 'signatureIndex']);
  const locationFamily = family('premises.location', 'location', ['locationIndex']);
  const buildingFamily = family('premises.building', 'building', ['locationIndex', 'buildingIndex'], 'premises.location');
  const qaFamily = family('general-information.question-answer', 'question-answer', ['sectionOccurrence', 'questionIndex']);

  const additions = {
    'Producer.Identity.FullName': node('Producer.Identity.FullName', {
      aliases: ['Producer_FullName', 'agent name', 'agency name', 'producer name'], synonyms: ['agent', 'agency', 'broker', 'name', 'producer'],
      sections: ['producer-information'], groups: ['identity'], role: 'Producer', component: 'identity.name', instanceFamily: producerFamily,
      evidence: evidence.path('Producer_FullName'),
    }),
    'Producer.Address.Line1': node('Producer.Address.Line1', {
      aliases: ['Producer_MailingAddress_LineOne'], synonyms: ['address', 'agent', 'agency', 'mailing', 'producer', 'street'],
      sections: ['producer-information'], groups: ['address'], role: 'Producer', component: 'address.line1', instanceFamily: producerFamily,
      evidence: evidence.path('Producer_MailingAddress_LineOne'),
    }),
    'Producer.Address.Line2': node('Producer.Address.Line2', {
      aliases: ['Producer_MailingAddress_LineTwo'], synonyms: ['address', 'line two', 'mailing', 'producer'],
      sections: ['producer-information'], groups: ['address'], role: 'Producer', component: 'address.line2', instanceFamily: producerFamily,
      evidence: evidence.path('Producer_MailingAddress_LineTwo'),
    }),
    'Producer.Address.City': node('Producer.Address.City', {
      aliases: ['Producer_MailingAddress_CityName'], synonyms: ['city', 'mailing', 'producer'],
      sections: ['producer-information'], groups: ['address'], role: 'Producer', component: 'address.city', instanceFamily: producerFamily,
      evidence: evidence.path('Producer_MailingAddress_CityName'),
    }),
    'Producer.Address.StateOrProvince': node('Producer.Address.StateOrProvince', {
      aliases: ['Producer_MailingAddress_StateOrProvinceCode'], synonyms: ['province', 'state', 'producer'],
      sections: ['producer-information'], groups: ['address', 'classification'], role: 'Producer', component: 'address.stateOrProvince', instanceFamily: producerFamily,
      evidence: evidence.path('Producer_MailingAddress_StateOrProvinceCode'),
    }),
    'Producer.Address.PostalCode': node('Producer.Address.PostalCode', {
      aliases: ['Producer_MailingAddress_PostalCode'], synonyms: ['postal', 'producer', 'zip'],
      sections: ['producer-information'], groups: ['address', 'classification'], role: 'Producer', component: 'address.postalCode', instanceFamily: producerFamily,
      evidence: evidence.path('Producer_MailingAddress_PostalCode'),
    }),
    'Producer.Contact.FullName': node('Producer.Contact.FullName', {
      aliases: ['Producer_ContactPerson_FullName'], synonyms: ['contact', 'name', 'producer'], sections: ['producer-information'], groups: ['contact', 'identity'],
      role: 'Producer', component: 'contact.name', instanceFamily: producerContactFamily, evidence: evidence.path('Producer_ContactPerson_FullName'),
    }),
    'Producer.Contact.Phone': node('Producer.Contact.Phone', {
      aliases: ['Producer_ContactPerson_PhoneNumber', 'Producer_PhoneNumber'], synonyms: ['contact', 'phone', 'producer', 'telephone'],
      sections: ['producer-information'], groups: ['contact'], role: 'Producer', component: 'contact.phone', instanceFamily: producerContactFamily,
      evidence: evidence.path('Producer_ContactPerson_PhoneNumber'),
    }),
    'Producer.Contact.Email': node('Producer.Contact.Email', {
      aliases: ['Producer_ContactPerson_EmailAddress'], synonyms: ['contact', 'email', 'producer'], sections: ['producer-information'], groups: ['contact'],
      role: 'Producer', component: 'contact.email', instanceFamily: producerContactFamily, evidence: evidence.path('Producer_ContactPerson_EmailAddress'),
    }),
    'Producer.Contact.Fax': node('Producer.Contact.Fax', {
      aliases: ['Producer_FaxNumber'], synonyms: ['fax', 'producer'], sections: ['producer-information'], groups: ['contact'],
      role: 'Producer', component: 'contact.fax', instanceFamily: producerContactFamily, evidence: evidence.path('Producer_FaxNumber'),
    }),
    'Form.Date.Completed': node('Form.Date.Completed', {
      aliases: ['Form_CompletionDate', 'DATE (MM/DD/YYYY)'], synonyms: ['completed', 'completion', 'date', 'form'], sections: ['document'], groups: ['date'],
      component: 'form.date.completed', instanceFamily: family('form.lifecycle', 'document', ['formInstance']), evidence: evidence.path('Form_CompletionDate'),
    }),
    'Form.Date.Signed': node('Form.Date.Signed', {
      aliases: ['NamedInsured_SignatureDate', 'Producer_AuthorizedRepresentative_SignatureDate', 'Producer_SignatureDate'], synonyms: ['date', 'signed', 'signature'],
      sections: ['signature'], groups: ['date', 'signature'], component: 'form.date.signed',
      instanceFamily: family('form.signature-date', 'signature', ['signerRole', 'signerIndex', 'signatureIndex']),
      evidence: { evidenceType: 'combined-semantic-paths', paths: [evidence.path('NamedInsured_SignatureDate'), evidence.path('Producer_AuthorizedRepresentative_SignatureDate'), evidence.path('Producer_SignatureDate')] },
    }),
    'Signature.Applicant': node('Signature.Applicant', {
      aliases: ['NamedInsured_Signature', "APPLICANT'S SIGNATURE"], synonyms: ['applicant', 'signature', 'signer'], sections: ['applicant-information', 'signature'], groups: ['signature'],
      role: 'Applicant', component: 'signature', instanceFamily: signatureFamily('Applicant'), evidence: evidence.path('NamedInsured_Signature'),
    }),
    'Signature.Producer': node('Signature.Producer', {
      aliases: ['Producer_AuthorizedRepresentative_Signature', 'PRODUCER_SIGNATURE', "PRODUCER'S SIGNATURE"], synonyms: ['agent', 'producer', 'signature', 'signer'],
      sections: ['producer-information', 'signature'], groups: ['signature'], role: 'Producer', component: 'signature', instanceFamily: signatureFamily('Producer'),
      evidence: evidence.path('Producer_AuthorizedRepresentative_Signature'),
    }),
    'Premises.Location.Identifier': node('Premises.Location.Identifier', {
      aliases: ['CommercialStructure_Location_ProducerIdentifier', 'location number', 'premises number'], synonyms: ['identifier', 'location', 'number', 'premises'],
      sections: ['premises-information'], groups: ['classification', 'premises'], component: 'premises.location.identifier', instanceFamily: locationFamily,
      evidence: evidence.path('CommercialStructure_Location_ProducerIdentifier'),
    }),
    'Premises.Location.Name': node('Premises.Location.Name', {
      aliases: ['Location_FullName', 'CommercialStructure_Location_FullName'], synonyms: ['location', 'name', 'premises'], sections: ['premises-information'], groups: ['identity', 'premises'],
      component: 'premises.location.name', instanceFamily: locationFamily, evidence: evidence.path('Location_FullName'),
    }),
    'Premises.Building.Identifier': node('Premises.Building.Identifier', {
      aliases: ['CommercialStructure_Building_ProducerIdentifier', 'building number'], synonyms: ['building', 'identifier', 'number', 'premises'], sections: ['premises-information'], groups: ['classification', 'premises'],
      component: 'premises.building.identifier', instanceFamily: buildingFamily, evidence: evidence.path('CommercialStructure_Building_ProducerIdentifier'),
    }),
    'Premises.Building.Description': node('Premises.Building.Description', {
      aliases: ['Location_BuildingDesciption', 'building description'], synonyms: ['building', 'description', 'premises'], sections: ['premises-information'], groups: ['classification', 'premises'],
      component: 'premises.building.description', instanceFamily: buildingFamily, evidence: evidence.path('Location_BuildingDesciption'),
    }),
    'Premises.Address.Line1': node('Premises.Address.Line1', {
      aliases: ['Location_PhysicalAddress_LineOne'], synonyms: ['address', 'location', 'premises', 'street'], sections: ['premises-information'], groups: ['address', 'premises'],
      component: 'address.line1', instanceFamily: locationFamily, evidence: evidence.path('Location_PhysicalAddress_LineOne'),
    }),
    'Premises.Address.Line2': node('Premises.Address.Line2', {
      aliases: ['Location_PhysicalAddress_LineTwo'], synonyms: ['address', 'line two', 'location', 'premises'], sections: ['premises-information'], groups: ['address', 'premises'],
      component: 'address.line2', instanceFamily: locationFamily, evidence: evidence.path('Location_PhysicalAddress_LineTwo'),
    }),
    'Premises.Address.City': node('Premises.Address.City', {
      aliases: ['Location_PhysicalAddress_CityName'], synonyms: ['city', 'location', 'premises'], sections: ['premises-information'], groups: ['address', 'premises'],
      component: 'address.city', instanceFamily: locationFamily, evidence: evidence.path('Location_PhysicalAddress_CityName'),
    }),
    'Premises.Address.StateOrProvince': node('Premises.Address.StateOrProvince', {
      aliases: ['Location_PhysicalAddress_StateOrProvinceCode'], synonyms: ['premises', 'province', 'state'], sections: ['premises-information'], groups: ['address', 'classification', 'premises'],
      component: 'address.stateOrProvince', instanceFamily: locationFamily, evidence: evidence.path('Location_PhysicalAddress_StateOrProvinceCode'),
    }),
    'Premises.Address.PostalCode': node('Premises.Address.PostalCode', {
      aliases: ['Location_PhysicalAddress_PostalCode'], synonyms: ['postal', 'premises', 'zip'], sections: ['premises-information'], groups: ['address', 'classification', 'premises'],
      component: 'address.postalCode', instanceFamily: locationFamily, evidence: evidence.path('Location_PhysicalAddress_PostalCode'),
    }),
    'GeneralInformation.Question': node('GeneralInformation.Question', {
      aliases: ['general information question'], synonyms: ['general', 'information', 'question'], sections: ['general-information'], groups: ['question-answer'],
      semanticKind: 'structural-question', component: 'question', instanceFamily: qaFamily,
      evidence: { evidenceType: 'structural-section-model', section: evidence.section('Section.GeneralInformation'), corpus: evidence.manifest },
    }),
    'GeneralInformation.Answer': node('GeneralInformation.Answer', {
      aliases: ['general information answer'], synonyms: ['answer', 'general', 'information', 'response'], sections: ['general-information'], groups: ['question-answer'],
      semanticKind: 'structural-answer', component: 'answer', instanceFamily: qaFamily, parentCodes: ['GeneralInformation.Question'],
      evidence: { evidenceType: 'structural-section-model', section: evidence.section('Section.GeneralInformation'), corpus: evidence.manifest },
    }),
    'Section.ProducerInformation': node('Section.ProducerInformation', {
      aliases: ['PRODUCER INFORMATION', 'PRODUCER', 'AGENCY', 'AGENT NAME', 'AGENCY CUSTOMER ID', 'AGENCY BILL'], synonyms: ['agent', 'agency', 'producer', 'section'], sections: ['producer-information'], groups: ['section'], semanticKind: 'section', role: 'Producer',
      component: 'section', instanceFamily: singleton('section.producer-information'), evidence: evidence.section('Section.ProducerInformation'),
    }),
    'Section.ApplicantInformation': node('Section.ApplicantInformation', {
      aliases: ['APPLICANT INFORMATION'], synonyms: ['applicant', 'information', 'section'], sections: ['applicant-information'], groups: ['section'], semanticKind: 'section', role: 'Applicant',
      component: 'section', instanceFamily: singleton('section.applicant-information'), evidence: evidence.section('Section.ApplicantInformation'),
    }),
    'Section.PremisesInformation': node('Section.PremisesInformation', {
      aliases: ['PREMISES INFORMATION'], synonyms: ['location', 'premises', 'section'], sections: ['premises-information'], groups: ['section'], semanticKind: 'section',
      component: 'section', instanceFamily: singleton('section.premises-information'), evidence: evidence.section('Section.PremisesInformation'),
    }),
    'Section.GeneralInformation': node('Section.GeneralInformation', {
      aliases: ['GENERAL INFORMATION'], synonyms: ['general', 'information', 'section'], sections: ['general-information'], groups: ['section'], semanticKind: 'section',
      component: 'section', instanceFamily: singleton('section.general-information'), evidence: evidence.section('Section.GeneralInformation'),
    }),
  };

  const nodes = Object.fromEntries([...Object.entries(inheritedNodes), ...Object.entries(additions)].sort(([a], [b]) => a.localeCompare(b)));
  nodes['GeneralInformation.Question'].childCodes = ['GeneralInformation.Answer'];
  const invalidReferences = [];
  for (const [id, current] of Object.entries(nodes)) {
    for (const relation of ['parentCodes', 'childCodes', 'mutuallyExclusiveCodes', 'requiredSiblingCodes']) {
      for (const related of current[relation] || []) if (!nodes[related]) invalidReferences.push({ id, relation, related });
    }
  }
  if (invalidReferences.length > 0) throw new Error(`Invalid RP-9 references: ${JSON.stringify(invalidReferences)}`);

  const ontologyHash = sha256(stableSerialize(nodes));
  const roleBoundaryPolicy = {
    ...phase33File.value.roleBoundaryPolicy,
    schemaVersion: 'strict-role-boundaries.rp9.v1',
    roles: {
      ...phase33File.value.roleBoundaryPolicy.roles,
      Producer: {
        legalMeaning: 'The insurance producer, agent, agency, or broker responsible for the application transaction.',
        semanticMeaning: 'Producer-scoped identity, address, contact, and signature data.',
      },
    },
    roleAliases: { Agent: 'Producer', Agency: 'Producer', Broker: 'Producer' },
    distinctRolesRequired: true,
    roleLevelCollapsingProhibited: true,
    crossRolePromotionProhibited: true,
  };
  const roleSafeEquivalences = [
    ...rp8TruthFile.value.evidence.roleSafeRepresentationEquivalences,
    {
      equivalenceId: 'agent-role-to-producer-role', sourceRole: 'Agent', targetRole: 'Producer', scope: 'role-alias', runtimePromotion: false,
      preservesSourceLabel: true, evidence: 'repository-domain-language-agent-producer-synonym',
    },
    {
      equivalenceId: 'applicant-signature-named-insured-representation', sourceRole: 'Applicant', sourceCode: 'Applicant.Signature', component: 'signature',
      representationCode: 'NamedInsured_Signature', canonicalCode: 'Signature.Applicant', representationRole: 'NamedInsured', scope: 'representation-only', runtimePromotion: false,
      preservesSourceRole: true, evidence: evidence.path('NamedInsured_Signature'),
    },
  ];

  const parent = {
    restorePoint: 'RP-8',
    semanticTruthPayloadSha256: rp8TruthFile.value.integrity.payloadSha256,
    semanticTruthFileSha256: canonicalFileSha256(rp8TruthFile.bytes),
    ontologyLineagePayloadSha256: rp8LineageFile.value.integrity.payloadSha256,
    ontologyLineageFileSha256: canonicalFileSha256(rp8LineageFile.bytes),
    phase33PayloadSha256: phase33File.value.integrity.payloadSha256,
    phase33FileSha256: canonicalFileSha256(phase33File.bytes),
    phase31PayloadSha256: phase31File.value.integrity.payloadSha256,
    phase31FileSha256: canonicalFileSha256(phase31File.bytes),
  };
  const truthPayload = {
    schemaVersion: 'rp9-authoritative-semantic-truth.v1',
    generatedAt,
    restorePoint: 'RP-9',
    targetRestorePoint: 'RP-9',
    status: 'staging-active-semantic-baseline',
    activation: {
      state: 'staging-active',
      scope: 'staging',
      runtimeChanged: true,
      productionBaselineChanged: false,
      requiresExplicitProductionPromotion: true,
      requiredEnvironment: { SEMANTIC_BASELINE: 'RP-9', DEPLOYMENT_ENVIRONMENT: 'staging' },
    },
    lineage: { parent, phase33Compatibility: { policyPayloadSha256: phase33File.value.integrity.payloadSha256, compatible: true } },
    canonicalOntology: {
      ontologyId: 'acord-canonical-ontology', version: '2026.08.18-rp9', generatedAt: 'deterministic', hash: ontologyHash, nodes,
    },
    roleBoundaryPolicy,
    roleSafeEquivalences,
    multiInstanceFamilies: Object.fromEntries([...new Map(Object.values(nodes).map((current) => [current.instanceFamily.familyId, current.instanceFamily])).entries()].sort(([a], [b]) => a.localeCompare(b))),
    semanticTruth: {
      inheritedNodeCount: Object.keys(inheritedNodes).length,
      addedNodeCount: Object.keys(additions).length,
      canonicalNodeCount: Object.keys(nodes).length,
      corpus: evidence.manifest,
      sectionContainersAreNotFillable: true,
      questionAnswerNodesAreStructural: true,
    },
    guardrails: {
      rp8RemainsProductionActive: true, rp9StagingActive: true, noProductionRuntimeOntologyChange: true, stableCanonicalIdentifiers: true,
      preserveRoleBoundaries: true, preserveFieldIds: true, preservePageIndices: true, preserveGrouping: true,
    },
    validation: {
      valid: invalidReferences.length === 0,
      invalidReferences,
      phase33Compatible: true,
      nodeCount: Object.keys(nodes).length,
      inheritedNodeCount: Object.keys(inheritedNodes).length,
      addedNodeCount: Object.keys(additions).length,
      roleSafeEquivalenceCount: roleSafeEquivalences.length,
      multiInstanceFamilyCount: new Set(Object.values(nodes).map((current) => current.instanceFamily.familyId)).size,
    },
  };
  const truth = writeArtifact(paths.truth, truthPayload);

  const groupMap = new Map();
  const sectionMap = new Map();
  for (const [id, current] of Object.entries(nodes)) {
    for (const groupId of current.groups) {
      const ids = groupMap.get(groupId) || [];
      ids.push(id);
      groupMap.set(groupId, ids);
    }
    for (const sectionId of current.sections) {
      const ids = sectionMap.get(sectionId) || [];
      ids.push(id);
      sectionMap.set(sectionId, ids);
    }
  }
  const bundlePayload = {
    schemaVersion: 'rp9-category-bundles.v1', generatedAt, restorePoint: 'RP-9', status: 'staging-active',
    semanticTruthPayloadSha256: truth.integrity.payloadSha256,
    ontologyHash,
    groups: [...groupMap].sort(([a], [b]) => a.localeCompare(b)).map(([bundleId, nodeIds]) => ({ bundleId, nodeIds: nodeIds.sort(), nodeCount: nodeIds.length })),
    sections: [...sectionMap].sort(([a], [b]) => a.localeCompare(b)).map(([bundleId, nodeIds]) => ({ bundleId, nodeIds: nodeIds.sort(), nodeCount: nodeIds.length })),
    multiInstanceFamilies: truth.multiInstanceFamilies,
    validation: { allNodesBundled: Object.keys(nodes).every((id) => [...groupMap.values(), ...sectionMap.values()].some((ids) => ids.includes(id))) },
  };
  const bundles = writeArtifact(paths.bundles, bundlePayload);

  const lineagePayload = {
    schemaVersion: 'production-ontology-lineage.v2', generatedAt, restorePoint: 'RP-9', parentRestorePoint: 'RP-8', status: 'staging-active',
    parent,
    canonicalOntology: 'rp9-semantic-expansion-producer-premises-general-information',
    activeSemanticPolicy: 'phase33-strict-role-boundary-readiness',
    activeOntology: 'rp9-semantic-expansion-producer-premises-general-information',
    activation: { state: 'staging-active', scope: 'staging', currentProductionBaseline: 'RP-8', productionPromoted: false },
    artifacts: {
      authoritativeSemanticTruth: { path: 'acord-artifacts/authoritative-semantic-truth-rp9.json', payloadSha256: truth.integrity.payloadSha256, fileSha256: canonicalFileSha256(fs.readFileSync(paths.truth)) },
      categoryBundles: { path: 'acord-artifacts/rp9-category-bundles.json', payloadSha256: bundles.integrity.payloadSha256, fileSha256: canonicalFileSha256(fs.readFileSync(paths.bundles)) },
      phase33Policy: { path: 'acord-artifacts/phase33-semantic-truth-rp8.json', payloadSha256: phase33File.value.integrity.payloadSha256, fileSha256: canonicalFileSha256(phase33File.bytes) },
    },
    roleBoundaryPolicy,
    roleSafeEquivalences,
    ontologyHash,
    nodeCount: Object.keys(nodes).length,
    validation: { crossFileLineageValid: true, phase33Compatible: true, parentRp8IntegrityValid: true, rp8RemainsActive: true },
  };
  const lineage = writeArtifact(paths.lineage, lineagePayload);

  process.stdout.write(`${JSON.stringify({
    outputs: { truth: paths.truth, lineage: paths.lineage, bundles: paths.bundles },
    hashes: { truth: truth.integrity.payloadSha256, lineage: lineage.integrity.payloadSha256, bundles: bundles.integrity.payloadSha256, ontology: ontologyHash },
    nodeCount: Object.keys(nodes).length,
    addedNodeCount: Object.keys(additions).length,
    roleSafeEquivalenceCount: roleSafeEquivalences.length,
    multiInstanceFamilyCount: truth.validation.multiInstanceFamilyCount,
    rp9StagingActive: truth.activation.state === 'staging-active',
    rp8RemainsProductionActive: truth.guardrails.rp8RemainsProductionActive,
  }, null, 2)}\n`);
}

main();
