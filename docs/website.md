# Website

The project website is a static page in `site/`: `index.html`, `styles.css`, real dashboard
screenshots in `site/assets/` (the sample project `tests/fixtures/storefront`) and the favicon. It
has no build step, no JavaScript and no third-party resources, so any web server can host it.
`tests/unit/site.test.ts` keeps it that way (local files only, no scripts, alt text on every
image, version matching `package.json`).

**Preview:** open `site/index.html` in a browser.

## The project's server (deptrace.sarthxkz.in)

The site is hosted on the Oracle Cloud VM `161.153.37.106`, next to the other `sarthxkz.in` sites.
That VM runs Caddy in Docker (`vybe-caddy-1`, from `~/vybe/deploy`). Caddy owns ports 80 and 443,
imports one `*.caddy` file per site from `~/vybe/deploy/sites/`, and obtains HTTPS certificates
itself. Nginx is not used there.

| What               | Where                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------- |
| Site configuration | `deploy/caddy/deptrace.caddy` here → `~/vybe/deploy/sites/deptrace.caddy` there         |
| Site files         | `site/` here → `~/vybe/deploy/public/deptrace/` there (`/srv/public/deptrace` in Caddy) |
| DNS (Cloudflare)   | `A` record `deptrace` → `161.153.37.106`                                                |

Deploy or update, from the repository (Git Bash):

```sh
ssh sarthak@161.153.37.106 'mkdir -p ~/vybe/deploy/public/deptrace'
tar -C site -cf - . | ssh sarthak@161.153.37.106 'tar -C ~/vybe/deploy/public/deptrace --no-same-owner -xf -'
ssh sarthak@161.153.37.106 'cat > ~/vybe/deploy/sites/deptrace.caddy' < deploy/caddy/deptrace.caddy
ssh sarthak@161.153.37.106 'docker exec vybe-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile'
ssh sarthak@161.153.37.106 'docker exec vybe-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile'
```

Content-only updates (just `site/`) need only the `tar` line; Caddy serves the new files at once.
`caddy reload` is graceful: it applies a configuration only if the configuration is valid, and the
other sites keep running. Add `-i ~/.ssh/<key>` to each command if the key is not your default.

**Roll back:** delete `~/vybe/deploy/sites/deptrace.caddy` (and `~/vybe/deploy/public/deptrace`),
then run the `caddy reload` line.

## Hosting on another server with nginx

The steps below are for a server without an existing reverse proxy.

These steps use nginx and Let's Encrypt. Replace `example.com`, `<user>` and `<server-ip>` with your
own values. They have not been run against your server; check each step's output.

### 1. Point the domain at the server

At your DNS provider, create an `A` record for `example.com` (and `www.example.com`) with the
server's public IP address. Add an `AAAA` record only if the instance has a public IPv6 address.

### 2. Open ports 80 and 443

- **Oracle Cloud console.** In the instance's subnet, open the VCN **security list** (or the
  network security group the instance uses). Add ingress rules for TCP **80** and **443** from
  `0.0.0.0/0`.
- **The server's own firewall** also blocks them by default on Oracle's images:
  - Ubuntu (iptables rules):
    ```sh
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
    sudo netfilter-persistent save
    ```
  - Oracle Linux (firewalld):
    ```sh
    sudo firewall-cmd --permanent --add-service=http --add-service=https
    sudo firewall-cmd --reload
    ```

### 3. Install nginx and the site configuration

```sh
# Ubuntu
sudo apt update && sudo apt install -y nginx
# Oracle Linux
sudo dnf install -y nginx && sudo systemctl enable --now nginx

sudo mkdir -p /var/www/deptrace
sudo chown "$USER" /var/www/deptrace
```

Copy `deploy/nginx/deptrace-site.conf` to the server, replace `example.com` in it, and install it:

```sh
# Ubuntu
sudo cp deptrace-site.conf /etc/nginx/sites-available/deptrace
sudo ln -s /etc/nginx/sites-available/deptrace /etc/nginx/sites-enabled/deptrace
sudo rm -f /etc/nginx/sites-enabled/default
# Oracle Linux
sudo cp deptrace-site.conf /etc/nginx/conf.d/deptrace.conf

sudo nginx -t && sudo systemctl reload nginx
```

### 4. Upload the site

From your computer, in the repository (PowerShell and Git Bash both have `scp`):

```sh
scp -r site/. <user>@<server-ip>:/var/www/deptrace/
```

`scp` does not delete files you removed locally. To replace the site exactly, run
`rm -rf /var/www/deptrace/*` on the server before uploading.

On **Oracle Linux**, SELinux must allow nginx to read the files, or every page returns 403:

```sh
sudo restorecon -Rv /var/www/deptrace
```

Check the site at `http://example.com` before continuing.

### 5. Enable HTTPS

```sh
# Ubuntu
sudo apt install -y certbot python3-certbot-nginx
# Oracle Linux: install certbot and its nginx plugin from EPEL (or snap), then:
sudo certbot --nginx -d example.com -d www.example.com
sudo certbot renew --dry-run      # confirms automatic renewal works
```

Certbot adds the HTTPS server block and the HTTP-to-HTTPS redirect to the configuration. Once
`https://example.com` works for every name, uncomment the `Strict-Transport-Security` line in the
configuration and reload nginx.

### 6. Verify

```sh
curl -sI https://example.com | head -n 20
```

Expect `HTTP/2 200` (or `HTTP/1.1 200`) and the `Content-Security-Policy`, `X-Content-Type-Options`
and `Referrer-Policy` headers.

## Updating and rolling back

- **Update:** edit `site/`, preview locally, run the tests, then repeat step 4.
- **Roll back:** check out the previous version of `site/` (`git checkout <commit> -- site`) and
  upload it again.
- **New release:** the page shows the version in two places (the install card and the footer).
  `tests/unit/site.test.ts` fails until both match `package.json`. Refresh the screenshots when
  the dashboard changes visibly.
