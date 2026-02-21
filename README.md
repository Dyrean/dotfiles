# 🖥️ My Dotfiles

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

My personal dotfiles for various tools and applications. These configurations are managed using [GNU Stow](https://www.gnu.org/software/stow/) for easy symlinking.

## 🛠️ Included Configurations

- **Shell**: Zsh configuration with plugins and customizations
- **Terminal**: Ghostty terminal configuration
- **Editor**: Neovim configuration with plugins
- **Version Control**: Git configuration and aliases
- **Prompt**: Starship prompt configuration
- **System Info**: Fastfetch configuration
- **Coding Agents**: OpenCode and Pi configurations

## 🚀 Installation

### Prerequisites

- [GNU Stow](https://www.gnu.org/software/stow/)
- [Just](https://github.com/casey/just) command runner
- Git

### Quick Start

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/dotfiles.git ~/dotfiles
   cd ~/dotfiles
   ```

2. Stow all configurations:
   ```bash
   just all
   ```

3. Or install a specific package:
   ```bash
   just install nvim
   ```

## 📦 Usage

```bash
just                    # Show available commands
just all                # Restow all packages
just install nvim git   # Install one or more packages
just uninstall nvim     # Uninstall one or more packages
just dry-run nvim       # Preview what install would do
just adopt nvim         # Adopt existing files into a package
just init alacritty     # Scaffold a new package directory
just delete             # Remove all symlinks (with confirmation)
just list               # List available packages
just status             # Dry-run showing what would be stowed
```

## 🔧 Customization

- Edit the respective configuration files in their directories
- New configurations can be added by creating a new directory and adding it to the stow command
- Use `.stow-local-ignore` to exclude files from being symlinked

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Thanks to all the open-source projects that make these configurations possible
- Inspired by various dotfiles repositories from the community
