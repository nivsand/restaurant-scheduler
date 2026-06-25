export const ROLE_LABELS: Record<string, { label: string; icon: string }> = {
  kitchen: { label: "מטבח", icon: "👨‍🍳" },
  floor: { label: "פלור", icon: "🧑‍💼" },
  both: { label: "מטבח + פלור", icon: "⭐" },
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role]?.label ?? role;
}

export function roleIcon(role: string): string {
  return ROLE_LABELS[role]?.icon ?? "👤";
}

export function roleBadge(role: string): string {
  const r = ROLE_LABELS[role];
  return r ? `${r.icon} ${r.label}` : role;
}
