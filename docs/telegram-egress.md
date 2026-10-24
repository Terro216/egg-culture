# Telegram egress

Activated 2026-10-24: the exact previous web image was retained, the dedicated
tunnel passed CONNECT/TLS/API checks, and web getMe plus successful polling were
verified through `http://telegram-egress:3128`. The first rollout on Docker's
automatic 192.168.* subnets failed; web was rolled back before pinning the working
subnets above and verifying the final switch. The shared firewall was unchanged.
