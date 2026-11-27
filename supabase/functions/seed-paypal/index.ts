Deno.serve(() => new Response(JSON.stringify({ error: "Legacy seed endpoint retired" }), { status: 410, headers: { "Content-Type": "application/json" } }));
