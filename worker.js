// Worker de Bitácora Apócrifa
// Sirve el HTML estático (PWA) y expone la API de sincronización de notas

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Todas las rutas /api/* se manejan acá. El resto lo sirve el binding de assets.
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }

    // Si no es /api/*, Cloudflare sirve el archivo estático automáticamente
    // gracias al binding "assets" en wrangler.jsonc
    return env.ASSETS.fetch(request);
  },
};

async function handleApi(request, env, url) {
  // --- Autenticación simple por passcode ---
  const passcode = request.headers.get("X-Passcode");
  if (!passcode || passcode !== env.PASSCODE) {
    return json({ error: "No autorizado" }, 401);
  }

  const parts = url.pathname.split("/").filter(Boolean); // ["api", "notas", ":id?"]

  // GET /api/notas -> trae todas las notas
  if (request.method === "GET" && parts[1] === "notas" && !parts[2]) {
    const { results } = await env.DB.prepare(
      "SELECT id, contenido, updated_at, created_at FROM notas ORDER BY updated_at DESC"
    ).all();
    return json({ notas: results });
  }

  // POST /api/notas -> crea o actualiza una nota (upsert)
  if (request.method === "POST" && parts[1] === "notas" && !parts[2]) {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "JSON inválido" }, 400);
    }

    const { id, contenido } = body;
    if (!id || contenido === undefined) {
      return json({ error: "Faltan campos: id y contenido son requeridos" }, 400);
    }

    const now = Date.now();

    // Upsert: si existe, actualiza solo si la versión entrante es más nueva
    const existing = await env.DB.prepare(
      "SELECT updated_at FROM notas WHERE id = ?"
    ).bind(id).first();

    if (existing) {
      // gana la última edición
      const incomingUpdatedAt = body.updated_at || now;
      if (incomingUpdatedAt < existing.updated_at) {
        // la que está en el server es más nueva, no se pisa
        return json({ status: "conflict_kept_server_version" });
      }
      await env.DB.prepare(
        "UPDATE notas SET contenido = ?, updated_at = ? WHERE id = ?"
      ).bind(JSON.stringify(contenido), incomingUpdatedAt, id).run();
    } else {
      await env.DB.prepare(
        "INSERT INTO notas (id, contenido, updated_at, created_at) VALUES (?, ?, ?, ?)"
      ).bind(id, JSON.stringify(contenido), body.updated_at || now, now).run();
    }

    return json({ status: "ok" });
  }

  // DELETE /api/notas/:id
  if (request.method === "DELETE" && parts[1] === "notas" && parts[2]) {
    const id = parts[2];
    await env.DB.prepare("DELETE FROM notas WHERE id = ?").bind(id).run();
    return json({ status: "deleted" });
  }

  return json({ error: "Ruta no encontrada" }, 404);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
