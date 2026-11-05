export type RestoreDocument = { path: string; data: Record<string, unknown> };
export type RestoreProgress = { restoredCount: number; skippedCount: number };

/**
 * Restaura somente documentos ausentes. A decisão atômica de criação fica
 * a cargo do adaptador (por exemplo, uma transação do Firestore).
 */
export async function restoreMissingDocuments(
  documents: RestoreDocument[],
  createIfMissing: (document: RestoreDocument) => Promise<boolean>,
  onProgress?: (progress: RestoreProgress) => void,
): Promise<RestoreProgress> {
  let restoredCount = 0;
  let skippedCount = 0;
  for (const document of documents) {
    if (await createIfMissing(document)) restoredCount += 1;
    else skippedCount += 1;
    onProgress?.({ restoredCount, skippedCount });
  }
  return { restoredCount, skippedCount };
}
