import { DifficultyKey } from "@/lib/csv";

export const DIFFICULTY_ORDER: DifficultyKey[] = [
  "easy",
  "normal",
  "hard",
  "expert",
  "master",
  "append",
];

export const DIFFICULTY_LABEL: Record<DifficultyKey, string> = {
  easy: "EASY",
  normal: "NORMAL",
  hard: "HARD",
  expert: "EXPERT",
  master: "MASTER",
  append: "APPEND",
};

export const DIFFICULTY_COLOR: Record<DifficultyKey, string> = {
  easy: "#3ddc97",
  normal: "#4da6ff",
  hard: "#ffd54a",
  expert: "#ff5a6e",
  master: "#b98eff",
  append: "#ff8fd0",
};

export function DifficultyBadge({
  difficulty,
  level,
  onClick,
}: {
  difficulty: DifficultyKey;
  level: number | null;
  onClick?: (difficulty: DifficultyKey) => void;
}) {
  const color = DIFFICULTY_COLOR[difficulty];
  const empty = level === null;
  const clickable = !empty && !!onClick;
  return (
    <button
      type="button"
      title={DIFFICULTY_LABEL[difficulty]}
      disabled={!clickable}
      onClick={(e) => {
        e.stopPropagation();
        if (clickable && onClick) onClick(difficulty);
      }}
      className={`difficulty-badge ${clickable ? "clickable" : ""}`}
      style={{
        border: `2px solid ${empty ? "#333a4a" : color}`,
        color: empty ? "#454c5e" : color,
        background: empty ? "transparent" : `${color}1a`,
      }}
    >
      {empty ? "–" : level}
    </button>
  );
}
