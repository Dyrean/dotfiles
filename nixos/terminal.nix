{ pkgs, ... }:

{
  programs.zsh.enable = true;

  # List packages installed in system profile. To search, run:
  # $ nix search wget
  environment.systemPackages = with pkgs; [
    wget

    fastfetch
    onefetch
    ipfetch
    btop
    gping

    git
    gitleaks
    lazygit
    numbat
    just
    ripgrep
    tealdeer

    stow
    yazi
    eza
    bat
    fzf
    tokei
    jq
    fd
    atuin

    vim
    neovim
    wezterm
    zellij
    oh-my-posh
    zoxide
    thefuck
  ];
}
