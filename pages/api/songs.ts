import type { NextApiRequest, NextApiResponse } from "next";
import { parseSongsCsv, ParseResult } from "@/lib/csv";

type ApiResponse = ParseResult | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  const url = process.env.SONGS_CSV_URL;

  if (!url) {
    res.status(500).json({ error: "サーバー側の環境変数 SONGS_CSV_URL が未設定です" });
    return;
  }

  let csvText: string;
  try {
    const upstream = await fetch(url, {
      headers: { Accept: "text/csv, text/plain, */*" },
    });
    if (!upstream.ok) {
      res
        .status(502)
        .json({ error: `CSVの取得に失敗しました (HTTP ${upstream.status})` });
      return;
    }
    csvText = await upstream.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `CSVの取得中にエラーが発生しました: ${message}` });
    return;
  }

  try {
    const parsed = parseSongsCsv(csvText);
    res.status(200).json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `CSVの解析中にエラーが発生しました: ${message}` });
  }
}
