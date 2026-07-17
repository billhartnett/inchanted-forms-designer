/*
 * ACORD P&C Commercial Lines Ontology
 * Source inputs:
 * - acord-eLabels.json
 * - ACORD XSD 2.14.0 (BusinessAggregates.xsd, BusinessData.xsd)
 */

export type SourceSystem = "xsd" | "elabel" | "both";

export interface OntologyClassMetadata {
  name: string;
  semanticRole: string;
  description: string;
  sourceArtifacts: string[];
  sourceTypes?: string[];
}

export interface OntologyPropertyMetadata {
  name: string;
  type: string;
  cardinality: "0..1" | "0..n" | "1..1" | "1..n";
  source: SourceSystem;
  evidence: string[];
  description: string;
}

export interface OntologyClassRegistryEntry {
  metadata: OntologyClassMetadata;
  properties: OntologyPropertyMetadata[];
}

export interface OntologyRegistry {
  classes: Record<string, OntologyClassRegistryEntry>;
}

export abstract class ACORDEntity {
  public id?: string;
  public sourceSystemRef?: string;
  public eLabelExtensions: Record<string, unknown> = {};
}

export class Address extends ACORDEntity {
  public addrTypeCodes: string[] = [];
  public lineOne?: string;
  public lineTwo?: string;
  public lineThree?: string;
  public lineFour?: string;
  public city?: string;
  public stateOrProvinceCode?: string;
  public stateOrProvinceName?: string;
  public postalCode?: string;
  public countryCode?: string;
  public countryName?: string;
  public county?: string;
  public township?: string;
  public latitude?: number;
  public longitude?: number;
  public doNotContactIndicator?: boolean;
  public preferredContactRef?: string;
}

export class ContactPerson extends ACORDEntity {
  public fullName?: string;
  public givenName?: string;
  public surname?: string;
  public relationshipCode?: string;
  public phoneTypeCode?: string;
  public phoneNumber?: string;
  public emailAddress?: string;
  public websiteUrl?: string;
  public socialMediaTypeCode?: string;
  public socialMediaId?: string;
  public doNotContactIndicator?: boolean;
  public mailingAddress?: Address;
}

export class Employer extends ACORDEntity {
  public fullName?: string;
  public phoneNumber?: string;
  public selfInsuredIndicator?: boolean;
  public lessorIndicator?: boolean;
  public employerPayrollCode?: string;
  public specificProductsDescription?: string;
  public physicalAddress?: Address;
}

export class Producer extends ACORDEntity {
  public fullName?: string;
  public contractNumber?: string;
  public producerSubCode?: string;
  public producerIdentifiers: {
    niprId?: string;
    stateProducerId?: string;
    customerIdentifier?: string;
    nationalIdentifier?: string;
    taxIdentifier?: string;
    agencyStateLicenseIdentifier?: string;
    stateLicenseIdentifier?: string;
  } = {};
  public producerRoleCodes: string[] = [];
  public placingOffice?: string;
  public fieldOfficeCode?: string;
  public accountYear?: number;
  public contractTerm?: string;
  public riskParticipationPercent?: number;
  public faxNumber?: string;
  public remarkText?: string;
  public mailingAddress?: Address;
  public contactPerson?: ContactPerson;
  public authorizedRepresentative?: {
    fullName?: string;
    signature?: string;
    signatureDate?: string;
    signatureTime?: string;
  };
}

export class Insurer extends ACORDEntity {
  public fullName?: string;
  public naicCode?: string;
  public aiinCode?: string;
  public producerIdentifier?: string;
  public subProducerIdentifier?: string;
  public productCode?: string;
  public productDescription?: string;
  public facilityIdentifier?: string;
  public underwriter?: ContactPerson;
  public policyNumber?: string;
  public fullTermAmount?: number;
  public subscriptionPercent?: number;
  public admittedInsurerIndicator?: boolean;
  public leadInsurerIndicator?: boolean;
}

export class NamedInsured extends ACORDEntity {
  public fullName?: string;
  public givenName?: string;
  public otherGivenNameInitial?: string;
  public surname?: string;
  public initials?: string;
  public birthDate?: string;
  public taxIdentifier?: string;
  public maritalStatusCode?: string;
  public legalEntityCode?: string;
  public knownByProducer?: string;
  public knownSinceDate?: string;
  public occupationDescription?: string;
  public currentOccupationYearCount?: number;
  public employedYearCount?: number;
  public currentEmployerYearCount?: number;
  public previousEmployerYearCount?: number;
  public generalLiabilityCode?: string;
  public sicCode?: string;
  public naicsCode?: string;
  public websiteAddress?: string;
  public signature?: string;
  public signatureDate?: string;
  public signatureTime?: string;
  public primaryPhoneNumber?: string;
  public secondaryPhoneNumber?: string;
  public primaryEmailAddress?: string;
  public secondaryEmailAddress?: string;
  public primaryHomePhoneIndicator?: boolean;
  public primaryBusinessPhoneIndicator?: boolean;
  public primaryCellPhoneIndicator?: boolean;
  public secondaryHomePhoneIndicator?: boolean;
  public secondaryBusinessPhoneIndicator?: boolean;
  public secondaryCellPhoneIndicator?: boolean;
  public physicalAddressSameAsMailingIndicator?: boolean;
  public mailingAddressSameAsApplicantIndicator?: boolean;
  public residency: {
    permanentResidentInStateIndicator?: boolean;
    exemptFromResidencyRequirementIndicator?: boolean;
  } = {};
  public mailingAddress?: Address;
  public physicalAddress?: Address;
  public contact?: ContactPerson;
  public employer?: Employer;
}

export class CoverageAmount {
  public currentTermAmount?: number;
  public netChangeAmount?: number;
  public writtenAmount?: number;
  public fullTermAmount?: number;
  public minimumPremiumAmount?: number;
  public taxablePremiumAmount?: number;
  public depositAmount?: number;
  public estimatedTotalAmount?: number;
  public policyFeeAmount?: number;
  public serviceFeeAmount?: number;
  public insurerShareAmount?: number;
  public insurerSharePercent?: number;
  public limits: number[] = [];
  public deductibles: number[] = [];
}

export class Coverage extends ACORDEntity {
  public coverageCode?: string;
  public coverageTypeCode?: string;
  public coverageSubCode?: string;
  public coverageName?: string;
  public coverageDescription?: string;
  public appliesToCode?: string;
  public categoryCode?: string;
  public premiumBasisCode?: string;
  public ratingClassificationCode?: string;
  public coinsurancePercent?: number;
  public proRateFactor?: number;
  public fullyEarnedIndicator?: boolean;
  public effectiveDates: string[] = [];
  public expirationDates: string[] = [];
  public requiredIndicator?: boolean;
  public amount: CoverageAmount = new CoverageAmount();
}

export class PolicyStatus {
  public eLabelExtensions: Record<string, unknown> = {};
  public policyStatusCode?: string;
  public renewalStatusCode?: string;
  public otherDescription?: string;
  public effectiveDate?: string;
  public effectiveTime?: string;
  public effectiveTimeAMIndicator?: boolean;
  public effectiveTimePMIndicator?: boolean;
  public quoteIndicator?: boolean;
  public issueIndicator?: boolean;
  public boundIndicator?: boolean;
  public cancelIndicator?: boolean;
  public newIndicator?: boolean;
  public renewIndicator?: boolean;
  public changeIndicator?: boolean;
  public otherIndicator?: boolean;
}

export class Location extends ACORDEntity {
  public locationName?: string;
  public locationDescription?: string;
  public producerIdentifier?: string;
  public taxCode?: string;
  public insuredInterest?: string;
  public countyTownCode?: string;
  public riskLocationCode?: string;
  public earthquakeZoneCode?: string;
  public catastropheZoneCodes: string[] = [];
  public reportingTransactionTypeCode?: string;
  public endorsementReasonCode?: string;
  public numberOfMortgagees?: number;
  public unitCount?: number;
  public allBuildingsIndicator?: boolean;
  public physicalAddress?: Address;
}

export class Policy extends ACORDEntity {
  public policyNumberIdentifier?: string;
  public policyVersion?: string;
  public companyProductCode?: string;
  public companyProductSubCodes: string[] = [];
  public broadLineOfBusinessCode?: string;
  public lineOfBusinessCode?: string;
  public lineOfBusinessSubCode?: string;
  public policyTypeCode?: string;
  public controllingStateProvinceCode?: string;
  public effectiveDate?: string;
  public expirationDate?: string;
  public policyIssueDate?: string;
  public originalInceptionDate?: string;
  public billingAccountIdentifier?: string;
  public billingMethodCode?: string;
  public paymentScheduleCode?: string;
  public paymentMethodDescription?: string;
  public payorDescription?: string;
  public premiumFinancedCode?: string;
  public financeCompanyName?: string;
  public directBillIndicator?: boolean;
  public producerBillIndicator?: boolean;
  public fullPayIndicator?: boolean;
  public minimumPremiumAmount?: number;
  public fullTermPremiumAmount?: number;
  public contractTerm?: string;
  public status: PolicyStatus = new PolicyStatus();
  public lineOfBusinessIndicators: Record<string, boolean> = {};
  public sectionAttachedIndicators: Record<string, boolean> = {};
  public producers: Producer[] = [];
  public participatingInsurers: Insurer[] = [];
  public namedInsureds: NamedInsured[] = [];
  public locations: Location[] = [];
  public coverages: Coverage[] = [];
}

export const ACORD_ONTOLOGY_CLASS_METADATA: Record<string, OntologyClassMetadata> = {
  Address: {
    name: "Address",
    semanticRole: "Reusable postal and geospatial address node for parties, employers, and locations.",
    description: "Derived from Addr_Type and aligned to eLabel line/city/state/postal components.",
    sourceArtifacts: ["BusinessAggregates.xsd", "acord-eLabels.json"],
    sourceTypes: ["Addr_Type"],
  },
  ContactPerson: {
    name: "ContactPerson",
    semanticRole: "Human contact and communication endpoint for producer, insurer, and insured contexts.",
    description: "Combines PCPARTY name fields and Communications_Type channels with eLabel contact patterns.",
    sourceArtifacts: ["BusinessData.xsd", "BusinessAggregates.xsd", "acord-eLabels.json"],
    sourceTypes: ["PCPARTY", "Communications_Type"],
  },
  Employer: {
    name: "Employer",
    semanticRole: "Employer context associated with insured party underwriting details.",
    description: "Aligned to EmployerInfo_Type plus employer-specific eLabels and nested address/contact fields.",
    sourceArtifacts: ["BusinessAggregates.xsd", "acord-eLabels.json"],
    sourceTypes: ["EmployerInfo_Type"],
  },
  Producer: {
    name: "Producer",
    semanticRole: "Agency/broker producer entity participating in policy origination and servicing.",
    description: "Based on Producer_Type extension of PCPARTY and producer-specific eLabels.",
    sourceArtifacts: ["BusinessAggregates.xsd", "BusinessData.xsd", "acord-eLabels.json"],
    sourceTypes: ["Producer_Type", "PCPARTY"],
  },
  Insurer: {
    name: "Insurer",
    semanticRole: "Carrier/participating insurer entity including insurer identifiers and participation details.",
    description: "Based on INSURERID_CHOICE and ParticipatingInsurer_Type, augmented by insurer eLabels.",
    sourceArtifacts: ["BusinessAggregates.xsd", "acord-eLabels.json"],
    sourceTypes: ["ParticipatingInsurer_Type", "INSURERID_CHOICE"],
  },
  NamedInsured: {
    name: "NamedInsured",
    semanticRole: "Primary insured party (person or business) with identity, contact, and employment context.",
    description: "Modeled from InsuredOrPrincipal_Type/PCPARTY and named-insured eLabels.",
    sourceArtifacts: ["BusinessAggregates.xsd", "BusinessData.xsd", "acord-eLabels.json"],
    sourceTypes: ["InsuredOrPrincipal_Type", "PCPARTY"],
  },
  Coverage: {
    name: "Coverage",
    semanticRole: "Coverage grant node with coding, applicability, and financial amounts.",
    description: "Derived from Coverage_Type and commercial coverage-related eLabels.",
    sourceArtifacts: ["BusinessAggregates.xsd", "acord-eLabels.json"],
    sourceTypes: ["Coverage_Type"],
  },
  Location: {
    name: "Location",
    semanticRole: "Insured risk location and premises characteristics.",
    description: "Derived from Location_Type and location eLabels with nested physical address.",
    sourceArtifacts: ["BusinessAggregates.xsd", "acord-eLabels.json"],
    sourceTypes: ["Location_Type"],
  },
  Policy: {
    name: "Policy",
    semanticRole: "Commercial lines policy aggregate containing status, participants, risks, and coverages.",
    description: "Derived from Policy_Type and policy eLabels, including nested policy status and payment details.",
    sourceArtifacts: ["BusinessAggregates.xsd", "BusinessData.xsd", "acord-eLabels.json"],
    sourceTypes: ["Policy_Type"],
  },
  PolicyStatus: {
    name: "PolicyStatus",
    semanticRole: "Lifecycle and transaction state of the policy.",
    description: "Combines PolicyStatusCd from XSD with policy status indicator/effective-time eLabels.",
    sourceArtifacts: ["BusinessAggregates.xsd", "BusinessData.xsd", "acord-eLabels.json"],
    sourceTypes: ["PolicyStatusCd"],
  },
};

export const ACORD_ONTOLOGY_REGISTRY: OntologyRegistry = {
  classes: {
    Address: {
      metadata: ACORD_ONTOLOGY_CLASS_METADATA.Address,
      properties: [
        { name: "lineOne", type: "string", cardinality: "0..1", source: "both", evidence: ["Addr1", "Producer_MailingAddress_LineOne", "NamedInsured_MailingAddress_LineOne", "Location_PhysicalAddress_LineOne"], description: "Primary address line." },
        { name: "lineTwo", type: "string", cardinality: "0..1", source: "both", evidence: ["Addr2", "Producer_MailingAddress_LineTwo", "NamedInsured_MailingAddress_LineTwo", "Location_PhysicalAddress_LineTwo"], description: "Secondary address line." },
        { name: "city", type: "string", cardinality: "0..1", source: "both", evidence: ["City", "*_CityName"], description: "Municipality/city name." },
        { name: "stateOrProvinceCode", type: "string", cardinality: "0..1", source: "both", evidence: ["StateProvCd", "*_StateOrProvinceCode"], description: "State or province code." },
        { name: "postalCode", type: "string", cardinality: "0..1", source: "both", evidence: ["PostalCode", "*_PostalCode"], description: "Postal/ZIP code." },
        { name: "countryCode", type: "string", cardinality: "0..1", source: "both", evidence: ["CountryCd", "Location_PhysicalAddress_CountryCode"], description: "ISO-style country code." },
      ],
    },
    ContactPerson: {
      metadata: ACORD_ONTOLOGY_CLASS_METADATA.ContactPerson,
      properties: [
        { name: "fullName", type: "string", cardinality: "0..1", source: "elabel", evidence: ["Producer_ContactPerson_FullName", "NamedInsured_Contact_FullName"], description: "Contact display name." },
        { name: "phoneNumber", type: "string", cardinality: "0..1", source: "both", evidence: ["PhoneNumber", "Producer_ContactPerson_PhoneNumber"], description: "Primary phone number." },
        { name: "emailAddress", type: "string", cardinality: "0..1", source: "both", evidence: ["EmailAddr", "Producer_ContactPerson_EmailAddress"], description: "Email address." },
        { name: "mailingAddress", type: "Address", cardinality: "0..1", source: "elabel", evidence: ["NamedInsured_ContactMailingAddress_*"], description: "Contact mailing address." },
      ],
    },
    Employer: {
      metadata: ACORD_ONTOLOGY_CLASS_METADATA.Employer,
      properties: [
        { name: "fullName", type: "string", cardinality: "0..1", source: "elabel", evidence: ["Employer_FullName"], description: "Employer/business name." },
        { name: "selfInsuredIndicator", type: "boolean", cardinality: "0..1", source: "xsd", evidence: ["SelfInsuredInd"], description: "Whether employer is self-insured." },
        { name: "physicalAddress", type: "Address", cardinality: "0..1", source: "both", evidence: ["Addr", "Employer_PhysicalAddress_*"], description: "Employer physical location." },
      ],
    },
    Producer: {
      metadata: ACORD_ONTOLOGY_CLASS_METADATA.Producer,
      properties: [
        { name: "fullName", type: "string", cardinality: "0..1", source: "elabel", evidence: ["Producer_FullName"], description: "Producer legal/display name." },
        { name: "producerIdentifiers", type: "object", cardinality: "0..1", source: "both", evidence: ["NIPRId", "StateProducerId", "Producer_CustomerIdentifier", "Producer_NationalIdentifier"], description: "Set of producer IDs used across systems." },
        { name: "mailingAddress", type: "Address", cardinality: "0..1", source: "both", evidence: ["Addr", "Producer_MailingAddress_*"], description: "Producer mailing address." },
        { name: "contactPerson", type: "ContactPerson", cardinality: "0..1", source: "elabel", evidence: ["Producer_ContactPerson_*"], description: "Producer primary contact person." },
      ],
    },
    Insurer: {
      metadata: ACORD_ONTOLOGY_CLASS_METADATA.Insurer,
      properties: [
        { name: "fullName", type: "string", cardinality: "0..1", source: "elabel", evidence: ["Insurer_FullName"], description: "Insurer legal name." },
        { name: "naicCode", type: "string", cardinality: "0..1", source: "both", evidence: ["NAICCd", "Insurer_NAICCode"], description: "NAIC carrier identifier." },
        { name: "aiinCode", type: "string", cardinality: "0..1", source: "xsd", evidence: ["AIINCd"], description: "Alternate insurer identifier from INSURERID_CHOICE." },
        { name: "subscriptionPercent", type: "number", cardinality: "0..1", source: "xsd", evidence: ["SubscriptionPct"], description: "Participation percent for shared placements." },
      ],
    },
    NamedInsured: {
      metadata: ACORD_ONTOLOGY_CLASS_METADATA.NamedInsured,
      properties: [
        { name: "fullName", type: "string", cardinality: "0..1", source: "elabel", evidence: ["NamedInsured_FullName"], description: "Named insured as shown on declarations." },
        { name: "givenName", type: "string", cardinality: "0..1", source: "both", evidence: ["GivenName", "NamedInsured_GivenName"], description: "First/given name." },
        { name: "surname", type: "string", cardinality: "0..1", source: "both", evidence: ["Surname", "NamedInsured_Surname"], description: "Family/surname." },
        { name: "mailingAddress", type: "Address", cardinality: "0..1", source: "both", evidence: ["Addr", "NamedInsured_MailingAddress_*"], description: "Mailing address." },
        { name: "physicalAddress", type: "Address", cardinality: "0..1", source: "both", evidence: ["Addr", "NamedInsured_PhysicalAddress_*"], description: "Physical/risk address." },
        { name: "contact", type: "ContactPerson", cardinality: "0..1", source: "elabel", evidence: ["NamedInsured_Contact_*"], description: "Designated insured contact." },
        { name: "employer", type: "Employer", cardinality: "0..1", source: "both", evidence: ["EmployerCd", "EmployerDesc", "Employer_*"], description: "Current employer context." },
      ],
    },
    Coverage: {
      metadata: ACORD_ONTOLOGY_CLASS_METADATA.Coverage,
      properties: [
        { name: "coverageCode", type: "string", cardinality: "0..1", source: "xsd", evidence: ["CoverageCd"], description: "Coverage code." },
        { name: "coverageTypeCode", type: "string", cardinality: "0..1", source: "xsd", evidence: ["CoverageTypeCd"], description: "Coverage type code." },
        { name: "coverageName", type: "string", cardinality: "0..1", source: "xsd", evidence: ["CoverageName"], description: "Coverage display name." },
        { name: "coverageDescription", type: "string", cardinality: "0..1", source: "xsd", evidence: ["CoverageDesc"], description: "Coverage narrative description." },
        { name: "amount", type: "CoverageAmount", cardinality: "1..1", source: "both", evidence: ["CurrentTermAmt", "WrittenAmt", "ResidentialCoverage_*_LimitAmount", "ResidentialCoverage_*_PremiumAmount"], description: "Nested amount details, limits, and deductibles." },
      ],
    },
    Location: {
      metadata: ACORD_ONTOLOGY_CLASS_METADATA.Location,
      properties: [
        { name: "producerIdentifier", type: "string", cardinality: "0..1", source: "elabel", evidence: ["Location_ProducerIdentifier"], description: "Producer-assigned location identifier." },
        { name: "locationName", type: "string", cardinality: "0..1", source: "xsd", evidence: ["LocationName"], description: "Location name/title." },
        { name: "locationDescription", type: "string", cardinality: "0..1", source: "both", evidence: ["LocationDesc", "Location_LocationDescription"], description: "Location description." },
        { name: "physicalAddress", type: "Address", cardinality: "0..1", source: "both", evidence: ["Addr", "Location_PhysicalAddress_*"], description: "Physical risk address." },
      ],
    },
    PolicyStatus: {
      metadata: ACORD_ONTOLOGY_CLASS_METADATA.PolicyStatus,
      properties: [
        { name: "policyStatusCode", type: "string", cardinality: "0..1", source: "xsd", evidence: ["PolicyStatusCd"], description: "Canonical policy status code." },
        { name: "effectiveDate", type: "string", cardinality: "0..1", source: "elabel", evidence: ["Policy_Status_EffectiveDate"], description: "Status effective date." },
        { name: "effectiveTime", type: "string", cardinality: "0..1", source: "elabel", evidence: ["Policy_Status_EffectiveTime"], description: "Status effective time." },
        { name: "otherDescription", type: "string", cardinality: "0..1", source: "elabel", evidence: ["Policy_Status_OtherDescription"], description: "Freeform status description." },
      ],
    },
    Policy: {
      metadata: ACORD_ONTOLOGY_CLASS_METADATA.Policy,
      properties: [
        { name: "policyNumberIdentifier", type: "string", cardinality: "0..1", source: "both", evidence: ["PolicyNumber", "Policy_PolicyNumberIdentifier"], description: "Primary policy identifier." },
        { name: "effectiveDate", type: "string", cardinality: "0..1", source: "both", evidence: ["PolicyIssueDt", "Policy_EffectiveDate"], description: "Policy effective date." },
        { name: "expirationDate", type: "string", cardinality: "0..1", source: "elabel", evidence: ["Policy_ExpirationDate"], description: "Policy expiration date." },
        { name: "status", type: "PolicyStatus", cardinality: "1..1", source: "both", evidence: ["PolicyStatusCd", "Policy_Status_*"], description: "Nested policy status object." },
        { name: "producers", type: "Producer[]", cardinality: "0..n", source: "xsd", evidence: ["Producer"], description: "Associated producers." },
        { name: "participatingInsurers", type: "Insurer[]", cardinality: "0..n", source: "xsd", evidence: ["ParticipatingInsurer"], description: "Associated insurers/carriers." },
        { name: "namedInsureds", type: "NamedInsured[]", cardinality: "0..n", source: "both", evidence: ["InsuredOrPrincipal", "NamedInsured_*"], description: "Named insured parties." },
        { name: "locations", type: "Location[]", cardinality: "0..n", source: "xsd", evidence: ["Location"], description: "Covered locations." },
        { name: "coverages", type: "Coverage[]", cardinality: "0..n", source: "xsd", evidence: ["Coverage"], description: "Coverage entries under policy or line of business." },
      ],
    },
  },
};
