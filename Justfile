# 🤖 Just a command runner, is similar to Makefile, but simpler.

# use nushell for shell commands
set shell := ["zsh", "-c"]

# commands for nixos

# nixos rebuild flake host=HOSTNAME
deploy:
	cd nixos ; sudo nixos-rebuild switch --flake .

# nixos rebuild flake with debug
debug:
	cd nixos ; sudo nixos-rebuild switch --flake . --show-trace --print-build-logs --verbose

# update all the flake inputs
up:
	cd nixos ; sudo nix flake update

# update specific input
# usage: just nixos-upp nixpkgs
upp input:
	cd nixos ; sudo nix flake update {{input}}

# list all nixos generations of the system profile
history:
	nix profile history --profile /nix/var/nix/profiles/system

# remove all nixos generations older than 7 days
clean:
	sudo nix profile wipe-history --profile /nix/var/nix/profiles/system  --older-than 7d

# garbage collect all unused nix store entries
gc:
	sudo nix store gc --debug
	sudo nix-collect-garbage --delete-old
