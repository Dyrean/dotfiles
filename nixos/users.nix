{ pkgs, ... }:

{
	# Define a user account. Don't forget to set a password with ‘passwd’.
	users.users.dyrean = {
		isNormalUser = true;
		description = "dyrean";
		extraGroups = [ "networkmanager" "wheel" "video" "input" "uinput" "docker" ]; 
		shell = pkgs.zsh;
		packages = with pkgs; [
			brave
		];
	};
}
