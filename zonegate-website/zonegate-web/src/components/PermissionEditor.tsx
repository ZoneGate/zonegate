"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Search, ShieldCheck } from "lucide-react";
import { ApiError, updateActorPermissions, type Actor } from "@/lib/api";

export default function PermissionEditor({ actor, availablePermissions, onBack, onSaved }: {
    actor: Actor;
    availablePermissions: string[];
    onBack: () => void;
    onSaved: (actor: Actor) => void;
}) {
    const [selected, setSelected] = useState(() => [...actor.permissions]);
    const [search, setSearch] = useState("");
    const [discardPrompt, setDiscardPrompt] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [custom, setCustom] = useState("");
    const permissions = [...new Set([...availablePermissions, ...actor.permissions, ...selected])].sort();
    const added = selected.filter((permission) => !actor.permissions.includes(permission));
    const removed = actor.permissions.filter((permission) => !selected.includes(permission));
    const dirty = added.length + removed.length > 0;
    const visible = permissions.filter((permission) => permission.toLowerCase().includes(search.trim().toLowerCase()));

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
        setDiscardPrompt(false);
        setSaved(false);
    }

    async function save() {
        if (saving || !dirty) return;
        setSaving(true);
        setDiscardPrompt(false);
        setError(null);
        setSaved(false);
        try {
            const updated = await updateActorPermissions(actor.actor_id, selected, actor.permissions);
            onSaved(updated);
            setSelected([...updated.permissions]);
            setSaved(true);
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Permissions could not be saved. Please try again.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="flex w-full flex-col gap-6">
            <header className="border-b border-[#E2E8F0] pb-5">
                <button type="button" disabled={saving} onClick={() => dirty ? setDiscardPrompt(true) : onBack()} className="mb-4 inline-flex items-center gap-2 rounded text-sm font-medium text-[#0F766E] focus-visible:outline-2 focus-visible:outline-[#0D9488] disabled:opacity-50">
                    <ArrowLeft size={16} /> Back to employee
                </button>
                <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A]">Employee permissions</h1>
                <p className="mt-2 text-base text-[#64748B]">Review and adjust the permissions assigned to this employee.</p>
            </header>

            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
            {saved && <div role="status" className="rounded-lg border border-[#99F6E4] bg-[#F0FDFA] p-4 text-sm text-[#0F766E]">Permissions saved successfully.</div>}

            {discardPrompt && <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p>Your permission changes have not been saved.</p>
                <div className="flex gap-3">
                    <button type="button" onClick={() => setDiscardPrompt(false)} className="rounded border border-amber-300 px-3 py-2 font-medium">Keep editing</button>
                    <button type="button" onClick={onBack} className="rounded px-3 py-2 font-medium underline">Discard and go back</button>
                </div>
            </div>}

            <section className="flex flex-wrap items-center gap-4 rounded-xl border border-[#E2E8F0] bg-white p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F0FDFA] text-[#0F766E]"><ShieldCheck size={24} /></div>
                <div className="min-w-0 flex-1">
                    <h2 className="break-all text-lg font-semibold text-[#0F172A]">{actor.actor_id}</h2>
                    <p className="mt-1 text-sm text-[#64748B]">{actor.role} · {actor.enrollment_status}</p>
                </div>
                <span className="rounded-full bg-[#F1F5F9] px-3 py-1.5 text-sm text-[#475569]">{actor.permissions.length} current permissions</span>
            </section>

            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
                    <div className="border-b border-[#E2E8F0] p-5">
                        <h2 className="text-lg font-semibold text-[#0F172A]">Permissions</h2>
                        <p className="mt-1 text-sm text-[#64748B]">Select the permissions this employee should have. Options come from the enrolled roster.</p>
                        <div className="relative mt-4">
                            <Search size={18} className="pointer-events-none absolute left-3 top-3 text-[#94A3B8]" />
                            <input aria-label="Search permissions" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search permissions…" className="w-full rounded-lg border border-[#CBD5E1] py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20" />
                        </div>
                    </div>
                    <fieldset disabled={saving} className="divide-y divide-[#F1F5F9] disabled:opacity-60">
                        <legend className="sr-only">Employee permission selection</legend>
                        {visible.map((permission) => {
                            const checked = selected.includes(permission);
                            return <label key={permission} className={`flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors ${checked ? "bg-[#F0FDFA]/60" : "hover:bg-[#F8FAFC]"}`}>
                                <input type="checkbox" checked={checked} disabled={!checked && selected.length >= 200} onChange={() => toggle(permission)} className="h-5 w-5 shrink-0 accent-[#0F766E]" />
                                <span className="min-w-0 flex-1 break-all font-mono text-sm text-[#0F172A]">{permission}</span>
                                <span className={`text-sm ${checked ? "text-[#0F766E]" : "text-[#64748B]"}`}>{checked ? "Allowed" : "Not assigned"}</span>
                            </label>;
                        })}
                    </fieldset>
                    {!visible.length && <p className="p-8 text-center text-sm text-[#64748B]">{permissions.length ? "No permissions match your search." : "No permissions are available in the enrolled roster."}</p>}
                    <form className="border-t border-[#E2E8F0] p-5" onSubmit={(event) => {
                        event.preventDefault();
                        const value = custom.trim();
                        if (!value || saving || selected.length >= 200) return;
                        setSelected((current) => current.includes(value) ? current : [...current, value]);
                        setCustom(""); setSearch(""); setSaved(false); setDiscardPrompt(false);
                    }}>
                        <label htmlFor="new-permission" className="text-sm font-medium text-[#475569]">Add a permission scope</label>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <input id="new-permission" value={custom} disabled={saving} maxLength={128} onChange={(event) => setCustom(event.target.value)} placeholder="e.g. cargo:inspect" className="min-w-0 flex-1 rounded-lg border border-[#CBD5E1] px-3 py-2.5 text-sm outline-none focus:border-[#0D9488]" />
                            <button type="submit" disabled={saving || !custom.trim() || selected.length >= 200} className="rounded-lg border border-[#99F6E4] px-4 py-2 text-sm font-medium text-[#0F766E] hover:bg-[#F0FDFA] disabled:opacity-40">Add</button>
                        </div>
                    </form>
                </section>

                <aside className="rounded-xl border border-[#E2E8F0] bg-white p-5">
                    <h2 className="text-lg font-semibold text-[#0F172A]">Changes</h2>
                    <p aria-live="polite" className="mt-1 text-sm text-[#64748B]">{selected.length} permissions selected · {added.length + removed.length} changes</p>
                    {!dirty && <p className="my-5 text-sm text-[#64748B]">No changes yet.</p>}
                    {added.length > 0 && <ChangeList title="To add" values={added} className="text-[#0F766E]" />}
                    {removed.length > 0 && <ChangeList title="To remove" values={removed} className="text-[#B91C1C]" />}
                    {dirty && selected.length === 0 && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">All permissions will be removed from this employee.</p>}
                    <p className="mt-5 rounded-lg bg-[#F8FAFC] p-3 text-sm leading-relaxed text-[#64748B]">Saved changes apply to future authorization requests.</p>
                    <button type="button" onClick={save} disabled={saving || !dirty} className="mt-4 w-full rounded-lg bg-[#0F766E] px-4 py-3 text-sm font-semibold text-white hover:bg-[#115E59] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button>
                    <button type="button" disabled={!dirty || saving} onClick={() => { setSelected([...actor.permissions]); setDiscardPrompt(false); setError(null); setCustom(""); }} className="mt-2 w-full rounded-lg border border-[#CBD5E1] px-4 py-3 text-sm font-medium text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-40">Reset changes</button>
                </aside>
            </div>
        </div>
    );
}

function ChangeList({ title, values, className }: { title: string; values: string[]; className: string }) {
    return <div className="mt-5">
        <h3 className={`text-sm font-medium ${className}`}>{title} ({values.length})</h3>
        <ul className="mt-2 space-y-2">{values.map((value) => <li key={value} className="break-all rounded bg-[#F8FAFC] px-3 py-2 font-mono text-sm text-[#475569]">{value}</li>)}</ul>
    </div>;
}
