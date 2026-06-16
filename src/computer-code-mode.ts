// The reviewed capability catalog consumed by My AX's official
// @cloudflare/codemode executor. Cloudbox owns these computer operations;
// orchestration runs in the authenticated agent experience so each callback
// crosses the normal fail-closed Cloudbox HTTP boundary.
export const COMPUTER_CODE_CATALOG = [
  { name: "info", description: "Return the delegated computer and home directory." },
  { name: "list", description: "List files below an absolute /home/user path." },
  { name: "read", description: "Read one text file below /home/user." },
  { name: "write", description: "Write one text file below /home/user." },
  { name: "exec", description: "Execute one bounded command in /home/user." },
  { name: "repo_status", description: "Return porcelain Git status for a repository below /home/user." },
  { name: "repo_diff", description: "Return the Git diff for a repository below /home/user." },
] as const;
