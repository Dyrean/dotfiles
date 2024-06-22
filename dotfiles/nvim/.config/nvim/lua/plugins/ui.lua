return {
	-- messages, cmdline and the popupmenu
	{
		"folke/noice.nvim",
        opts = function(_, opts)
			table.insert(opts.routes, {
				filter = {
					event = "notify",
					find = "No information available",
				},
				opts = { skip = true },
			})
			local focused = true
			vim.api.nvim_create_autocmd("FocusGained", {
				callback = function()
					focused = true
				end,
			})
			vim.api.nvim_create_autocmd("FocusLost", {
				callback = function()
					focused = false
				end,
			})
			table.insert(opts.routes, 1, {
				filter = {
					cond = function()
						return not focused
					end,
				},
				view = "notify_send",
				opts = { stop = false },
			})

			opts.commands = {
				all = {
					-- options for the message history that you get with `:Noice`
					view = "split",
					opts = { enter = true, format = "details" },
					filter = {},
				},
			}

			vim.api.nvim_create_autocmd("FileType", {
				pattern = "markdown",
				callback = function(event)
					vim.schedule(function()
						require("noice.text.markdown").keys(event.buf)
					end)
				end,
			})

			opts.presets.lsp_doc_border = true
		end,
    },
	{
		"rcarriga/nvim-notify",
		opts = {
			timeout = 3000,
		},
	},
	-- animations
	{
		"echasnovski/mini.animate",
		event = "VeryLazy",
		opts = function(_, opts)
			opts.scroll = {
				enable = false,
			}
		end,
	},
	-- buffer line
    {
        "akinsho/bufferline.nvim",
        event = "VeryLazy",
        opts = {
            options = {
            -- stylua: ignore
            close_command = function(n) LazyVim.ui.bufremove(n) end,
            -- stylua: ignore
            right_mouse_command = function(n) LazyVim.ui.bufremove(n) end,
            diagnostics = "nvim_lsp",
            always_show_bufferline = false,
            diagnostics_indicator = function(_, _, diag)
                local icons = LazyVim.config.icons.diagnostics
                local ret = (diag.error and icons.Error .. diag.error .. " " or "")
                .. (diag.warning and icons.Warn .. diag.warning or "")
                return vim.trim(ret)
            end,
            offsets = {
                {
                filetype = "neo-tree",
                text = "Neo-tree",
                highlight = "Directory",
                text_align = "left",
                },
            },
            ---@param opts bufferline.IconFetcherOpts
            get_element_icon = function(opts)
                return LazyVim.config.icons.ft[opts.filetype]
            end,
            },
        },
        config = function(_, opts)
            require("bufferline").setup(opts)
            -- Fix bufferline when restoring a session
            vim.api.nvim_create_autocmd({ "BufAdd", "BufDelete" }, {
            callback = function()
                vim.schedule(function()
                pcall(nvim_bufferline)
                end)
            end,
            })
        end,
    },
	{
		"nvimdev/dashboard-nvim",
		opts = function(_, opts)
			local logo = [[
        ██████╗ ██╗   ██╗██████╗ ███████╗ █████╗ ███╗   ██╗
        ██╔══██╗╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗████╗  ██║
        ██║  ██║ ╚████╔╝ ██████╔╝█████╗  ███████║██╔██╗ ██║
        ██║  ██║  ╚██╔╝  ██╔══██╗██╔══╝  ██╔══██║██║╚██╗██║
        ██████╔╝   ██║   ██║  ██║███████╗██║  ██║██║ ╚████║
        ╚═════╝    ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝
        ]]

			logo = string.rep("\n", 8) .. logo .. "\n\n"
			opts.config.header = vim.split(logo, "\n")
		end,
	},
}
