import { parseChartForScoring, ParsedCourseForScoring, Marker } from "@/lib/chartParser";

export interface ScoreCalcInput {
  chartText: string;
  courseName: string;
  totalPower: number; // 総合力
  skillPercents: [number, number, number, number, number, number]; // SKILL1〜6の%アップ
  skillDurationsSec: [number, number, number, number, number, number]; // SKILL1〜6の効果秒数
  feverEnabled: boolean;
  feverDurationSec: number;
}

export interface ScoreCalcResult {
  score: number;
  noteCount: number;
  totalWeight: number;
  level: number | null;
  warnings: string[];
  chartDurationSec: number | null; // 最初のノーツ〜最後のノーツの時間(参考値)
  midJudgeCount: number; // ロング中間の自動判定(8分グリッド)の個数(参考値)
}

const FEVER_MULTIPLIER = 1.5;

/** そのノーツの時刻に有効な(最後に開始した)マーカーを1つ選ぶ。 */
function activeMarker(
  timeMs: number,
  markers: Marker[],
  durationOf: (m: Marker) => number
): Marker | null {
  let best: Marker | null = null;
  for (const m of markers) {
    const durMs = durationOf(m) * 1000;
    if (timeMs >= m.timeMs && timeMs < m.timeMs + durMs) {
      if (!best || m.timeMs > best.timeMs) best = m;
    }
  }
  return best;
}

export function calcApScore(input: ScoreCalcInput): ScoreCalcResult | { error: string } {
  const parsed: ParsedCourseForScoring | null = parseChartForScoring(
    input.chartText,
    input.courseName
  );
  if (!parsed) {
    return { error: `譜面内にCOURSE:${input.courseName} が見つかりません` };
  }
  if (parsed.notes.length === 0) {
    return { error: "採点対象のノーツがありません" };
  }
  if (parsed.level === null) {
    return { error: "譜面のLEVEL行が読み取れませんでした" };
  }

  const levelMultiplier = 1 + (parsed.level - 5) * 0.005;
  const totalWeight = parsed.totalWeight;

  let score = 0;
  for (const note of parsed.notes) {
    const comboMultiplier =
      1 + Math.min(Math.floor((note.comboIndex - 1) / 100), 10) * 0.01;

    const activeSkill = activeMarker(
      note.timeMs,
      parsed.skillMarkers,
      (m) => input.skillDurationsSec[m.slot - 1] ?? 0
    );
    const skillPercent = activeSkill ? input.skillPercents[activeSkill.slot - 1] || 0 : 0;
    const skillMultiplier = 1 + skillPercent / 100;

    const feverActive =
      input.feverEnabled &&
      parsed.feverMarker !== null &&
      note.timeMs >= parsed.feverMarker.timeMs &&
      note.timeMs < parsed.feverMarker.timeMs + input.feverDurationSec * 1000;
    const feverMultiplier = feverActive ? FEVER_MULTIPLIER : 1;

    const perNoteScore =
      (input.totalPower / totalWeight) *
      4 *
      note.weight *
      levelMultiplier *
      comboMultiplier *
      skillMultiplier *
      feverMultiplier;
    score += perNoteScore;
  }

  const chartDurationSec =
    parsed.firstNoteTimeMs !== null && parsed.lastNoteTimeMs !== null
      ? (parsed.lastNoteTimeMs - parsed.firstNoteTimeMs) / 1000
      : null;

  return {
    score: Math.round(score),
    noteCount: parsed.notes.length,
    totalWeight,
    level: parsed.level,
    warnings: parsed.warnings,
    chartDurationSec,
    midJudgeCount: parsed.midJudgeCount,
  };
}
