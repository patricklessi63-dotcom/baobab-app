import React from "react";
import { Check, X, Flag } from "lucide-react";
import Avatar from "../Avatar";
import EmptyState from "../home/EmptyState";
import { categoryLabelForReport } from "../../lib/communities/communityConfig";
import { primary, green, coral, muted, bg, card, primaryRgb } from "./theme";

const REPORT_TARGET_LABEL = { post: "une publication", comment: "un commentaire", member: "un membre", community: "la communauté" };

export default function CommunityAdminPanel({ joinRequests = [], reports = [], onAccept, onReject, onResolveReport, onDismissReport }) {
  return (
    <div className="flex flex-col gap-5">
      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <b className="text-sm" style={{ color: primary }}>Demandes d'adhésion</b>
          {joinRequests.length > 0 && (
            <span className="text-[10px] font-black text-white rounded-full h-5 min-w-5 px-1.5 flex items-center justify-center" style={{ background: coral }}>{joinRequests.length}</span>
          )}
        </div>
        {joinRequests.length === 0 ? (
          <EmptyState title="Aucune demande en attente." />
        ) : (
          <div className="flex flex-col gap-2">
            {joinRequests.map((req) => (
              <div key={req.id} className="flex items-center gap-3 p-2 rounded-xl" style={{ background: bg }}>
                <Avatar name={req.profiles?.name} url={req.profiles?.avatar_url} size={36} />
                <span className="text-sm font-semibold flex-1 truncate">{req.profiles?.name || "Utilisateur"}</span>
                <button onClick={() => onReject(req)} aria-label="Refuser la demande" className="h-8 w-8 rounded-full flex items-center justify-center" style={{ color: coral, background: "#fff" }}>
                  <X size={15} />
                </button>
                <button onClick={() => onAccept(req)} aria-label="Accepter la demande" className="h-8 w-8 rounded-full flex items-center justify-center text-white" style={{ background: green }}>
                  <Check size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <b className="text-sm" style={{ color: primary }}>Signalements</b>
          {reports.length > 0 && (
            <span className="text-[10px] font-black text-white rounded-full h-5 min-w-5 px-1.5 flex items-center justify-center" style={{ background: coral }}>{reports.length}</span>
          )}
        </div>
        {reports.length === 0 ? (
          <EmptyState icon={Flag} title="Aucun signalement ouvert." />
        ) : (
          <div className="flex flex-col gap-2">
            {reports.map((rep) => (
              <div key={rep.id} className="p-3 rounded-xl" style={{ background: bg }}>
                <div className="text-sm font-semibold" style={{ color: primary }}>
                  {categoryLabelForReport(rep.category)} — {REPORT_TARGET_LABEL[rep.target_type] || rep.target_type}
                </div>
                {rep.reason && <p className="text-xs mt-1" style={{ color: muted }}>{rep.reason}</p>}
                <div className="flex gap-2 mt-2.5">
                  <button onClick={() => onDismissReport(rep)} className="flex-1 text-xs font-bold py-2 rounded-full" style={{ border: `1px solid rgba(${primaryRgb},.15)`, color: primary }}>
                    Ignorer
                  </button>
                  <button onClick={() => onResolveReport(rep)} className="flex-1 text-xs font-bold py-2 rounded-full text-white" style={{ background: coral }}>
                    Traiter
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
