import type { NextApiRequest, NextApiResponse } from "next";
import { readChartFromDrive, writeChartToDrive } from "@/lib/googleDrive";

type ApiResponse = { content: string } | { ok: true } | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method === "GET") {
    const { filename } = req.query;
    if (typeof filename !== "string" || filename.trim() === "") {
      res.status(400).json({ error: "クエリパラメータ filename が必要です" });
      return;
    }
    const result = await readChartFromDrive(filename);
    if (!result.ok) {
      res.status(502).json({ error: result.error });
      return;
    }
    res.status(200).json({ content: result.content });
    return;
  }

  if (req.method === "PUT") {
    // 書き込みはエディタ専用機能のため、認証Cookieを必須にする
    const authed = req.cookies["editor_auth"] === "1";
    if (!authed) {
      res.status(401).json({ error: "エディタ認証が必要です" });
      return;
    }
    const { filename, content } = req.body as {
      filename?: string;
      content?: string;
    };
    if (!filename || typeof content !== "string") {
      res.status(400).json({ error: "filename と content が必要です" });
      return;
    }
    const result = await writeChartToDrive(filename, content);
    if (!result.ok) {
      res.status(502).json({ error: result.error });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Method Not Allowed" });
}
