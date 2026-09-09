// スコア計算専用の軽量パーサー。
// 描画用パーサー(別配布の譜面エディタ/public/viewer.html由来のもの)とロジックは共通だが、
// こちらは色やレーン座標などの描画情報を持たず、
// 「何コンボ目にどの重みのノーツが、譜面内の何ms地点に来るか」と
// 「SKILL/FEVERの各マーカーが何ms地点にあるか」だけを追う。
//
// ロングノーツの中間判定(始点・終点を除き8分グリッドに重なる位置で自動的に
// コンボが加算される仕様)もここで計算し、重み0.1の仮想ノーツとして
// 実ノーツ列にマージしてからコンボ番号を振り直す。

export const NOTE_WEIGHT: Record<string, number> = {
  "1": 1, "2": 2, "3": 0.1, "4": 0.2, // タップ: 通常/クリティカル/トレース/クリティカルトレース
  A: 1, B: 1, C: 1, // フリック 通常
  D: 3, E: 3, F: 3, // フリック クリティカル
  G: 0.1, H: 0.1, I: 0.1, // フリック トレース
  J: 0.2, K: 0.2, L: 0.2, // フリック クリティカルトレース
  a: 1, b: 2, c: 0.1, d: 0.2, // ロング始点: 通常/クリティカル/トレース/クリティカルトレース
  f: 1, g: 2, h: 0.1, i: 0.2, // ロング終点: 同上
  k: 0.1, l: 0.1, // ロング中間(明示的な粒。色に関わらず同じ重み)
  m: 1, n: 1, o: 1, // フリック始点 通常
  p: 3, q: 3, r: 3, // フリック始点 クリティカル
  s: 1, t: 1, u: 1, // フリック終点 通常
  v: 3, w: 3, x: 3, // フリック終点 クリティカル
};
const MID_JUDGE_WEIGHT = 0.1; // ロング中間の自動判定(8分グリッド)の重み
const NO_SCORE = new Set(["0", "e", "j"]);
const LONG_START_CHARS = new Set(["a", "b", "c", "d", "e", "m", "n", "o", "p", "q", "r"]);
const LONG_END_CHARS = new Set(["f", "g", "h", "i", "j", "s", "t", "u", "v", "w", "x"]);
const LINKABLE = new Set([...LONG_START_CHARS, ...LONG_END_CHARS]);

interface Token {
  char: string;
  width: number;
  id: string | null;
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
      let id: string | null = null;
      if (LINKABLE.has(content[0]) && /^\d\d/.test(str.slice(i, i + 2))) {
        id = str.slice(i, i + 2);
        i += 2;
      }
      tokens.push({ char: content[0], width: content.length, id });
    } else {
      i++;
      let id: string | null = null;
      if (LINKABLE.has(c) && /^\d\d/.test(str.slice(i, i + 2))) {
        id = str.slice(i, i + 2);
        i += 2;
      }
      tokens.push({ char: c, width: 1, id });
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
  weight: number;
  comboIndex: number; // 1始まり。譜面データの上から下(=ビューアーの下から上)、同時は左から右の順で採番
  timeMs: number;
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
  midJudgeCount: number; // ロング中間の自動判定の個数(参考値)
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

  // 実際に書かれたノーツ(始点・終点・タップ・粒など)
  const notes: Omit<ScoredNote, "comboIndex">[] = [];
  let absTimeMs = 0;

  // ロング始点・終点の対応づけ(IDベース)。中間判定の8分グリッド計算に使う。
  const openLongs: Record<string, number> = {}; // id -> startTimeMs
  const longSpans: { startTimeMs: number; endTimeMs: number }[] = [];

  // 8分グリッド計算用に、小節ごとの基準(開始時刻・BPM)を記録しておく
  const measureGrids: { startTimeMs: number; durationMs: number; bpm: number }[] = [];

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

    let gridCaptured = false;
    parsedGroups.forEach((g) => {
      if (g.directive) applyDirective(g.directive);
      if (g.notesStr.length === 0) return;

      // この小節の8分グリッド基準は、最初の実ノーツグループの時点(directive適用後)で確定させる
      if (!gridCaptured) {
        measureGrids.push({
          startTimeMs: absTimeMs,
          durationMs: measureDurMs(),
          bpm: state.bpm || 120,
        });
        gridCaptured = true;
      }

      const sliceDurMs = measureDurMs() / N;
      let tokens = tokenizeGroup(g.notesStr, warnings, ctx);
      tokens = expandTokens(tokens, warnings, ctx);

      tokens.forEach((t) => {
        if (NO_SCORE.has(t.char)) {
          // ノーツなし始点・終点(e/j)もロングの経路としてはIDで対応づける
          if (t.char === "e" || t.char === "j") {
            if (t.char === "e" && t.id) openLongs[t.id] = absTimeMs;
            if (t.char === "j" && t.id) {
              if (openLongs[t.id] !== undefined) {
                longSpans.push({ startTimeMs: openLongs[t.id], endTimeMs: absTimeMs });
                delete openLongs[t.id];
              } else {
                warnings.push(`${ctx}: ID ${t.id} に対応する始点が見つかりません`);
              }
            }
          }
          return;
        }
        const weight = NOTE_WEIGHT[t.char];
        if (weight === undefined) {
          warnings.push(`${ctx}: 未知のノーツ記号 "${t.char}"`);
          return;
        }
        notes.push({ weight, timeMs: absTimeMs });

        if (LONG_START_CHARS.has(t.char)) {
          if (!t.id) {
            warnings.push(`${ctx}: 始点 "${t.char}" にIDがありません(中間判定を計算できません)`);
          } else {
            openLongs[t.id] = absTimeMs;
          }
        } else if (LONG_END_CHARS.has(t.char)) {
          if (!t.id) {
            warnings.push(`${ctx}: 終点 "${t.char}" にIDがありません`);
          } else if (openLongs[t.id] === undefined) {
            warnings.push(`${ctx}: ID ${t.id} に対応する始点が見つかりません`);
          } else {
            longSpans.push({ startTimeMs: openLongs[t.id], endTimeMs: absTimeMs });
            delete openLongs[t.id];
          }
        }
      });

      absTimeMs += sliceDurMs;
    });
  });

  Object.keys(openLongs).forEach((id) => warnings.push(`未閉合のロング始点 (ID ${id})`));

  // ---- ロング中間の自動判定(8分グリッド)を計算してマージ ----
  const grid: number[] = [];
  measureGrids.forEach((mg) => {
    const eighthMs = 30000 / (mg.bpm || 120); // 8分音符 = 4分音符の半分。BPMだけで決まる(拍子によらない)
    if (eighthMs <= 0) return;
    for (let t = mg.startTimeMs; t < mg.startTimeMs + mg.durationMs - 1e-6; t += eighthMs) {
      grid.push(t);
    }
  });
  const EPS = 1; // ms。始点・終点そのものと誤って重複計上しないための許容誤差
  const midJudgeNotes: Omit<ScoredNote, "comboIndex">[] = [];
  longSpans.forEach((span) => {
    grid.forEach((t) => {
      if (t > span.startTimeMs + EPS && t < span.endTimeMs - EPS) {
        midJudgeNotes.push({ weight: MID_JUDGE_WEIGHT, timeMs: t });
      }
    });
  });

  // 時刻順にマージしてコンボ番号を振り直す(同時刻は元の並び= 実ノーツ優先を維持する安定ソート)
  const merged = [...notes, ...midJudgeNotes].sort((a, b) => a.timeMs - b.timeMs);
  const finalNotes: ScoredNote[] = merged.map((n, idx) => ({ ...n, comboIndex: idx + 1 }));
  const totalWeight = finalNotes.reduce((s, n) => s + n.weight, 0);

  const missingSkills = [1, 2, 3, 4, 5, 6].filter((n) => !skillSeen.has(n));
  if (skillSeen.size > 0 && missingSkills.length > 0) {
    warnings.push(`SKILLが${skillSeen.size}/6箇所しか指定されていません(未指定: ${missingSkills.join(",")})`);
  }

  const levelNum = Number(level);
  const timeValues = finalNotes.map((n) => n.timeMs);
  return {
    courseName,
    level: Number.isFinite(levelNum) ? levelNum : null,
    notes: finalNotes,
    totalWeight,
    warnings,
    skillMarkers,
    feverMarker,
    firstNoteTimeMs: timeValues.length ? Math.min(...timeValues) : null,
    lastNoteTimeMs: timeValues.length ? Math.max(...timeValues) : null,
    midJudgeCount: midJudgeNotes.length,
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
