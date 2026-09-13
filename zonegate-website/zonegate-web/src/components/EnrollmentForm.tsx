"use client";

/**
 * Enrolls a new employee.
 *
 * One submission writes both halves of an identity: the actor record and the
 * device binding the Evidence Gateway checks against. Only fields ZoneGate
 * actually stores are asked for — no badge photos, no clearance tiers — so
 * every value on the roster afterwards traces back to something entered here.
 */

import { useEffect, useState } from "react";
import { ArrowLeft, Search, UserPlus } from "lucide-react";
import { ApiError, enrollActor, type Actor, type EnrollmentResponse } from "@/lib/api";

/** E.164: a leading +, then 8-15 digits, the first of which is not a zero. */
const E164 = /^\+[1-9]\d{7,14}$/;

const STATUSES = ["ACTIVE", "SUSPENDED", "PENDING"] as const;

export default function EnrollmentForm({ knownRoles, availablePermissions, existingActorIds, onBack, onEnrolled }: {
    knownRoles: string[];
    availablePermissions: string[];
    existingActorIds: string[];
    onBack: () => void;
    onEnrolled: (result: EnrollmentResponse) => void;
}) {
    const [actorId, setActorId] = useState("");
    const [role, setRole] = useState("");
    const [phone, setPhone] = useState("");
    const [deviceId, setDeviceId] = useState("");
    const [bindDeviceId, setBindDeviceId] = useState("");
    const [status, setStatus] = useState<string>("ACTIVE");
    const [password, setPassword] = useState("");
    const [selected, setSelected] = useState<string[]>([]);
    const [search, setSearch] = useState("");
    const [custom, setCustom] = useState("");

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [discardPrompt, setDiscardPrompt] = useState(false);

    const permissions = [...new Set([...availablePermissions, ...selected])].sort();
    const visible = permissions.filter((permission) => permission.toLowerCase().includes(search.trim().toLowerCase()));

    const trimmedId = actorId.trim();
    const duplicate = existingActorIds.includes(trimmedId);
    const dirty = Boolean(trimmedId || role.trim() || phone.trim() || deviceId.trim() || bindDeviceId.trim() || password || selected.length);

    const fieldErrors = {
        actorId: !trimmedId
            ? "An identifier is required."
            : duplicate
                ? "This identifier is already enrolled. Edit that employee instead."
                : "",
        role: role.trim() ? "" : "A role is required.",
        phone: !phone.trim()
            ? "A registered phone number is required."
            : E164.test(phone.trim())
                ? ""
                : "Use E.164 format, e.g. +14155550199.",
        deviceId: deviceId.trim() ? "" : "A registered device is required.",
        password: !password
            ? "A console password is required to sign in."
            : password.length < 10
                ? "Use at least 10 characters."
                : password.trim() !== password
                    ? "Must not start or end with a space."
                    : "",
    };

    const invalid = Object.values(fieldErrors).some(Boolean);

    // Enrollment is a write; leaving mid-form should not lose it silently.
    useEffect(() => {
        if (!dirty) return;
        const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); };
        window.addEventListener("beforeunload", guard);
        return () => window.removeEventListener("beforeunload", guard);
    }, [dirty]);

    function toggle(permission: string) {
        setSelected((current) => current.includes(permission)
            ? current.filter((value) => value !== permission)
            : [...current, permission]);
    }

    async function submit() {
        if (saving || invalid) return;
        setSaving(true);
        setError(null);

        const actor: Actor = {
            actor_id: trimmedId,
            role: role.trim(),
            permissions: selected,
            registered_phone_number: phone.trim(),
            registered_device_id: deviceId.trim(),
            enrollment_status: status,
        };

        try {
            const result = await enrollActor(actor, {
                deviceId: bindDeviceId.trim() || undefined,
                password,
            });
            onEnrolled(result);
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "The employee could not be enrolled. Please try again.");
            setSaving(false);
        }
    }

    return (
        <div className="flex w-full flex-col gap-6">
            <header className="border-b border-[#E2E8F0] pb-5">
                <button type="button" disabled={saving} onClick={() => dirty ? setDiscardPrompt(true) : onBack()} className="mb-4 inline-flex items-center gap-2 rounded text-sm font-medium text-[#0F766E] focus-visible:outline-2 focus-visible:outline-[#0D9488] disabled:opacity-50">
                    <ArrowLeft size={16} /> Back to roster
                </button>
                <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A]">Enroll an employee</h1>
                <p className="mt-2 text-base text-[#64748B]">
                    Registers the identity and binds the device it will be recognised by. Both are
                    required before any authorization request from this employee can be approved.
                </p>
            </header>

            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

            {discardPrompt && <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p>This employee has not been enrolled yet.</p>
                <div className="flex gap-3">
                    <button type="button" onClick={() => setDiscardPrompt(false)} className="rounded border border-amber-300 px-3 py-2 font-medium">Keep editing</button>
                    <button type="button" onClick={onBack} className="rounded px-3 py-2 font-medium underline">Discard and go back</button>
                </div>
            </div>}

            <form
                onSubmit={(event) => { event.preventDefault(); submit(); }}
                className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"
            >
                <div className="flex flex-col gap-6">
                    <section className="rounded-xl border border-[#E2E8F0] bg-white p-5">
                        <h2 className="text-lg font-semibold text-[#0F172A]">Identity</h2>
                        <p className="mt-1 text-sm text-[#64748B]">How this employee is referenced in every decision and receipt.</p>

                        <fieldset disabled={saving} className="mt-5 grid gap-5 sm:grid-cols-2 disabled:opacity-60">
                            <legend className="sr-only">Employee identity</legend>

                            <Field
                                id="actor-id"
                                label="Employee ID"
                                hint="Unique and permanent, e.g. usr_k_vance."
                                error={fieldErrors.actorId}
                                value={actorId}
                                onChange={setActorId}
                                placeholder="usr_k_vance"
                                mono
                            />

                            <Field
                                id="actor-role"
                                label="Role"
                                hint="Used by the policy engine when an action needs authority."
                                error={fieldErrors.role}
                                value={role}
                                onChange={setRole}
                                placeholder="gate_officer"
                                list="known-roles"
                                mono
                            />

                            <datalist id="known-roles">
                                {knownRoles.map((value) => <option key={value} value={value} />)}
                            </datalist>

                            <label className="flex flex-col gap-2">
                                <span className="text-sm font-medium text-[#475569]">Enrollment status</span>
                                <select
                                    value={status}
                                    onChange={(event) => setStatus(event.target.value)}
                                    className="rounded-lg border border-[#CBD5E1] px-3 py-2.5 font-mono text-sm text-[#0F172A] outline-none focus:border-[#0D9488]"
                                >
                                    {STATUSES.map((value) => <option key={value}>{value}</option>)}
                                </select>
                                <span className="text-sm text-[#64748B]">Only ACTIVE identities pass authorization.</span>
                            </label>

                            <Field
                                id="actor-password"
                                label="Console password"
                                hint="At least 10 characters. Give it to the employee to change after their first sign-in."
                                error={fieldErrors.password}
                                value={password}
                                onChange={setPassword}
                                placeholder=""
                                type="password"
                            />

                        </fieldset>
                    </section>

                    <section className="rounded-xl border border-[#E2E8F0] bg-white p-5">
                        <h2 className="text-lg font-semibold text-[#0F172A]">Network identity &amp; device</h2>
                        <p className="mt-1 text-sm text-[#64748B]">What the carrier checks against when evidence is collected.</p>

                        <fieldset disabled={saving} className="mt-5 grid gap-5 sm:grid-cols-2 disabled:opacity-60">
                            <legend className="sr-only">Registered network identity</legend>

                            <Field
                                id="actor-phone"
                                label="Registered phone number"
                                hint="E.164, including the country code."
                                error={fieldErrors.phone}
                                value={phone}
                                onChange={setPhone}
                                placeholder="+14155550199"
                                mono
                            />

                            <Field
                                id="actor-device"
                                label="Registered device"
                                hint="IMEI or device fingerprint."
                                error={fieldErrors.deviceId}
                                value={deviceId}
                                onChange={setDeviceId}
                                placeholder="dev_imei_99887766"
                                mono
                            />

                            <Field
                                id="bind-device"
                                label="Bind a different device (optional)"
                                hint="Leave empty to bind the registered device above."
                                error=""
                                value={bindDeviceId}
                                onChange={setBindDeviceId}
                                placeholder="dev_imei_11223344"
                                mono
                            />
                        </fieldset>
                    </section>

                    <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
                        <div className="border-b border-[#E2E8F0] p-5">
                            <h2 className="text-lg font-semibold text-[#0F172A]">Permissions</h2>
                            <p className="mt-1 text-sm text-[#64748B]">Optional now — they can also be granted later from the employee&apos;s permissions screen. Options come from the enrolled roster.</p>
                            <div className="relative mt-4">
                                <Search size={18} className="pointer-events-none absolute left-3 top-3 text-[#94A3B8]" />
                                <input aria-label="Search permissions" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search permissions…" className="w-full rounded-lg border border-[#CBD5E1] py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20" />
                            </div>
                        </div>

                        <fieldset disabled={saving} className="divide-y divide-[#F1F5F9] disabled:opacity-60">
                            <legend className="sr-only">Permission selection</legend>
                            {visible.map((permission) => {
                                const checked = selected.includes(permission);
                                return <label key={permission} className={`flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors ${checked ? "bg-[#F0FDFA]/60" : "hover:bg-[#F8FAFC]"}`}>
                                    <input type="checkbox" checked={checked} disabled={!checked && selected.length >= 200} onChange={() => toggle(permission)} className="h-5 w-5 shrink-0 accent-[#0F766E]" />
                                    <span className="min-w-0 flex-1 break-all font-mono text-sm text-[#0F172A]">{permission}</span>
                                    <span className={`text-sm ${checked ? "text-[#0F766E]" : "text-[#64748B]"}`}>{checked ? "Allowed" : "Not assigned"}</span>
                                </label>;
                            })}
                        </fieldset>

                        {!visible.length && <p className="p-8 text-center text-sm text-[#64748B]">{permissions.length ? "No permissions match your search." : "No permissions are available in the enrolled roster yet."}</p>}

                        <div className="border-t border-[#E2E8F0] p-5">
                            <label htmlFor="new-permission" className="text-sm font-medium text-[#475569]">Add a permission scope</label>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <input
                                    id="new-permission"
                                    value={custom}
                                    disabled={saving}
                                    maxLength={128}
                                    onChange={(event) => setCustom(event.target.value)}
                                    onKeyDown={(event) => {
                                        // Enter here adds a scope; it must not submit the enrollment.
                                        if (event.key !== "Enter") return;
                                        event.preventDefault();
                                        addCustom();
                                    }}
                                    placeholder="e.g. cargo:inspect"
                                    className="min-w-0 flex-1 rounded-lg border border-[#CBD5E1] px-3 py-2.5 text-sm outline-none focus:border-[#0D9488]"
                                />
                                <button type="button" onClick={addCustom} disabled={saving || !custom.trim() || selected.length >= 200} className="rounded-lg border border-[#99F6E4] px-4 py-2 text-sm font-medium text-[#0F766E] hover:bg-[#F0FDFA] disabled:opacity-40">Add</button>
                            </div>
                        </div>
                    </section>
                </div>

                <aside className="rounded-xl border border-[#E2E8F0] bg-white p-5">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F0FDFA] text-[#0F766E]"><UserPlus size={22} /></div>
                        <h2 className="text-lg font-semibold text-[#0F172A]">Summary</h2>
                    </div>

                    <dl className="mt-5 space-y-3 text-sm">
                        <Row label="Employee" value={trimmedId} />
                        <Row label="Role" value={role.trim()} />
                        <Row label="Status" value={status} />
                        <Row label="Phone" value={phone.trim()} />
                        <Row label="Device bound" value={bindDeviceId.trim() || deviceId.trim()} />
                        <Row label="Permissions" value={selected.length ? `${selected.length} selected` : ""} />
                        <Row label="Password" value={password ? "set" : ""} />
                    </dl>

                    <p className="mt-5 rounded-lg bg-[#F8FAFC] p-3 text-sm leading-relaxed text-[#64748B]">
                        Enrolling writes the actor and an active device binding. Both are checked on
                        every future authorization request.
                    </p>

                    <button type="submit" disabled={saving || invalid} className="mt-4 w-full rounded-lg bg-[#0F766E] px-4 py-3 text-sm font-semibold text-white hover:bg-[#115E59] disabled:cursor-not-allowed disabled:opacity-50">
                        {saving ? "Enrolling…" : "Enroll employee"}
                    </button>

                    <p aria-live="polite" className="mt-2 text-center text-sm text-[#64748B]">
                        {invalid && dirty ? "Fill in the highlighted fields to continue." : ""}
                    </p>
                </aside>
            </form>
        </div>
    );

    function addCustom() {
        const value = custom.trim();
        if (!value || saving || selected.length >= 200) return;
        setSelected((current) => current.includes(value) ? current : [...current, value]);
        setCustom("");
        setSearch("");
    }
}

function Field({ id, label, hint, error, value, onChange, placeholder, list, mono, type }: {
    id: string;
    label: string;
    hint: string;
    error: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    list?: string;
    mono?: boolean;
    type?: "text" | "password";
}) {
    // The message only appears once something has been typed, so an untouched
    // form is not a wall of red.
    const show = Boolean(error && value.trim());

    return (
        <label htmlFor={id} className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[#475569]">{label}</span>
            <input
                id={id}
                type={type ?? "text"}
                autoComplete={type === "password" ? "new-password" : undefined}
                value={value}
                list={list}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                aria-invalid={show || undefined}
                aria-describedby={`${id}-hint`}
                maxLength={128}
                className={`rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[#0D9488] ${mono ? "font-mono" : ""} ${show ? "border-[#FCA5A5]" : "border-[#CBD5E1]"}`}
            />
            <span id={`${id}-hint`} className={`text-sm ${show ? "text-[#B91C1C]" : "text-[#64748B]"}`}>
                {show ? error : hint}
            </span>
        </label>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[#64748B]">{label}</dt>
            <dd className={`min-w-0 break-all text-right font-mono ${value ? "text-[#0F172A]" : "text-[#94A3B8]"}`}>{value || "—"}</dd>
        </div>
    );
}
