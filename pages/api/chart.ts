import type { NextApiRequest, NextApiResponse } from "next";
import { readChartFromDrive } from "@/lib/googleDrive";

type ApiResponse = { content: string } | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

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
}
