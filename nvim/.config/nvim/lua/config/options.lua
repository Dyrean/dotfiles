-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

vim.opt.wrap = true
vim.opt.conceallevel = 1
vim.opt.cursorline = false
vim.opt.number = true -- Print line number
vim.opt.relativenumber = true -- Relative line numbers
vim.opt.hlsearch = false -- highlight search
vim.opt.incsearch = true -- incremental search
vim.opt.scrolloff = 4 -- scroll offset
vim.opt.clipboard = "unnamedplus" -- sync clipboard with os
vim.opt.breakindent = true
vim.opt.inccommand = "split"

vim.opt.tabstop = 4
vim.opt.softtabstop = 4
vim.opt.shiftwidth = 4
vim.opt.expandtab = true

vim.opt.swapfile = false

vim.opt.cinoptions:append(":0") -- switch statement indentations

vim.opt.title = true
vim.opt.ignorecase = true

vim.opt.wildignore:append({ "*/node_modules/*" })
vim.opt.path:append({ "**" })
