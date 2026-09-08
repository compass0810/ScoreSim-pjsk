import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { password } = req.body as { password?: string };
  const expected = process.env.EDITOR_PASSWORD;

  if (!expected) {
    res.status(500).json({ error: "サーバー側に EDITOR_PASSWORD が未設定です" });
    return;
  }

  if (password !== expected) {
    res.status(401).json({ error: "パスワードが違います" });
    return;
  }

  const maxAge = 60 * 60 * 24 * 30; // 30日
  const secureFlag = process.env.NODE_ENV === "production" ? " Secure;" : "";
  res.setHeader(
    "Set-Cookie",
    `editor_auth=1; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax;${secureFlag}`
  );
  res.status(200).json({ ok: true });
}
