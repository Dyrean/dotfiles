{
  description = "Dyrean's NixOS Configuration";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

    hyprland = {
      url = "git+https://github.com/hyprwm/Hyprland?submodules=1";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # add git hooks to format nix code before commit
    pre-commit-hooks = {
      url = "github:cachix/pre-commit-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { nixpkgs, ... } @ inputs: {
    nixosConfigurations.nixos = nixpkgs.lib.nixosSystem {
      specialArgs = { inherit inputs; };
      modules = [
        ./configuration.nix
        ./hardware-configuration.nix
	./fonts.nix
	./internationalisation.nix
	./bluetooth.nix
	./bootloader.nix
	./auto-upgrade.nix
	./networking.nix
	./gnome.nix
	./printing.nix
	./sound.nix
	./users.nix
	./nixpkgs.nix
	./services.nix
	./firewall.nix
	./gc.nix
	./nix-settings.nix
	./terminal.nix
	./utils.nix
	./programming.nix
	./environment.nix
	./security.nix
	./lsp.nix
	./virtualisation.nix
	./dns.nix
      ];
    };
  };
}
