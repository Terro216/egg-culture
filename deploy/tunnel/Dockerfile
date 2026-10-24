FROM alpine:3.23@sha256:85fe1e81d6758c208f3e1eed4338a1997e19d4be002d4dd32d3100c9a8c010a0
RUN apk add --no-cache openssh-client curl jq
COPY --chmod=0755 entrypoint.sh healthcheck.sh /
USER 0:0
HEALTHCHECK --interval=60s --timeout=8s --start-period=20s --retries=3 CMD /healthcheck.sh
ENTRYPOINT ["/entrypoint.sh"]
