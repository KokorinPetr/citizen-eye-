import type { User } from "../api/types";

const MANAGER_ROLES: User["role"][] = ["coordinator", "admin"];

/** Same rule as the backend: the author, or a coordinator / admin, may manage a thing. */
export function canManage(user: User | null | undefined, ownerId: string | null | undefined): boolean {
  if (!user) return false;
  return user.id === ownerId || MANAGER_ROLES.includes(user.role);
}
