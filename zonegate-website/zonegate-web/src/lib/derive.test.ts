/**
 * Tests for the projections behind every number on the console.
 *
 * The API records decisions; the dashboard shows counts, rollups and queues.
 * Each of those is computed here, so a bug in this file is a wrong figure on a
 * security operator's screen rather than a visible crash.
 */

import { describe, expect, it } from "vitest";

import type {
    DecisionContext,
    DecisionOutcome,
    PolicyDecision,
} from "./api";
import {
    badgeLabel,
    clearedResources,
    countByOutcome,
    decidedToday,
    effectiveOutcome,
    formatWait,
    isAwaitingAuthority,
    resolutionLatency,
    securityEvents,
    shortStamp,
    shortTime,
    zoneTotals,
} from "./derive";

function decision(
    overrides: Partial<PolicyDecision> & { decision_id: string }
): PolicyDecision {
    return {
        transaction_id: `tx_${overrides.decision_id}`,
        decision: "APPROVE",
        reasons: ["test reason"],
        required_authority: null,
        context_evaluation: null,
        evidence_summary: null,
        decided_at: "2026-09-10T09:00:00Z",
        resolution: null,
        ...overrides,
    };
}

function context(
    id: string,
    outcome: DecisionOutcome,
    options: {
        zone?: string;
        resource?: string;
        decidedAt?: string;
        resolved?: DecisionOutcome;
    } = {}
): DecisionContext {
    const {
        zone = "PORT_GATE_17",
        resource = "CT-100",
        decidedAt = "2026-09-10T09:00:00Z",
        resolved,
    } = options;

    return {
        decision: decision({
            decision_id: id,
            decision: outcome,
            decided_at: decidedAt,
            required_authority:
                outcome === "HOLD" ? "ROLE_CARGO_SUPERVISOR" : null,
            resolution: resolved
                ? {
                      outcome: resolved,
                      resolved_by: "usr_cargo_supervisor_02",
                      authority_role: "ROLE_CARGO_SUPERVISOR",
                      note: "",
                      resolved_at: "2026-09-10T10:00:00Z",
                  }
                : null,
        }),
        transaction: {
            transaction_id: `tx_${id}`,
            actor_id: "usr_cargo_operator_01",
            action: "RELEASE_CARGO",
            resource_id: resource,
            zone,
            timestamp: decidedAt,
            value: "15000.00",
            category: "GENERAL",
            metadata: {},
        },
        evidence: null,
        evidence_plan: null,
        receipt: null,
    };
}

describe("effectiveOutcome", () => {
    it("returns the engine's outcome when nobody has decided", () => {
        expect(effectiveOutcome(decision({ decision_id: "a", decision: "HOLD" }))).toBe(
            "HOLD"
        );
    });

    it("lets a human resolution supersede the HOLD", () => {
        const resolved = context("a", "HOLD", { resolved: "APPROVE" }).decision;
        expect(effectiveOutcome(resolved)).toBe("APPROVE");
    });

    it("reflects a human DENY on a HOLD", () => {
        const resolved = context("a", "HOLD", { resolved: "DENY" }).decision;
        expect(effectiveOutcome(resolved)).toBe("DENY");
    });
});

describe("isAwaitingAuthority", () => {
    it("is true only for an unresolved HOLD", () => {
        expect(isAwaitingAuthority(context("a", "HOLD").decision)).toBe(true);
    });

    it("is false once the HOLD has been decided", () => {
        expect(
            isAwaitingAuthority(context("a", "HOLD", { resolved: "APPROVE" }).decision)
        ).toBe(false);
    });

    it("is false for outcomes that never transfer authority", () => {
        expect(isAwaitingAuthority(context("a", "APPROVE").decision)).toBe(false);
        expect(isAwaitingAuthority(context("b", "DENY").decision)).toBe(false);
    });
});

describe("countByOutcome", () => {
    it("counts each outcome", () => {
        const counts = countByOutcome([
            context("a", "APPROVE"),
            context("b", "APPROVE"),
            context("c", "HOLD"),
            context("d", "DENY"),
        ]);

        expect(counts).toEqual({ APPROVE: 2, HOLD: 1, DENY: 1 });
    });

    it("counts a resolved HOLD under what actually stands", () => {
        const counts = countByOutcome([
            context("a", "HOLD", { resolved: "APPROVE" }),
            context("b", "HOLD"),
        ]);

        expect(counts).toEqual({ APPROVE: 1, HOLD: 1, DENY: 0 });
    });

    it("returns zeroes for an empty log", () => {
        expect(countByOutcome([])).toEqual({ APPROVE: 0, HOLD: 0, DENY: 0 });
    });
});

describe("decidedToday", () => {
    it("keeps only decisions stamped with today's date", () => {
        const today = new Date().toISOString().slice(0, 10);

        const rows = decidedToday([
            context("a", "APPROVE", { decidedAt: `${today}T08:00:00Z` }),
            context("b", "APPROVE", { decidedAt: "2020-01-01T08:00:00Z" }),
        ]);

        expect(rows.map((r) => r.decision.decision_id)).toEqual(["a"]);
    });

    it("is empty when nothing was decided today", () => {
        expect(
            decidedToday([
                context("a", "APPROVE", { decidedAt: "2020-01-01T08:00:00Z" }),
            ])
        ).toEqual([]);
    });
});

describe("zoneTotals", () => {
    it("groups by zone and ranks by volume", () => {
        const totals = zoneTotals([
            context("a", "APPROVE", { zone: "PORT_GATE_17" }),
            context("b", "DENY", { zone: "PORT_GATE_17" }),
            context("c", "HOLD", { zone: "PORT_GATE_09" }),
        ]);

        expect(totals[0].zone).toBe("PORT_GATE_17");
        expect(totals[0].total).toBe(2);
        expect(totals[0].approve).toBe(1);
        expect(totals[0].deny).toBe(1);
        expect(totals[1].zone).toBe("PORT_GATE_09");
        expect(totals[1].hold).toBe(1);
    });

    it("counts a resolved HOLD under the outcome that stands", () => {
        const totals = zoneTotals([
            context("a", "HOLD", { zone: "Z", resolved: "APPROVE" }),
        ]);

        expect(totals[0].approve).toBe(1);
        expect(totals[0].hold).toBe(0);
    });

    it("skips a decision whose transaction is no longer on record", () => {
        const orphan = context("a", "APPROVE");
        orphan.transaction = null;

        expect(zoneTotals([orphan])).toEqual([]);
    });
});

describe("clearedResources", () => {
    it("counts a container once, however many decisions it has", () => {
        const cleared = clearedResources([
            context("newest", "APPROVE", { resource: "CT-1" }),
            context("older", "APPROVE", { resource: "CT-1" }),
        ]);

        expect(cleared).toEqual(["CT-1"]);
    });

    it("uses the newest decision, so a later block un-clears a container", () => {
        // Contexts arrive newest first, as the API returns them.
        const cleared = clearedResources([
            context("newest", "DENY", { resource: "CT-1" }),
            context("older", "APPROVE", { resource: "CT-1" }),
        ]);

        expect(cleared).toEqual([]);
    });

    it("clears a container whose latest decision is an approved HOLD", () => {
        const cleared = clearedResources([
            context("newest", "HOLD", { resource: "CT-1", resolved: "APPROVE" }),
        ]);

        expect(cleared).toEqual(["CT-1"]);
    });

    it("separates distinct containers", () => {
        const cleared = clearedResources([
            context("a", "APPROVE", { resource: "CT-1" }),
            context("b", "APPROVE", { resource: "CT-2" }),
        ]);

        expect(cleared.sort()).toEqual(["CT-1", "CT-2"]);
    });
});

describe("securityEvents", () => {
    it("surfaces anything that was not a plain approval", () => {
        const events = securityEvents([
            context("a", "APPROVE"),
            context("b", "DENY"),
            context("c", "HOLD"),
        ]);

        expect(events.map((e) => e.decision.decision_id)).toEqual(["b", "c"]);
    });

    it("keeps a resolved HOLD, because a person had to intervene", () => {
        const events = securityEvents([
            context("a", "HOLD", { resolved: "APPROVE" }),
        ]);

        expect(events).toHaveLength(1);
    });

    it("respects the limit", () => {
        const many = Array.from({ length: 10 }, (_, i) =>
            context(`d${i}`, "DENY")
        );

        expect(securityEvents(many, 3)).toHaveLength(3);
    });
});

describe("badgeLabel", () => {
    it("uses the vocabulary the badges already speak", () => {
        expect(badgeLabel("APPROVE")).toBe("APPROVED");
        expect(badgeLabel("DENY")).toBe("DENIED");
        expect(badgeLabel("HOLD")).toBe("HOLD");
    });
});

describe("time formatting", () => {
    it("renders a UTC clock time", () => {
        expect(shortTime("2026-09-10T09:05:03Z")).toBe("09:05:03");
    });

    it("renders a readable stamp without sub-second noise", () => {
        expect(shortStamp("2026-09-10T09:05:03.577797Z")).toBe(
            "2026-09-10 09:05 UTC"
        );
    });

    it("reports in UTC regardless of the offset in the input", () => {
        expect(shortStamp("2026-09-10T12:05:00+03:00")).toBe(
            "2026-09-10 09:05 UTC"
        );
    });
});

describe("resolutionLatency", () => {
    /** A hold decided at `decidedAt` and answered `minutes` later. */
    function waited(id: string, minutes: number) {
        const row = context(id, "HOLD", {
            decidedAt: "2026-09-10T09:00:00Z",
            resolved: "APPROVE",
        });

        row.decision.resolution!.resolved_at = new Date(
            Date.parse("2026-09-10T09:00:00Z") + minutes * 60000
        ).toISOString();

        return row;
    }

    it("averages the wait across resolved holds only", () => {
        const latency = resolutionLatency([
            waited("a", 10),
            waited("b", 20),
            context("c", "HOLD"),
            context("d", "APPROVE"),
        ]);

        expect(latency).toEqual({ averageMinutes: 15, sampled: 2 });
    });

    it("is null when nobody has resolved anything", () => {
        expect(resolutionLatency([context("a", "HOLD")])).toBeNull();
    });

    it("is null for an empty log, rather than reporting zero", () => {
        expect(resolutionLatency([])).toBeNull();
    });

    it("ignores a resolution stamped before the decision it resolves", () => {
        const backwards = waited("a", -30);

        expect(resolutionLatency([backwards])).toBeNull();
    });
});

describe("formatWait", () => {
    it("keeps short waits in minutes", () => {
        expect(formatWait(42)).toBe("42 min avg");
    });

    it("does not round a real wait down to zero", () => {
        expect(formatWait(0.4)).toBe("under a minute");
    });

    it("switches to hours past an hour and a half", () => {
        expect(formatWait(150)).toBe("2.5 h avg");
    });

    it("switches to days past two", () => {
        expect(formatWait(60 * 72)).toBe("3.0 d avg");
    });
});
