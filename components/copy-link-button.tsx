"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const fullUrl =
    typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={fullUrl}
        dir="ltr"
        onFocus={(e) => e.currentTarget.select()}
        className="h-10 flex-1 rounded-lg border border-cream-200 bg-cream-50 px-3 text-sm text-brown-700 text-start"
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(fullUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked */
          }
        }}
      >
        {copied ? "הועתק ✓" : "העתק"}
      </Button>
    </div>
  );
}
