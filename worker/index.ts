import handler from "vinext/server/app-router-entry";

export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    return handler.fetch(request, env as never, ctx as never);
  },
};
