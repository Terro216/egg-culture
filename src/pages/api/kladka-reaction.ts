import type { APIRoute } from "astro";
import { checkRoadWrite, sessionRoadPlayer, roadJson } from "../../server/roadHttp.ts";
import { roadRecordStore } from "../../server/roadRecords.ts";
import { reactionNetwork, KladkaReactionError } from "../../server/kladkaReactions.ts";
import { allowRequestAttempt, readJsonObject, RequestBodyError } from "../../server/requestBody.ts";
import { getPost, postVisibility } from "../../shared/utils/kladkaStore.ts";
import { isKladkaReaction } from "../../shared/kladkaReactions.ts";

export const prerender = false;
export const POST: APIRoute = async context => {
  const denied = checkRoadWrite(context); if (denied) return denied;
  try {
    const network = reactionNetwork(context.request, context.clientAddress);
    if (!allowRequestAttempt(`kladka-reactions:${network}`, 120)) throw new KladkaReactionError("rate_limit", 429, 60);
    if (!sessionRoadPlayer(context)) return roadJson({ error: "login" }, 401);
    const body = await readJsonObject(context.request, 1024);
    const multiple = Object.hasOwn(body, "selected");
    if (Object.keys(body).sort().join(",") !== (multiple ? "account,post,reaction,selected" : "account,post,reaction") || typeof body.post !== "string"
      || !/^[a-f0-9-]{1,64}$/.test(body.post) || typeof body.account !== "string" || body.account.length > 64
      || (multiple ? !isKladkaReaction(body.reaction) || typeof body.selected !== "boolean"
        : body.reaction !== null && !isKladkaReaction(body.reaction))) return roadJson({ error: "invalid_body" }, 400);
    const post = await getPost(body.post);
    // Recheck the session after I/O; a logout/account switch must not receive an old write.
    const player = sessionRoadPlayer(context), store = roadRecordStore();
    if (!player) return roadJson({ error: "login" }, 401);
    if (store.account(player).name !== body.account) return roadJson({ error: "account_changed" }, 409);
    if (!post || post.status !== "approved" || (postVisibility(post) === "adepts" && !store.initiated(player))) return roadJson({ error: "not_found" }, 404);
    try {
      const summary = multiple && isKladkaReaction(body.reaction)
        ? store.selectReaction(post.id, player, body.reaction, body.selected as boolean, network)
        : store.setReaction(post.id, player, body.reaction as Parameters<typeof store.setReaction>[2], network);
      return roadJson({ summary });
    } catch (error) {
      if (error instanceof KladkaReactionError && error.code === "reaction_limit") {
        return roadJson({ error: error.code, summary: store.reactionSummaries([post.id], player)[post.id] }, error.status);
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof RequestBodyError) return roadJson({ error: error.code }, error.status);
    if (error instanceof KladkaReactionError) {
      const response = roadJson({ error: error.code, retryAfter: error.retryAfter }, error.status);
      if (error.retryAfter) response.headers.set("Retry-After", String(error.retryAfter));
      return response;
    }
    return roadJson({ error: "unavailable" }, 503);
  }
};
