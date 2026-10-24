# Telegram egress

The Compose configuration gives Egg its own `egg-culture-tunnel`
container and SSH session, on a private `telegram` network. The web container no
longer needs Cinemarr's `media_net`. DE and its Squid remain shared dependencies;
this change isolates application restarts, not a DE outage.

The dedicated subnets are `172.30.240.64/28` (internal) and `172.30.240.80/28`
(egress, gateway priority 1). big-one uses manually managed NAT for 172.16.0.0/12;
Docker-allocated 192.168.* networks cannot reach DE. Both selected subnets were
checked against current networks. Do not change the shared firewall for this service.

The endpoint comes from the server's `config/de-endpoint.json`. The default key
directory is the already-authorized `/home/me/.cinemarr/tunnel`, mounted read-only;
the session forwards only to DE loopback port 3128. No key or persistent volume
is created. Restore that restricted key (or provision an equivalent egress-only
key and set `EGG_TUNNEL_KEYS_DIR`) and its pinned known_hosts before starting.
The existing key is root-owned 0600, so the container uses UID 0, like Cinemarr's
tunnel, with all capabilities dropped and a read-only rootfs and mounts. It has
no host ports, Docker socket, or writable host paths. This does not grant host root.
Reconstruct the container from Git and its image. Kladka's existing volume and
backup coverage are unchanged. A new secret export is needed only if credentials
or the private environment are changed.

Before activation, preserve the running web image ID and Compose configuration.
Build only `telegram-egress`, then recreate only the tunnel and web with the exact
existing web image and `--no-build`; do not include concurrent frontend edits.
Verify the tunnel's API healthcheck and the web's successful polling, using
`getMe`/`getWebhookInfo` without a competing `getUpdates`. Rollback restores the
previous proxy URL/network and the saved web image, then removes only the new
tunnel. Do not recreate Cinemarr or send moderation requests as a smoke test.

Activated 2026-10-24: the exact previous web image was retained, the dedicated
tunnel passed CONNECT/TLS/API checks, and web getMe plus successful polling were
verified through `http://telegram-egress:3128`. The first rollout on Docker's
automatic 192.168.* subnets failed; web was rolled back before pinning the working
subnets above and verifying the final switch. The shared firewall was unchanged.
