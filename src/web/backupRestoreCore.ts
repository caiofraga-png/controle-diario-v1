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


/** Confere a identidade do documento antes de qualquer gravação de restauração. */
export function assertRestoreDocumentIdentity(path: string, data: Record<string, unknown>): void {
  const parts = path.split("/");
  if (parts[0] === "users" && parts.length === 2 && data.uid !== parts[1]) {
    throw new Error(`O identificador do usuário não corresponde ao caminho ${path}.`);
  }
  if (parts[0] === "users" && parts.length > 2) {
    const relativePath = parts.slice(2, -1).join("/");
    const requiresOwner = relativePath === "attendanceRows"
      || relativePath === "operational"
      || relativePath === "operational/history/entries";
    if (requiresOwner && data.ownerUid !== parts[1]) {
      throw new Error(`O proprietário não corresponde ao caminho do documento ${path}.`);
    }
    if (typeof data.ownerUid === "string" && data.ownerUid !== parts[1]) {
      throw new Error(`O proprietário não corresponde ao caminho do documento ${path}.`);
    }
  }
  if (parts[0] === "Expediente"
    && (typeof data.ownerUid !== "string"
      || !data.assignment || typeof data.assignment !== "object"
      || (data.assignment as Record<string, unknown>).uid !== data.ownerUid)) {
    throw new Error(`A atribuição do expediente não corresponde ao proprietário em ${path}.`);
  }
}
