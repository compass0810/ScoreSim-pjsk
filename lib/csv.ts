import Papa from "papaparse";

export type DifficultyKey =
  | "easy"
  | "normal"
  | "hard"
  | "expert"
  | "master"
  | "append";

export interface Song {
  id: string;
  title: string;
  subtitle: string;
  levels: Record<DifficultyKey, number | null>;
  jacketUrl: string;
  chartFileName: string;
}

// CSVの列順(A〜K): 曲ID, 曲名, サブタイトル, EASY, NORMAL, HARD, EXPERT, MASTER, APPEND, ジャケットURL, 譜面ファイル名
const COLUMN_ORDER: (keyof Song | DifficultyKey)[] = [
  "id",
  "title",
  "subtitle",
  "easy",
  "normal",
  "hard",
  "expert",
  "master",
  "append",
  "jacketUrl",
  "chartFileName",
];

function parseLevel(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "ー" || trimmed === "―") {
    return null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export interface ParseResult {
  songs: Song[];
  warnings: string[];
}

/**
 * CSVテキストをSong[]にパースする。
 * 1行目はヘッダーとして扱い、A〜K列(11列)を固定の意味として読む。
 * ヘッダーの文字列自体は見ない(列の並び順だけを信頼する)。
 */
export function parseSongsCsv(csvText: string): ParseResult {
  const warnings: string[] = [];
  const result = Papa.parse<string[]>(csvText, {
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    result.errors.forEach((e) =>
      warnings.push(`CSVパースエラー (行${e.row ?? "?"}): ${e.message}`)
    );
  }

  const rows = result.data;
  if (rows.length === 0) {
    return { songs: [], warnings: ["CSVにデータがありません"] };
  }

  const [, ...dataRows] = rows; // 1行目(ヘッダー)を除外
  const songs: Song[] = [];

  dataRows.forEach((row, idx) => {
    const lineNo = idx + 2; // 実ファイル上の行番号(ヘッダーぶん+1)
    if (row.length < COLUMN_ORDER.length) {
      warnings.push(
        `行${lineNo}: 列数が${row.length}しかありません(11列必要) - スキップしました`
      );
      return;
    }
    const [
      id,
      title,
      subtitle,
      easy,
      normal,
      hard,
      expert,
      master,
      append,
      jacketUrl,
      chartFileName,
    ] = row;

    if (!id || !title) {
      warnings.push(`行${lineNo}: 曲IDまたは曲名が空です - スキップしました`);
      return;
    }

    songs.push({
      id: id.trim(),
      title: title.trim(),
      subtitle: (subtitle ?? "").trim(),
      levels: {
        easy: parseLevel(easy),
        normal: parseLevel(normal),
        hard: parseLevel(hard),
        expert: parseLevel(expert),
        master: parseLevel(master),
        append: parseLevel(append),
      },
      jacketUrl: (jacketUrl ?? "").trim(),
      chartFileName: (chartFileName ?? "").trim(),
    });
  });

  return { songs, warnings };
}
