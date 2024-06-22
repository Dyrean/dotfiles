{ ... }:

{
  # Nix Configuration
  nix.settings = {
    substituters = ["https://nix-community.cachix.org"];
    experimental-features = [ "nix-command" "flakes" ];
    trusted-users = ["@wheel"];
    warn-dirty = false;
  };
}
