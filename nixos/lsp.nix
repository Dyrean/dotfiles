{ pkgs, ... }:

{
	environment.systemPackages = with pkgs; [
		nodePackages_latest.nodemon
		nodePackages_latest.typescript
		nodePackages_latest.typescript-language-server
		nodePackages_latest.yaml-language-server
		marksman
		rust-analyzer
		nil
		zls
		gopls
		luajitPackages.lua-lsp
        nixpkgs-fmt
        nil
	];  
}
