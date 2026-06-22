export {
  areEmbeddingsReady,
  ensureEmbeddings,
  getAllAcordEntries,
  getAcordDictionaryState,
  getEmbeddingCache,
  initializeAcordDictionary,
  lookupAcordByCode,
  searchAcordDictionary,
} from "../api/src/services/acordDictionary";

export type { AcordDictionaryEntry } from "shared/acord";