import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { HunkUserError } from "../../core/run/errors";
import { resolveExtensionContainerEntries } from "../discovery";
import type { NpmExtensionInstallSource } from "./source";
import { resolveNpmCommand } from "./npmCommand";

/** Enforce managed-install policy in both npm and the child npm processes used by Git dependencies. */
function createNpmInstallEnvironment(
  stagingDir: string,
  env?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const environment = { ...process.env, ...env };
  const policy = {
    npm_config_ignore_scripts: "true",
    npm_config_legacy_peer_deps: "true",
    npm_config_global: "false",
    npm_config_location: "project",
    // Some npm versions run Git prepare hooks even with ignore-scripts. A shell
    // that cannot exist fails closed instead of executing a hook in that fallback.
    npm_config_script_shell: join(stagingDir, `.hunk-disabled-script-shell-${randomUUID()}`),
  };

  // npm normalizes case and underscores/hyphens in environment configuration names.
  // Remove every equivalent spelling before adding policy, including child-process aliases.
  for (const key of Object.keys(environment)) {
    if (Object.hasOwn(policy, key.toLowerCase().replaceAll("-", "_"))) delete environment[key];
  }

  // npm's Git preparation launches another npm install without forwarding --ignore-scripts.
  // Its inherited environment must retain the policy, even when the dependency has an .npmrc.
  return { ...environment, ...policy };
}

/** Install one registry package and expose only its declared entries through the workspace root.
 * Keep the package and its dependencies in their normal node_modules layout so imports survive
 * promotion. The generated root manifest lets existing discovery use the same entry contract.
 */
export function stageNpmPackage(
  source: NpmExtensionInstallSource,
  stagingDir: string,
  env?: NodeJS.ProcessEnv,
) {
  writeFileSync(join(stagingDir, "package.json"), JSON.stringify({ private: true }));
  const environment = createNpmInstallEnvironment(stagingDir, env);
  // npm handles registry configuration/auth, selectors, tarball integrity, and dependencies.
  // Host-provided peers must not pull in a second Hunk runtime; scripts are never implicit consent.
  const args = [
    "install",
    source.spec.slice(4),
    "--prefix",
    stagingDir,
    "--ignore-scripts",
    "--legacy-peer-deps",
    "--global=false",
    "--location=project",
    `--script-shell=${environment.npm_config_script_shell}`,
    "--no-audit",
    "--no-fund",
    "--prefer-online",
    "--fetch-retries=0",
  ];
  let proc: ReturnType<typeof Bun.spawnSync>;
  try {
    proc = Bun.spawnSync([...resolveNpmCommand(environment), ...args], {
      cwd: stagingDir,
      env: environment,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    });
  } catch (error) {
    throw new HunkUserError(
      `Could not run npm: ${error instanceof Error ? error.message : String(error)}`,
      ["Installing npm extensions requires npm (and Node.js) on PATH."],
    );
  }

  if (proc.exitCode !== 0) {
    const stderr = proc.stderr?.toString().trim() ?? "";
    if (stderr.includes(environment.npm_config_script_shell!)) {
      throw new HunkUserError(
        "npm attempted to run a lifecycle script; installation was blocked.",
        [
          "npm extensions and their dependencies must ship ready-to-load code without install-time scripts.",
        ],
      );
    }

    throw new HunkUserError(`npm install failed: ${stderr || `exit ${proc.exitCode}`}`);
  }

  const packageDir = join(stagingDir, "node_modules", source.packageName);
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const declared = manifest.hunk?.extensions;
  if (
    manifest.name !== source.packageName ||
    typeof manifest.version !== "string" ||
    !Array.isArray(declared) ||
    declared.length === 0 ||
    declared.some((entry: unknown) => typeof entry !== "string")
  ) {
    throw new HunkUserError(`${source.spec} does not declare a valid hunk.extensions manifest.`);
  }

  const entries = resolveExtensionContainerEntries(packageDir);
  const packageRoot = realpathSync(packageDir);
  for (const entry of entries) {
    if (!existsSync(entry.path) || !statSync(entry.path).isFile()) {
      throw new HunkUserError(`${source.spec} declares a missing extension entry: ${entry.path}`);
    }

    const within = relative(packageRoot, realpathSync(entry.path));
    if (within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) {
      throw new HunkUserError(`${source.spec} declares an extension entry outside its package.`);
    }
  }

  writeFileSync(
    join(stagingDir, "package.json"),
    JSON.stringify({
      private: true,
      version: manifest.version,
      hunk: {
        extensions: entries.map(
          (entry) => `./${relative(stagingDir, entry.path).replaceAll("\\", "/")}`,
        ),
        ...(manifest.hunk.apiVersion !== undefined ? { apiVersion: manifest.hunk.apiVersion } : {}),
      },
    }),
  );
  return manifest.version as string;
}
