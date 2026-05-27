/**
 * Pure guards for staff mutations. Kept out of the "use server" action module
 * (whose every export must be an async action) so they can be unit-tested
 * directly — the Server Action enforcement is the real gate, not the UI.
 */

/**
 * A manager must not deactivate their own account (lockout guard, spec 01 §2.3).
 * True when the actor is turning their OWN row inactive.
 */
export function isSelfDeactivation(
  actorId: string,
  targetId: string,
  nextActive: boolean,
): boolean {
  return !nextActive && actorId === targetId;
}
