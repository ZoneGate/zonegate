/**
 * Tests for the console's API client.
 *
 * The client is where a backend problem becomes something the operator sees.
 * What matters most here is the failure path: an unreachable backend has to
 * surface as an unreachable backend, never as an empty queue.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    ApiError,
    API_URL,
    changePassword,
    enrollActor,
    getHealth,
    getPolicyConfig,
    getSession,
    listActors,
    listCategories,
    listDecisionContexts,
    listDecisions,
    listZones,
    login,
    logout,
    resolveHold,
    updateActorPermissions,
    updatePolicyConfig,
    type Actor,
} from "./api";

/** Captures what the client asked for, and answers with a canned response. */
function mockFetch(
    responder: (url: string, init?: RequestInit) => {
        status?: number;
        body?: unknown;
        reject?: boolean;
    }
) {
    const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const result = responder(url, init);

        if (result.reject) throw new TypeError("Failed to fetch");

        const status = result.status ?? 200;
        const text = result.body === undefined ? "" : JSON.stringify(result.body);

        return {
            ok: status < 400,
            status,
            statusText: `status ${status}`,
            json: async () => JSON.parse(text),
            text: async () => text,
        } as unknown as Response;
    });

    vi.stubGlobal("fetch", spy);
    return spy;
}

beforeEach(() => {
    vi.unstubAllGlobals();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("request failure handling", () => {
    it("turns an unreachable backend into a named, actionable error", () => {
        mockFetch(() => ({ reject: true }));

        return getHealth().then(
            () => expect.unreachable("should have thrown"),
            (error) => {
                expect(error).toBeInstanceOf(ApiError);
                expect(error.status).toBe(0);
                expect(error.message).toContain(API_URL);
                expect(error.message).toContain("Is the backend running?");
            }
        );
    });

    it("surfaces the backend's own detail message on a 4xx", () => {
        mockFetch(() => ({
            status: 404,
            body: { detail: "Authorization decision 'dec_x' not found" },
        }));

        return listDecisions().then(
            () => expect.unreachable("should have thrown"),
            (error) => {
                expect(error).toBeInstanceOf(ApiError);
                expect(error.status).toBe(404);
                expect(error.message).toBe(
                    "Authorization decision 'dec_x' not found"
                );
            }
        );
    });

    it("falls back to the status line when the error body is not JSON", () => {
        const spy = vi.fn(async () => ({
            ok: false,
            status: 502,
            statusText: "Bad Gateway",
            json: async () => {
                throw new SyntaxError("not json");
            },
            text: async () => "<html>502</html>",
        }) as unknown as Response);

        vi.stubGlobal("fetch", spy);

        return listDecisions().then(
            () => expect.unreachable("should have thrown"),
            (error) => {
                expect(error.status).toBe(502);
                expect(error.message).toContain("502");
            }
        );
    });

    it("preserves a 409 so a conflict can be told apart from a bad request", () => {
        mockFetch(() => ({ status: 409, body: { detail: "already resolved" } }));

        return resolveHold("dec_1", {
            outcome: "APPROVE",
            resolved_by: "usr_supervisor",
        }).then(
            () => expect.unreachable("should have thrown"),
            (error) => expect(error.status).toBe(409)
        );
    });
});

describe("decision listing", () => {
    it("sends no filters when none were asked for", () => {
        const spy = mockFetch(() => ({ body: [] }));

        return listDecisions().then(() => {
            expect(String(spy.mock.calls[0][0])).toBe(`${API_URL}/v1/authorizations`);
        });
    });

    it("passes the outcome, pending flag and limit through", () => {
        const spy = mockFetch(() => ({ body: [] }));

        return listDecisions({ decision: "HOLD", pending: true, limit: 50 }).then(
            () => {
                const url = String(spy.mock.calls[0][0]);
                expect(url).toContain("decision=HOLD");
                expect(url).toContain("pending=true");
                expect(url).toContain("limit=50");
            }
        );
    });

    it("omits the pending flag when it is false", () => {
        const spy = mockFetch(() => ({ body: [] }));

        return listDecisions({ pending: false }).then(() => {
            expect(String(spy.mock.calls[0][0])).not.toContain("pending");
        });
    });

    it("reads the bulk contexts endpoint, not the plain listing", () => {
        const spy = mockFetch(() => ({ body: [] }));

        return listDecisionContexts({ limit: 25 }).then(() => {
            const url = String(spy.mock.calls[0][0]);
            expect(url).toContain("/v1/authorizations/contexts");
            expect(url).toContain("limit=25");
        });
    });
});

describe("roster", () => {
    it("requests the roster with an explicit limit", () => {
        const spy = mockFetch(() => ({ body: [] }));

        return listActors(10).then(() => {
            expect(String(spy.mock.calls[0][0])).toBe(`${API_URL}/v1/actors?limit=10`);
        });
    });

    it("returns each actor with its binding", () => {
        mockFetch(() => ({
            body: [
                {
                    actor: {
                        actor_id: "usr_1",
                        role: "ROLE_CARGO_OPERATOR",
                        permissions: ["cargo:release"],
                        registered_phone_number: "+14155550199",
                        registered_device_id: "dev_1",
                        enrollment_status: "ACTIVE",
                    },
                    binding: null,
                },
            ],
        }));

        return listActors().then((roster) => {
            expect(roster).toHaveLength(1);
            expect(roster[0].actor.actor_id).toBe("usr_1");
            expect(roster[0].binding).toBeNull();
        });
    });
});

describe("policy configuration", () => {
    it("reads the live configuration", () => {
        mockFetch(() => ({
            body: {
                restricted_categories: { WEAPONS: "ROLE_SECURITY_OFFICER" },
            },
        }));

        return getPolicyConfig().then((config) => {
            expect(config.restricted_categories.WEAPONS).toBe("ROLE_SECURITY_OFFICER");
            expect(config).not.toHaveProperty("window_start_hour");
        });
    });

    it("writes with PUT, which the backend must allow through CORS", () => {
        const spy = mockFetch(() => ({ body: {} }));

        return updatePolicyConfig({
            restricted_categories: { HAZARDOUS: "ROLE_SAFETY_OFFICER" },
        }).then(() => {
            const [url, init] = spy.mock.calls[0];

            expect(String(url)).toBe(`${API_URL}/v1/policy/config`);
            expect(init?.method).toBe("PUT");
        });
    });

    it("reports a rejected configuration rather than swallowing it", () => {
        mockFetch(() => ({
            status: 400,
            body: { detail: "Category 'WEAPONS' is restricted but names no approving authority" },
        }));

        return updatePolicyConfig({
            restricted_categories: { WEAPONS: "" },
        }).then(
            () => expect.unreachable("should have thrown"),
            (error) => {
                expect(error.status).toBe(400);
                expect(error.message).toContain("WEAPONS");
            }
        );
    });
});

describe("console sign-in", () => {
    it("posts the credentials to the auth endpoint", () => {
        const spy = mockFetch(() => ({ body: { actor: {} } }));

        return login(" usr_console_01 ".trim(), "correct-horse").then(() => {
            const [url, init] = spy.mock.calls[0];

            expect(String(url)).toBe(`${API_URL}/v1/auth/login`);
            expect(init?.method).toBe("POST");
            expect(JSON.parse(String(init?.body))).toEqual({
                actor_id: "usr_console_01",
                password: "correct-horse",
            });
        });
    });

    it("sends the session cookie on every call, not only on sign-in", () => {
        // The session lives in an httpOnly cookie, so a request made without
        // credentials would read as signed-out no matter who is signed in.
        const spy = mockFetch(() => ({ body: { actor: {} } }));

        return getSession().then(() => {
            expect(spy.mock.calls[0][1]?.credentials).toBe("include");
        });
    });

    it("surfaces a 401 as a 401 so the gate can tell it from a dead backend", () => {
        mockFetch(() => ({ status: 401, body: { detail: "No console session" } }));

        return getSession().then(
            () => expect.unreachable("should have thrown"),
            (error) => {
                expect(error).toBeInstanceOf(ApiError);
                expect(error.status).toBe(401);
            }
        );
    });

    it("treats the 204 from sign-out as success, not a parse failure", () => {
        mockFetch(() => ({ status: 204 }));

        return logout().then((body) => expect(body).toBeUndefined());
    });

    it("never puts the new password in the URL", () => {
        const spy = mockFetch(() => ({ status: 204 }));

        return changePassword("a-brand-new-one").then(() => {
            const [url, init] = spy.mock.calls[0];

            expect(String(url)).toBe(`${API_URL}/v1/auth/password`);
            expect(String(url)).not.toContain("a-brand-new-one");
            expect(JSON.parse(String(init?.body)).password).toBe("a-brand-new-one");
        });
    });
});

describe("employee enrolment", () => {
    const actor: Actor = {
        actor_id: "usr_new_01",
        role: "ROLE_CARGO_OPERATOR",
        permissions: ["cargo:release"],
        registered_phone_number: "+14155550199",
        registered_device_id: "dev_imei_99887766",
        enrollment_status: "ACTIVE",
    };

    it("omits the optional fields entirely when they were not given", () => {
        const spy = mockFetch(() => ({ status: 201, body: {} }));

        return enrollActor(actor).then(() => {
            const body = JSON.parse(String(spy.mock.calls[0][1]?.body));

            expect(body.actor.actor_id).toBe("usr_new_01");
            expect("password" in body).toBe(false);
            expect("device_id" in body).toBe(false);
        });
    });

    it("passes a console password through when one was set", () => {
        const spy = mockFetch(() => ({ status: 201, body: {} }));

        return enrollActor(actor, { password: "let-me-in-please" }).then(() => {
            const body = JSON.parse(String(spy.mock.calls[0][1]?.body));

            expect(body.password).toBe("let-me-in-please");
        });
    });

    it("sends the permissions the editor was showing, so a stale save is refused", () => {
        const spy = mockFetch(() => ({ body: {} }));

        return updateActorPermissions(
            "usr new/01",
            ["cargo:release"],
            ["cargo:release", "cargo:inspect"]
        ).then(() => {
            const [url, init] = spy.mock.calls[0];

            // An id with a slash must not be able to walk the path.
            expect(String(url)).toBe(
                `${API_URL}/v1/actors/usr%20new%2F01/permissions`
            );
            expect(init?.method).toBe("PUT");
            expect(JSON.parse(String(init?.body)).expected_permissions).toEqual([
                "cargo:release",
                "cargo:inspect",
            ]);
        });
    });

    it("preserves the 409 that means somebody else edited first", () => {
        mockFetch(() => ({
            status: 409,
            body: { detail: "Permissions for 'usr_new_01' changed while you were editing." },
        }));

        return updateActorPermissions("usr_new_01", [], []).then(
            () => expect.unreachable("should have thrown"),
            (error) => {
                expect(error.status).toBe(409);
                expect(error.message).toContain("changed while you were editing");
            }
        );
    });
});

describe("categories and geofences", () => {
    it("reads the category vocabulary with its authorities", () => {
        const spy = mockFetch(() => ({
            body: [
                { category: "GENERAL", restricted: false, required_authority: null },
                {
                    category: "WEAPONS",
                    restricted: true,
                    required_authority: "ROLE_SECURITY_OFFICER",
                },
            ],
        }));

        return listCategories().then((options) => {
            expect(String(spy.mock.calls[0][0])).toBe(`${API_URL}/v1/policy/categories`);
            expect(options[1].required_authority).toBe("ROLE_SECURITY_OFFICER");
            expect(options[0].restricted).toBe(false);
        });
    });

    it("reads the geofences the gateway actually checks against", () => {
        const spy = mockFetch(() => ({
            body: [
                {
                    zone: "ZONE_CARGO_BAY_1",
                    latitude: 37.7749,
                    longitude: -122.4194,
                    radius_meters: 500,
                },
            ],
        }));

        return listZones().then((zones) => {
            expect(String(spy.mock.calls[0][0])).toBe(`${API_URL}/v1/policy/zones`);
            expect(zones[0].radius_meters).toBe(500);
        });
    });
});

describe("empty responses", () => {
    it("treats a 204 as no content rather than failing to parse it", () => {
        mockFetch(() => ({ status: 204 }));

        return getHealth().then((body) => expect(body).toBeUndefined());
    });
});
