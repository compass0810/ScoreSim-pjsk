import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Song, DifficultyKey } from "@/lib/csv";
import { SongCard } from "@/components/SongCard";
import { DIFFICULTY_LABEL } from "@/components/DifficultyBadge";
import { EditorModal } from "@/components/EditorModal";

const STORAGE_KEY = "proseka-score-sim:csv-url";

type SortKey = "id" | "title" | DifficultyKey;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "id", label: "曲ID" },
  { value: "title", label: "曲名" },
  { value: "easy", label: `${DIFFICULTY_LABEL.easy} Lv` },
  { value: "normal", label: `${DIFFICULTY_LABEL.normal} Lv` },
  { value: "hard", label: `${DIFFICULTY_LABEL.hard} Lv` },
  { value: "expert", label: `${DIFFICULTY_LABEL.expert} Lv` },
  { value: "master", label: `${DIFFICULTY_LABEL.master} Lv` },
  { value: "append", label: `${DIFFICULTY_LABEL.append} Lv` },
];

export default function Home() {
  const [csvUrl, setCsvUrl] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [query, setQuery] = useState("");
  const [isEditor, setIsEditor] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);

  // 前回入力したCSV URLを復元
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setCsvUrl(saved);
  }, []);

  // エディタ認証状態を確認(httpOnly Cookieなのでサーバーに聞く)
  const refreshEditorStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/editor-status");
      const data = await res.json();
      setIsEditor(!!data.authed);
    } catch {
      setIsEditor(false);
    }
  }, []);
  useEffect(() => {
    refreshEditorStatus();
  }, [refreshEditorStatus]);

  const logout = useCallback(async () => {
    await fetch("/api/editor-logout", { method: "POST" });
    setIsEditor(false);
  }, []);

  const loadCsv = useCallback(async (url: string) => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/songs?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "取得に失敗しました");
        setSongs([]);
        setWarnings([]);
        return;
      }
      setSongs(data.songs);
      setWarnings(data.warnings ?? []);
      window.localStorage.setItem(STORAGE_KEY, url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`通信エラー: ${message}`);
      setSongs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 保存済みURLがあれば自動で読み込む
  useEffect(() => {
    if (csvUrl) loadCsv(csvUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedSongs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? songs.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.subtitle.toLowerCase().includes(q) ||
            s.id.toLowerCase().includes(q)
        )
      : songs;
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: string | number | null;
      let bv: string | number | null;
      if (sortKey === "id") {
        // 曲IDは数値として比較する(文字列順だと "10" が "2" より前に来てしまうため)
        const an = Number(a.id);
        const bn = Number(b.id);
        av = Number.isFinite(an) ? an : a.id;
        bv = Number.isFinite(bn) ? bn : b.id;
      } else if (sortKey === "title") {
        av = a.title;
        bv = b.title;
      } else {
        av = a.levels[sortKey];
        bv = b.levels[sortKey];
      }
      // レベル未設定(null)は常に末尾へ
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [songs, sortKey, sortDir, query]);

  return (
    <div className="page">
      <Head>
        <title>楽曲を選択 | プロセカ譜面スコアシミュレーター</title>
      </Head>
      <div className="page-header">
        <h1>プロセカ譜面スコアシミュレーター</h1>
        <div className="header-links">
          <Link href="/guide">使い方</Link>
        </div>
      </div>

      <div className="csv-bar">
        <input
          type="text"
          placeholder="楽曲一覧CSVのURL(公開済みGoogleスプレッドシートのCSVリンクなど)"
          value={csvUrl}
          onChange={(e) => setCsvUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") loadCsv(csvUrl);
          }}
        />
        <button className="btn" onClick={() => loadCsv(csvUrl)} disabled={loading}>
          {loading ? "読込中..." : "読み込む"}
        </button>
      </div>

      {error && <div className="status-line error">⚠ {error}</div>}

      {warnings.length > 0 && (
        <div className="warnings">
          {warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}

      {songs.length > 0 && (
        <>
          <div className="sort-bar">
            <input
              type="text"
              className="search-input"
              placeholder="曲名・サブタイトルで検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span>並べ替え:</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              className="btn"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            >
              {sortDir === "asc" ? "昇順 ↑" : "降順 ↓"}
            </button>
            <span className="status-line" style={{ margin: 0 }}>
              {sortedSongs.length}曲 / 全{songs.length}曲
            </span>
          </div>

          <div className="song-list">
            {sortedSongs.map((song) => (
              <SongCard
                key={song.id}
                song={song}
                isEditor={isEditor}
                onEdit={(s) => setEditingSong(s)}
              />
            ))}
          </div>
        </>
      )}

      {!loading && songs.length === 0 && !error && (
        <div className="status-line">
          CSVのURLを入力して「読み込む」を押してください。
        </div>
      )}

      <div className="footer-link">
        {isEditor ? (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              logout();
            }}
          >
            editor: on (ログアウト)
          </a>
        ) : (
          <a href="/editor-login">edit</a>
        )}
      </div>

      {editingSong && (
        <EditorModal song={editingSong} onClose={() => setEditingSong(null)} />
      )}
    </div>
  );
}
