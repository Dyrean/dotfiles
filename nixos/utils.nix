{ pkgs, ... }:

{
  environment.systemPackages = with pkgs; [
    gcc14
    mold
    gnumake
    cmake
    unzip
    unrar
    rustup
  ];
}
