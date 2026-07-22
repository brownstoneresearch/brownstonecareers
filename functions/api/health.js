import { health, json } from "../_shared.js";

export function onRequestGet(context) {
  return health(context.env);
}

export function onRequest() {
  return json({ message: "Method not allowed." }, 405);
}
