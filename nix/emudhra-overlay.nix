# Swaps the Nix dev shell's Node and Bun for the first releases that distrust the
# compromised eMudhra (emSign) intermediates, on macOS only.
#
# TEMPORARY eMudhra workaround. Node and Bun carry their own root stores, so the
# nix-darwin `security.pki.caCertificateBlacklist` fix does not reach them; the
# first upstream releases whose stores reject the compromised chain are
#   node 24.22.1 (NSS 3.131.1 roots + blocked-SPKI check, 2026-10-20)
#   bun   1.4.4  (roots updated to NSS 3.131.1, 2026-10-22)
# while the flake's nixpkgs pin still carries older builds. Linux shells keep
# nixpkgs' packages untouched (their trust comes from the system store).
#
# Invariants:
# - Self-retiring: each replacement applies only while the pinned nixpkgs version
#   is older than the fixed release, so `nix flake update` turns it off on its own.
# - The attribute *names* this overlay defines never depend on `prev`; the gates
#   live in the values. Conditional names would recurse through the fixpoint.
# - Version gates read `prev.nodejs-slim_24`, not `prev.nodejs_24`: at this
#   nixpkgs `nodejs_24` is a symlinkJoin whose `version` resolves through `final`,
#   which would recurse back into this overlay.
#
# Remove when nixpkgs' `nodejs_24` is >= 24.22.1 and `bun` is >= 1.4.4: delete
# this file, `nix/nodejs-bin.nix`, and the `overlays` line in `flake.nix`.
# Check with:
#   curl -s https://raw.githubusercontent.com/NixOS/nixpkgs/nixpkgs-unstable/pkgs/development/web/nodejs/v24.nix | grep version
#   curl -s https://raw.githubusercontent.com/NixOS/nixpkgs/nixpkgs-unstable/pkgs/by-name/bu/bun/package.nix | grep version
final: prev:
let
  inherit (prev.stdenv.hostPlatform) system isDarwin;
  wantNode = prev.lib.versionOlder (prev.nodejs-slim_24 or prev.nodejs_24).version "24.22.1";
  wantBun = prev.lib.versionOlder prev.bun.version "1.4.4";

  # Official nodejs.org tarball; see the header of nodejs-bin.nix.
  nodejsBin = import ./nodejs-bin.nix { pkgs = prev; };

  # nixpkgs' darwin bun is already "unzip the official GitHub release asset", so
  # only version and src move; the install_name_tool/codesign/completion hooks are
  # reused as-is. Hashes come from SHASUMS256.txt on the bun-v1.4.4 release.
  bunVersion = "1.4.4";
  bunSrc = {
    "aarch64-darwin" = prev.fetchurl {
      url = "https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/bun-darwin-aarch64.zip";
      hash = "sha256-wkDX8My5DCY6hJ/NsJt+5iYw2SE0jtaq/ahrnVd7xRA=";
    };
    "x86_64-darwin" = prev.fetchurl {
      url = "https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/bun-darwin-x64-baseline.zip";
      hash = "sha256-1KFVrfv9CRVes7oFyeOlRPOSl9emhhbTx3WfZ6tcR9w=";
    };
  };
  bunBin = prev.bun.overrideAttrs (_: {
    version = bunVersion;
    src = bunSrc.${system} or (throw "emudhra-overlay.nix: no bun ${bunVersion} hash for ${system}");
  });

  # Both the darwin gate and the version gate are evaluated lazily inside each
  # value, so non-darwin systems never force the darwin-only derivations.
  pick = want: replacement: orig: if isDarwin && want then replacement else orig;
in
{
  nodejs = pick wantNode nodejsBin prev.nodejs;
  nodejs_24 = pick wantNode nodejsBin prev.nodejs_24;
  nodejs-slim = pick wantNode nodejsBin prev.nodejs-slim;
  nodejs-slim_24 = pick wantNode nodejsBin prev.nodejs-slim_24;
  bun = pick wantBun bunBin prev.bun;
}
