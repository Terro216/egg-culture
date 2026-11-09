import type { APIContext } from "astro";
import { getApprovedPosts, visibleKladkaEntries } from "../shared/utils/kladkaStore.ts";
import { sessionRoadPlayer } from "./roadHttp.ts";
import { roadRecordStore } from "./roadRecords.ts";
import type { KladkaReactionFeed } from "../shared/kladkaReactions.ts";

export async function kladkaFeed(context: Pick<APIContext, "cookies">) {
  const approved = await getApprovedPosts(100);
  const player = sessionRoadPlayer(context as APIContext), store = roadRecordStore();
  const adept = player ? store.initiated(player) : context.cookies.get("egg_guest_initiated")?.value === "1";
  const posts = visibleKladkaEntries(approved, adept);
  const reactions: KladkaReactionFeed = {
    entries: store.reactionSummaries(posts.filter(post => !post.locked).map(post => post.id), player),
    access: store.reactionAccess(player),
    account: player ? store.account(player).name : null,
  };
  return { posts, reactions };
}
