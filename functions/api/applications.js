import { handleApplication } from "../_shared.js";

export async function onRequestPost(context) {
  try {
    return await handleApplication(context.request, context.env);
  } catch (error) {
    console.error("Application route error", error);
    return Response.json({ message: "A server error occurred. Please try again." }, { status: 500 });
  }
}

export function onRequest() {
  return Response.json({ message: "Method not allowed." }, { status: 405, headers: { Allow: "POST" } });
}
