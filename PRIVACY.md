# Privacy

This is a template that has not been reviewed by a lawyer.

The website at megazron.github.io/text-to-robot runs in your browser. Your prompts and designs stay on your device, stored in your browser's local storage until you clear them.

- No account, no analytics, no tracking.
- GitHub hosts the page and may keep standard server logs, under GitHub's own policies.
- Share links carry the design inside the link. Anyone with the link can open it.
- Publish opens a GitHub issue from your own account, and only if you confirm it. That design is then public.
- The gallery reads public issues from GitHub only when you ask for it.

## Reading options

Both are off until you switch them on in **Create > How it reads**.

- **Smarter reading** downloads a small sentence model once from Hugging Face (huggingface.co, cdn.jsdelivr.net for its runtime). Your prompts are read by that model in your browser; they are not sent anywhere.
- **Your own model** sends each prompt you design to the provider you chose (Anthropic, or the OpenAI-compatible address you typed), with your key. The key is kept in this browser only: for this tab, or on this device if you tick *Remember on this device*. It is never put in a design, a share link, a download or a post. What that provider keeps is under its own policy.

## The community blog

Nothing is posted unless you press **Share on the blog** and then **Post publicly**. Nothing is sent in the background.

- A post is public. It holds the title, description, tags, a picture of the 3D view, the design link and a display name if you give one (blank means Anonymous).
- No login, no email, no IP address and no other personal detail is stored.
- To limit abuse the server keeps a hash of your connection made with a random daily salt. The salt is deleted after two days, after which nobody, me included, can tell which connection a hash came from. A Cloudflare Turnstile check runs when you post or report; Cloudflare's [privacy policy](https://www.cloudflare.com/privacypolicy/) applies to it.
- After posting you get a private delete link, shown once. Opening it removes the post for good. I can delete any post too.
- Details: [docs/COMMUNITY.md](docs/COMMUNITY.md).
