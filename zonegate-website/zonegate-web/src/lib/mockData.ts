/**
 * Client-only mock dataset and in-browser state store for the ZoneGate demo.
 *
 * Persists modifications (resolving holds, enrolling actors, updating permissions,
 * changing policy) to localStorage during the demo session, while seeding realistic
 * operations, zones, and security events.
 */

import {
    ApiError,
    type Actor,
    type CategoryOption,
    type DecisionContext,
    type DecisionOutcome,
    type GeofenceZone,
    type HealthReport,
    type PolicyConfig,
    type PolicyDecision,
    type Receipt,
    type RosterEntry,
    type SessionResponse,
} from "./api";

const STORAGE_KEY = "zonegate_demo_state_v1";

export const DEFAULT_DEMO_OPERATOR: Actor = {
    actor_id: "OP-7821",
    role: "SUPERVISOR",
    permissions: [
        "DECISION_RESOLVE",
        "ACTOR_ENROLL",
        "POLICY_MANAGE",
        "AUDIT_EXPORT",
        "CARGO_RELEASE",
    ],
    registered_phone_number: "+1 (555) 482-9011",
    registered_device_id: "DEV-SEC-09",
    enrollment_status: "ACTIVE",
};

export const INITIAL_ZONES: GeofenceZone[] = [
    {
        zone: "PORT_GATE_17",
        latitude: 51.9515,
        longitude: 4.1332,
        radius_meters: 250,
    },
    {
        zone: "TERMINAL_NORTH",
        latitude: 51.9482,
        longitude: 4.141,
        radius_meters: 300,
    },
    {
        zone: "CARGO_BAY_C",
        latitude: 51.955,
        longitude: 4.128,
        radius_meters: 180,
    },
    {
        zone: "INTERMODAL_YARD",
        latitude: 51.942,
        longitude: 4.15,
        radius_meters: 350,
    },
    {
        zone: "AIRPORT_AIRSIDE_EAST",
        latitude: 52.3105,
        longitude: 4.7683,
        radius_meters: 220,
    },
];

export const INITIAL_CATEGORIES: CategoryOption[] = [
    { category: "GENERAL_FREIGHT", restricted: false, required_authority: null },
    { category: "PERISHABLE_FOOD", restricted: false, required_authority: null },
    {
        category: "ELECTRONICS_HIGH_VALUE",
        restricted: true,
        required_authority: "SUPERVISOR",
    },
    {
        category: "HAZARDOUS_CLASS_3",
        restricted: true,
        required_authority: "HAZMAT_CONTROLLER",
    },
    {
        category: "PHARMACEUTICALS",
        restricted: true,
        required_authority: "COMPLIANCE_OFFICER",
    },
    {
        category: "BONDED_CUSTOMS",
        restricted: true,
        required_authority: "CUSTOMS_LIAISON",
    },
];

export const INITIAL_POLICY_CONFIG: PolicyConfig = {
    restricted_categories: {
        ELECTRONICS_HIGH_VALUE: "SUPERVISOR",
        HAZARDOUS_CLASS_3: "HAZMAT_CONTROLLER",
        PHARMACEUTICALS: "COMPLIANCE_OFFICER",
        BONDED_CUSTOMS: "CUSTOMS_LIAISON",
    },
};

export const INITIAL_ROSTER: RosterEntry[] = [
    {
        actor: DEFAULT_DEMO_OPERATOR,
        binding: {
            actor_id: "OP-7821",
            phone_number: "+1 (555) 482-9011",
            device_id: "DEV-SEC-09",
            bound_at: "2026-01-15T08:30:00Z",
            is_active: true,
        },
    },
    {
        actor: {
            actor_id: "OP-4410",
            role: "GATE_INSPECTOR",
            permissions: ["CARGO_INSPECT", "EVIDENCE_COLLECT"],
            registered_phone_number: "+1 (555) 321-7789",
            registered_device_id: "DEV-GATE-44",
            enrollment_status: "ACTIVE",
        },
        binding: {
            actor_id: "OP-4410",
            phone_number: "+1 (555) 321-7789",
            device_id: "DEV-GATE-44",
            bound_at: "2026-02-01T10:00:00Z",
            is_active: true,
        },
    },
    {
        actor: {
            actor_id: "CR-9012",
            role: "COURIER",
            permissions: ["TRANSACTION_REQUEST", "ZONE_ENTER"],
            registered_phone_number: "+1 (555) 890-1234",
            registered_device_id: "PH-CR-9012",
            enrollment_status: "ACTIVE",
        },
        binding: {
            actor_id: "CR-9012",
            phone_number: "+1 (555) 890-1234",
            device_id: "PH-CR-9012",
            bound_at: "2026-03-10T14:15:00Z",
            is_active: true,
        },
    },
    {
        actor: {
            actor_id: "CR-8823",
            role: "COURIER",
            permissions: ["TRANSACTION_REQUEST", "ZONE_ENTER"],
            registered_phone_number: "+1 (555) 765-4321",
            registered_device_id: "PH-CR-8823",
            enrollment_status: "ACTIVE",
        },
        binding: {
            actor_id: "CR-8823",
            phone_number: "+1 (555) 765-4321",
            device_id: "PH-CR-8823",
            bound_at: "2026-03-12T09:00:00Z",
            is_active: true,
        },
    },
    {
        actor: {
            actor_id: "CR-3341",
            role: "COURIER",
            permissions: ["TRANSACTION_REQUEST", "ZONE_ENTER"],
            registered_phone_number: "+1 (555) 443-8811",
            registered_device_id: "PH-CR-3341",
            enrollment_status: "ACTIVE",
        },
        binding: {
            actor_id: "CR-3341",
            phone_number: "+1 (555) 443-8811",
            device_id: "PH-CR-3341",
            bound_at: "2026-04-05T11:45:00Z",
            is_active: true,
        },
    },
    {
        actor: {
            actor_id: "OP-1102",
            role: "COMPLIANCE_OFFICER",
            permissions: ["DECISION_RESOLVE", "POLICY_MANAGE", "AUDIT_EXPORT"],
            registered_phone_number: "+1 (555) 909-5522",
            registered_device_id: "DEV-CMP-11",
            enrollment_status: "ACTIVE",
        },
        binding: {
            actor_id: "OP-1102",
            phone_number: "+1 (555) 909-5522",
            device_id: "DEV-CMP-11",
            bound_at: "2026-02-18T16:20:00Z",
            is_active: true,
        },
    },
];

function minutesAgo(minutes: number): string {
    return new Date(Date.now() - minutes * 60_000).toISOString();
}

function hoursAgo(hours: number): string {
    return new Date(Date.now() - hours * 3_600_000).toISOString();
}

export function buildInitialContexts(): DecisionContext[] {
    return [
        // Pending HOLD 1 - High value electronics
        {
            decision: {
                decision_id: "DEC-9801",
                transaction_id: "tx_9801",
                decision: "HOLD",
                reasons: [
                    "Restricted cargo category (ELECTRONICS_HIGH_VALUE) requires manual supervisor release",
                ],
                required_authority: "SUPERVISOR",
                context_evaluation: {
                    risk_factors: [
                        "CARGO_VALUATION_EXCEEDS_THRESHOLD",
                        "RESTRICTED_CATEGORY_ELECTRONICS",
                    ],
                    recommended_control: "HOLD",
                    rationale:
                        "Cargo declared at $185,000 under restricted classification. Carrier geofence and SIM telemetry verified. Mandatory supervisor review required before gate interlock release.",
                },
                evidence_summary: {
                    number_verified: true,
                    location_verified: true,
                    recent_sim_swap: false,
                    recent_device_swap: false,
                    reachable: true,
                },
                decided_at: minutesAgo(18),
                resolution: null,
            },
            transaction: {
                transaction_id: "tx_9801",
                actor_id: "CR-9012",
                action: "CARGO_RELEASE",
                resource_id: "CT-9401",
                zone: "PORT_GATE_17",
                timestamp: minutesAgo(19),
                value: "$185,000",
                category: "ELECTRONICS_HIGH_VALUE",
                metadata: {
                    manifest: "MNF-2026-8812",
                    seal_id: "SL-09412",
                    carrier: "Nordic Logistics",
                },
            },
            evidence: {
                number_verified: true,
                location_verified: true,
                recent_sim_swap: false,
                recent_device_swap: false,
                reachable: true,
                kyc_match: true,
                collected_at: minutesAgo(19),
            },
            evidence_plan: {
                mandatory: ["LOCATION_VERIFICATION", "DEVICE_INTEGRITY"],
                optional: ["CARRIER_ROAMING_CHECK"],
                combined: ["LOCATION_VERIFICATION", "DEVICE_INTEGRITY"],
                rationale: ["Standard high-value cargo verification bundle enforced"],
                planner_consulted: true,
                offered_optional: ["CARRIER_ROAMING_CHECK"],
                proposed_optional: [],
            },
            receipt: null,
        },

        // Pending HOLD 2 - Hazardous cargo class 3
        {
            decision: {
                decision_id: "DEC-9802",
                transaction_id: "tx_9802",
                decision: "HOLD",
                reasons: [
                    "Hazardous Class 3 chemical transfer requires HAZMAT controller authorization",
                ],
                required_authority: "HAZMAT_CONTROLLER",
                context_evaluation: {
                    risk_factors: [
                        "HAZARDOUS_CLASS_3",
                        "DOCK_SAFETY_PROTOCOL_ACTIVE",
                    ],
                    recommended_control: "HOLD",
                    rationale:
                        "Class 3 flammable liquid container awaiting dock safety and vapor barrier clearance by certified Hazmat supervisor.",
                },
                evidence_summary: {
                    number_verified: true,
                    location_verified: true,
                    recent_sim_swap: false,
                    recent_device_swap: false,
                    reachable: true,
                },
                decided_at: minutesAgo(42),
                resolution: null,
            },
            transaction: {
                transaction_id: "tx_9802",
                actor_id: "CR-8823",
                action: "CARGO_TRANSFER",
                resource_id: "TANK-404",
                zone: "CARGO_BAY_C",
                timestamp: minutesAgo(43),
                value: "$48,000",
                category: "HAZARDOUS_CLASS_3",
                metadata: {
                    un_number: "UN-1203",
                    hazard_class: "3",
                    inspector: "HAZ-CERT-4",
                },
            },
            evidence: {
                number_verified: true,
                location_verified: true,
                recent_sim_swap: false,
                recent_device_swap: false,
                reachable: true,
                kyc_match: true,
                collected_at: minutesAgo(43),
            },
            evidence_plan: {
                mandatory: ["LOCATION_VERIFICATION", "GEOFENCE_DWELL_TIME"],
                optional: [],
                combined: ["LOCATION_VERIFICATION", "GEOFENCE_DWELL_TIME"],
                rationale: ["Hazmat transfer standard policy rule"],
                planner_consulted: true,
                offered_optional: [],
                proposed_optional: [],
            },
            receipt: null,
        },

        // Pending HOLD 3 - Pharmaceuticals cold-chain
        {
            decision: {
                decision_id: "DEC-9803",
                transaction_id: "tx_9803",
                decision: "HOLD",
                reasons: [
                    "Pharmaceutical cold-chain shipment requires compliance signoff",
                ],
                required_authority: "COMPLIANCE_OFFICER",
                context_evaluation: {
                    risk_factors: [
                        "TEMPERATURE_SENSITIVE",
                        "CUSTOMS_CONTROLLED_SUBSTANCE",
                    ],
                    recommended_control: "HOLD",
                    rationale:
                        "Temperature logger audit in progress. Holding gate interlock until telematics confirms < -20°C integrity.",
                },
                evidence_summary: {
                    number_verified: true,
                    location_verified: true,
                    recent_sim_swap: false,
                    recent_device_swap: false,
                    reachable: true,
                },
                decided_at: minutesAgo(75),
                resolution: null,
            },
            transaction: {
                transaction_id: "tx_9803",
                actor_id: "CR-3341",
                action: "CARGO_RELEASE",
                resource_id: "COLD-119",
                zone: "AIRPORT_AIRSIDE_EAST",
                timestamp: minutesAgo(76),
                value: "$320,000",
                category: "PHARMACEUTICALS",
                metadata: {
                    temp_range: "-20C to -25C",
                    logger_sn: "LOG-9921",
                },
            },
            evidence: {
                number_verified: true,
                location_verified: true,
                recent_sim_swap: false,
                recent_device_swap: false,
                reachable: true,
                kyc_match: true,
                collected_at: minutesAgo(76),
            },
            evidence_plan: {
                mandatory: ["LOCATION_VERIFICATION", "KYC_VERIFICATION"],
                optional: [],
                combined: ["LOCATION_VERIFICATION", "KYC_VERIFICATION"],
                rationale: ["Pharma protocol compliance rule"],
                planner_consulted: true,
                offered_optional: [],
                proposed_optional: [],
            },
            receipt: null,
        },

        // Resolved HOLD (Approved with note)
        {
            decision: {
                decision_id: "DEC-9790",
                transaction_id: "tx_9790",
                decision: "HOLD",
                reasons: [
                    "High-value shipment held for manifest verification",
                ],
                required_authority: "SUPERVISOR",
                context_evaluation: {
                    risk_factors: ["CARGO_VALUATION_EXCEEDS_THRESHOLD"],
                    recommended_control: "HOLD",
                    rationale: "High-value cargo escalated for physical seal verification.",
                },
                evidence_summary: {
                    number_verified: true,
                    location_verified: true,
                    recent_sim_swap: false,
                    recent_device_swap: false,
                    reachable: true,
                },
                decided_at: hoursAgo(2.5),
                resolution: {
                    outcome: "APPROVE",
                    resolved_by: "OP-7821",
                    authority_role: "SUPERVISOR",
                    note: "Container seal integrity inspected and matched bill of lading.",
                    resolved_at: hoursAgo(2.3),
                },
            },
            transaction: {
                transaction_id: "tx_9790",
                actor_id: "CR-9012",
                action: "CARGO_RELEASE",
                resource_id: "CT-8820",
                zone: "PORT_GATE_17",
                timestamp: hoursAgo(2.6),
                value: "$140,000",
                category: "ELECTRONICS_HIGH_VALUE",
                metadata: { seal_checked: "true" },
            },
            evidence: {
                number_verified: true,
                location_verified: true,
                recent_sim_swap: false,
                recent_device_swap: false,
                reachable: true,
                kyc_match: true,
                collected_at: hoursAgo(2.6),
            },
            evidence_plan: null,
            receipt: {
                receipt_id: "RCPT-9790",
                decision_id: "DEC-9790",
                transaction_id: "tx_9790",
                decision: "APPROVE",
                issued_at: hoursAgo(2.3),
                token: "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.demo-token-9790",
            },
        },

        // Approved clean decision 1
        {
            decision: {
                decision_id: "DEC-9788",
                transaction_id: "tx_9788",
                decision: "APPROVE",
                reasons: ["All identity, carrier telematics, and zone geofences verified"],
                required_authority: null,
                context_evaluation: {
                    risk_factors: [],
                    recommended_control: "APPROVE",
                    rationale: "Clean telemetry: carrier location in geofence, device registered, no SIM swap.",
                },
                evidence_summary: {
                    number_verified: true,
                    location_verified: true,
                    recent_sim_swap: false,
                    recent_device_swap: false,
                    reachable: true,
                },
                decided_at: hoursAgo(1),
                resolution: null,
            },
            transaction: {
                transaction_id: "tx_9788",
                actor_id: "CR-3341",
                action: "ZONE_ACCESS",
                resource_id: "PAL-4412",
                zone: "TERMINAL_NORTH",
                timestamp: hoursAgo(1.1),
                value: "$22,500",
                category: "GENERAL_FREIGHT",
                metadata: { carrier_name: "Swift Transport" },
            },
            evidence: {
                number_verified: true,
                location_verified: true,
                recent_sim_swap: false,
                recent_device_swap: false,
                reachable: true,
                kyc_match: true,
                collected_at: hoursAgo(1.1),
            },
            evidence_plan: null,
            receipt: {
                receipt_id: "RCPT-9788",
                decision_id: "DEC-9788",
                transaction_id: "tx_9788",
                decision: "APPROVE",
                issued_at: hoursAgo(1),
                token: "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.demo-token-9788",
            },
        },

        // Approved clean decision 2
        {
            decision: {
                decision_id: "DEC-9785",
                transaction_id: "tx_9785",
                decision: "APPROVE",
                reasons: ["All carrier checks passed"],
                required_authority: null,
                context_evaluation: {
                    risk_factors: [],
                    recommended_control: "APPROVE",
                    rationale: "Standard perishable food release verified within policy window.",
                },
                evidence_summary: {
                    number_verified: true,
                    location_verified: true,
                    recent_sim_swap: false,
                    recent_device_swap: false,
                    reachable: true,
                },
                decided_at: hoursAgo(3),
                resolution: null,
            },
            transaction: {
                transaction_id: "tx_9785",
                actor_id: "CR-9012",
                action: "CARGO_RELEASE",
                resource_id: "CT-100",
                zone: "PORT_GATE_17",
                timestamp: hoursAgo(3.1),
                value: "$35,000",
                category: "PERISHABLE_FOOD",
                metadata: { reefer_temp: "4C" },
            },
            evidence: {
                number_verified: true,
                location_verified: true,
                recent_sim_swap: false,
                recent_device_swap: false,
                reachable: true,
                kyc_match: true,
                collected_at: hoursAgo(3.1),
            },
            evidence_plan: null,
            receipt: {
                receipt_id: "RCPT-9785",
                decision_id: "DEC-9785",
                transaction_id: "tx_9785",
                decision: "APPROVE",
                issued_at: hoursAgo(3),
                token: "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.demo-token-9785",
            },
        },

        // Denied decision 1 - SIM swap detected
        {
            decision: {
                decision_id: "DEC-9780",
                transaction_id: "tx_9780",
                decision: "DENY",
                reasons: [
                    "SIM card swap detected on registered MSISDN within the past 24 hours",
                    "Device binding trust level revoked by carrier telematics",
                ],
                required_authority: null,
                context_evaluation: {
                    risk_factors: [
                        "CRITICAL_SIM_SWAP_DETECTED",
                        "CARRIER_DEVICE_RISK_FLAG",
                    ],
                    recommended_control: "DENY",
                    rationale:
                        "Carrier network reported IMSI change 4 hours ago. Automatic hard denial triggered to prevent account takeover and illicit cargo handover.",
                },
                evidence_summary: {
                    number_verified: true,
                    location_verified: true,
                    recent_sim_swap: true,
                    recent_device_swap: false,
                    reachable: true,
                },
                decided_at: hoursAgo(4),
                resolution: null,
            },
            transaction: {
                transaction_id: "tx_9780",
                actor_id: "CR-8823",
                action: "CARGO_RELEASE",
                resource_id: "CT-7719",
                zone: "INTERMODAL_YARD",
                timestamp: hoursAgo(4.1),
                value: "$89,000",
                category: "GENERAL_FREIGHT",
                metadata: { alert: "SIM_CHANGE_EVENT" },
            },
            evidence: {
                number_verified: true,
                location_verified: true,
                recent_sim_swap: true,
                recent_device_swap: false,
                reachable: true,
                kyc_match: true,
                collected_at: hoursAgo(4.1),
            },
            evidence_plan: null,
            receipt: null,
        },

        // Denied decision 2 - Location outside geofence
        {
            decision: {
                decision_id: "DEC-9775",
                transaction_id: "tx_9775",
                decision: "DENY",
                reasons: [
                    "Carrier verified location placed device 1.8km outside authorized geofence radius",
                ],
                required_authority: null,
                context_evaluation: {
                    risk_factors: ["GEOFENCE_BOUNDARY_BREACH"],
                    recommended_control: "DENY",
                    rationale:
                        "Device cell-tower trilateration confirms actor is not physically present at CARGO_BAY_C. Authorization rejected.",
                },
                evidence_summary: {
                    number_verified: true,
                    location_verified: false,
                    recent_sim_swap: false,
                    recent_device_swap: false,
                    reachable: true,
                },
                decided_at: hoursAgo(6),
                resolution: null,
            },
            transaction: {
                transaction_id: "tx_9775",
                actor_id: "CR-9012",
                action: "ZONE_ACCESS",
                resource_id: "BAY-DOOR-02",
                zone: "CARGO_BAY_C",
                timestamp: hoursAgo(6.1),
                value: "$0",
                category: "GENERAL_FREIGHT",
                metadata: { requested_gate: "CARGO_BAY_C" },
            },
            evidence: {
                number_verified: true,
                location_verified: false,
                recent_sim_swap: false,
                recent_device_swap: false,
                reachable: true,
                kyc_match: true,
                collected_at: hoursAgo(6.1),
            },
            evidence_plan: null,
            receipt: null,
        },

        // Approved clean decision 3
        {
            decision: {
                decision_id: "DEC-9770",
                transaction_id: "tx_9770",
                decision: "APPROVE",
                reasons: ["Telemetry and credentials verified"],
                required_authority: null,
                context_evaluation: {
                    risk_factors: [],
                    recommended_control: "APPROVE",
                    rationale: "Routine container intake authorization confirmed.",
                },
                evidence_summary: {
                    number_verified: true,
                    location_verified: true,
                    recent_sim_swap: false,
                    recent_device_swap: false,
                    reachable: true,
                },
                decided_at: hoursAgo(8),
                resolution: null,
            },
            transaction: {
                transaction_id: "tx_9770",
                actor_id: "CR-3341",
                action: "CARGO_RELEASE",
                resource_id: "CT-204",
                zone: "TERMINAL_NORTH",
                timestamp: hoursAgo(8.1),
                value: "$64,000",
                category: "GENERAL_FREIGHT",
                metadata: { manifest: "MNF-2026-8740" },
            },
            evidence: {
                number_verified: true,
                location_verified: true,
                recent_sim_swap: false,
                recent_device_swap: false,
                reachable: true,
                kyc_match: true,
                collected_at: hoursAgo(8.1),
            },
            evidence_plan: null,
            receipt: {
                receipt_id: "RCPT-9770",
                decision_id: "DEC-9770",
                transaction_id: "tx_9770",
                decision: "APPROVE",
                issued_at: hoursAgo(8),
                token: "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.demo-token-9770",
            },
        },
    ];
}

export type DemoState = {
    currentActor: Actor | null;
    roster: RosterEntry[];
    policyConfig: PolicyConfig;
    categories: CategoryOption[];
    zones: GeofenceZone[];
    contexts: DecisionContext[];
};

function createFreshDemoState(): DemoState {
    return {
        currentActor: DEFAULT_DEMO_OPERATOR,
        roster: [...INITIAL_ROSTER],
        policyConfig: { ...INITIAL_POLICY_CONFIG },
        categories: [...INITIAL_CATEGORIES],
        zones: [...INITIAL_ZONES],
        contexts: buildInitialContexts(),
    };
}

let inMemoryState: DemoState | null = null;

export function getDemoState(): DemoState {
    if (typeof window === "undefined") {
        if (!inMemoryState) inMemoryState = createFreshDemoState();
        return inMemoryState;
    }

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.contexts) && parsed.policyConfig) {
                return parsed;
            }
        }
    } catch {
        // LocalStorage unavailable or parse error, fall through to fresh
    }

    const fresh = createFreshDemoState();
    saveDemoState(fresh);
    return fresh;
}

export function saveDemoState(state: DemoState) {
    inMemoryState = state;
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // quota exceeded or storage blocked
    }
}

export function resetDemoState(): DemoState {
    const fresh = createFreshDemoState();
    saveDemoState(fresh);
    return fresh;
}

// ---------------------------------------------------------------------------
// Mock Handlers for API calls
// ---------------------------------------------------------------------------

export async function mockGetHealth(): Promise<HealthReport> {
    return {
        status: "healthy",
        dependencies: {
            authorization_engine: "healthy [client-demo]",
            carrier_gateway: "healthy [simulated]",
            database: "healthy [in-memory]",
        },
    };
}

export async function mockGetSession(): Promise<SessionResponse> {
    const state = getDemoState();
    if (!state.currentActor) {
        throw new ApiError("401 Unauthorized (nobody is signed in)", 401);
    }
    return { actor: state.currentActor };
}

export async function mockLogin(actorId: string): Promise<SessionResponse> {
    const state = getDemoState();
    const entry = state.roster.find(
        (r) => r.actor.actor_id.toLowerCase() === actorId.trim().toLowerCase()
    );

    const actor = entry ? entry.actor : {
        ...DEFAULT_DEMO_OPERATOR,
        actor_id: actorId.trim() || DEFAULT_DEMO_OPERATOR.actor_id,
    };

    state.currentActor = actor;
    saveDemoState(state);
    return { actor };
}

export async function mockLogout(): Promise<void> {
    const state = getDemoState();
    state.currentActor = null;
    saveDemoState(state);
}

export async function mockChangePassword(): Promise<void> {
    return;
}

export async function mockListDecisionContexts(params: {
    decision?: DecisionOutcome;
    pending?: boolean;
    limit?: number;
} = {}): Promise<DecisionContext[]> {
    const state = getDemoState();
    let list = [...state.contexts];

    if (params.decision) {
        list = list.filter((c) => c.decision.decision === params.decision);
    }

    if (params.pending) {
        list = list.filter(
            (c) => c.decision.decision === "HOLD" && c.decision.resolution === null
        );
    }

    if (params.limit && params.limit > 0) {
        list = list.slice(0, params.limit);
    }

    return list;
}

export async function mockListDecisions(params: {
    decision?: DecisionOutcome;
    pending?: boolean;
    limit?: number;
} = {}): Promise<PolicyDecision[]> {
    const contexts = await mockListDecisionContexts(params);
    return contexts.map((c) => c.decision);
}

export async function mockGetDecisionContext(
    decisionId: string
): Promise<DecisionContext> {
    const state = getDemoState();
    const found = state.contexts.find(
        (c) => c.decision.decision_id === decisionId
    );
    if (!found) {
        throw new ApiError(`Decision context ${decisionId} not found`, 404);
    }
    return found;
}

export async function mockResolveHold(
    decisionId: string,
    body: { outcome: "APPROVE" | "DENY"; resolved_by: string; note?: string }
): Promise<{ decision: PolicyDecision; receipt: Receipt }> {
    const state = getDemoState();
    const index = state.contexts.findIndex(
        (c) => c.decision.decision_id === decisionId
    );

    if (index === -1) {
        throw new Error(`Decision ${decisionId} not found`);
    }

    const context = state.contexts[index];
    const resolvedAt = new Date().toISOString();

    const resolution = {
        outcome: body.outcome,
        resolved_by: body.resolved_by || state.currentActor?.actor_id || "OP-7821",
        authority_role: state.currentActor?.role || "SUPERVISOR",
        note: body.note || "Resolved in interactive demo console",
        resolved_at: resolvedAt,
    };

    const updatedDecision: PolicyDecision = {
        ...context.decision,
        resolution,
    };

    const receipt: Receipt = {
        receipt_id: `RCPT-RESOLVE-${Date.now().toString().slice(-6)}`,
        decision_id: decisionId,
        transaction_id: context.decision.transaction_id,
        decision: body.outcome,
        issued_at: resolvedAt,
        token:
            body.outcome === "APPROVE"
                ? `demo-token-${decisionId}-${Date.now()}`
                : null,
    };

    const updatedContext: DecisionContext = {
        ...context,
        decision: updatedDecision,
        receipt: body.outcome === "APPROVE" ? receipt : context.receipt,
    };

    state.contexts[index] = updatedContext;
    saveDemoState(state);

    return { decision: updatedDecision, receipt };
}

export async function mockListActors(limit = 200): Promise<RosterEntry[]> {
    const state = getDemoState();
    return state.roster.slice(0, limit);
}

export async function mockEnrollActor(
    actor: Actor,
    options?: { deviceId?: string; password?: string }
): Promise<{ actor: Actor; binding: import("./api").DeviceBinding }> {
    const state = getDemoState();
    const binding = {
        actor_id: actor.actor_id,
        phone_number: actor.registered_phone_number,
        device_id: options?.deviceId || actor.registered_device_id,
        bound_at: new Date().toISOString(),
        is_active: true,
    };

    const entry: RosterEntry = {
        actor: {
            ...actor,
            enrollment_status: "ACTIVE",
        },
        binding,
    };

    state.roster = [entry, ...state.roster.filter((r) => r.actor.actor_id !== actor.actor_id)];
    saveDemoState(state);

    return { actor: entry.actor, binding };
}

export async function mockUpdateActorPermissions(
    actorId: string,
    permissions: string[]
): Promise<Actor> {
    const state = getDemoState();
    const entry = state.roster.find((r) => r.actor.actor_id === actorId);

    if (!entry) {
        throw new Error(`Actor ${actorId} not found`);
    }

    entry.actor.permissions = permissions;
    saveDemoState(state);
    return entry.actor;
}

export async function mockListCategories(): Promise<CategoryOption[]> {
    const state = getDemoState();
    return state.categories;
}

export async function mockListZones(): Promise<GeofenceZone[]> {
    const state = getDemoState();
    return state.zones;
}

export async function mockGetPolicyConfig(): Promise<PolicyConfig> {
    const state = getDemoState();
    return state.policyConfig;
}

export async function mockUpdatePolicyConfig(
    config: PolicyConfig
): Promise<PolicyConfig> {
    const state = getDemoState();
    state.policyConfig = config;
    saveDemoState(state);
    return state.policyConfig;
}
