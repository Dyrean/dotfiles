{ pkgs, ... }:

{
	programs.zsh.enable = true;

	# List packages installed in system profile. To search, run:
	# $ nix search wget
	environment.systemPackages = with pkgs; [
		wget

        killall
        kolourpaint
        gnome.nautilus
        swww
        
		fastfetch
		onefetch
		ipfetch
		btop
		gping

        gh
		git
		gitleaks
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
		alacritty
		zellij
		oh-my-posh
		zoxide

        # theming tools
        gradience
        gnome.gnome-tweaks

        # langs
		marksman
        nodePackages_latest.nodejs
        gjs
        bun
        go
        typescript
        nodePackages_latest.eslint
        air
        just
        rustup
        gnumake
        zig
        lua
        nixfmt-classic

        #lsp
        tailwindcss-language-server
        lua-language-server #Lua
        gopls
        zls
        nixd
        clang-tools #C
        gopls #Golang
        vscode-langservers-extracted #HTML,CSS, JSON
        nodePackages_latest.typescript-language-server #Javascript and Typescript
        nodePackages_latest.bash-language-server #Bash
        dockerfile-language-server-nodejs #Dockerfiles
        yaml-language-server #Yaml
        nil
        vscode-extensions.tamasfe.even-better-toml
	];
}
