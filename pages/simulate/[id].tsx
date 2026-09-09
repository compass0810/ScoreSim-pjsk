import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { calcApScore } from "@/lib/scoreCalc";
import { DIFFICULTY_LABEL, DIFFICULTY_COLOR } from "@/components/DifficultyBadge";
import type { DifficultyKey } from "@/lib/csv";

const SKILL_COUNT = 6;

export default function Simulate() {
  const router = useRouter();
  const { title, subtitle, chartFileName, difficulty, level } = router.query as {
    id?: string;
    title?: string;
    subtitle?: string;
    chartFileName?: string;
    difficulty?: DifficultyKey;
    level?: string;
  };

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [chartText, setChartText] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalPower, setTotalPower] = useState(300000);
  const [skillPercents, setSkillPercents] = useState<number[]>(
    Array(SKILL_COUNT).fill(40)
  );
  const [skillDurations, setSkillDurations] = useState<number[]>(
    Array(SKILL_COUNT).fill(5)
  );
  const [feverEnabled, setFeverEnabled] = useState(false);
  const [feverDuration, setFeverDuration] = useState(25);

  // 譜面txtをDriveから取得
  useEffect(() => {
    if (!chartFileName) return;
    setChartText(null);
    setLoadError(null);
    fetch(`/api/chart?filename=${encodeURIComponent(chartFileName)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "読み込みに失敗しました");
        return data.content as string;
      })
      .then(setChartText)
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setLoadError(message);
      });
  }, [chartFileName]);

  const postLoadIfReady = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || chartText === null || !difficulty) return;
    win.postMessage(
      {
        type: "load-chart",
        filename: chartFileName,
        content: chartText,
        courseName: DIFFICULTY_LABEL[difficulty],
      },
      "*"
    );
  }, [chartText, chartFileName, difficulty]);

  useEffect(() => {
    postLoadIfReady();
  }, [postLoadIfReady]);

  const result =
    chartText !== null && difficulty
      ? calcApScore({
          chartText,
          courseName: DIFFICULTY_LABEL[difficulty],
          totalPower,
          skillPercents: skillPercents as [number, number, number, number, number, number],
          skillDurationsSec: skillDurations as [
            number,
            number,
            number,
            number,
            number,
            number
          ],
          feverEnabled,
          feverDurationSec: feverDuration,
        })
      : null;

  const diffColor = difficulty ? DIFFICULTY_COLOR[difficulty] : "#888";
  const chartDurationSec =
    result && !("error" in result) ? result.chartDurationSec : null;

  return (
    <div className="sim-layout">
      <Head>
        <title>
          {title ? `${title} ` : ""}
          {difficulty ? DIFFICULTY_LABEL[difficulty] : ""} スコアシミュレート | プロセカ譜面スコアシミュレーター
        </title>
      </Head>
      <div className="sim-left">
        <div className="sim-header">
          <button className="btn" onClick={() => router.push("/")}>
            ← 一覧に戻る
          </button>
          <div className="sim-song-title">
            <span className="diff-chip" style={{ background: diffColor }}>
              {difficulty ? DIFFICULTY_LABEL[difficulty] : ""} Lv.{level}
            </span>
            <span>
              {title}
              {subtitle ? ` / ${subtitle}` : ""}
            </span>
          </div>
        </div>

        {loadError && <div className="status-line error">⚠ {loadError}</div>}
        {!chartFileName && (
          <div className="status-line error">
            この曲には譜面ファイルが設定されていません
          </div>
        )}

        <div className="sim-form">
          <label className="sim-field">
            <span>総合力</span>
            <input
              type="number"
              value={totalPower}
              onChange={(e) => setTotalPower(Number(e.target.value) || 0)}
            />
          </label>

          <div className="sim-skill-table">
            <div className="sim-skill-header">
              <span />
              <span>%アップ</span>
              <span>効果秒数</span>
            </div>
            {skillPercents.map((v, i) => (
              <div className="sim-skill-row" key={i}>
                <span>SKILL{i + 1}</span>
                <input
                  type="number"
                  value={v}
                  onChange={(e) => {
                    const next = [...skillPercents];
                    next[i] = Number(e.target.value) || 0;
                    setSkillPercents(next);
                  }}
                />
                <span className="unit-input">
                  <input
                    type="number"
                    value={skillDurations[i]}
                    onChange={(e) => {
                      const next = [...skillDurations];
                      next[i] = Number(e.target.value) || 0;
                      setSkillDurations(next);
                    }}
                  />
                  <span className="unit">秒</span>
                </span>
              </div>
            ))}
          </div>

          <div className="fever-block">
            <label className="sim-field checkbox">
              <input
                type="checkbox"
                checked={feverEnabled}
                onChange={(e) => setFeverEnabled(e.target.checked)}
              />
              <span>FEVERあり (+50%固定)</span>
            </label>
            <label className="sim-field small">
              <span>効果秒数</span>
              <input
                type="number"
                value={feverDuration}
                onChange={(e) => setFeverDuration(Number(e.target.value) || 0)}
                disabled={!feverEnabled}
              />
              <span className="unit">秒</span>
            </label>
            {chartDurationSec !== null && (
              <div className="fever-reference">
                参考: 曲時間(最初〜最後のノーツ) 約{chartDurationSec.toFixed(1)}秒 /
                その1/12 = 約{(chartDurationSec / 12).toFixed(1)}秒
              </div>
            )}
          </div>
        </div>

        <div className="sim-result">
          {result && "error" in result && (
            <div className="status-line error">⚠ {result.error}</div>
          )}
          {result && !("error" in result) && (
            <>
              <div className="sim-score">{result.score.toLocaleString()}</div>
              <div className="sim-score-label">ALL PERFECT想定スコア</div>
              <div className="sim-sub-stats">
                <span>ノーツ数: {result.noteCount} (うち中間判定 {result.midJudgeCount})</span>
                <span>重み合計: {result.totalWeight.toFixed(1)}</span>
                <span>譜面Lv: {result.level}</span>
              </div>
              {result.warnings.length > 0 && (
                <div className="warnings" style={{ marginTop: 10 }}>
                  {result.warnings.map((w, i) => (
                    <div key={i}>⚠ {w}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="sim-note">
          判定によるスコア倍率(常にPERFECT扱い)とライフ0時のペナルティは考慮していません。
          SKILL・FEVERはそれぞれのマーカー時点から、入力した効果秒数のあいだだけ
          スコアに反映されます(範囲が重なる場合は、より後に開始した方を優先します)。
        </div>
      </div>

      <div className="sim-right">
        {chartFileName && (
          <iframe
            ref={iframeRef}
            src="/viewer.html"
            title="譜面ビューアー"
            onLoad={postLoadIfReady}
            className="sim-iframe"
          />
        )}
      </div>
    </div>
  );
}
