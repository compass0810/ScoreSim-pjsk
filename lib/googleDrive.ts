import { JWT } from "google-auth-library";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

let cachedClient: JWT | null = null;

function getClient(): JWT | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) return null;

  if (!cachedClient) {
    cachedClient = new JWT({
      email,
      // Vercelの環境変数には改行がそのまま入れられないことが多いので、
      // "\n" というリテラル文字列を実際の改行に戻す。
      key: rawKey.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
  }
  return cachedClient;
}

async function authHeader(): Promise<{ Authorization: string } | null> {
  const client = getClient();
  if (!client) return null;
  const token = await client.authorize();
  if (!token.access_token) return null;
  return { Authorization: `Bearer ${token.access_token}` };
}

export interface DriveError {
  ok: false;
  error: string;
}

function configError(): DriveError {
  return {
    ok: false,
    error:
      "サーバー側の環境変数 GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY / GOOGLE_DRIVE_FOLDER_ID が未設定です",
  };
}

async function findFileIdByName(
  fileName: string
): Promise<{ ok: true; id: string } | DriveError> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const headers = await authHeader();
  if (!folderId || !headers) return configError();

  const q = encodeURIComponent(
    `'${folderId}' in parents and name = '${fileName.replace(/'/g, "\\'")}' and trashed = false`
  );
  const url = `${DRIVE_API_BASE}/files?q=${q}&fields=files(id,name)`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `Drive API エラー (HTTP ${res.status}): ${body.slice(0, 300)}` };
  }
  const data = (await res.json()) as { files?: { id: string; name: string }[] };
  const files = data.files ?? [];
  if (files.length === 0) {
    return { ok: false, error: `"${fileName}" がフォルダ内に見つかりません` };
  }
  if (files.length > 1) {
    return { ok: false, error: `"${fileName}" に一致するファイルが複数見つかりました` };
  }
  return { ok: true, id: files[0].id };
}

export interface DriveReadResult {
  ok: true;
  content: string;
}

/** ファイル名からフォルダ内を検索し、本文をテキストとして取得する。 */
export async function readChartFromDrive(
  fileName: string
): Promise<DriveReadResult | DriveError> {
  const lookup = await findFileIdByName(fileName);
  if (!lookup.ok) return lookup;

  const headers = await authHeader();
  if (!headers) return configError();

  const res = await fetch(`${DRIVE_API_BASE}/files/${lookup.id}?alt=media`, { headers });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `ファイル本体の取得に失敗しました (HTTP ${res.status}): ${body.slice(0, 300)}` };
  }
  return { ok: true, content: await res.text() };
}

export interface DriveWriteResult {
  ok: true;
}

/** ファイル名からフォルダ内を検索し、本文を新しい内容で上書きする。 */
export async function writeChartToDrive(
  fileName: string,
  content: string
): Promise<DriveWriteResult | DriveError> {
  const lookup = await findFileIdByName(fileName);
  if (!lookup.ok) return lookup;

  const headers = await authHeader();
  if (!headers) return configError();

  const res = await fetch(
    `${DRIVE_UPLOAD_BASE}/files/${lookup.id}?uploadType=media`,
    {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "text/plain; charset=UTF-8" },
      body: content,
    }
  );
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `保存に失敗しました (HTTP ${res.status}): ${body.slice(0, 300)}` };
  }
  return { ok: true };
}
