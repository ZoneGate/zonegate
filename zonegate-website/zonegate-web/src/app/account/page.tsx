"use client";

/**
 * The signed-in operator's own account.
 *
 * Everything on an `Actor` except the password is security state: the role and
 * permissions are what the policy engine decides on, and the registered phone
 * and device are how the Evidence Gateway recognises this person at the gate.
 * Letting someone edit those about themselves would defeat the model, so they
 * are shown read-only here and changed from the roster by a supervisor on the
 * console. The password is the one thing this screen writes.
 */

import { useEffect, useState } from "react";
import { KeyRound, ShieldAlert, ShieldCheck, Smartphone, UserRound } from "lucide-react";

import { useSession } from "@/components/layout/SessionGate";
import {
    ApiError,
    changePassword,
    listActors,
    type DeviceBinding,
} from "@/lib/api";

/** `+14155550199` -> `+1415•••0199`, so a full number is not readable in passing. */
function maskNumber(value: string): string {
    if (value.length < 9) return value;
    return `${value.slice(0, 5)}•••${value.slice(-4)}`;
}

export default function AccountPage() {
    const { actor } = useSession();

    const [binding, setBinding] = useState<DeviceBinding | null>(null);
    const [bindingKnown, setBindingKnown] = useState(false);

    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        listActors(500)
            .then((roster) => {
                if (cancelled) return;
                const mine = roster.find((entry) => entry.actor.actor_id === actor.actor_id);
                setBinding(mine?.binding ?? null);
            })
            .catch(() => {
                // The binding is context, not the point of this screen; a failure
                // here should not hide the password form.
            })
            .finally(() => {
                if (!cancelled) setBindingKnown(true);
            });

        return () => { cancelled = true; };
    }, [actor.actor_id]);

    const complaint = !password
        ? ""
        : password.length < 10
            ? "Use at least 10 characters."
            : password.trim() !== password
                ? "Must not start or end with a space."
                : confirm && password !== confirm
                    ? "The two entries do not match."
                    : "";

    const ready = Boolean(password && confirm && !complaint);
    const operational = actor.enrollment_status === "ACTIVE" && Boolean(binding?.is_active);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (!ready || saving) return;

        setSaving(true);
        setError(null);
        setSaved(false);

        try {
            await changePassword(password);
            setPassword("");
            setConfirm("");
            setSaved(true);
        } catch (caught) {
            setError(
                caught instanceof ApiError
                    ? caught.message
                    : "The password could not be changed. Please try again."
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="flex w-full flex-col gap-6">
            <section className="border-b border-[#E2E8F0] pb-4">
                <p className="text-[10px] font-medium uppercase tracking-widest text-[#64748B]">
                    Your Account // Berth-04
                </p>

                <h1 className="mt-1 text-2xl font-semibold uppercase tracking-tight text-[#0F172A]">
                    Operator Profile
                </h1>

                <p className="mt-1 text-sm text-[#64748B]">
                    Your enrolled identity, and the one credential you control yourself.
                </p>
            </section>

            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="rounded-xl border border-[#E2E8F0] bg-white p-5">
                    <div className="flex flex-wrap items-center gap-4 border-b border-[#F1F5F9] pb-5">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F0FDFA] text-[#0F766E]">
                            <UserRound size={24} />
                        </div>

                        <div className="min-w-0 flex-1">
                            <h2 className="break-all text-lg font-semibold text-[#0F172A]">{actor.actor_id}</h2>
                            <p className="mt-1 text-sm text-[#64748B]">{actor.role} · {actor.enrollment_status}</p>
                        </div>

                        <span
                            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${
                                operational
                                    ? "bg-[#F0FDFA] text-[#0F766E]"
                                    : "bg-[#FEF3C7] text-[#92400E]"
                            }`}
                        >
                            {operational ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
                            {!bindingKnown
                                ? "Checking binding…"
                                : operational
                                    ? "Can pass authorization"
                                    : "Blocked by enrollment"}
                        </span>
                    </div>

                    <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                        <Detail label="Registered phone" value={maskNumber(actor.registered_phone_number)} />
                        <Detail label="Registered device" value={actor.registered_device_id} />
                        <Detail
                            label="Device binding"
                            value={
                                !bindingKnown
                                    ? "—"
                                    : binding
                                        ? `${binding.is_active ? "Active" : "Inactive"} · ${binding.device_id}`
                                        : "No binding on record"
                            }
                        />
                        <Detail
                            label="Permissions"
                            value={actor.permissions.length ? `${actor.permissions.length} granted` : "None granted"}
                        />
                    </dl>

                    {actor.permissions.length > 0 && (
                        <ul className="mt-4 flex flex-wrap gap-2">
                            {actor.permissions.map((permission) => (
                                <li key={permission} className="break-all rounded bg-[#F8FAFC] px-3 py-1.5 font-mono text-sm text-[#475569]">
                                    {permission}
                                </li>
                            ))}
                        </ul>
                    )}

                    <p className="mt-6 rounded-lg bg-[#F8FAFC] p-3 text-sm leading-relaxed text-[#64748B]">
                        Your role, permissions, phone number and device binding are what
                        every authorization is checked against, so they are changed from
                        the enrolled roster rather than here. Ask an operator with console
                        access if any of them is wrong.
                    </p>
                </section>

                <aside className="rounded-xl border border-[#E2E8F0] bg-white p-5">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F0FDFA] text-[#0F766E]">
                            <KeyRound size={22} />
                        </div>
                        <h2 className="text-lg font-semibold text-[#0F172A]">Change password</h2>
                    </div>

                    <form onSubmit={submit} className="mt-5">
                        <fieldset disabled={saving} className="flex flex-col gap-5 disabled:opacity-60">
                            <legend className="sr-only">New console password</legend>

                            <label htmlFor="new-password" className="flex flex-col gap-2">
                                <span className="text-sm font-medium text-[#475569]">New password</span>
                                <input
                                    id="new-password"
                                    type="password"
                                    autoComplete="new-password"
                                    maxLength={200}
                                    value={password}
                                    onChange={(event) => { setPassword(event.target.value); setSaved(false); }}
                                    className="rounded-lg border border-[#CBD5E1] px-3 py-2.5 text-sm outline-none focus:border-[#0D9488]"
                                />
                                <span className="text-sm text-[#64748B]">At least 10 characters.</span>
                            </label>

                            <label htmlFor="confirm-password" className="flex flex-col gap-2">
                                <span className="text-sm font-medium text-[#475569]">Repeat new password</span>
                                <input
                                    id="confirm-password"
                                    type="password"
                                    autoComplete="new-password"
                                    maxLength={200}
                                    value={confirm}
                                    onChange={(event) => { setConfirm(event.target.value); setSaved(false); }}
                                    aria-invalid={Boolean(complaint) || undefined}
                                    className={`rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[#0D9488] ${complaint ? "border-[#FCA5A5]" : "border-[#CBD5E1]"}`}
                                />
                            </label>
                        </fieldset>

                        {complaint && (
                            <p role="alert" className="mt-4 text-sm text-[#B91C1C]">{complaint}</p>
                        )}

                        {error && (
                            <p role="alert" className="mt-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-sm text-[#B91C1C]">
                                {error}
                            </p>
                        )}

                        {saved && (
                            <p role="status" className="mt-4 rounded-lg border border-[#99F6E4] bg-[#F0FDFA] px-3 py-2 text-sm text-[#0F766E]">
                                Password changed. Use it the next time you sign in.
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={!ready || saving}
                            className="mt-5 w-full rounded-lg bg-[#0F766E] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#115E59] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {saving ? "Saving…" : "Change password"}
                        </button>
                    </form>

                    <p className="mt-5 flex items-start gap-2 text-sm leading-relaxed text-[#64748B]">
                        <Smartphone size={16} className="mt-0.5 shrink-0 text-[#94A3B8]" />
                        This password is for the operations console only. It is not what
                        the gate checks — that is your device binding.
                    </p>
                </aside>
            </div>
        </div>
    );
}

function Detail({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-sm text-[#64748B]">{label}</dt>
            <dd className="mt-1 break-all font-mono text-sm text-[#0F172A]">{value}</dd>
        </div>
    );
}
