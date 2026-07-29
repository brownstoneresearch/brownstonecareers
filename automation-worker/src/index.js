import { runAutopilot } from "../../functions/_autopilot.js";
export default {
  async scheduled(_event, env, ctx) { ctx.waitUntil(runAutopilot(env, { limit: 100 })); },
  async fetch(request, env) {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
    if (!env.AUTOMATION_RUNNER_SECRET || token !== env.AUTOMATION_RUNNER_SECRET) return new Response('Unauthorized',{status:401});
    return Response.json(await runAutopilot(env,{limit:100}));
  }
};
