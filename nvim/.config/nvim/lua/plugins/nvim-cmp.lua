return {
  {
    "hrsh7th/nvim-cmp",
    dependencies = { "hrsh7th/cmp-emoji" },
    ---@param opts cmp.ConfigSchema
    opts = function(_, opts)
      table.insert(opts.sources, { name = "emoji" })
    end,
  },
  {
    "hrsh7th/nvim-cmp",
    opts = function()
      local cmp = require("cmp")
      cmp.setup({
        sources = cmp.config.sources({
          -- { name = "buffer" }, -- <- remove
          { name = "nvim_lsp" },
        }),
      })
    end,
  },
}