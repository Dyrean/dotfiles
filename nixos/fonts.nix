{ pkgs, ... }:

{
	# Fonts
	fonts.packages = with pkgs; [
		(nerdfonts.override { fonts = [ "GeistMono" "JetBrainsMono" ]; })
	];
}
