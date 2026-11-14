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


/** Confere referências entre registros institucionais antes da restauração. */
export function assertBackupRelationships(documents: RestoreDocument[]): void {
  const byPath = new Map(documents.map((item) => [item.path, item.data]));
  const requireRecord = (path: string, description: string) => {
    const value = byPath.get(path);
    if (!value) throw new Error(`O backup não contém o registro vinculado: ${description} (${path}).`);
    return value;
  };
  for (const item of documents) {
    const data = item.data;
    if (item.path.startsWith("sharedPromotions/") && typeof data.lastNotificationId === "string") {
      const notification = requireRecord(`sharedNotifications/${data.lastNotificationId}`, "notificação da promoção");
      if (notification.category !== "promocoes" || notification.target !== "promocoes"
        || notification.referenceId !== item.path.split("/")[1]) {
        throw new Error(`A notificação vinculada à promoção ${item.path} não corresponde ao registro.`);
      }
    }
    if (item.path.startsWith("delinquencyNotices/")) {
      if (typeof data.notificationId !== "string") throw new Error(`O aviso ${item.path} não possui notificação vinculada.`);
      const notification = requireRecord(`sharedNotifications/${data.notificationId}`, "notificação de inadimplência");
      if (notification.category !== "cobranca" || notification.target !== "inadimplencia"
        || notification.noticeId !== item.path.split("/")[1]) {
        throw new Error(`A notificação vinculada ao aviso ${item.path} não corresponde ao registro.`);
      }
    }
    if (item.path.startsWith("externalMaintenances/") && item.path.split("/").length === 2) {
      if (typeof data.lastNotificationId !== "string" || typeof data.lastHistoryId !== "string") {
        throw new Error(`A manutenção ${item.path} não possui histórico ou notificação vinculados.`);
      }
      const id = item.path.split("/")[1];
      const notification = requireRecord(`sharedNotifications/${data.lastNotificationId}`, "notificação da manutenção");
      const history = requireRecord(`externalMaintenances/${id}/history/${data.lastHistoryId}`, "histórico da manutenção");
      if (notification.category !== "manutencoes" || notification.target !== "manutencoes"
        || notification.maintenanceId !== id || history.maintenanceId !== id
        || !history.after || typeof history.after !== "object") {
        throw new Error(`Os vínculos históricos da manutenção ${item.path} são incompatíveis.`);
      }
      const after = history.after as Record<string, unknown>;
      for (const key of ["title", "date", "location", "description", "status"]) {
        if (after[key] !== data[key]) throw new Error(`O histórico final da manutenção ${item.path} diverge no campo ${key}.`);
      }
    }
  }
}
