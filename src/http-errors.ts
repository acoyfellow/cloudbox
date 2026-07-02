export function jsonError(c: any, status: number, code: string, detail: string): Response {
  return c.json({ error: code, detail }, status);
}

export function jsonErrorResponse(status: number, code: string, detail: string): Response {
  return new Response(JSON.stringify({ error: code, detail }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
