// Day-of-week constants. We use 0 = Sunday (Israeli/JS convention).

export const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type DayOfWeek = (typeof DAYS)[number];

export const DAY_NAMES_HE: Record<DayOfWeek, string> = {
  0: "ראשון",
  1: "שני",
  2: "שלישי",
  3: "רביעי",
  4: "חמישי",
  5: "שישי",
  6: "שבת",
};

export const DAY_NAMES_HE_SHORT: Record<DayOfWeek, string> = {
  0: "א׳",
  1: "ב׳",
  2: "ג׳",
  3: "ד׳",
  4: "ה׳",
  5: "ו׳",
  6: "ש׳",
};

export const DAY_NAMES_EN: Record<DayOfWeek, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};
