-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

-- Enable the option to require a Prettier config file
-- If no prettier config file is found, the formatter will not be used
vim.g.lazyvim_prettier_needs_config = true

vim.opt.tabstop = 4
vim.opt.showmode = false

vim.g.have_nerd_font = true

vim.opt.listchars = { tab = "» ", trail = "·", nbsp = "␣" }

vim.opt.hlsearch = true
