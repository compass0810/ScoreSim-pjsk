import { useCallback, useEffect, useRef, useState } from "react";
import { Song } from "@/lib/csv";

type Status =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export function EditorModal({
  song,
  onClose,
}: {
  song: Song;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const contentRef = useRef<string | null>(null);

  // 譜面ファイルの内容をDriveから取得しておき、iframeのロード完了を待って流し込む
  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });
    fetch(`/api/chart?filename=${encodeURIComponent(song.chartFileName)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "読み込みに失敗しました");
        return data.content as string;
      })
      .then((content) => {
        if (cancelled) return;
        contentRef.current = content;
        setStatus({ kind: "ready" });
        postLoadIfReady();
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setStatus({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.chartFileName]);

  const postLoadIfReady = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || contentRef.current === null) return;
    win.postMessage(
      { type: "load-chart", filename: song.chartFileName, content: contentRef.current },
      "*"
    );
  }, [song.chartFileName]);

  // エディタ(iframe)からの保存リクエストを受け取る
  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      if (!e.data || e.data.type !== "save-chart") return;
      const content = e.data.content as string;
      setStatus({ kind: "saving" });
      try {
        const res = await fetch("/api/chart", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: song.chartFileName, content }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "保存に失敗しました");
        setStatus({ kind: "saved" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus({ kind: "error", message });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [song.chartFileName]);

  const statusLabel = (() => {
    switch (status.kind) {
      case "loading":
        return "読込中...";
      case "ready":
        return "準備完了";
      case "saving":
        return "保存中...";
      case "saved":
        return "✓ 保存しました";
      case "error":
        return `⚠ ${status.message}`;
    }
  })();

  return (
    <div className="editor-modal-overlay">
      <div className="editor-modal-header">
        <span className="editor-modal-title">
          {song.title} <span className="mono">{song.chartFileName}</span>
        </span>
        <span
          className={`editor-modal-status ${status.kind === "error" ? "error" : ""}`}
        >
          {statusLabel}
        </span>
        <button className="btn" onClick={onClose}>
          閉じる
        </button>
      </div>
      <iframe
        ref={iframeRef}
        src="/tools/chart-editor.html"
        title="譜面エディタ"
        onLoad={postLoadIfReady}
        className="editor-modal-iframe"
      />
    </div>
  );
}
