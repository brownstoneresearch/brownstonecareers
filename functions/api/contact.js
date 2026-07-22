import { handleContact, json } from "../_shared.js";

export async function onRequestPost(context) {
  return handleContact(context.request, context.env);
}

export function onRequest() {
  return json({ message: "Method not allowed." }, 405);
}
