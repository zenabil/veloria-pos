// Veloria PoS — Domain: constructeur d'événements d'audit (framework-free).
// P3 : TOUTE mutation trace via ce constructeur — operationId OBLIGATOIRE
// (jamais de randomUUID silencieux), type/entité non vides, détails JSON
// sérialisables. Le repo persiste tel quel dans audit_log (même transaction).

import { DomainError } from "../common/errors.ts";

export interface AuditEventInput {
  eventId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  operationId: string;
  details?: unknown;
  createdAt: string;
}

export interface AuditEventRow {
  event_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  operation_id: string;
  details_json: string;
  created_at: string;
}

function nonEmpty(v: string, label: string): string {
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new DomainError("VALIDATION_ERROR", `Audit invalide : ${label} requis.`);
  }
  return v;
}

export function buildAuditEvent(input: AuditEventInput): AuditEventRow {
  const operationId = nonEmpty(input.operationId, "operationId");
  let detailsJson: string;
  try {
    detailsJson = JSON.stringify(input.details ?? {});
  } catch {
    throw new DomainError("VALIDATION_ERROR", "Audit invalide : détails non sérialisables.");
  }
  return {
    event_id: nonEmpty(input.eventId, "eventId"),
    event_type: nonEmpty(input.eventType, "eventType"),
    entity_type: nonEmpty(input.entityType, "entityType"),
    entity_id: nonEmpty(input.entityId, "entityId"),
    operation_id: operationId,
    details_json: detailsJson,
    created_at: nonEmpty(input.createdAt, "createdAt"),
  };
}
