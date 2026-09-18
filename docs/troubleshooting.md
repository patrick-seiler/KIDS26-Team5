# Troubleshooting

## I cannot clone the repository

Check that the repository URL is correct and that you have been added as a collaborator. If the repository is private, sign in to the correct GitHub account. The [GitHub cloning guide](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository) and [GitHub Desktop guide](https://docs.github.com/en/desktop/overview/getting-started-with-github-desktop) cover the two supported paths.

## Git asks for a password

GitHub no longer accepts account passwords for Git operations over HTTPS. Use GitHub Desktop or follow GitHub's [authentication guidance](https://docs.github.com/en/authentication).

## My branch is behind

Save your work, switch to the default branch, pull the latest changes, and then return to your branch. Ask a teammate before resolving a conflict if you are unsure which version should remain.

## A command or tool is missing

Record the exact command, your operating system, and the full error message. Ask Copilot to explain the error without sharing credentials or private data. Check the project's Tools and stack section in the README before installing anything.

## My data is too large or sensitive for Git

Do not commit it. Check whether it can be shared at all, record where it is stored and how it was obtained, and add a small README describing the expected file or download step without including the data itself.

## docker compose up --build fails with ResourceExhausted: ... no space left on device

This is Docker Desktop's own virtual disk filling up — it's separate from your
Mac's actual free disk space, so `df -h` on the host can show plenty of room
while Docker is still full. Work through these in order:

1. **Check what Docker thinks it's using:**
   ```bash
   docker system df
   ```
2. **Clear the build cache first** — almost always the biggest offender, and
   always safe to delete (just gets rebuilt on the next build):
   ```bash
   docker builder prune -af
   ```
3. **Remove unused images** (safe — anything still referenced by a container
   is untouched; anything else can be re-pulled/rebuilt):
   ```bash
   docker image prune -af
   ```
4. **If it's still full after that**, the real cause is usually a runaway
   container log, not a genuine capacity problem. Check the VM's actual free
   space and find the largest log file:
   ```bash
   docker run --rm alpine df -h /
   docker run --rm -v /var/lib/docker/containers:/containers alpine \
     sh -c "du -sh /containers/*/*-json.log 2>/dev/null | sort -rh | head -10"
   ```
   A container stuck in a restart loop (e.g. the `antelope` service starting
   before Nomad is reachable — see the Nomad note in
   [`LOCAL_SETUP.md`](../LOCAL_SETUP.md)) writes its panic/stack trace to its
   log on every restart with no size limit, and this can reach tens of GB
   surprisingly fast.
5. **Identify and remove the offending container** (safe — it holds no data;
   your Postgres/Redis data lives in named volumes, untouched by this):
   ```bash
   docker inspect --format '{{.Name}} — restarts:{{.RestartCount}}' <container-id>
   docker rm -f <container-name>
   ```
6. Re-run `docker run --rm alpine df -h /` to confirm space is back, then
   retry the build.

**Never run** `docker system prune --volumes` or `docker volume prune` to
"fix" this — that deletes the named volumes (`postgres_data`, `redis_data`)
and wipes your database. None of the steps above touch volumes.

**Root cause on this project specifically:** `src/` has no `.dockerignore`,
so `docker build` copies the full ~1 GB context (including the 347 MB
`skills/upstream/` source tree) into the image on every build. That alone
doesn't fill a healthy Docker disk, but it makes an already-tight disk fail
faster. Adding a `.dockerignore` that excludes `skills/upstream/`,
`web_src/node_modules/`, `web_src/dist/`, and `bin/` would shrink the build
context significantly — worth raising with the team if this keeps recurring.

## Nextflow job submission fails

The nomad server needs to be set up locally (or use global one). This information needs to be updated in the src/config.yaml

nomad:
     host: http://10.48.196.154
     port: 4646

