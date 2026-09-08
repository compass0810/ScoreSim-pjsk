import { useState } from "react";
import { useRouter } from "next/router";

export default function EditorLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/editor-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "ログインに失敗しました");
        return;
      }
      const next =
        typeof router.query.next === "string" ? router.query.next : "/";
      window.location.href = next;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`通信エラー: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 360 }}>
      <div className="page-header">
        <h1>エディタへのアクセス</h1>
      </div>
      <div className="csv-bar" style={{ flexDirection: "column" }}>
        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ width: "100%" }}
        />
        <button className="btn" onClick={submit} disabled={loading}>
          {loading ? "確認中..." : "入る"}
        </button>
      </div>
      {error && <div className="status-line error">⚠ {error}</div>}
    </div>
  );
}
