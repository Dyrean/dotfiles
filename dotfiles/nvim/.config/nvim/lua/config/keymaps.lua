-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

-- Split screen
vim.keymap.set("n", "<leader>wv", ":split<Return>", { desc = "[w]indow [v]ertical Split", noremap = true, silent = true })
vim.keymap.set("n", "<leader>wh", ":vsplit<Return>", { desc= "[w]indow [h]orizontal Split", noremap = true, silent = true })
