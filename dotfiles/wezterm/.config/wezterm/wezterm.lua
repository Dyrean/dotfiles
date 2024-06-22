local wezterm = require "wezterm"
local config = wezterm.config_builder()

config.font = wezterm.font_with_fallback { "GeistMono Nerd Font", "JetBrainsMono Nerd Font" }
config.color_scheme = "Catppuccin Mocha"

-- config.hide_tab_bar_if_only_one_tab = true
config.enable_tab_bar = false

local wayland_gnome = require 'wayland_gnome'
wayland_gnome.apply_to_config(config)

return config
