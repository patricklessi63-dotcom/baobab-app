import React from "react";
import { primary, muted } from "../social/theme";

export default function EmptyState({ icon: Icon, title, subtitle, actionLabel, onAction }) {
  return (
    <div className="text-center py-8 px-3">
      {Icon && <Icon size={26} className="mx-auto mb-3" color={muted} aria-hidden="true" />}
      <p className="text-sm font-bold" style={{ color: primary }}>{title}</p>
      {subtitle && <p className="text-xs mt-1.5 max-w-xs mx-auto leading-5" style={{ color: muted }}>{subtitle}</p>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="bb-btn-gold mt-4 px-4 py-2.5 rounded-xl font-bold text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
