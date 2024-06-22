# 🤖 Just a command runner, is similar to Makefile, but simpler.

# use nushell for shell commands
set shell := ["zsh", "-c"]

# global variables
HOSTNAME := "nixos"
NIXOS_PATH := "/etc/nixos"

# commands for nixos

# run nixos-backup-and-symbolic.sh
nixos-ln:
  bash nixos-backup-and-symbolic.sh

# nixos rebuild flake host=HOSTNAME
nixos-deploy host=HOSTNAME:
 cd nixos ; sudo nixos-rebuild switch --flake .#{{HOSTNAME}}

# nixos rebuild flake with debug
nixos-deploy-debug host=HOSTNAME:
 cd nixos ; sudo nixos-rebuild switch --flake .#{{HOSTNAME}} --show-trace --print-build-logs --verbose

# update all the flake inputs
nixos-up:
  cd nixos ; sudo nix flake update

# update specific input
# usage: just nixos-upp nixpkgs
nixos-upp input:
  cd nixos ; sudo nix flake update {{input}}

# list all nixos generations of the system profile
nixos-history:
  nix profile history --profile /nix/var/nix/profiles/system

# remove all nixos generations older than 7 days
nixos-clean:
  sudo nix profile wipe-history --profile /nix/var/nix/profiles/system  --older-than 7d

# garbage collect all unused nix store entries
nixos-gc:
  sudo nix store gc --debug
  sudo nix-collect-garbage --delete-old
