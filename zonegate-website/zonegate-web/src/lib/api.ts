/**
 * Client for the ZoneGate authorization API.
 *
 * Requests use the site's own backend proxy by default. A public API URL can
 * still be supplied for deployments that explicitly use cross-origin access.
 */

export const API_URL =
    process.env.NEXT_PUBLIC_API_URL ?? "/api/backend";

export function isDemoMode(): boolean {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return true;
    if (typeof window !== "undefined") {
        if (window.location.hostname.endsWith("github.io")) return true;
        if (window.location.search.includes("demo=true")) {
            try {
                window.localStorage.setItem("zonegate_demo_mode", "true");
            } catch {}
            return true;
        }
        try {
            if (window.localStorage.getItem("zonegate_demo_mode") === "true") return true;
        } catch {}
    }
    return false;
}

export function enableDemoMode() {
    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem("zonegate_demo_mode", "true");
        } catch {}
        window.location.reload();
    }
}

export function disableDemoMode() {
    if (typeof window !== "undefined") {
        try {
            window.localStorage.removeItem("zonegate_demo_mode");
        } catch {}
        window.location.reload();
    }
}

export const IS_DEMO =
    process.env.NEXT_PUBLIC_DEMO_MODE === "true";

import {
    mockChangePassword,
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
} from "./mockData";

export type DecisionOutcome = "APPROVE" | "HOLD" | "DENY";

export type ContextEvaluation = {
    risk_factors: string[];
    recommended_control: DecisionOutcome;
    rationale: string;
};

export type EvidenceSummary = {
    number_verified: boolean | null;
    location_verified: boolean | null;
    recent_sim_swap: boolean | null;
    recent_device_swap: boolean | null;
    reachable: boolean | null;
};

export type HoldResolution = {
    outcome: DecisionOutcome;
    resolved_by: string;
    authority_role: string;
    note: string;
    resolved_at: string;
};

export type PolicyDecision = {
    decision_id: string;
    transaction_id: string;
    decision: DecisionOutcome;
    reasons: string[];
    required_authority: string | null;
    context_evaluation: ContextEvaluation | null;
    evidence_summary: EvidenceSummary | null;
    decided_at: string;
    resolution: HoldResolution | null;
};

export type TransactionRequest = {
    transaction_id: string;
    actor_id: string;
    action: string;
    resource_id: string;
    zone: string;
    timestamp: string;
    /** Declared value, recorded for the audit trail. It no longer decides anything. */
    value: string;
    /** Cargo category. A restricted one is escalated instead of released. */
    category: string;
    metadata: Record<string, string>;
};

export type CanonicalEvidence = EvidenceSummary & {
    kyc_match: boolean | null;
    collected_at: string;
};

export type EvidencePlan = {
    mandatory: string[];
    optional: string[];
    combined: string[];
    rationale: string[];
    /**
     * How the plan was reached. The agent is only ever offered the optional
     * set, so anything mandatory in `combined` is the validator enforcing
     * policy rather than the agent having asked for it.
     *
     * Decisions recorded before this was traced come back with the defaults,
     * which is why `offered_optional` being empty means "not recorded" rather
     * than "the agent was offered nothing".
     */
    planner_consulted: boolean;
    offered_optional: string[];
    proposed_optional: string[];
};

export type Receipt = {
    receipt_id: string;
    decision_id: string;
    transaction_id: string;
    decision: DecisionOutcome;
    issued_at: string;
    token: string | null;
};

export type DecisionContext = {
    decision: PolicyDecision;
    transaction: TransactionRequest | null;
    evidence: CanonicalEvidence | null;
    evidence_plan: EvidencePlan | null;
    receipt: Receipt | null;
};

export type Actor = {
    actor_id: string;
    role: string;
    permissions: string[];
    registered_phone_number: string;
    registered_device_id: string;
    enrollment_status: string;
};

export type DeviceBinding = {
    actor_id: string;
    phone_number: string;
    device_id: string;
    bound_at: string;
    is_active: boolean;
};

export type RosterEntry = {
    actor: Actor;
    binding: DeviceBinding | null;
};

/** What the sign-in endpoints return. */
export type SessionResponse = {
    actor: Actor;
};

/** What `POST /v1/actors` returns: the saved actor and the binding made for it. */
export type EnrollmentResponse = {
    actor: Actor;
    binding: DeviceBinding;
};

export type PolicyConfig = {
    /** Cargo category -> the authority role that must approve it. */
    restricted_categories: Record<string, string>;
};

/** One cargo category, and who has to approve it if anyone does. */
export type CategoryOption = {
    category: string;
    restricted: boolean;
    required_authority: string | null;
};

/** A zone as the evidence gateway actually asks the carrier about it. */
export type GeofenceZone = {
    zone: string;
    latitude: number;
    longitude: number;
    radius_meters: number;
};

export type HealthReport = {
    status: string;
    dependencies: Record<string, string>;
};

export class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;

    try {
        response = await fetch(`${API_URL}${path}`, {
            ...init,
            // The session lives in an httpOnly cookie set by the backend.
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...(init?.headers ?? {}),
            },
        });
    } catch {
        throw new ApiError(
            `Cannot reach the authorization API at ${API_URL}. Is the backend running?`,
            0
        );
    }

    if (!response.ok) {
        let detail = `${response.status} ${response.statusText}`;

        try {
            const body = await response.json();
            if (body?.detail) detail = body.detail;
        } catch {
            // A non-JSON error body leaves the status line as the message.
        }

        throw new ApiError(detail, response.status);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
}

export function getHealth() {
    if (isDemoMode()) return mockGetHealth();
    return request<HealthReport>("/health");
}

export function listDecisions(params: {
    decision?: DecisionOutcome;
    pending?: boolean;
    limit?: number;
} = {}) {
    if (isDemoMode()) return mockListDecisions(params);
    const query = new URLSearchParams();

    if (params.decision) query.set("decision", params.decision);
    if (params.pending) query.set("pending", "true");
    if (params.limit) query.set("limit", String(params.limit));

    const suffix = query.toString() ? `?${query}` : "";
    return request<PolicyDecision[]>(`/v1/authorizations${suffix}`);
}

export function listDecisionContexts(params: {
    decision?: DecisionOutcome;
    pending?: boolean;
    limit?: number;
} = {}) {
    if (isDemoMode()) return mockListDecisionContexts(params);
    const query = new URLSearchParams();

    if (params.decision) query.set("decision", params.decision);
    if (params.pending) query.set("pending", "true");
    if (params.limit) query.set("limit", String(params.limit));

    const suffix = query.toString() ? `?${query}` : "";
    return request<DecisionContext[]>(`/v1/authorizations/contexts${suffix}`);
}

/** Signs an enrolled operator in. The session cookie comes back on the response. */
export function login(actorId: string, password: string) {
    if (isDemoMode()) return mockLogin(actorId);
    return request<SessionResponse>("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ actor_id: actorId, password }),
    });
}

export function logout() {
    if (isDemoMode()) return mockLogout();
    return request<void>("/v1/auth/logout", { method: "POST" });
}

/** Who the console is signed in as. Throws ApiError with status 401 when nobody is. */
export function getSession() {
    if (isDemoMode()) return mockGetSession();
    return request<SessionResponse>("/v1/auth/session");
}

/** Changes the signed-in operator's own console password. */
export function changePassword(password: string) {
    if (isDemoMode()) return mockChangePassword();
    return request<void>("/v1/auth/password", {
        method: "POST",
        body: JSON.stringify({ password }),
    });
}

export function listActors(limit = 200) {
    if (isDemoMode()) return mockListActors(limit);
    return request<RosterEntry[]>(`/v1/actors?limit=${limit}`);
}

/**
 * Enrolls an actor and binds their device in one call.
 *
 * Both halves matter: the authorization pipeline checks every request against
 * an enrolled actor *and* an active binding, so an actor saved without one can
 * only ever be denied. `deviceId` overrides the device the binding is made
 * against; omitted, the backend binds the actor's registered device.
 */
export function enrollActor(actor: Actor, options?: { deviceId?: string; password?: string }) {
    if (isDemoMode()) return mockEnrollActor(actor, options);
    return request<EnrollmentResponse>("/v1/actors", {
        method: "POST",
        body: JSON.stringify({
            actor,
            ...(options?.deviceId ? { device_id: options.deviceId } : {}),
            ...(options?.password ? { password: options.password } : {}),
        }),
    });
}

export function updateActorPermissions(actorId: string, permissions: string[], expectedPermissions: string[]) {
    if (isDemoMode()) return mockUpdateActorPermissions(actorId, permissions);
    return request<Actor>(`/v1/actors/${encodeURIComponent(actorId)}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions, expected_permissions: expectedPermissions }),
    });
}

export function listCategories() {
    if (isDemoMode()) return mockListCategories();
    return request<CategoryOption[]>("/v1/policy/categories");
}

/**
 * The geofences the gateway verifies device location against.
 *
 * The console map draws these, so it shows the circle the carrier was actually
 * asked about rather than an illustration of one.
 */
export function listZones() {
    if (isDemoMode()) return mockListZones();
    return request<GeofenceZone[]>("/v1/policy/zones");
}

export function getPolicyConfig() {
    if (isDemoMode()) return mockGetPolicyConfig();
    return request<PolicyConfig>("/v1/policy/config");
}

export function updatePolicyConfig(config: PolicyConfig) {
    if (isDemoMode()) return mockUpdatePolicyConfig(config);
    return request<PolicyConfig>("/v1/policy/config", {
        method: "PUT",
        body: JSON.stringify(config),
    });
}

export function getDecisionContext(decisionId: string) {
    if (isDemoMode()) return mockGetDecisionContext(decisionId);
    return request<DecisionContext>(
        `/v1/authorizations/${encodeURIComponent(decisionId)}/context`
    );
}

export function resolveHold(
    decisionId: string,
    body: { outcome: "APPROVE" | "DENY"; resolved_by: string; note?: string }
) {
    if (isDemoMode()) return mockResolveHold(decisionId, body);
    return request<{ decision: PolicyDecision; receipt: Receipt }>(
        `/v1/authorizations/${encodeURIComponent(decisionId)}/resolve`,
        { method: "POST", body: JSON.stringify(body) }
    );
}
