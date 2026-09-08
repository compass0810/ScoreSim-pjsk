import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ authed: boolean }>
) {
  const authed = req.cookies["editor_auth"] === "1";
  res.status(200).json({ authed });
}
