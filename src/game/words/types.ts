export type WordDifficulty = "easy" | "medium" | "hard";
export type WordEntry = { word: string; difficulty: WordDifficulty };
export type Pack = { id: string; name: string; words: readonly WordEntry[] };
