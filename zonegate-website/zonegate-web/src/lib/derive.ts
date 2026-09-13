/**
 * Projections over the decision log.
 *
 * The API records decisions, not dashboards: there is no cargo entity, no
 * per-zone rollup, no "today" counter. Everything the console shows is derived
 * here from `/v1/authorizations/contexts`, so a number on screen can always be
 * traced back to the decisions that produced it.
 */

import type { DecisionContext, DecisionOutcome, PolicyDecision } from "./api";

/** The outcome that actually stands: a human resolution supersedes the HOLD. */
export function effectiveOutcome(decision: PolicyDecision): DecisionOutcome {
    return decision.resolution?.outcome ?? decision.decision;
}

/** A HOLD nobody has decided on yet. */
export function isAwaitingAuthority(decision: PolicyDecision): boolean {
    return decision.decision === "HOLD" && decision.resolution === null;
}

export function countByOutcome(contexts: DecisionContext[]) {
    const counts = { APPROVE: 0, HOLD: 0, DENY: 0 };

    for (const context of contexts) {
        counts[effectiveOutcome(context.decision)] += 1;
    }

    return counts;
}

export function decidedToday(contexts: DecisionContext[]): DecisionContext[] {
    const today = new Date().toISOString().slice(0, 10);
    return contexts.filter((c) => c.decision.decided_at.slice(0, 10) === today);
}

/** Zones ranked by how many decisions targeted them. */
export function zoneTotals(contexts: DecisionContext[]) {
    const totals = new Map<string, { zone: string; approve: number; hold: number; deny: number; total: number }>();

    for (const context of contexts) {
        const zone = context.transaction?.zone;
        if (!zone) continue;

        const row = totals.get(zone) ?? { zone, approve: 0, hold: 0, deny: 0, total: 0 };
        const outcome = effectiveOutcome(context.decision);

        if (outcome === "APPROVE") row.approve += 1;
        else if (outcome === "HOLD") row.hold += 1;
        else row.deny += 1;

        row.total += 1;
        totals.set(zone, row);
    }

    return [...totals.values()].sort((a, b) => b.total - a.total);
}

/** Distinct resources whose most recent decision cleared them. */
export function clearedResources(contexts: DecisionContext[]): string[] {
    const seen = new Set<string>();
    const cleared = new Set<string>();

    // Contexts arrive newest first, so the first sighting is the current state.
    for (const context of contexts) {
        const resource = context.transaction?.resource_id;
        if (!resource || seen.has(resource)) continue;

        seen.add(resource);
        if (effectiveOutcome(context.decision) === "APPROVE") cleared.add(resource);
    }

    return [...cleared];
}

/** Decisions a security lead would want surfaced, newest first. */
export function securityEvents(contexts: DecisionContext[], limit = 6) {
    return contexts
        .filter((c) => effectiveOutcome(c.decision) !== "APPROVE" || c.decision.resolution)
        .slice(0, limit);
}

export function shortTime(iso: string): string {
    const date = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function shortStamp(iso: string): string {
    const date = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
        date.getUTCDate()
    )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

/** `APPROVE` -> `APPROVED`, matching the badge vocabulary already in the UI. */
export function badgeLabel(outcome: DecisionOutcome): string {
    if (outcome === "APPROVE") return "APPROVED";
    if (outcome === "DENY") return "DENIED";
    return "HOLD";
}

/**
 * How long the holds in this set waited on a human, averaged.
 *
 * Measured from the moment the engine handed the decision over to the moment
 * the named authority answered, so it only counts holds that were actually
 * resolved. Returns `null` when nobody has resolved anything yet -- a dash on
 * screen is honest, an invented average is not.
 */
export function resolutionLatency(
    contexts: DecisionContext[]
): { averageMinutes: number; sampled: number } | null {
    const waits: number[] = [];

    for (const { decision } of contexts) {
        const resolution = decision.resolution;
        if (!resolution) continue;

        const handedOver = new Date(decision.decided_at).getTime();
        const answered = new Date(resolution.resolved_at).getTime();
        if (!Number.isFinite(handedOver) || !Number.isFinite(answered)) continue;
        if (answered < handedOver) continue;

        waits.push((answered - handedOver) / 60000);
    }

    if (waits.length === 0) return null;

    return {
        averageMinutes: waits.reduce((sum, wait) => sum + wait, 0) / waits.length,
        sampled: waits.length,
    };
}

/** Renders a minute count the way an operations screen reads it. */
export function formatWait(minutes: number): string {
    if (minutes < 1) return "under a minute";
    if (minutes < 90) return `${Math.round(minutes)} min avg`;
    const hours = minutes / 60;
    if (hours < 48) return `${hours.toFixed(1)} h avg`;
    return `${(hours / 24).toFixed(1)} d avg`;
}
