import { beforeEach, describe, expect, it } from "vitest";
import {
    clearedResources,
    countByOutcome,
    decidedToday,
    effectiveOutcome,
    isAwaitingAuthority,
    zoneTotals,
} from "./derive";
import {
    DEFAULT_DEMO_OPERATOR,
    mockEnrollActor,
    mockGetDecisionContext,
    mockGetHealth,
    mockGetPolicyConfig,
    mockGetSession,
    mockListActors,
    mockListCategories,
    mockListDecisionContexts,
    mockListDecisions,
    mockListZones,
    mockLogin,
    mockLogout,
    mockResolveHold,
    mockUpdateActorPermissions,
    mockUpdatePolicyConfig,
    resetDemoState,
} from "./mockData";

describe("Demo mode client store and mock handlers", () => {
    beforeEach(() => {
        resetDemoState();
    });

    it("returns healthy status for health probe", async () => {
        const health = await mockGetHealth();
        expect(health.status).toBe("healthy");
        expect(health.dependencies.authorization_engine).toContain("client-demo");
    });

    it("defaults to logged-in demo supervisor session", async () => {
        const session = await mockGetSession();
        expect(session.actor.actor_id).toBe(DEFAULT_DEMO_OPERATOR.actor_id);
        expect(session.actor.role).toBe("SUPERVISOR");
    });

    it("supports logging out and signing in as another actor", async () => {
        await mockLogout();
        await expect(mockGetSession()).rejects.toThrow("401");

        const loggedIn = await mockLogin("OP-4410");
        expect(loggedIn.actor.actor_id).toBe("OP-4410");
        expect(loggedIn.actor.role).toBe("GATE_INSPECTOR");

        const currentSession = await mockGetSession();
        expect(currentSession.actor.actor_id).toBe("OP-4410");
    });

    it("lists decisions and contexts with filtering", async () => {
        const allContexts = await mockListDecisionContexts();
        expect(allContexts.length).toBeGreaterThan(5);

        const pending = await mockListDecisionContexts({ pending: true });
        expect(pending.length).toBeGreaterThan(0);
        for (const c of pending) {
            expect(isAwaitingAuthority(c.decision)).toBe(true);
        }

        const decisions = await mockListDecisions();
        expect(decisions.length).toBe(allContexts.length);
    });

    it("resolves a hold and generates a receipt", async () => {
        const pending = await mockListDecisionContexts({ pending: true });
        const target = pending[0];

        const { decision, receipt } = await mockResolveHold(target.decision.decision_id, {
            outcome: "APPROVE",
            resolved_by: "OP-7821",
            note: "Verified in demo",
        });

        expect(decision.resolution?.outcome).toBe("APPROVE");
        expect(decision.resolution?.resolved_by).toBe("OP-7821");
        expect(receipt).not.toBeNull();
        expect(receipt.token).toBeDefined();

        // Verify it was persisted in state
        const updatedContext = await mockGetDecisionContext(target.decision.decision_id);
        expect(effectiveOutcome(updatedContext.decision)).toBe("APPROVE");
        expect(isAwaitingAuthority(updatedContext.decision)).toBe(false);
    });

    it("enrolls new actors and modifies permissions", async () => {
        const initialRoster = await mockListActors();
        const newActor = {
            actor_id: "CR-9999",
            role: "COURIER",
            permissions: ["TRANSACTION_REQUEST"],
            registered_phone_number: "+1 (555) 111-2233",
            registered_device_id: "DEV-NEW-99",
            enrollment_status: "PENDING",
        };

        const { actor, binding } = await mockEnrollActor(newActor);
        expect(actor.actor_id).toBe("CR-9999");
        expect(actor.enrollment_status).toBe("ACTIVE");
        expect(binding.device_id).toBe("DEV-NEW-99");

        const updated = await mockUpdateActorPermissions("CR-9999", [
            "TRANSACTION_REQUEST",
            "ZONE_ENTER",
        ]);
        expect(updated.permissions).toContain("ZONE_ENTER");

        const updatedRoster = await mockListActors();
        expect(updatedRoster.length).toBe(initialRoster.length + 1);
    });

    it("returns and updates policy config, zones, and categories", async () => {
        const config = await mockGetPolicyConfig();
        expect(config).not.toHaveProperty("window_start_hour");

        await mockUpdatePolicyConfig({
            ...config,
            restricted_categories: {
                ...config.restricted_categories,
                PERISHABLE: "ROLE_COLD_CHAIN_LEAD",
            },
        });

        const updatedConfig = await mockGetPolicyConfig();
        expect(updatedConfig.restricted_categories.PERISHABLE).toBe("ROLE_COLD_CHAIN_LEAD");

        const zones = await mockListZones();
        expect(zones.length).toBeGreaterThan(0);
        expect(zones[0].zone).toBe("PORT_GATE_17");

        const categories = await mockListCategories();
        expect(categories.some((c) => c.restricted)).toBe(true);
    });

    it("integrates seamlessly with derive projections", async () => {
        const contexts = await mockListDecisionContexts();
        const counts = countByOutcome(contexts);
        expect(counts.APPROVE).toBeGreaterThan(0);
        expect(counts.HOLD).toBeGreaterThan(0);
        expect(counts.DENY).toBeGreaterThan(0);

        const today = decidedToday(contexts);
        expect(today.length).toBeGreaterThan(0);

        const zones = zoneTotals(contexts);
        expect(zones.length).toBeGreaterThan(0);

        const cleared = clearedResources(contexts);
        expect(cleared.length).toBeGreaterThan(0);
    });
});
