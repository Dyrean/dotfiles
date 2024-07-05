return {
  "neovim/nvim-lspconfig",
  opts = {
    servers = {
      nil_ls = {},
      lua_ls = {},
      bashls = {},
      denols = {
        root_dir = require("lspconfig").util.root_pattern("deno.json"),
      },
      vala_ls = {},
      mesonlsp = {},
    },
  },
}
