# Jeristotle Productions self-hosting

The production website is deployed on the connected persistent cloud computer at **<server-ip>**.

Nginx accepts public HTTP traffic and proxies the website and API to a dedicated Node.js service listening only on `127.0.0.1:3100`.

## Deployment architecture

| Component           | Configuration                                     |
| ------------------- | ------------------------------------------------- |
| Public web server   | Nginx on TCP port 80                              |
| Application service | `jeristotle-productions.service`                  |
| Application runtime | Node.js 22 LTS                                    |
| Application release | `/opt/jeristotle-productions/current`             |
| Persistent leads    | `/var/lib/jeristotle-productions/inquiries.jsonl` |
| Service identity    | Dedicated `jeristotle` system user                |
| Health endpoint     | `/api/health`                                     |

The public form uses the same typed tRPC contract as the managed version.

On this self-hosted deployment, submissions are written to a protected local JSONL file with `0600` permissions before any email is attempted. The managed Manus database, OAuth, file storage, and notification service are not required at runtime. Website images are packaged into the local release.

## Branded inquiry email

When Gmail SMTP is configured, every saved inquiry also produces a responsive black-and-gold HTML email. The message includes the prospect, business, project type, promotion goal, investment, timeline, goals, source, a direct email action, phone link, and consultation-calendar link. A plain-text version is included for accessibility and email-client compatibility. The application fixes both the sender and recipient to `jeremy@jeristotleproductions.com`; form submissions use the prospect's address only as `Reply-To`.

Create `/etc/jeristotle-productions.env` as a root-owned file with mode `0600`.

| Key                  | Purpose                                                    |
| -------------------- | ---------------------------------------------------------- |
| `GMAIL_APP_PASSWORD` | Google App Password for `jeremy@jeristotleproductions.com` |
| `SMTP_HOST`          | Optional override; defaults to `smtp.gmail.com`            |
| `SMTP_PORT`          | Optional override; defaults to secure port `465`           |
| `SMTP_SECURE`        | Optional override; defaults to secure mode                 |

`GMAIL_APP_PASSWORD` must be a Google App Password rather than the regular account password. Do not place the normal Google account password in this file.

Restart the service after adding credentials:

```bash
sudo systemctl restart jeristotle-productions
```

## Operations

Use `sudo systemctl status jeristotle-productions` to inspect the service.

Use `sudo journalctl -u jeristotle-productions -n 100 --no-pager` to review logs.

Restart the application with `sudo systemctl restart jeristotle-productions`.

Validate Nginx with `sudo nginx -t`.

Check the local application with `curl --fail http://127.0.0.1:3100/api/health`.

Review the latest leads with:

```bash
sudo -u jeristotle tail -n 20 /var/lib/jeristotle-productions/inquiries.jsonl
```

The lead file must remain outside the public website directory. Back it up before replacing or migrating the server.

## Domain and HTTPS

The domain did not resolve during deployment.

Create an **A record** for `jeristotleproductions.com` pointing to `<server-ip>`. Create either another A record or a CNAME for `www.jeristotleproductions.com`.

Once DNS resolves publicly, install a trusted TLS certificate with Certbot and open TCP port 443. Keep port 443 closed until HTTPS is configured.
