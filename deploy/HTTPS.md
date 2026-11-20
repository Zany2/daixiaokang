# Shared gateway HTTPS and RAGFlow

## Server layout

Run deployment commands from `/daixk/components`. The certificate service is
`acme`; the Nginx service and container are `gateway`. Both `gateway` and the
separately deployed `ragflow` join `mynetwork`.

The certificate covers `daixiaokang.com`, `api.daixiaokang.com`,
`vantage.daixiaokang.com` and `ragflow.daixiaokang.com`. Existing certificates
require one explicit `issue` action to register the expanded domain list.
The scheduler checks renewal at startup and daily at 03:15 Asia/Shanghai.

Issuance uses `--dnssleep 300` by default. This waits five minutes after TXT
creation instead of probing Cloudflare/Google public DNS over HTTPS. It does
not bypass the CA's DNS verification. Override `ACME_DNS_SLEEP` in the server
environment if a longer propagation interval is needed. The chosen value is
passed to acme.sh and retained in its domain renewal configuration.

## Private files

`deploy/https.env` stores the DNSPod credentials and account email.
`deploy/acme/` stores account keys, DNS credentials and renewal state.
`gateway/ssl/` stores installed certificates and private keys.
`gateway/logs/` stores gateway logs. These paths are ignored by Git; keep the
credential values in `https.env.example` empty.

Preserve the existing server `deploy/https.env`, `deploy/acme/`, and
`gateway/ssl/`. Do not upload downloaded account state over the live state or
delete these directories when adding a domain. The image build context is
restricted by `.dockerignore` to the Dockerfile and certificate script.

## Add the domain

1. Add a DNSPod A record: `ragflow` -> `134.175.50.80`.
2. Upload the updated `acme-container.sh` to
   `/daixk/components/deploy/acme-container.sh`.
3. Run these commands on the server one at a time, continuing only on success:

```bash
cd /daixk/components
docker compose config --quiet
docker compose build acme
docker compose run --rm --no-deps acme issue
docker compose up -d --no-deps --force-recreate acme
docker compose run --rm --no-deps acme status
```

The SAN output must include `DNS:ragflow.daixiaokang.com` and all three previous
domains. The wrapper checks the source certificate's SANs before installing it,
including when acme.sh reports that issuance was skipped. Successful installation
checks and reloads `gateway` automatically.
If a command fails, inspect the reported error before continuing.

The Dockerfile copies the script into the image, so rebuilding and recreating
`acme` is required. Restarting the existing container does not update the script.
Do not force ordinary issuance or renewal. Other components need no restart.

If a failed expansion saved the new order domains but retained the old
certificate, a subsequent `issue` can return "Domains not changed" and skip.
The wrapper now rejects that stale certificate before installation. For this
specific recovery, upload the updated script and run each command separately:

```bash
cd /daixk/components
docker compose build acme
docker compose run --rm --no-deps acme issue-force
```

Allow the TXT propagation wait and issuance to finish. Only after success:

```bash
docker compose up -d --no-deps --force-recreate acme
docker compose run --rm --no-deps acme status
```

`issue-force` explicitly passes `--force` for one order; it does not change the
automatic scheduler. Do not loop forced orders on failures. Never delete the
account or certificate directories to reset an order.

## Enable the HTTPS virtual host

After the certificate check succeeds, upload `ragflow.nginx.conf.example` as
`/daixk/components/gateway/conf.d/ragflow.conf`. Replace an existing HTTP-only
RAGFlow configuration rather than leaving duplicate virtual hosts on port 80.
The components Compose already mounts this directory into Nginx.

The template forwards the entire site and its API to `http://ragflow:80` using
Docker DNS. It preserves the public host and scheme and disables response
buffering for streamed chat. The request-body limit is 256 MB; application
limits may be smaller.

Check the server configuration:

```bash
docker exec gateway nginx -t
```

Only after that succeeds:

```bash
docker exec gateway nginx -s reload
curl -I https://ragflow.daixiaokang.com/
```

Open the HTTPS domain, sign in, test uploads and streamed chat, and confirm
browser `/api/v1/` requests use the same HTTPS domain. Once verified, optionally
restrict the RAGFlow host mapping to `127.0.0.1:8011:80` and run
`docker compose up -d --no-deps ragflow` from `/daixk/project/ragflow`.
Gateway traffic uses the container port and does not depend on host port 8011.
No additional Docker network is required.

## DNS verification failures

If TXT creation succeeds but the CA reports NXDOMAIN, first check authoritative
DNS visibility and allow for propagation or cached negative answers. A
successful API write does not prove the CA can already see the record. The
public DNS precheck may also encounter TLS errors or timeouts from the server.
The default fixed propagation wait avoids depending on those prechecks.

After stopping the failed command and uploading the updated script, rebuild
`acme` and retry `issue` once. Wait for `issue` to finish successfully before
recreating the scheduler or enabling the new HTTPS virtual host. Do not delete
the existing certificate or account directory. If NXDOMAIN persists after the
wait, inspect the TXT record on both DNSPod authoritative servers during the
next validation window; increasing the wait alone cannot fix an incorrect zone,
record name, split DNS line or challenge delegation.

## Offline verification

Run `python -m unittest discover -s deploy/tests -v` with Python 3.10+ and a
POSIX shell with OpenSSL. Tests mock ACME and Docker, create temporary self-signed
certificate fixtures, and verify the four domains, stale-certificate rejection,
explicit recovery, gateway reload ordering, failure recovery, locking and scheduling. They do not contact
DNSPod or issue certificates. Live signing and Nginx checks run on the server.
