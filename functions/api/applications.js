import { handleApplication, json } from "../_shared.js";

export async function onRequestPost(context) {
  return handleApplication(context.request, context.env);
}

export function onRequest() {
  return json({ message: "Method not allowed." }, 405);
}
