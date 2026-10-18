#!/bin/bash
# Auto-commit + push Midir after each Claude Code turn (run by a Stop hook).
# Pushing uses git's stored credentials; it never prompts. Restarts the game server if server.py changed.
export PATH=/usr/sbin:/usr/bin:/sbin:/bin GIT_TERMINAL_PROMPT=0
cd /root/midir || exit 0
git add -A
if git diff --cached --quiet; then
  # nothing new; still push commits a previous run couldn't
  git fetch -q origin main 2>/dev/null
  [ -z "$(git rev-list origin/main..HEAD 2>/dev/null)" ] && exit 0
  msg="Pushing earlier auto-commits"
else
  # refuse to commit anything that looks like a secret
  if git diff --cached -U0 | grep -qE '^\+.*(tsk_[A-Za-z0-9]{20,}|sk_[a-f0-9]{40,}|github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{30,})'; then
    git reset -q
    echo '{"systemMessage": "Auto-commit skipped: staged changes look like they contain a secret."}'
    exit 0
  fi
  files=$(git diff --cached --name-only)
  server_changed=$(echo "$files" | grep -qx 'server.py' && echo 1)
  git commit -qm "Auto: update $(echo "$files" | head -n 3 | tr '\n' ' ')$( [ "$(echo "$files" | wc -l)" -gt 3 ] && echo '…')" || exit 0
  msg="Auto-committed $(git log -1 --format=%h)"
fi
if timeout 120 git push -q origin main 2>/dev/null; then msg="$msg and pushed"; else msg="$msg (push failed: check stored GitHub credentials)"; fi
[ -n "$server_changed" ] && systemctl restart midir && msg="$msg; game server restarted"
echo "{\"systemMessage\": \"$msg\"}"
