// Veloria PoS - IPC: rôles internes (0041). Session en mémoire main uniquement.
// Mutations gérant : l'acteur est la session courante (jamais un id client).
// Login/logout/session : auth, sans operationId. Mutations : operationId requis.

import { IPC_CHANNELS } from "./channels";
import * as V from "./validators";
import * as Staff from "./handlers/staff.repo";
import { getCurrentStaffUser, setCurrentStaffUser } from "./handlers/staff-session";
import { handle } from "./handle";

function requireSession(): number {
  const id = getCurrentStaffUser();
  if (id == null) throw new Error("Session requise : choisissez un utilisateur.");
  return id;
}

export function registerStaffChannels(): void {
  handle(IPC_CHANNELS["staff.list"], V.emptyPayloadSchema, () =>
    Staff.listStaffUsers(new Date().toISOString()),
  );
  handle(IPC_CHANNELS["staff.login"], V.staffLoginSchema, (input) => {
    const user = Staff.authenticateAtomic({
      username: input.username,
      code: input.code,
      now: new Date().toISOString(),
    });
    setCurrentStaffUser(user.id);
    return { user };
  });
  handle(IPC_CHANNELS["staff.logout"], V.emptyPayloadSchema, () => {
    setCurrentStaffUser(null);
    return { loggedOut: true };
  });
  handle(IPC_CHANNELS["staff.session"], V.emptyPayloadSchema, () => {
    const id = getCurrentStaffUser();
    if (id == null) return { user: null };
    const { users } = Staff.listStaffUsers(new Date().toISOString());
    return { user: users.find((u) => u.id === id) ?? null };
  });
  handle(IPC_CHANNELS["staff.create"], V.staffCreateSchema, (input) => {
    const actor = requireSession();
    return Staff.createStaffUserAtomic({
      actorUserId: actor,
      operationId: input.operationId,
      username: input.username,
      displayName: input.displayName,
      role: input.role,
      code: input.code,
      now: new Date().toISOString(),
    });
  });
  handle(IPC_CHANNELS["staff.setPermissions"], V.staffSetPermissionsSchema, (input) => {
    const actor = requireSession();
    return Staff.setPermissionsAtomic({
      actorUserId: actor,
      userId: input.userId,
      permissionKeys: [...input.permissionKeys],
      operationId: input.operationId,
      now: new Date().toISOString(),
    });
  });
  handle(IPC_CHANNELS["staff.changeCode"], V.staffChangeCodeSchema, (input) => {
    const id = requireSession();
    return Staff.changeCodeAtomic({
      userId: id,
      oldCode: input.oldCode,
      newCode: input.newCode,
      operationId: input.operationId,
      now: new Date().toISOString(),
    });
  });
  handle(IPC_CHANNELS["staff.setActive"], V.staffSetActiveSchema, (input) => {
    const actor = requireSession();
    return Staff.setActiveAtomic({
      actorUserId: actor,
      userId: input.userId,
      isActive: input.isActive,
      operationId: input.operationId,
      now: new Date().toISOString(),
    });
  });
  // Récupération sans session (code de secours 8 chiffres, 0042).
  handle(IPC_CHANNELS["staff.recover"], V.staffRecoverSchema, (input) =>
    Staff.recoverAccessAtomic({
      username: input.username,
      recoveryCode: input.recoveryCode,
      newCode: input.newCode,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  // Réémission du secours (gérant en session, clair retourné une fois).
  handle(IPC_CHANNELS["staff.regenRecovery"], V.staffRegenRecoverySchema, (input) => {
    const actor = requireSession();
    return Staff.regenRecoveryAtomic({
      actorUserId: actor,
      operationId: input.operationId,
      now: new Date().toISOString(),
    });
  });
}
