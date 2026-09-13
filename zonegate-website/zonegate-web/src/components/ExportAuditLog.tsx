"use client";

import { Download } from "lucide-react";

type AuditRow = {
    id: string;
    resource: string;
    zone: string;
    officer: string;
    status: string;
    time: string;
};

export default function ExportAuditLog({ rows }: { rows: AuditRow[] }) {
    const download = () => {
        const header = ["request_id", "resource", "zone", "officer", "decision", "time_utc"];

        const csv = [
            header,
            ...rows.map((row) => [
                row.id,
                row.resource,
                row.zone,
                row.officer,
                row.status,
                row.time,
            ]),
        ]
            .map((row) => row.join(","))
            .join("\n");

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = "zonegate-audit-log.csv";
        link.click();

        URL.revokeObjectURL(url);
    };

    return (
        <button
            type="button"
            onClick={download}
            className="flex items-center gap-2 rounded border border-[#E2E8F0] bg-white px-3 py-2 transition hover:bg-[#F1F5F9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
        >
            <Download size={15} className="text-[#64748B]" />
            <span className="text-[10px] font-medium uppercase tracking-wider">
                Export Audit Log
            </span>
        </button>
    );
}
