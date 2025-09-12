export type SearchBody = {
  q?: string;
  mode?: "air" | "ocean";
  hs?: string[];
  origin?: string[];
  dest?: string[];
  carrier?: string[];
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  limit?: number;     // default 25
  offset?: number;    // default 0
};

