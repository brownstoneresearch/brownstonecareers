import { requireAdmin } from "../../_admin-auth.js";
import { getCandidateJourney } from "../../_journey.js";
import { clean, hasWorkforceDb, json } from "../../_workforce-db.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context, "candidate.read");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);
  const id = clean(new URL(context.request.url).searchParams.get("candidateId"), 100);
  if (!id) return json({ message: "Candidate ID is required." }, 400);
  const journey = await getCandidateJourney(context.env, id);
  return journey ? json(journey) : json({ message: "Candidate journey not found." }, 404);
}

export function onRequest() { return json({ message: "Method not allowed." }, 405); }
