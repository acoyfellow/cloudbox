export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return json({ ok: true, name: "cloudbox" });
    }
    if (url.pathname === "/computers") {
      return json({ error: "bad_spec", detail: "expected a ComputerSpec body" }, 400);
    }
    if (url.pathname === "/brief") {
      return json({ error: "bad_request", detail: "brief required" }, 400);
    }
    return new Response("not found", { status: 404 });
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
