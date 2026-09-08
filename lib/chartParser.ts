// スコア計算専用の軽量パーサー。
// public/tools/chart-editor.html にある描画用パーサーとロジックは共通だが、
// こちらは色やレーン座標などの描画情報を持たず、
// 「何コンボ目にどの重みのノーツが、譜面内の何ms地点に来るか」と
// 「SKILL/FEVERの各マーカーが何ms地点にあるか」だけを追う。
// SKILL/FEVERが実際にどこまで効果を持続するか(秒数)は呼び出し側(scoreCalc)で扱う。

export const NOTE_WEIGHT: Record<string, number> = {
  "1": 1, "2": 2, "3": 0.1, "4": 0.2, // タップ: 通常/クリティカル/トレース/クリティカルトレース
  A: 1, B: 1, C: 1, // フリック 通常
  D: 3, E: 3, F: 3, // フリック クリティカル
  G: 0.1, H: 0.1, I: 0.1, // フリック トレース
  J: 0.2, K: 0.2, L: 0.2, // フリック クリティカルトレース
  a: 1, b: 2, c: 0.1, d: 0.2, // ロング始点: 通常/クリティカル/トレース/クリティカルトレース
  f: 1, g: 2, h: 0.1, i: 0.2, // ロング終点: 同上
  k: 0.1, l: 0.1, // ロング中間(色に関わらず同じ重み)
  m: 1, n: 1, o: 1, // フリック始点 通常
  p: 3, q: 3, r: 3, // フリック始点 クリティカル
  s: 1, t: 1, u: 1, // フリック終点 通常
  v: 3, w: 3, x: 3, // フリック終点 クリティカル
};
const NO_SCORE = new Set(["0", "e", "j"]);
const LINKABLE = new Set([
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j",
  "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x",
]);

interface Token {
  char: string;
  width: number;
}

function tokenizeGroup(str: string, warnings: string[], ctx: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < str.length) {
    const c = str[i];
    if (c === "(") {
      const close = str.indexOf(")", i);
      if (close < 0) {
        warnings.push(`${ctx}: 括弧が閉じていません "${str.slice(i)}"`);
        break;
      }
      const content = str.slice(i + 1, close);
      i = close + 1;
      if (LINKABLE.has(content[0]) && /^\d\d/.test(str.slice(i, i + 2))) i += 2;
      tokens.push({ char: content[0], width: content.length });
    } else {
      i++;
      if (LINKABLE.has(c) && /^\d\d/.test(str.slice(i, i + 2))) i += 2;
      tokens.push({ char: c, width: 1 });
    }
  }
  return tokens;
}

function expandTokens(tokens: Token[], warnings: string[], ctx: string): Token[] {
  const total = tokens.reduce((s, t) => s + t.width, 0);
  if (total === 12) return tokens;
  if (total > 0 && 12 % total === 0) {
    const factor = 12 / total;
    return tokens.map((t) => ({ ...t, width: t.width * factor }));
  }
  warnings.push(`${ctx}: グリッド合計が${total}で12の約数ではありません(そのまま解釈します)`);
  return tokens;
}

type Directive =
  | { type: "BPM"; value: string }
  | { type: "MEASURE"; value: string }
  | { type: "SKILL"; value: string }
  | { type: "FEVER"; value: null };

function parseGroup(raw: string): { directive: Directive | null; notesStr: string } {
  const m = raw.match(/^\{(BPM|MEASURE|SKILL|FEVER)(?::([^}]+))?\}/);
  if (!m) return { directive: null, notesStr: raw };
  const type = m[1] as Directive["type"];
  const directive = { type, value: m[2] ?? null } as Directive;
  return { directive, notesStr: raw.slice(m[0].length) };
}

export interface ScoredNote {
  char: string;
  weight: number;
  comboIndex: number; // 1始まり。譜面データの上から下(=ビューアーの下から上)、同時は左から右の順で採番
  timeMs: number; // 譜面内での経過時間(先頭からのms)
}

export interface Marker {
  slot: number; // SKILLの場合1〜6
  timeMs: number;
}

export interface ParsedCourseForScoring {
  courseName: string;
  level: number | null;
  notes: ScoredNote[];
  totalWeight: number;
  warnings: string[];
  skillMarkers: Marker[];
  feverMarker: Marker | null;
  firstNoteTimeMs: number | null;
  lastNoteTimeMs: number | null;
}

function parseCourseForScoring(
  courseName: string,
  level: string,
  body: string,
  headerBpm: number | null
): ParsedCourseForScoring {
  const warnings: string[] = [];
  const clean = body.replace(/\s+/g, "");
  const measuresRaw = clean.split(";").filter((m) => m.length > 0);

  const state = { bpm: headerBpm, timesig: { n: 4, d: 4 } };
  const skillMarkers: Marker[] = [];
  let feverMarker: Marker | null = null;
  const skillSeen = new Set<number>();
  let feverCount = 0;

  const notes: ScoredNote[] = [];
  let comboIndex = 0;
  let totalWeight = 0;
  let absTimeMs = 0;
  let firstNoteTimeMs: number | null = null;
  let lastNoteTimeMs: number | null = null;

  measuresRaw.forEach((measureStr, mIdx) => {
    const groupsRaw = measureStr.split(",").filter((g) => g.length > 0);
    const parsedGroups = groupsRaw.map((g) => parseGroup(g));
    const realGroups = parsedGroups.filter((g) => g.notesStr.length > 0);
    const N = realGroups.length;
    const ctx = `COURSE ${courseName} 小節${mIdx + 1}`;

    if (N === 0) {
      parsedGroups.forEach((g) => {
        if (g.directive) applyDirective(g.directive);
      });
      return;
    }

    const quarterMs = () => 60000 / (state.bpm || 120);
    const measureDurMs = () => quarterMs() * 4 * state.timesig.n / state.timesig.d;

    function applyDirective(directive: Directive) {
      if (directive.type === "BPM") {
        state.bpm = parseFloat(directive.value);
      } else if (directive.type === "MEASURE") {
        const [n, d] = directive.value.split("/").map(Number);
        state.timesig = { n, d };
      } else if (directive.type === "SKILL") {
        const idx = parseInt(directive.value, 10);
        if (!Number.isInteger(idx) || idx < 1 || idx > 6) {
          warnings.push(`${ctx}: {SKILL:${directive.value}} は1〜6の番号で指定してください`);
        } else if (skillSeen.has(idx)) {
          warnings.push(`${ctx}: SKILL ${idx} が複数回指定されています`);
        } else {
          skillSeen.add(idx);
          skillMarkers.push({ slot: idx, timeMs: absTimeMs });
        }
      } else if (directive.type === "FEVER") {
        feverCount++;
        if (feverCount > 1) {
          warnings.push(`${ctx}: {FEVER}が複数回指定されています`);
        } else {
          feverMarker = { slot: 0, timeMs: absTimeMs };
        }
      }
    }

    parsedGroups.forEach((g) => {
      if (g.directive) applyDirective(g.directive);
      if (g.notesStr.length === 0) return;

      const sliceDurMs = measureDurMs() / N;
      let tokens = tokenizeGroup(g.notesStr, warnings, ctx);
      tokens = expandTokens(tokens, warnings, ctx);

      tokens.forEach((t) => {
        if (NO_SCORE.has(t.char)) return;
        const weight = NOTE_WEIGHT[t.char];
        if (weight === undefined) {
          warnings.push(`${ctx}: 未知のノーツ記号 "${t.char}"`);
          return;
        }
        comboIndex++;
        totalWeight += weight;
        if (firstNoteTimeMs === null) firstNoteTimeMs = absTimeMs;
        lastNoteTimeMs = absTimeMs;
        notes.push({ char: t.char, weight, comboIndex, timeMs: absTimeMs });
      });

      absTimeMs += sliceDurMs;
    });
  });

  const missingSkills = [1, 2, 3, 4, 5, 6].filter((n) => !skillSeen.has(n));
  if (skillSeen.size > 0 && missingSkills.length > 0) {
    warnings.push(`SKILLが${skillSeen.size}/6箇所しか指定されていません(未指定: ${missingSkills.join(",")})`);
  }

  const levelNum = Number(level);
  return {
    courseName,
    level: Number.isFinite(levelNum) ? levelNum : null,
    notes,
    totalWeight,
    warnings,
    skillMarkers,
    feverMarker,
    firstNoteTimeMs,
    lastNoteTimeMs,
  };
}

/** 譜面txt全体から、指定した難易度(COURSE名)のスコア計算用データを取り出す。 */
export function parseChartForScoring(
  src: string,
  courseName: string
): ParsedCourseForScoring | null {
  const lines = src.split("\n");
  let i = 0;
  let headerBpm: number | null = null;
  while (i < lines.length && !/^COURSE:/.test(lines[i])) {
    if (/^BPM:/.test(lines[i])) headerBpm = parseFloat(lines[i].slice(4).trim());
    i++;
  }
  while (i < lines.length) {
    if (/^COURSE:/.test(lines[i])) {
      const name = lines[i].slice(7).trim();
      i++;
      let level = "";
      if (i < lines.length && /^LEVEL:/.test(lines[i])) {
        level = lines[i].slice(6).trim();
        i++;
      }
      while (i < lines.length && !/^#START/.test(lines[i])) i++;
      i++;
      let body = "";
      while (i < lines.length && !/^#END/.test(lines[i])) {
        body += lines[i] + "\n";
        i++;
      }
      i++;
      if (name.toUpperCase() === courseName.toUpperCase()) {
        return parseCourseForScoring(name, level, body, headerBpm);
      }
    } else {
      i++;
    }
  }
  return null;
}
