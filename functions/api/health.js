import { health } from "../_shared.js";

export function onRequestGet(context) {
  return health(context.env);
}

export function onRequest() {
  return Response.json({ message: "Method not allowed." }, { status: 405, headers: { Allow: "GET" } });
}
