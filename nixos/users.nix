{ pkgs, ... }:

{
  # Define a user account. Don't forget to set a password with ‘passwd’.
  users.users.dyrean = {
    isNormalUser = true;
    description = "dyrean";
    extraGroups = [ "networkmanager" "input" "wheel" "video" "audio" "tss" "sudo" ];
    shell = pkgs.zsh;
    packages = with pkgs; [
      brave
    ];
  };
}
