{ pkgs, ... }:

{
  environment.systemPackages = with pkgs; [
    go
    nodePackages_latest.nodejs
    bun
    lua
    zig
  ];
}
