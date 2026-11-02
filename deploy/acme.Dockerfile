FROM neilpang/acme.sh:latest

# acme.sh supplies DNS validation and OpenSSL. Add scheduling and Nginx reload tools.
# Keep the base image's Alpine release and repository branches when switching mirrors.
RUN sed -i 's#dl-cdn\.alpinelinux\.org#mirrors.aliyun.com#g' /etc/apk/repositories \
    && apk add --no-cache docker-cli util-linux tzdata supercronic \
    && command -v acme.sh && command -v flock && command -v supercronic

ENV AUTO_UPGRADE=0 TZ=Asia/Shanghai
COPY acme-container.sh /opt/https/acme-container.sh
ENTRYPOINT ["sh", "/opt/https/acme-container.sh"]
CMD ["daemon"]
