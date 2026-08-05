/**
 * Helpers for the operational scripts in this directory.
 *
 * **This repository is public.** Any credential written into a script is
 * published the moment it is committed, and stays recoverable from git
 * history even after it is removed. Passwords therefore come from the
 * environment (`.env.local`, which is gitignored) or from a CLI flag —
 * never from a literal in source.
 */

/** Reads a non-secret option from `--name=value`, falling back to a default. */
export function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

/**
 * Reads a credential from `--flag=value` or `process.env[envKey]`.
 * Exits with a usage message when neither is set — there is deliberately
 * no default, so a script can never silently create an account with a
 * password that is published in this repo.
 */
export function requireSecret(envKey: string, flag?: string): string {
  const hit = flag ? process.argv.find((a) => a.startsWith(`--${flag}=`)) : undefined
  const value = (hit ? hit.slice(flag!.length + 3) : process.env[envKey])?.trim()

  if (!value) {
    console.error(`\nMissing credential: ${envKey}\n`)
    console.error('  Set it in .env.local:')
    console.error(`    ${envKey}=<a strong password>`)
    if (flag) console.error(`  ...or pass it inline:\n    --${flag}=<a strong password>`)
    console.error('\n  Do not hardcode it — this repository is public.\n')
    process.exit(1)
  }

  if (value.length < 12) {
    console.error(`\n${envKey} is only ${value.length} characters. Use at least 12.\n`)
    process.exit(1)
  }

  return value
}
