// Axie collection → Atia's Flame values, from the Terrariums
// "Collectible Axie Utility Breakdown". Each working Axie contributes its
// collection's flame; a plot has up to 30 working-axie slots.

export type Collection = {
  key: string;
  name: string;
  flame: number;
  accent: string; // on-brand tint for the collection chip
};

export const COLLECTIONS: Collection[] = [
  { key: "normal", name: "Normal", flame: 5, accent: "#5fd0c5" },
  { key: "summer", name: "Summer", flame: 20, accent: "#84cc16" },
  { key: "nightmare", name: "Nightmare", flame: 40, accent: "#8b5cf6" },
  { key: "japanese", name: "Japanese", flame: 60, accent: "#ef4444" },
  { key: "shiny", name: "Shiny", flame: 200, accent: "#38bdf8" },
  { key: "xmas", name: "Xmas", flame: 200, accent: "#22c55e" },
  { key: "meo", name: "Meo", flame: 200, accent: "#3b82f6" },
  { key: "origin", name: "Origin", flame: 400, accent: "#f97316" },
  { key: "mystic", name: "Mystic", flame: 1000, accent: "#c084fc" },
  { key: "agamo-genesis", name: "Agamo Genesis", flame: 2000, accent: "#ec4899" },
];

// Working-axie slots per paid plot (from the Land Utility Breakdown).
export const MAX_WORKING_AXIES = 30;
