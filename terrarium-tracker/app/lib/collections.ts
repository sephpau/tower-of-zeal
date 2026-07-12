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

// Resolve an axie's collection from its base Atia's Flame. 200 is shared by
// Shiny / Xmas / Meo, so it's grouped.
export function flameInfo(flame: number): { label: string; color: string } {
  switch (flame) {
    case 5:
      return { label: "Normal", color: "#5fd0c5" };
    case 20:
      return { label: "Summer", color: "#84cc16" };
    case 40:
      return { label: "Nightmare", color: "#8b5cf6" };
    case 60:
      return { label: "Japanese", color: "#ef4444" };
    case 200:
      return { label: "Shiny/Xmas/Meo", color: "#38bdf8" };
    case 400:
      return { label: "Origin", color: "#f97316" };
    case 1000:
      return { label: "Mystic", color: "#c084fc" };
    case 2000:
      return { label: "Agamo Genesis", color: "#ec4899" };
    default:
      return { label: `${flame} flame`, color: "#a8a29e" };
  }
}
