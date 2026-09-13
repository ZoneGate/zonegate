/**
 * Who may settle a hold.
 *
 * Mirrors the backend's rule so the console can say so before anyone presses
 * a button; the backend still refuses a mismatched role on its own. Roles are
 * compared without their `ROLE_` prefix, because enrolment has used both
 * spellings for the same job.
 */

export function normalizeRole(role: string | null | undefined): string {
    const value = (role ?? "").trim().toUpperCase();
    return value.startsWith("ROLE_") ? value.slice("ROLE_".length) : value;
}

export function holdsAuthority(
    role: string | null | undefined,
    requiredAuthority: string | null | undefined
): boolean {
    if (!requiredAuthority) return false;
    return normalizeRole(role) === normalizeRole(requiredAuthority);
}
