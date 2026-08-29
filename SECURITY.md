# Security Policy

This is a single-player game with no backend, no accounts and no network calls.
The realistic attack surface is small: saved games in the browser's IndexedDB,
the service worker cache, and the dependency tree.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private reporting: **Security → Report a vulnerability** on this
repository. If that is unavailable to you, open a normal issue saying only that
you have a security report and asking for a contact — no details.

Expect an acknowledgement within a week.

## In scope

- Anything that lets a crafted save file, world seed or content bundle execute
  code or corrupt another player's data
- Service worker cache poisoning
- Dependency vulnerabilities that are actually reachable from the game

## Not in scope

- Cheating in your own single-player save. The game runs entirely on your
  machine; editing your own save is your business.
- Denial of service against a server you are running yourself
- Missing hardening headers on a deployment that is not ours
