# Security

## Supported versions

Security fixes go into `main` and the website at [megazron.github.io/text-to-robot](https://megazron.github.io/text-to-robot/), which is rebuilt from `main` on every push. Older commits and releases are not patched.

## Reporting a problem

Please do not open a public issue.

Report it privately through GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability** ([direct link](https://github.com/megazron/text-to-robot/security/advisories/new)). Only you and I can see the report; I reply and fix it there before anything is public. You need a GitHub account; I do not publish an email address.

Include what you found, how to reproduce it, and what an attacker could do with it. I aim to reply within a week. Once a fix is out you will be credited in the changelog, unless you would rather not be.

## Scope

In scope:

- The website: script injection through prompts, share links or gallery issues, and anything that sends a user's design off their device.
- The local server (`apps/api`): path traversal, request handling, anything reachable from another machine.
- The CLI and generated files: a crafted prompt or spec that writes outside the output folder, or generated scripts and launch files that run something they should not.
- Dependencies I ship, if the vulnerable path is reachable.

Out of scope: GitHub's own infrastructure, denial of service through very large inputs on your own machine, and reports from automated scanners without a working example.

## What I already checked

[docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md) lists the last audit: the threat model, every finding with its fix, the site's Content-Security-Policy and the repository settings.

## Physical safety

A design that could hurt someone who builds it (a wrong voltage, an overloaded part, a pinch point, a battery without protection) is not a security problem, but it matters as much. Report it with the [bug form](https://github.com/megazron/text-to-robot/issues/new?template=bug_report.yml) and tick the safety box. Nothing produced by Text to Robot has been built and tested by me; see [Terms](TERMS.md).
