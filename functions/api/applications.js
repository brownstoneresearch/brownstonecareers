import { handleApplication } from "../_shared.js";

export async function onRequestPost(context) {
  try {
    return await handleApplication(context.request, context.env);
  } catch (error) {
    const incident = crypto.randomUUID().slice(0, 8).toUpperCase();
    console.error("Application route error", { incident, name: error?.name, message: error?.message, stack: error?.stack });
    return new Response(JSON.stringify({
      message: "A server error occurred. Please try again.",
      incident,
    }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
}

export function onRequest() {
  return Response.json({ message: "Method not allowed." }, { status: 405, headers: { Allow: "POST" } });
}
