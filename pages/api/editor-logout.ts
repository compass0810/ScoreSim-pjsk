import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader(
    "Set-Cookie",
    "editor_auth=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax;"
  );
  res.status(200).json({ ok: true });
}
