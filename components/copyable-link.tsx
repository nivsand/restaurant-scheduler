"use client";

import { useState } from "react";

export function CopyableLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={url}
        dir="ltr"
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 flex-1 truncate rounded-lg border border-cream-200 bg-white px-2 text-xs text-brown-700 text-start"
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked — manager can still select-and-copy */
          }
        }}
        className="inline-flex h-9 items-center rounded-lg border border-cream-200 bg-white px-3 text-xs font-medium text-brown-700 hover:bg-cream-50"
      >
        {copied ? "הועתק ✓" : "העתק"}
      </button>
    </div>
  );
}
