import { describe, expect, it } from "vitest";

import { holdsAuthority, normalizeRole } from "./roles";

describe("normalizeRole", () => {
    it("ignores the ROLE_ prefix, case and padding", () => {
        expect(normalizeRole("ROLE_SECURITY_OFFICER")).toBe("SECURITY_OFFICER");
        expect(normalizeRole(" role_cargo_supervisor ")).toBe("CARGO_SUPERVISOR");
        expect(normalizeRole(null)).toBe("");
    });
});

describe("holdsAuthority", () => {
    it("lets only the named role settle a hold", () => {
        expect(holdsAuthority("ROLE_SECURITY_OFFICER", "ROLE_SECURITY_OFFICER")).toBe(true);
        expect(holdsAuthority("SECURITY_OFFICER", "ROLE_SECURITY_OFFICER")).toBe(true);
        expect(holdsAuthority("ROLE_CARGO_SUPERVISOR", "ROLE_SECURITY_OFFICER")).toBe(false);
    });

    it("gives a hold that names nobody to nobody", () => {
        expect(holdsAuthority("ROLE_CARGO_SUPERVISOR", null)).toBe(false);
    });
});
